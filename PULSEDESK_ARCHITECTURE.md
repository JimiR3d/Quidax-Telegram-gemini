# PulseDesk — Definitive Architecture Specification

> **Provenance.** Written 2026-07-06 from the code itself (server.ts and all 25 pure modules), the migration set (001–023), the 404-test suite, all 183 commits, KNOWN_ISSUES.md/PULSEDESK_HANDOFF.md, and the **live production system** (health endpoint, Railway environment variables, and a live KPI snapshot pulled through the production API on this date — production runs commit `ed5763b`, which is HEAD of main, so code and prod are identical at time of writing). This supersedes the older `ARCHITECTURE.md` in content; that file is kept unmodified as history. Companions: `PULSEDESK_PRD.md` (what and why), `LESSONS_AS_REQUIREMENTS.md` (numbered invariants), `KPI_DEFINITIONS.md` (per-KPI SQL).
>
> Sections flagged **⚠ LESSON** encode a design decision that was purchased with a real production incident. Do not "simplify" them away.

---

## 1. System overview

One always-on Node.js process on Railway does everything: it holds a persistent Telegram MTProto connection (GramJS, a *user* session — not a bot), ingests every message from one supergroup through four overlapping paths into Supabase Postgres, classifies tickets asynchronously with Groq (Gemini as fallback), runs a family of gated background sweeps (auto-resolution, reply repair, orphan reconciliation), and serves both the REST API and the built React dashboard from the same Express app.

```
 Telegram supergroup (OfficialQuidaxCommunity, channel id 2129818880)
        │  MTProto, session string #3 (read-only member; group is broadcast-only)
        ▼
┌────────────────────────── Railway container (exactly 1 replica) ─────────────────────────┐
│  server.ts (Express + GramJS in one process; dist/ served statically)                    │
│                                                                                          │
│  INGESTION (4 paths → ONE processAndIngestMessage):                                      │
│    1. getChannelDifference poll — every 15s (primary, ~14s lag)                          │
│    2. AutoFetch getMessages sweep — every 3 min, 2h lookback, limit 20 (safety net)      │
│    3. reconcileOrphanMessages — startup+5min, then hourly (self-healing)                 │
│    4. POST /api/backfill + POST /api/ingest (manual/admin)                               │
│    (5. The live NewMessage push handler exists but is structurally dead for this         │
│        supergroup — GramJS 2.26.x never syncs channel pts; kept as harmless code.)       │
│                                                                                          │
│  CLASSIFICATION: Groq gpt-oss-20b (temp 0, JSON, few-shot) → Gemini 2.5-pro fallback     │
│  REPLIES: Gemini 3.5-flash suggested replies + 15-min repair sweep (quota-aware)         │
│  SWEEPS: assumeResolveQuietTickets (hourly), inferResolvedFromConversation (hourly),     │
│          repairMissingSuggestedReplies (15 min), reconcileOrphanMessages (hourly),       │
│          watchdog (5 min), admin-list cache refresh (15 min, lazy)                       │
│  OUTBOUND: maybeSendStatusBotReply — kill-switched (group is broadcast-only)             │
└──────────────┬───────────────────────────────────────────────────────────────────────────┘
               │ service-role key only (server-side)
               ▼
      Supabase Postgres: tickets · messages · corrections · bot_replies ·
                         audit_logs · learned_keywords · tickets_stats() function
               ▲
               │ GET /api/tickets every 10s (Bearer token / x-admin-key)
      React 19 + Vite + Tailwind v4 dashboard (feed, KPIs, /train, Benchmark,
      Dismissed Audit) — built into dist/, served by the same Express process
```

External services: Groq API (classification, topic-shift, resolution inference, reclassify, eval), Google Gemini (suggested replies; classification fallback), Telegram (MTProto), Supabase (Postgres + PostgREST), optional Jira (issue creation), optional HEARTBEAT_URL ping (every 5 min from the watchdog loop).

---

## 2. The Telegram layer

### 2.1 Why a user session, not a bot
A Telegram bot cannot read general group traffic the way a member can; PulseDesk's entire value is seeing *every* message. So it logs in as a real account via MTProto (`TELEGRAM_SESSION_STRING`). Consequences that shape everything else:
- The session string is a **single-tenancy credential**: two simultaneous connections ⇒ Telegram returns `406: AUTH_KEY_DUPLICATED` and **permanently invalidates the string**. This burned two sessions during development. ⚠ LESSON — hence `numReplicas = 1`, the deploy-overlap guards (§2.3), and the absolute rule against opening a second session (even "just to re-fetch history").
- The account is a normal member and the group is **broadcast-only**: reading works, posting is impossible (`USER_BANNED_IN_CHANNEL`, proven on two different accounts). The outbound bot is therefore parked, kill-switched.
- Session #3 (2026-06-16, personal account) is current. Regeneration = `node -r dotenv/config scripts/generate-session.cjs` + Railway var update — **only ever on explicit owner instruction**.

### 2.2 Startup sequence (exact order — the order is load-bearing)
1. Env validation: `REQUIRED_ENV_VARS = [GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_PASSWORD]`; missing ⇒ loud fatal exit. `VITE_DASHBOARD_PASSWORD` is copied into `DASHBOARD_PASSWORD` only if the latter is absent. **No secret has a code fallback.** ⚠ LESSON (a hardcoded fallback password once matched the real one in a public repo).
2. Express boots (~1s) and `/api/health` starts answering immediately — deliberately *before* Telegram connects, so Railway's healthcheck passes and cutover timing is unaffected.
3. SIGTERM/SIGINT handler registered: `client.disconnect()` raced against a 3s timeout, then exit 0 — the OLD container releases the session before the new one connects (deploy-overlap guard part A).
4. **Initial-connect delay**: `resolveConnectDelayMs(TELEGRAM_CONNECT_DELAY_MS)` (default 60s, "0" disables for cold first deploys) — deploy-overlap guard part B. ⚠ LESSON: both A and B are required; either alone has a failure mode (no SIGTERM delivered / old container slow to release).
5. Connect with retry: 5 attempts, `attempt × 5s` backoff, disconnect-before-retry. On total failure: **slow recovery every 10 min** (a failed initial connect used to leave a healthy-looking process that ingested nothing forever). ⚠ LESSON.
6. `armListenersOnce()` (idempotent): registers handlers, primes updates via `getDialogs()` (`dialog-priming.ts` — also the membership probe: target absent from dialogs ⇒ banned/not a member), seeds channel `pts` via `GetFullChannel`, starts the AutoFetch interval, the channel-difference poll, and the watchdog.

### 2.3 The four ingestion paths — why each exists

| # | Path | Cadence | Typical lag | Why it exists |
|---|------|---------|-------------|----------------|
| 1 | `getChannelDifference` poll (`channel-difference.ts`) | 15s | **~14s** | GramJS 2.26.x never tracks a channel's `pts` and never calls `updates.getChannelDifference`, so Telegram **withholds** the supergroup's `UpdateNewChannelMessage` push even for a primed, member session (proven with a metadata-only Raw-update logger in prod: channel *control* updates arrived, message updates never did). PulseDesk therefore does the sync itself: seed `pts` from `GetFullChannel.fullChat.pts`, poll `GetChannelDifference` (filter Empty, limit 100), feed `newMessages` into the shared pipeline, advance the tracked pts, re-seed after every reconnect. |
| 2 | AutoFetch (`getMessages`, 2h lookback, limit 20, `autofetch-dedup.ts` pre-dedup) | 3 min | 37–174s | The safety net that carried ALL ingestion while the push mystery was being solved; retained permanently because it also recovers gaps (deploy windows, TooLong resets). Processes **oldest-first** (⚠ LESSON: newest-first made replies process before their parents — structurally unattachable). One batched `IN` pre-query skips already-ingested ids so they don't pay the admin-check round-trip or Groq spacing; the authoritative dedup stays inside the pipeline (the pre-dedup is fail-open). |
| 3 | `reconcileOrphanMessages` (`message-reconciliation.ts`) | startup+5min, hourly | n/a | The `messages` row is written BEFORE the ticket; any mid-build crash orphans the message and the dedup makes every later sweep skip it — permanently. The sweep finds `messages` rows with no ticket representation and replays them through the SAME pipeline via a 3-line `reconcileOpts` bypass (reuses the stored `sender_hash` so conversations re-group, and the existing row id so nothing duplicates). It must never resurrect admin/bot content: content recognizers (`isSystemBotMessage`) + the live noise gates + the `ADMIN_SENDER_HASHES` env allowlist (needed because `messages` has no senderId — admin detection can't re-run offline). Gated: `INGEST_RECONCILE_ENABLED` / `_DRY_RUN` (live: true/false), lookback + max-per-sweep bounded. |
| 4 | `POST /api/backfill`, `POST /api/ingest` | manual | n/a | Admin-triggered history pulls and test injection. `/api/ingest` (super_admin) accepts `isAdmin`, `msgDate`, `replyToMsgId`, `senderId` — the e2e testing workhorse. Both behind `heavyLimiter`. |

**Channel-difference response shapes** (pure `classifyChannelDifference`, switch on `className`): `ChannelDifference` (newMessages + new pts + `otherUpdates`), `ChannelDifferenceEmpty` (pts only), `ChannelDifferenceTooLong` — **new pts comes from `resp.dialog.pts` and its `messages` are latest-state, NOT the gap: never bulk-ingest them; re-seed and let AutoFetch's 2h lookback carry the gap.** ⚠ LESSON. Raw TL gotchas baked into `normalizeDiffMessage`: text is `.message` not `.text`; sender comes from `fromId.userId/channelId` (a Peer); usernames must be joined from the response's `users[]`; service/empty/media-only messages return null; id guard is `Number.isFinite(n) && n > 0` because `Number(null) === 0`.

### 2.4 Edits and deletes
`UpdateEditChannelMessage` / `UpdateDeleteChannelMessages` ride the channel difference's `otherUpdates` (the dead Raw listener also still calls the same shared appliers — no behavior fork). `extractChannelEditsDeletes` (pure) pulls `{edits:[{id,text}], deletedIds:[]}` → `applyMessageEdit` / `applyMessageDelete`:
- Edit: update the stored `messages.raw_text`.
- Delete of a ticket **root**: soft-delete (`messages.deleted_at`, migration 018) + Dismiss the ticket via a guarded `.in("status", ["Open","In Review","Awaiting User","Assumed Resolved"])` update (never clobbers Escalated/Resolved). Deleting a folded follow-up only stamps `deleted_at` (the issue may still be live).
- ⚠ LESSON: both appliers act **only on the resolved target group's channel id** — Telegram message IDs are per-chat, and an unguarded handler once let a colliding ID from an unrelated chat overwrite stored rows and could silently Dismiss real tickets (`telegram-guards.ts`).
- Operational note: the June 25/28 "Withdrawal/High → Dismissed" scares were this handler **working correctly** (users deleted their own messages) — check `messages.deleted_at` before suspecting a bug.

### 2.5 Watchdog and liveness semantics
Every 5 min the watchdog checks `lastMessageReceivedAt`; ≥30 min of silence ⇒ force reconnect + re-prime + re-seed pts, then **reset the clock** (without the reset it re-fired every 5 min forever, because only real deliveries advance the clock and live push is dead). ⚠ LESSON stack:
- The clock is stamped **only for target-group messages** (exact channel-id match) — DMs/other chats once kept it warm while the group listener was dead for days.
- It is initialized to **boot time** and advanced by reconnects, so it alone can NEVER prove the listener is alive. The authoritative liveness check is **DB ingest lag** (`ingested_at − message_timestamp` on recent `messages`): sub-15s = channel-diff healthy; ~60–180s = AutoFetch is carrying; ≥3 min sustained = both degraded.
- `HEARTBEAT_URL`, if set, is pinged (fire-and-forget) every watchdog tick — external uptime monitoring hook.
- **(2026-07-07) The DB-ingest-lag check above is now automated**, not just a manual SQL habit: `observability.ts` + a `checkIngestionHealth()` sweep (boot+10s, then every 60s) compute median/max lag over the last 50 `messages` rows and cache it for `/api/health.ingestLag`; a second, independent signal `telegramDownForMs` tracks how long `telegramReady && client.connected` has been continuously false. Both run through one shared `evaluateBreach` state machine (sustain ≥5 min for ingest-lag / `SESSION_DOWN_ALERT_MS` for session-down before the first alert, re-alert at most every 30 min) — logs always, optionally POSTs to `ALERT_WEBHOOK_URL`. The session-down half only evaluates when Telegram is actually configured, so the no-telegram launcher never false-alarms.
- **(2026-07-08) Outage-gap recovery (P0-2, `gap-recovery.ts`)** — AutoFetch's fixed 2h lookback loses any gap longer than 2h. `runGapRecovery(reason)` (startup + watchdog reconnect, re-entrancy-guarded, dormant behind `GAP_RECOVERY_ENABLED`) treats the **`messages` table as the durable checkpoint** (`max(telegram_message_id)`), pages Telegram history newest-first via `client.getMessages`, and replays anything newer through the SAME idempotent `processAndIngestMessage`, bounded by `GAP_RECOVERY_MAX_MESSAGES` (500) + `GAP_RECOVERY_MAX_AGE_HOURS` (24). Never stamps `lastMessageReceivedAt` (backfill, not live delivery, same rule as AutoFetch). Exposed on `/api/health.lastGapRecovery`; a healthy up-to-date system recovers nothing (one cheap call, `reachedCheckpoint:true`). The live `getMessages` leg is prod-only (no `tlClient` on the launcher); the id/age/stop logic is unit-tested (17 tests).
- **(2026-07-08) Groq budget accounting (P1-4, `groq-budget.ts`)** — all Groq calls run through a shared `groqChatCreate(...)` wrapper (`.withResponse()` captures `usage` + `x-ratelimit-*` headers) that meters daily request/token usage; `/api/health.groqBudget` reports it, and a third `checkIngestionHealth` breach check fires a `GroqBudget` alert through the same `evaluateBreach` machine when usage crosses `GROQ_BUDGET_ALERT_PCT` of a daily cap or any 429 is seen today. ⚠ LESSON: Groq's `x-ratelimit-remaining-tokens` header is the **per-minute** bucket (limit 8000/min), NOT the daily 200K — so the daily token pct is **tally-based**, and a header dimension is trusted only when its own limit equals the configured daily cap (requests match → header/restart-proof; tokens don't → tally). The per-process tally resets on redeploy, so the 429-seen-today condition is the daily-exhaustion safety net.

### 2.6 Admin detection (`checkIsAdmin`)
Order: sender == the group itself (anonymous admin) → env `TELEGRAM_ADMIN_USER_IDS` (ids) → env `TELEGRAM_ADMIN_USERNAMES` → per-group cached admin set, refreshed at most every 15 min via `channels.GetParticipants(ChannelParticipantsAdmins, limit 200)`; without a live client, non-env senders are non-admin. Detection has been **verified correct on all ingestion paths** — when "admin messages become tickets" symptoms appear, the bug is downstream in the drop guard (`admin-message-policy.ts`), not here. ⚠ LESSON (Bug 3 red herring).

---

## 3. The ingestion pipeline — `processAndIngestMessage`, branch by branch

All four paths call this one function (server.ts:2363). Its **branch order is a contract**; several incidents were caused by things happening in the wrong order. Signature carries `reconcileOpts` (recovery bypass) — null on every live path.

```
0.  sender_hash = sha256(senderId||telegramId + groupId)[:16]   (reconcile passes the stored hash through)
1.  Reject text < 5 chars (throw — the messages row is NOT written for these)
2.  BOT-SELF GUARD: telegramId ∈ botSentMessageIds ⇒ return null
      ⚠ bot replies never enter `messages`, so the normal dedup can't catch them; without this
      they'd re-ingest as admin replies and corrupt first_admin_reply_at / response-time KPI
3.  DEDUP (authoritative): SELECT messages WHERE telegram_message_id = X ⇒ exists ⇒ return null
      (skipped only for reconcileOpts, which is rebuilding FROM that very row)
4.  PERSIST the messages row (before ANY decision), storing reply_to_msg_id via
      normalizeReplyToMsgId (the > 0 guard matters: Number(null)===0 would store 0 for non-replies).
      Insert error 23505 ⇒ concurrent duplicate ⇒ return null (the DB UNIQUE constraint is the
      concurrency-safe last line — ⚠ the in-code check is not atomic across paths)
5.  USER "THANKS" AUTO-RESOLVE: non-admin + /thanks|thank you|resolved|fixed|worked|solved|appreciate/i
      ⇒ append [USER_REPLY (Auto-Resolved)], status=Resolved, resolved_at=now, on the sender's most
      recent ticket in {4 active, Assumed Resolved, Handed off}; else fall through
      (⚠ testing gotcha: this branch runs BEFORE the quoted-reply branches — neutral wording needed
      to exercise reply-to paths in tests)
6.  QUOTED REPLY (replyToMsgId set):
      ADMIN sender: parent message looked up in `messages`;
        a) GROUND TRUTH: parentMsg.ticket_id → selectReplyToTarget (rejects closed/admin targets)
        b) legacy: ticket whose message_id = parent row id
        c) A2: parent is a folded follow-up ⇒ resolve via the QUOTED MESSAGE's sender_hash →
           that sender's most-recent active non-admin ticket
        d) Fix 5: parent never ingested ⇒ recoverQuotedParent fetches it from Telegram BY ID,
           ingests it as a ROOT (replyToMsgId=null — recovery must never recurse), then attaches
      Attach = append [ADMIN_REPLY]; status: Resolved/Escalated/Awaiting User keep state, else
      In Review; first_admin_reply_at stamped ONCE with the reply's own Telegram timestamp;
      linkMessageToTicket; fire-and-forget extractAndLearnKeywords + reclassifyFromAdminReply
      USER sender:
        a) GROUND TRUTH: parentMsg.ticket_id (this is the over-split fix — a user answering an
           ADMIN's question quotes an admin message whose ticket_id points at the user's own thread)
        b) legacy message_id → c) raw_text ILIKE probe → d) sender's most-recently-active ticket in
           {4 active, Assumed Resolved, Handed off} with last_message_at within 48h
           (QUOTED_FALLBACK_MAX_AGE_MS — an unbounded fallback once attached today's reply to a
           month-old thread)
      Attach = append [USER_REPLY]; Awaiting User / Assumed Resolved / Handed off REOPEN to
      In Review with resolved_at=null; NO match ⇒ **fall through, no early return**
      (⚠ a `return null` here once silently ate real issues that arrived as replies to old/welcome
      messages — the whole conversation became invisible)
7.  UN-QUOTED ADMIN: candidates = non-admin active tickets with last_message_at within ~30 min
      (ADMIN_UNQUOTED_ATTACH_WINDOW_MS, env-overridable) ⇒ selectAdminAttachTarget picks the single
      most-recently-active ⇒ attach as [ADMIN_REPLY] (same status/stamp rules)
      (⚠ was a hard 90s window keyed on created_at — dropped the COMMON case of an admin answering
      minutes later; 4 real replies vanished off one live ticket)
8.  DROP-ADMIN: an admin message that still matched nothing is dropped (messages row already
      persisted) — NEVER a standalone ticket (they used to appear as fake "Resolved" tickets and
      inflate the rate). `disposeUnattachedMessage` in admin-message-policy.ts.
9.  GROUPING (non-admin, un-quoted, senderHash from a real senderId): candidate = sender's single
      most-recent active ticket with last_message_at within 6h;
      band = fast (≤5 min ⇒ fold) | extended (5min–6h ⇒ shouldBurstFold? (Open + no admin reply +
      ≤30 min ⇒ fold, no LLM) else ONE Groq topic-shift call, strict same_issue===true ⇒ fold,
      ANY error/parse-fail/timeout/breaker ⇒ NEW TICKET) | none (>6h)
      Fold = append [USER_FOLLOWUP], advance last_message_at, linkMessageToTicket, fire-and-forget
      reclassifyGroupedTicket (full-thread re-classify; never touches status; preserves human-set
      urgency via buildGroupedUpdatePayload)
10. PRE-FILTER: isPreFiltered = !skipPreFilter && (!shouldProcessMessage(text, learnedKeywordCache)
      || isBanterNoise(text)) — conservative AND-gates; skips the LLM entirely
11. TICKET INSERT: placeholder row (summary "Processing message...", category General Question,
      urgency Medium, status: admin⇒Resolved / else Open), telegram_message_id + deep link,
      created_at = the MESSAGE's own timestamp, last_message_at stamped; linkMessageToTicket(root)
12. ASYNC CLASSIFICATION (fire-and-forget IIFE):
      pre-filtered ⇒ canned {Community Chat / Low / "General Chat" summary} (no LLM; the summary
      string "General Chat" is a contract — the reply-repair sweep excludes BY SUMMARY)
      else: few-shot fetch → Groq (GROQ_SYSTEM_PROMPT+fewShot / temp 0 / json_object / 15s timeout /
      groqBreaker) → parseAndValidateClassification (strip fences → JSON.parse → normalize
      priority→urgency, type→category → Zod with .catch defaults) → generateSuggestedReply (Gemini)
      → decideClassificationOutcome (policy) → applyClassification
      Groq fails ⇒ Gemini 2.5-pro fallback (same prompt+few-shot, JSON mime) ⇒ both fail ⇒
      "[NEEDS REVIEW]" summary, status Open — NEVER dismissed, never lost
      applyClassification = STEP 1: UPDATE ... SET fields+status WHERE id=X AND status=insertedStatus
      (atomic guard) — 0 rows ⇒ STEP 2: write fields WITHOUT status
      (⚠ the classifier once clobbered "In Review"/"Escalated" set during its 5–10s window)
```

`reclassifyFromAdminReply` (fired on every admin attach): waits once (12s) if the ticket still says "Processing message..."; judges the FULL user-side thread (`userThreadText`); Groq returns `{category, resolved}`; category applies only on an exact case-insensitive match against `VALID_CATEGORIES` (⚠ a normalize-fallback here would rewrite real tickets to "General Question" on hallucinations — deliberately absent); then `shouldHandOffFromAdminReply` (email/DM patterns, `handoff-detect.ts`) is checked FIRST, else `shouldResolveFromAdminReply` (strict `resolved===true`); both write via guarded `.in("status", ["Open","In Review"])` updates; hand-off does NOT stamp `resolved_at`; category failures log-and-continue so a category hiccup never blocks the resolve.

---

## 4. Classification stack

- **Models:** Groq `GROQ_MODEL` (default `openai/gpt-oss-20b`; llama-3.1-8b-instant retired 2026-08-16 — the env rollback lever dies then) for ALL 8 Groq call sites (classification, reclassify, topic-shift, resolution inference, eval). Gemini `gemini-2.5-pro` = classification fallback; `gemini-3.5-flash` = suggested replies. A 404 on a Gemini call means a bad model name, not quota — the cooldown correctly won't engage.
- **Prompt architecture:** `GROQ_SYSTEM_PROMPT` = role + `=== OUTPUT SCHEMA ===` block naming the exact JSON keys (⚠ its loss once silently blanked all summaries for weeks — Zod `.catch()` defaults masked it) + 12 category definitions + urgency rules & worked examples + Nigeria context + feature-existence rule + `PIDGIN_GLOSSARY_PROMPT` appended (language coverage is base-prompt, NOT few-shot, so it reaches the raw-model benchmark identically). Few-shot corrections are appended per call. User text rides in `role: user` after `redactPII(sanitizeForPrompt(...))`; a post-user system turn re-pins JSON-only output; a trailing assistant prefill turn ("I will now output only the JSON classification:") exists here and works — but ⚠ the SAME prefill pattern deterministically 400'd gpt-oss on the D2 resolution prompt (`Tool choice is none, but model called a tool`); if any site starts 400ing that way, remove ITS prefill first, don't fiddle with response_format.
- **Validation:** strip code fences → JSON.parse → normalize LLM field drift (`priority`→`urgency`, `type`→`category`) → Zod (`z.enum(VALID_CATEGORIES).catch("General Question")`, urgency `.catch("Medium")`) → `classification_failed` marks genuinely unparseable output. `isCategoryFallback` distinguishes a real "General Question" from a defaulted one.
- **Policy** (`classification-policy.ts`): see PRD §5; Critical ⇒ Open + `[ESCALATED]`; failures ⇒ `[NEEDS REVIEW]` + Open; auto-dismiss only Praise / Spam/Irrelevant / Community Chat / pre-filtered.
- **Resilience per call:** circuit breaker per provider (groq/gemini/supabase; `/api/health` exposes states) + `withTimeout` (15s classification) + retry taxonomy: retry ONLY 429/5xx/capacity/`[Timeout]`; never `[CircuitBreaker]` fast-fails, never other 4xx; **quota-exhaustion (429/RESOURCE_EXHAUSTED/"quota") is not a retry — it arms a 60-min cooldown** (`gemini-quota.ts`) so a dead daily quota isn't re-burned every sweep (⚠ the 15-min repair sweep once tripped the shared breaker every cycle for a day). Deterministic 400s (`isDeterministicRequestRejection`) record the per-ticket cooldown so a bad prompt flaps the breaker at most once/24h.
- **Budget (Groq free tier: 1,000 req/day, 8K TPM, 200K TPD** — 14× smaller than llama's request budget): sequential everywhere (never `Promise.all`); spacing: ingestion-adjacent 2.1s, eval 15s, verify 15s, D2 20s; D2 keeps an in-memory per-ticket verdict record (`shouldRecheckResolution`) and re-asks only when the thread advanced or 24h passed (⚠ without it the hourly sweep alone could eat the whole daily budget); D2 capped at 40 calls/sweep; `/api/eval` has NO 429 retry (an error row scores as a miss) — run it sparingly.

**Few-shot retrieval** (`getFewShotCorrections`): naive keyword overlap (≥4-char lowercased words, stop-worded, 200-candidate cap) over `corrections`, top 5, **merge-deduped per message** (`dedupeAndMergeCorrections`: category from the newest non-`human_urgency` row, urgency from the newest row with a non-null `correct_urgency`) — a plain newest-wins would let an urgency-only row shadow a category correction. Excludes `human_skip`. The `/api/verify` path passes `excludeMessageText` (leave-one-out) — ⚠ dropping that third argument makes the trained score meaningless (the pool leaks the answer).

---

## 5. Background sweeps (all in server.ts; all writes guarded; all fail-safe-gated)

| Sweep | Schedule | Gate (live value) | What it does | Guard rails |
|---|---|---|---|---|
| `pollChannelDifference` | every 15s | `CHANNEL_DIFF_ENABLED` (**true**) | Primary live ingestion (§2.3) | idempotent via pipeline dedup; TooLong re-seeds only |
| `runAutoFetch` | every 3 min | always on | 2h-lookback sweep, oldest-first, batched pre-dedup | pre-dedup fail-open; pipeline dedup authoritative |
| Watchdog | every 5 min | always on | reconnect after 30-min group silence; re-prime + re-seed; reset clock; ping `HEARTBEAT_URL` | clock stamped by target-group messages only |
| `repairMissingSuggestedReplies` | every 15 min | always on | fills `suggested_reply IS NULL` on tickets <24h old, ACTIVE, classified, non-admin, max 10/run | update guarded on still-null (never overwrites an agent's edit); skips during Gemini quota cooldown; excludes pre-filtered tickets BY SUMMARY ("General Chat") |
| `assumeResolveQuietTickets` | startup+3min, hourly | `ASSUMED_RESOLVE_ENABLED` (**true**) | admin-engaged + quiet ≥7 days ⇒ Assumed Resolved | statuses Open/In Review/Awaiting User only — never Escalated; guarded `.in(...)`; `sweepCategoryOrClause` (noise category no longer excludes High/Critical); stamps `resolved_at`; never posts to Telegram |
| `inferResolvedFromConversation` (D2) | startup+4min, hourly | `RESOLUTION_INFER_ENABLED` (**true**), `_DRY_RUN` (**false**) | admin-engaged + quiet ≥24h ⇒ Groq reads the WHOLE thread: "did support resolve this? is anything pending on the user?" — strict `resolved===true` only | same status/guard rails as above; 40-call cap, 20s spacing, 24h per-ticket recheck; every error path leaves the ticket untouched; prompt was precision-tuned after a dry-run caught it closing a ticket awaiting a user's screenshot |
| `reconcileOrphanMessages` | startup+5min (env), hourly | `INGEST_RECONCILE_ENABLED` (**true**), `_DRY_RUN` (**false**) | replays orphaned messages through the pipeline (§2.3 path 3) | admin/bot exclusion (recognizers + `ADMIN_SENDER_HASHES`, armed); bounded lookback/batch |
| Admin-list refresh | lazy, 15-min TTL per group | always on | GetParticipants(Admins) cache for `checkIsAdmin` | — |

"Admin-engaged" everywhere = `raw_text LIKE '%[ADMIN_REPLY]%' OR first_admin_reply_at IS NOT NULL` — ⚠ the column alone under-counts legacy tickets (live evidence: 20 vs 49).

---

## 6. Conversation model — the raw_text block contract

A ticket's `raw_text` IS the thread: the original message followed by appended blocks `\n\n[ADMIN_REPLY]\n…\n[/ADMIN_REPLY]`, `[USER_REPLY]`, `[USER_REPLY (Auto-Resolved)]`, `[USER_FOLLOWUP]`. This format is a **parsing contract** with at least these exact-match consumers: `conversation-grouping.ts` `BLOCK_RE`/`FIRST_BLOCK_RE` (require a bare `]` — `[USER_FOLLOWUP id=…]` would silently break thread extraction), the admin-engaged `.includes("[ADMIN_REPLY]")` checks in both auto-resolve sweeps, `originalMessageText` (first-block split), `userThreadText` (user-side thread for classification//train/corrections), the App.tsx thread renderer, and `handoff-detect.ts` (these last two tolerate suffixes). ⚠ LESSON: a planned `id=<telegramId>` tag was dropped when the grep of consumers showed it would silently freeze the sweeps and lose follow-up text. Grep ALL consumers before touching block syntax; the era-agnostic "is this message already attached?" check is a raw_text substring probe, not a tag.

---

## 7. Status machine

Eight statuses; roles and the noise-category/urgent-exception rules are in `PULSEDESK_PRD.md` §5.1. Transitions with triggers and guards:

| From | To | Trigger | Guard |
|------|----|---------|-------|
| *(new)* | `Open` | Real user message | dedup first; Critical gets `[ESCALATED]` prefix, still Open |
| *(new)* | `Dismissed` | Pre-filter or noise-category classification | messages row always persisted; reversible in /train |
| *(new)* | *(no ticket)* | Unattached admin message | `disposeUnattachedMessage` (drop-admin) |
| `Open` | `In Review` | Admin reply attaches | Resolved/Escalated/Awaiting User keep state |
| `Open`/`In Review` | `Resolved` | Admin's definitive answer (strict AI verdict) | conditional `.in(AUTO_RESOLVABLE_STATUSES)`; stamps `resolved_at` |
| `Open`/`In Review` | `Handed off` | Admin redirects off-platform (email/DM patterns) | checked BEFORE auto-resolve; `resolved_at` NOT stamped |
| `Open`/`In Review`/`Awaiting User` | `Assumed Resolved` | 7-day quiet sweep or D2 thread-reading sweep (admin-engaged only) | **never Escalated**; conditional update; stamps `resolved_at`; no Telegram post |
| `Awaiting User`/`Assumed Resolved`/`Handed off` | `In Review` | New in-channel user reply | clears `resolved_at` |
| any active + AR + Handed off | `Resolved` | User says thanks/it worked | sender's most recent such ticket; stamps `resolved_at` |
| `Open`/`In Review`/`Awaiting User`/`Assumed Resolved` | `Dismissed` | User deletes their root message | soft-delete + guarded update (never Escalated/Resolved) |
| any | any | Human via dashboard (`POST /api/tickets/:id/status`) | the ONLY trigger for the (kill-switched) outbound bot |
| `Dismissed` | `Open` | Human clicks Reopen in the Dismissed Audit | — |

`Escalated` and `Awaiting User` are entered **only** by humans. Every automatic write in this table is a guarded conditional update; `resolved_at` is the single source of truth for closure and every reopen clears it. Async-classification status writes obey the same discipline through `applyClassification`.

One known, accepted race: an admin reply landing inside the ~5–10s classification window can be followed by the classifier's outcome status when the guard matches exactly (documented in KNOWN_ISSUES; the 12s settle-wait in `reclassifyFromAdminReply` covers the reclassify half).

---

## 8. Data model (live schema truth)

**⚠ The reconstructed files in `supabase/migrations/` do NOT fully match the live schema** (they were rebuilt after the fact). Always verify columns against the live DB before trusting them. Live-DB migration tracking is by NAME (via Supabase MCP `apply_migration`), independent of the repo's manual `0NN_` numbering — `ls` the folder before numbering a new one; the DB won't catch a filename collision. Schema changes ship **migration-first** (live DB before code — PostgREST 23514s/400s on writes naming unknown columns/values), with explicit owner confirmation.

### tickets
| Column | Notes |
|---|---|
| `id` uuid PK | |
| `message_id` | FK → messages.id (root message; cascade: deleting the messages row deletes the ticket) |
| `telegram_message_id` **TEXT** | ⚠ `messages.telegram_message_id` is **BIGINT** — a live-schema mismatch from early development; supabase-js string filters work (PostgREST casts), raw SQL needs casts |
| `group_id` text | single-community today |
| `sender_hash` text | sha256(senderId+groupId)[:16] — no raw Telegram ids stored on tickets |
| `raw_text` | THE thread (block contract, §6) |
| `category`, `urgency`, `summary`, `product_area`, `sentiment`, `is_complaint`, `suggested_action`, `suggested_reply` | classifier outputs; CHECK constraints enumerate categories (12, migration 022) and statuses (8, migrations 009/017/020) |
| `status` | 8-value CHECK |
| `created_at` | the MESSAGE's own timestamp (not ingest time) |
| `updated_at` | ⚠ NOT auto-maintained — no trigger; every code path sets it explicitly |
| `resolved_at` | source of truth for closure; null for legacy pre-2026-06-11 resolutions (no fabricated timestamps); NOT stamped on Handed off |
| `last_message_at` | authoritative per-ticket last-activity signal (messages has no FK path for this); stamped with each message's own timestamp on all six attach sites; `coalesce(last_message_at, created_at)` for rare nulls |
| `first_admin_reply_at` | stamped exactly ONCE with the reply's own timestamp; legacy tickets null by design |
| `is_admin_message` | admin-rooted legacy tickets; filtered out of ALL stats at SQL source |
| `telegram_deep_link` | t.me link (migration 007) |
| `jira_url`/related | Jira escalation fields (migration 008; endpoint live, feature peripheral) |

### messages
`id` PK · `telegram_message_id` **BIGINT UNIQUE** (the dedup key; DB constraint = concurrency-safe last line) · `group_id` · `raw_text` · `sender_hash` · `sender_username` · `message_timestamp` (Telegram's clock) · `ingested_at` (⚠ there is **no `created_at`** column — another live-vs-reconstructed mismatch) · `reply_to_msg_id` bigint nullable (migration 019; null = not a reply; the `>0` normalization guard is load-bearing) · `ticket_id` uuid nullable (migration 019; stamped best-effort by `linkMessageToTicket` at ALL SIX attach sites; **no FK** — deleting a ticket does NOT cascade messages, re-point explicitly when merging) · `deleted_at` (migration 018, soft delete) · `is_admin_message`.

### corrections
`ticket_id` (FK → tickets, **cascade-deletes with the ticket** — ⚠ re-point corrections before deleting a merged-away ticket or training signal is silently lost) · `message_text` (the full user-side thread at correction time) · `original_category` / `correct_category` · `original_urgency` / `correct_urgency` (nullable; NULL = urgency not reviewed — all pre-021 rows) · `correction_source` CHECK ∈ `human_ui` | `admin_reply` | `human_skip` | `human_urgency` (widened by migrations 015/021 — the live constraint had to be ALTERed; the reconstructed files didn't show it) · `corrected_by` (hash or `sys_admin`) · `created_at`.

Semantics: `original = correct` under `human_ui` means a human CONFIRMED the AI; `human_skip` = reviewed-no-verdict (excluded from few-shot + /verify); `human_urgency` = urgency-only (category columns are placeholders; excluded from the /train reviewed-set; few-shot emits an urgency-only line for it). "Human-set urgency" = a `human_urgency` row OR a `human_ui` row with `original_urgency != correct_urgency` — a passive confirm deliberately does NOT freeze urgency.

### bot_replies
`ticket_id` · `status` · `dry_run` · `result` (`pending`/`sent`/`failed`/`dry_run`) · `telegram_message_id` · partial UNIQUE `(ticket_id, status) WHERE dry_run = false`. **Claim-then-send**: the row is inserted (result `pending`) BEFORE Telegram is called — the unique index is the concurrency gate; never switch to select-then-insert. Failed rows block their pair forever (v1); dry-run rows never block. Seeds `botSentMessageIds` at startup from the last 24h (even with the kill switch off) for the self-ingestion guard.

### audit_logs
`actor_id`, `action` (e.g. STATUS_CHANGE, CREATE_JIRA_ISSUE, urgency changes), `target_resource`, `previous_state`, `new_state`, `ip_address`. Best-effort (failures log a warning, never block).

### learned_keywords
Early-era adaptive keyword store fed by `extractAndLearnKeywords` on admin replies; feeds `learnedKeywordCache` into `shouldProcessMessage`. **Active in code but its effectiveness has never been measured** (KNOWN_ISSUES §3) — treat as legacy-but-live.

### tickets_stats(p_group_id, p_issues_only, p_start, p_end, p_search, p_urgency, p_category, p_today_start, p_today_end) → jsonb
THE single source for every KPI (full current body = migration 023). Key semantics: `is_admin_message = false` at the source; the issues-only filter and `activeCount` both carry the urgent-never-noise disjunct; median response via `percentile_cont(0.5)`; Lagos-day volume buckets; category/urgency breakdowns. The Issues-Only lane clause exists in TWO places that must stay in sync: `issuesOnlyOrClause()` (PostgREST, used by `applyBaseFilters`) and this function (SQL). ⚠ The exact-string unit tests on the `.or()` clauses are load-bearing — a malformed PostgREST or-string fails only at runtime as a silent 400 inside a sweep. Any new KPI goes INSIDE this function (never a JS row-scan — the old in-memory stats silently capped at 5,000 rows); any new base filter must reach BOTH the table query and the RPC params.

Live snapshot (2026-07-06, via the production API): 956 tickets; active 107 (open 100, in-review 65, escalated 0, awaiting 0); resolved 87 + assumed 63; handed off 12; **resolution rate 58%**; median response 374.5s; General Question dominates the all-time category mix (599/956) — the noise-lane design is why that's harmless.

---

## 9. API surface

All mutable responses `Cache-Control: no-store` (⚠ a cached response once made statuses snap back on the next poll). Helmet, restricted CORS, 1 MB JSON body limit. Rate limits: global 1,200/15min/IP (⚠ was 200 — the dashboard's own 5s poll tripped it and 429'd itself; poll is now 10s), `heavyLimiter` 20/15min on eval/verify/backfill/ingest (in-memory — restart resets it).

Auth tiers (`getAuthContext`): Bearer token from `POST /api/auth/login` (in-memory `activeTokens`, 8h TTL — **dies on every redeploy**; long-running scripts MUST use the header instead ⚠) · `x-admin-key` == `DASHBOARD_PASSWORD` ⇒ `super_admin` (stateless, timing-safe compare) · `x-admin-key` == `SUPPORT_API_KEY` ⇒ `support` role scoped to the group.

| Route | Auth | Notes |
|---|---|---|
| `GET /api/health` | none | commit, telegramReady/Connected, circuit states, lastMessageReceivedAt, ingestLag (median/max/sampleSize/computedAt), telegramDownForMs (see §2.5), lastGapRecovery (P0-2: ranAt/reason/recovered/reachedCheckpoint/capHit \| null), groqBudget (P1-4: requests/totalTokens/remaining\*/pctUsed/requestSource/tokenSource/rateLimitedToday/header) |
| `POST /api/auth/login` / `GET verify` / `POST logout` | password | token TTL 8h |
| `GET /api/communities` | auth | group list |
| `GET /api/tickets` | auth | table (paginated, `last_message_at` desc) + `tickets_stats` RPC merged; `applyBaseFilters` shared by both; `status` filter deliberately table-only; DEMO_MODE serves canned rows |
| `POST /api/tickets/:id/status` | auth | Zod-validated enum; audit-logged; the ONLY outbound-bot trigger |
| `POST /api/tickets/:id/urgency` | auth | inserts the `human_urgency` correction BEFORE updating; no-op short-circuit |
| `POST /api/tickets/:id/jira` | auth | creates a Jira issue via `JIRA_*` env (REST v3, audit-logged) |
| `POST/GET /api/eval` + `GET /api/eval/progress` | heavyLimiter | background job (verify-pattern): instant `{success,total}`, 409 while running, poll progress; `{messages:[...]}` override; 15s spacing; raw-model baseline (NO few-shot) ⚠ |
| `POST /api/verify` + `GET /api/verify/progress` | heavyLimiter | training-loop measurement; `human_ui` rows only; leave-one-out; errors retried once then EXCLUDED from denominator |
| `POST /api/test-message` | auth | live sandbox (uses few-shot, like production) |
| `GET /api/dismissed-audit` | auth | Dismissed ≤N days (default 30, cap 90), user-text-only signals + urgency-contradiction badge, human-reviewed excluded, cap 100 |
| `GET /api/train/next` / `POST /api/train/correct` | auth | reviewed-set excludes `human_urgency`; double-submit guard `.in(["human_ui","human_skip"])`; skip stamps NULL/NULL urgency |
| `POST /api/ingest` | super_admin | test/simulation workhorse (`isAdmin`, `msgDate`, `replyToMsgId`, `senderId`); heavyLimiter |
| `POST /api/backfill` + progress | super_admin | manual history pull |
| `GET /.well-known/security.txt` | none | |

Background-job pattern (eval/verify/backfill): synchronous long responses die at Railway's proxy edge **while the server keeps burning budget** — anything >~1 min must be start-then-poll. ⚠

---

## 10. Frontend (src/App.tsx, single file)

React 19 + Vite + Tailwind v4, served from `dist/` by Express. Polls `GET /api/tickets` every 10s; every poll-driven `setState` diffs first so identical data doesn't re-render the tree. ErrorBoundary per major section. Fetch helpers check Content-Type before `.json()` (a 502 HTML page must surface readably). Views: login → dashboard (KPI cards with plain-English tooltips, volume + resolution charts, filter bar, ticket feed with thread rendering + per-row status/urgency dropdowns) · /train (flashcards, full-conversation toggle, deep links, Correct/Wrong/Skip + urgency) · Benchmark modal (background-run progress, verification panel, audit card) · Dismissed Audit modal (🕵️).

⚠ Frontend lessons baked in: the "Real-Traffic Audit" card is **build-time-baked** — Vite/Rollup constant-folds the static `audit-results.json` import and dead-code-eliminates the other branch, so `npm run build` is required after changing that JSON. Oversized blur effects must stay tamed with `transform-gpu`/reduced radii (iOS Safari WebKit compositing failure = blank white page; only real-device verification is authoritative — the preview screenshot tool stalls on blur-heavy pages). Local server prefers a **stale `dist/`** over Vite middleware — rebuild before verifying UI changes locally. No secret in `VITE_*`/`define` (both inline into the shipped JS; grep `dist/` for `gsk_|eyJ|sk-|AIza` after build changes).

---

## 11. Security model

- **Data access:** Supabase service-role key only (`sb_secret_…` new-format, named key, rotated after a historical leak; legacy JWT keys DISABLED — re-enabling them resurrects the leaked key from public git history ⚠). RLS enabled on flagged tables; the server is the sole DB client.
- **Secrets:** validated at startup, no code fallbacks, never logged, never in the client bundle, never committed (the `.env` stays local; `*.mjs`/`*.cjs` are gitignored by convention with explicit negations for real utilities).
- **PII:** `redactPII(sanitizeForPrompt(text))` before every third-party LLM call (cards, BVN/NIN, phones, emails, API keys, crypto keys); sender identity stored as salted hash; audit sampler ships numbers-only JSON (worksheets with text live in the gitignored `audit/`).
- **Input hygiene:** Zod allowlists on every write route (never spread `req.body`); status/category/urgency validated against exact enums; prompt-injection mitigations (user text isolated in `role:user`, post-user system re-pin).
- **Telegram session string:** a real account credential — see §2.1. `LISTENER_DEBUG` diagnostic logging is metadata-only (never message text).
- **Auth:** timing-safe compares; generic 401s; tokens 8h in-memory.

---

## 12. Reliability pattern catalog (use these, don't reinvent)

1. **Idempotency by natural key:** dedup at the top of the one shared pipeline + DB UNIQUE as the concurrency backstop.
2. **Guarded conditional update:** every automated status write carries its precondition in the same statement (`.eq("status", inserted)` / `.in("status", [...])`).
3. **Fail-safe flag pairs:** every risky capability ships `X_ENABLED` default OFF + `X_DRY_RUN` default ON (parsed `!== "false"` so a missing var is safe); dry-run first in prod, read the preview, then arm. Dry-run structurally cannot catch remote-permission errors (Telegram sends) — budget a controlled live test.
4. **Claim-then-send** for outbound side effects (bot_replies partial unique index).
5. **Breaker + timeout + retry taxonomy** per provider; quota errors are cooldowns, not retries; deterministic 400s get per-item cooldowns.
6. **Fail toward visibility:** classification failure ⇒ Open + `[NEEDS REVIEW]`; topic-shift failure ⇒ new ticket; reconcile uncertainty ⇒ don't resurrect; noise uncertainty ⇒ let it through to the classifier.
7. **Pure-module extraction:** every risky decision lives in a small, dependency-injected module with exhaustive vitest coverage (25 modules / 404 tests / 26 files); the live legs that need `tlClient` are declared prod-only-verifiable, honestly.
8. **Preview-first data operations:** any live-DB cleanup/backfill runs a read-only preview, gets sign-off, sources text FROM `messages` (never hand-typed — data relocation is provably genuine), confirms with a SEPARATE post-delete SELECT (a `count(*)` in the same statement as a data-modifying CTE reads the pre-delete snapshot ⚠).
9. **Migration-first, additive, live-verified** schema changes (§8 preamble).

---

## 13. Operations runbook

- **Prod health:** `GET https://quidax-telegram-gemini-production.up.railway.app/api/health` → check `commit` (latest), `telegramReady:true`, circuits CLOSED (1–2 Gemini failures = normal quota micro-hits; only OPEN matters), `ingestLag.medianMs` (sub-3min = healthy), `telegramDownForMs` (should be null), `groqBudget` (P1-4: `requestsPctUsed`/`tokensPctUsed` well under 0.9 and `rateLimitedToday:0` = daily Groq budget healthy), and `lastGapRecovery` (P0-2: `recovered:0, reachedCheckpoint:true` on a healthy up-to-date system; `null` if `GAP_RECOVERY_ENABLED` is off). This is the authoritative pre-demo check.
- **Deploy:** push to main → Railway builds `node dist/server.mjs` (railway.toml; the npm start script has a Windows-only `chcp` and is not used). Keep `numReplicas=1`. Expect ~2.5 min including the 60s connect delay; confirm the new container via the health `commit` (or, for env-only redeploys where commit doesn't change, via `lastMessageReceivedAt` jumping to a fresh boot time). `railway variables --set` does NOT auto-redeploy in this CLI version — follow with `railway redeploy --yes`. `railway logs` streams the current container's recent buffer only — capture without pipes; the live DB is the authoritative record.
- **Local dev:** `scripts/dev-no-telegram.mjs` (blanks the session string, PORT=3100 — 3000 is occupied; shell env overrides `.env`). The launcher writes to the LIVE DB: clean up test rows by `telegram_message_id` (messages-row delete cascades the ticket; corrections cascade with tickets — verify the corrections count after cleanup). Kill lingering node processes on 3100 between runs. `x-admin-key` = `DASHBOARD_PASSWORD` (not VITE_). Grouping tests: a unique `senderId` isolates you from real tickets; avoid thanks/resolved wording unless testing auto-resolve; `/api/ingest` sits behind heavyLimiter (restart resets). Anything calling `tlClient` is a safe no-op locally — its first real exercise is prod; say so in the handoff.
- **Test suite:** `npx tsc --noEmit` + `npx vitest run` (460/29 — vitest excludes `**/.claude/**`; an agent worktree inside the repo once double-counted the suite) + `npm run build`.
- **Session burn response:** `AUTH_KEY_DUPLICATED` on a lone post-fix container = the string was invalidated on Telegram's side, not a deploy race; regenerate (owner instruction required), update Railway, redeploy.
- **Never:** run two GramJS sessions; re-enable legacy Supabase keys; widen sweep bounds without re-costing the Groq budget; bulk-ingest from a TooLong response.

---

## 14. Soundness cross-check — code vs. live vs. docs (2026-07-06)

Verified this session: prod commit == HEAD (`ed5763b`); all flag states read live from Railway (PRD §9 truth table); live KPI snapshot consistent with the migration-023 stats semantics; telegram connected, circuits closed.

Divergences found, honestly labeled:

| Finding | Class |
|---|---|
| `PULSEDESK_HANDOFF.md` sections 2–4 are stale (claims Gemini "3.1-Pro", "Cloud Run" hosting, port 3000) — the top banner is current | **Doc gap** (superseded by this doc; fix when next editing the handoff) |
| Old `PRD.md`/`ARCHITECTURE.md` are thinner and partially stale | **Doc gap** — superseded in content by the PULSEDESK_* versions; kept as history by user decision |
| `SUPPORT_API_KEY` on Railway appears to hold a placeholder value; it grants a real auth role (`support`) if matched | **Config debt / low-risk bug candidate** — set a real secret or unset it; placeholder values in an auth path are an accident waiting |
| `APP_URL` / `EVAL_BASE_URL` = `http://localhost:3000` on prod | **Config debt** — unused by serving paths (eval.ts CLI default); harmless but misleading |
| Jira integration (endpoint + Railway config, personal Jira) absent from CLAUDE.md/lessons and most docs | **Doc gap** (now documented here) |
| `learned_keywords` subsystem live but effectiveness never measured | **Known limitation** (tracked in KNOWN_ISSUES §3 since June) |
| `server_from_git.ts`, `git_history*.txt`, `all_files.txt`, assorted root `test-*.mjs/.js` are untracked/legacy clutter at the repo root | **Hygiene** — candidates for deletion in a housekeeping pass |
| Live `NewMessage` push handler permanently dead for the supergroup | **Accepted design** — superseded by channel-diff; handler kept harmless |
| In-memory state resets on redeploy (login tokens, D2 verdict cooldowns, heavyLimiter, botSentMessageIds re-seeded from 24h of bot_replies) | **Accepted design** — all have safe reload behavior |
| Supabase MCP rate-limited (429) during this session's schema pull — schema statements above rest on migrations 018–023 + each migration's documented live application + the live API snapshot | **Verification note** — re-run `list_tables` when convenient for belt-and-braces |

---

## 15. Re-drawing the diagram

If you need to redraw §1 for a slide: three swimlanes (Telegram → Railway backend → Supabase, with the React dashboard hanging off Supabase via the API). In the backend lane show: the 4 ingestion arrows converging on ONE `processAndIngestMessage` box; that box fanning out to `messages` (always) and `tickets` (conditionally); an async side-arrow to the LLM stack (Groq→Gemini fallback) writing back through the guarded update; a sweeps box (5 timers) looping on `tickets`; and the kill-switched outbound arrow back toward Telegram, drawn dashed. Annotate the Telegram edge "user session, read-only in practice (group is broadcast-only), single instance ever."
