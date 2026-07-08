# PulseDesk — Definitive Product Requirements Document

> **Provenance.** Written 2026-07-06 from a full-evidence investigation of the project itself: all 183 commits (2026-05-13 → 2026-07-05), KNOWN_ISSUES.md, PULSEDESK_HANDOFF.md, KPI_DEFINITIONS.md, CLAUDE.md, the classifier prompts and pure modules in the codebase, the 404-test suite, the live Railway environment, and the live production health endpoint (commit `ed5763b`, healthy, all circuits closed at time of writing). This document supersedes the older, thinner `PRD.md` **in content** — the old file is deliberately kept unmodified as a historical record. Companion documents: `PULSEDESK_ARCHITECTURE.md` (how the system is built) and `LESSONS_AS_REQUIREMENTS.md` (every hard-won production lesson as a numbered permanent requirement).
>
> **Audience.** A product owner, engineer, or AI agent who must maintain, extend, or rebuild PulseDesk using only the written record. Requirements marked **[INVARIANT]** were purchased with a real production incident and must never be weakened casually — each has a numbered entry in `LESSONS_AS_REQUIREMENTS.md`.

---

## 1. What PulseDesk is

PulseDesk is a production support-triage system for **Quidax**, a Nigerian cryptocurrency exchange, that turns the firehose of a public Telegram community (**OfficialQuidaxCommunity**, a broadcast-restricted supergroup with thousands of messages) into a clean, honest support-ticket dashboard. It listens to every group message through a Telegram user-session (MTProto/GramJS), decides what is a genuine support issue versus community noise, classifies issues by category and urgency with an LLM (Groq `openai/gpt-oss-20b`), assembles multi-message conversations into single tickets, tracks admin engagement and resolution automatically, learns from human corrections, and reports support KPIs whose formulas are documented to the SQL level.

It runs live on Railway (single container, single GramJS session), stores everything in Supabase Postgres, and serves a React dashboard from the same Express process. It was built solo, incrementally, over ~8 weeks (183 commits), as both a working tool and a pitch asset demonstrating deployable value to the Quidax team.

## 2. Problem statement

Quidax's community support happens **inside a public Telegram supergroup**, not a ticketing system. That creates five compounding problems, each observed directly in this project's production data:

1. **Real issues drown in noise.** Roughly a third of "active" messages at the June 2026 audit were greetings, price-bot commands (`/p BTC`), pasted crypto news, and user-to-user banter. A support agent must read everything to find the complaint that matters.
2. **The stakes are financial and immediate.** The messages that matter are stuck withdrawals, missing deposits, locked accounts with funds inside, and scam/phishing reports. The canonical incident: a live complaint reading *"scammed me of 100k"* (ticket `25f6281d`, 2026-07-01) became **invisible on the dashboard** after a category-only rewrite moved it into a noise category while its High urgency survived — the class of failure this product exists to prevent, and the reason for the urgent-is-never-noise guard (migration 023).
3. **Conversations are fragmented.** Real users describe one problem across many short messages, interleaved with admin replies, usually without using Telegram's reply feature. At the June-19 audit, one user's single 4-hour deposit/KYC conversation had become **14 separate tickets**. Classifying isolated fragments also destroys accuracy ("USDT too" is unclassifiable alone).
4. **Resolution is mostly invisible.** Admins resolve issues and users simply go quiet; nobody says "resolved." Many resolutions move to email/DM where a group listener structurally cannot see the outcome. A naive resolution metric therefore reads absurdly low (16% at the June-19 audit) and slanders a genuinely responsive support team — the KPI system exists to make the numbers *honest in both directions*.
5. **Language reality: Nigerian Pidgin English.** A significant share of messages are Pidgin ("dem block my account", "money never enter", "e dey pending", "abeg help me"). A stock LLM misreads these as unclassifiable or mis-grades their urgency. Classification quality in this domain **requires** explicit Pidgin coverage (the `pidgin-glossary.ts` prompt section; 6 of the 24 benchmark cases are Pidgin).

**Why Telegram user-session ingestion (and not the Bot API):** a Telegram bot only sees messages addressed to it or in groups where it has privileged access; a user-session sees the group as a member does — which is the entire point. The cost of that choice is a set of hard operational constraints (single session, permanent session-string burns on concurrent connections, a push-update protocol quirk that required building a `getChannelDifference` polling path) that shaped much of the architecture.

## 3. Users

| User | Needs |
|---|---|
| **Quidax support agents** (primary) | A triage queue that surfaces genuine issues fast, ranked by urgency, with the full conversation thread on one ticket; one-click status changes; suggested replies; confidence that nothing urgent is hidden. |
| **Quidax support team leads** (primary) | Honest KPIs (active backlog, median response time, resolution rate) with formulas they can defend to management; audit trails for every automatic decision (Assumed Resolved, Dismissed, Handed off). |
| **The operator/owner (Jimi)** (secondary) | A deployable pitch asset; a /train workflow to correct the AI; instruments that measure accuracy credibly (benchmark + independent real-traffic audit); safe operations (kill-switched outbound, dry-run-first sweeps). |
| **An independent auditor / Quidax rater** (occasional) | Blind rating worksheets for the real-traffic accuracy audit; documented methodology (`docs/ACCURACY_AUDIT_METHODOLOGY.md`). |

## 4. Product principles (each purchased with a real incident)

1. **Never lose a message.** Every non-duplicate group message is persisted to `messages` *before* any decision about it is made; every skip is logged. (June-12 audit found messages silently eaten by a quoted-reply dead end.) **[INVARIANT]**
2. **Exclude, never delete.** Noise is Dismissed — visible, filterable, reversible in /train, and watched by the Dismissed Audit — never dropped. A misclassified real issue must always be recoverable. (User-locked decision, 2026-06-19.) **[INVARIANT]**
3. **An urgent verdict is never noise.** A ticket the classifier rated High/Critical stays visible in the triage lane, counted in KPIs, and eligible for sweeps regardless of category. (The 100k-scam invisibility, migration 023.) **[INVARIANT]**
4. **Honest numbers in both directions.** The rate must not count spam as resolutions (80% → 53% correction, 2026-06-11) and must not count invisible off-platform work against the team (Handed off exclusion; Assumed Resolved for go-quiet closures; median not mean response time).
5. **Human-in-the-loop is a feature, not a fallback.** AI classifications are correctable in /train and from the dashboard; corrections feed few-shot learning; a human's deliberate choice (urgency, status) is never overwritten by automation. **[INVARIANT]**
6. **Fail-safe automation.** Every automated write is a guarded conditional update; every sweep ships behind a default-OFF flag with a default-ON dry-run; every LLM parse failure degrades to "do nothing" / "keep visible", never to a destructive action. **[INVARIANT]**
7. **Evidence over assertion.** Nothing is "verified" until proven against the live system (health endpoint, live DB, Railway logs), and prod-only legs are called out honestly as such in the docs.

## 5. The ticket model

### 5.1 Statuses (8) and their role in the resolution rate

| Status | Dashboard label | Meaning | Rate role |
|---|---|---|---|
| `Open` | Open | Real issue, no admin engagement. A fresh **Critical** lands here with an `[ESCALATED]` summary prefix (never as In Review, which would falsely read "Admin Replied") | denominator |
| `In Review` | **Admin Replied** | An admin replied at least once, or a user replied to a parked/closed ticket | denominator |
| `Escalated` | Escalated | Human-flagged. **No automatic path ever sets it or moves a ticket out of it** | denominator |
| `Awaiting User` | Awaiting User | Human-parked, waiting on the user | denominator |
| `Resolved` | Resolved | Closed with evidence: a human click, an admin's definitive answer (AI-verified), or the user's own "thanks, it worked" | numerator |
| `Assumed Resolved` | **Likely Resolved** | Auto-closed by the 7-day-quiet sweep or the thread-reading (D2) sweep; auditable separately; reopens on any user reply | numerator |
| `Handed off` | Handed Off | Admin redirected the user off-platform (email/DM); outcome unobservable | **excluded from both** |
| `Dismissed` | Dismissed | Noise (banter, spam, price commands, scams); reversible; watched by the Dismissed Audit | **excluded from both** |

Additional denominator rule: active tickets in **noise categories** (General Question, Praise, Spam/Irrelevant, Community Chat) are excluded from `activeCount` — *unless* the ticket's urgency is High/Critical (principle 3). Admin-rooted tickets (`is_admin_message = true`) are excluded from every number at the SQL source.

### 5.2 Category taxonomy (12, exhaustive — enforced by a live DB CHECK constraint)

Withdrawal Issue · Deposit Issue · Account Access · KYC/Verification · Trading Problem · App Bug · Fee Complaint · Network/Downtime · General Question · Praise · **Community Chat** · Spam/Irrelevant.

Two deliberate boundary decisions:
- **Community Chat vs Spam/Irrelevant** (added 2026-07-03, migration 022): Community Chat = benign greetings/banter/price talk; Spam/Irrelevant = **scams, phishing, and ads only**. Splitting them means a screaming phishing message and a friendly "gm fam" no longer share a bucket.
- **General Question is NOT auto-dismissed.** It is also the classifier's fallback when it fails, so dismissing it would hide every message the model fumbled (June-12 audit finding). It stays visible as Open/Low. Failed classifications are flagged `[NEEDS REVIEW]` and are never dismissible.

Auto-dismiss applies only to: pre-filtered noise, Praise, Spam/Irrelevant, Community Chat.

### 5.3 Urgency semantics (4 levels, exact rules from the live prompt)

- **Critical** — confirmed account compromise (unauthorized access AND funds taken), or a SPECIFIC described transaction (amount/asset/timeframe) stuck 3+ days. A fresh Critical lands **Open + `[ESCALATED]` prefix**.
- **High** — active financial problem under 3 days; account locked with funds at risk; platform-wide outage **even phrased as a question**. A vague "you stole my money" with no specific transaction is High, not Critical.
- **Medium** — KYC pending, app bugs, trading problems, fee disputes, 1–2 day delays. A **context-free fragment** (bare transaction ID, few words with no described problem) is NEVER above Medium.
- **Low** — general questions, praise, community chat. General Question and Community Chat are **forced** to Low at classification time.

Urgency is AI-assigned at classification, revisable only by humans (dashboard dropdown or /train); a deliberate human urgency choice is never overwritten by re-classification. **[INVARIANT]**

## 6. Functional requirements

### FR-1 Ingestion — completeness and idempotency

1. **Four overlapping ingestion paths**, all feeding ONE shared `processAndIngestMessage()`: (a) `getChannelDifference` poll every 15s (primary, ~14s lag — exists because GramJS 2.26.x never syncs channel `pts`, so Telegram withholds the supergroup's push updates; proven by a production diagnostic spike); (b) AutoFetch sweep every 3 min with a 2-hour lookback (safety net, ~37–174s lag); (c) `reconcileOrphanMessages` hourly (self-healing: replays `messages` rows that never got a ticket, e.g. after a mid-build crash); (d) manual `POST /api/backfill`.
2. **The `telegram_message_id` dedup check is the first statement** of `processAndIngestMessage`, before any branch that writes; the DB UNIQUE constraint is the last-resort backstop. Any mutation inside the function must be idempotent because all four paths overlap. **[INVARIANT]**
3. **Every non-duplicate group message persists a `messages` row before any attach/drop decision**; skips are logged. **[INVARIANT]**
4. **Reply-to metadata is ground truth** (migration 019): every message stores `reply_to_msg_id`; every attach path stamps `messages.ticket_id`; quoted replies resolve their target ticket via the quoted message's `ticket_id` FIRST, with sender-hash/time-window heuristics only as fallbacks. (Time-based attribution provably mis-attached admin replies to strangers' tickets.)
5. **Admin messages never become standalone tickets.** Unattached admin messages are dropped by policy (`disposeUnattachedMessage`) — but attach generously first: quoted replies (including to folded follow-ups, via sender resolution) and an un-quoted ~30-minute most-recently-active window. **[INVARIANT]**
6. **Edited/deleted Telegram messages are handled** on the working ingestion path (channel-difference `otherUpdates`): edits update stored text; a user deleting their **root** message soft-deletes (`messages.deleted_at`) and Dismisses the ticket via a guarded update (never clobbering Escalated/Resolved); deleting a follow-up only soft-deletes the row. Edit/delete events from OTHER chats must be ignored (Telegram message IDs are per-chat; a cross-chat collision once corrupted real rows). **[INVARIANT]**
7. **Only target-group traffic counts** for ingestion and for the listener-health watchdog clock (exact resolved channel-id match; the fuzzy name match survives only as a pre-resolution startup fallback).
8. The reconcile sweep must never resurrect admin/bot messages as user tickets: it filters via content recognizers plus the `ADMIN_SENDER_HASHES` env allowlist (armed live with the long-tenured admin's hash), because `messages` stores only `sender_hash` and admin detection cannot be re-run offline.

### FR-2 Classification

1. **Pipeline:** pre-filter (free, rule-based) → Groq classification (async) → Zod validation with normalization of common LLM field-drift (`priority`→`urgency`, `type`→`category`) → policy decision (`decideClassificationOutcome`). Gemini (`gemini-2.5-pro`) is the classification fallback provider. Everything sent to any LLM passes `redactPII(sanitizeForPrompt(...))`. **[INVARIANT]**
2. **The system prompt must contain:** the exact output-schema key list (its silent loss once caused 101/102 tickets to carry fallback "User inquiry" summaries for weeks), the 12-category definitions, the urgency rules of §5.3 with worked examples, the feature-existence rule ("can I…?" with no problem → General Question), Nigeria-specific context (NGN, BVN/NIN, TRC20/BEP20/ERC20), and the **Pidgin glossary** appended. Language coverage lives in the base prompt — NOT in few-shot — so it also reaches the raw-model benchmark. **[INVARIANT]**
3. **Failure policy:** after 3 parse failures, create the ticket anyway with `classification_failed: true`, summary-flagged `[NEEDS REVIEW]`, kept Open — never crash, never dismiss, never lose the message. **[INVARIANT]**
4. **Pre-filter (`noise-prefilter.ts` + `shouldProcessMessage`):** conservative AND-gates that route obvious noise (bare price commands `/p BTC`, long pasted news, automated price-snapshot dumps) straight to Dismissed without an LLM call, biased heavily toward LETTING MESSAGES THROUGH (a false positive hides a real issue; a false negative just costs one Groq call). "refund" is an explicit issue-signal (`\b(fund)\b` never matches inside "refund" — a real complaint was once pre-filtered to Dismissed because of that regex gap). The `messages` row is always persisted regardless.
5. **The async classifier must never clobber a status set during its ~5–10s window** (admin reply, dashboard change): its write is a guarded conditional update — status is written only if still exactly what ingestion inserted. **[INVARIANT]**
6. **Urgent-is-never-noise (read layer):** the Issues Only lane, `tickets_stats.activeCount`, and both auto-resolve sweeps each carry the High/Critical exception clause; the Dismissed Audit flags Dismissed-but-urgent tickets. The guard lives at READ time because category-only rewrite paths (admin-reply reclassify, /train fixes) never re-derive urgency and historical rows exist. **[INVARIANT]**

### FR-3 Conversation threading

1. A same-sender, un-quoted message folds into the sender's single most-recent ACTIVE ticket as a `[USER_FOLLOWUP]` block, by time band: **fast** (≤5 min: fold, no LLM), **extended** (5 min–6 h: one Groq topic-shift call decides same-issue-vs-new-ticket), **none** (>6 h: new ticket). An unanswered **burst** (candidate still Open, no admin reply, ≤30 min) folds without the LLM call.
2. **Topic-shift is fail-safe to a NEW ticket**: any parse failure, timeout, breaker-open, or error means "different issue" — the system must never wrongly merge two issues; a Groq outage degrades to pre-threading behavior. **[INVARIANT]**
3. Every fold re-classifies the ticket from the FULL user-side thread (`userThreadText`) — fragments get context. Grouped re-classification preserves human-set urgency.
4. `Assumed Resolved` is deliberately NOT a fold candidate (the quoted-reply path reopens it instead).
5. The reply-block tags (`[ADMIN_REPLY]`/`[USER_REPLY]`/`[USER_FOLLOWUP]`) are a **parsing contract** shared by multiple exact-match consumers; changing their shape is a cross-cutting change, not a local edit. **[INVARIANT]**

### FR-4 Status workflow and auto-resolution

1. **Admin reply behavior:** attaches to the ticket (FR-1), moves Open → In Review, stamps `first_admin_reply_at` exactly once using the reply's own Telegram timestamp, and triggers `reclassifyFromAdminReply`, which (a) may correct the category (exact-match against the valid list; hallucinations are rejected, never normalized into a default), (b) checks for an **off-platform hand-off** (email/DM patterns) FIRST, then (c) may **auto-resolve** if the reply was a definitive, complete answer (strict `resolved === true` from the model). All such writes are guarded to Open/In Review only. **[INVARIANT]**
2. **User reply behavior:** attaches, flips Awaiting User / Assumed Resolved / Handed off → In Review (clearing `resolved_at`); a user "thanks, it worked" resolves the ticket.
3. **Two auto-resolve sweeps** (hourly, staggered): the **7-day quiet** sweep (admin-engaged + quiet ≥7 days → Assumed Resolved) and the **D2 conversation-aware** sweep (admin-engaged + quiet ≥24 h → Groq reads the whole thread and answers "did support resolve this?", strict-true only, with per-ticket re-check cooldowns to respect the Groq budget). Both: eligible statuses Open/In Review/Awaiting User, **never Escalated**; guarded conditional updates; never post to Telegram; admin-engaged = `[ADMIN_REPLY]` in raw_text OR `first_admin_reply_at` set (the column alone under-counts legacy tickets). **[INVARIANT]**
4. **Escalated is a human fortress:** no automatic path sets it, resolves it, or leaves it. **[INVARIANT]**
5. Every automated status write in the system is a guarded conditional update (`.in("status", [...])` in the same statement) so a concurrent human change is never clobbered. **[INVARIANT]**

### FR-5 Human training loop

1. **/train page:** flashcard review of unreviewed tickets (full-thread context, "Show full conversation", Telegram deep link), with verdicts Correct / Wrong-fix-it / **Skip**, plus an urgency selector.
2. **Corrections semantics (exact, load-bearing):** `human_ui` = real review (confirm = `original_category = correct_category`); `admin_reply` = machine-inferred from an admin's reply; `human_skip` = human-confirmed no-op (excluded from few-shot and /verify); `human_urgency` = dashboard urgency-only change (category columns are placeholders; excluded from the reviewed-set; never presented as a category confirmation). NULL urgency columns = urgency not reviewed. Any corrections row marks a ticket "reviewed" for /train (skips and reviews both); `human_urgency` alone does not.
3. **Few-shot learning:** every live classification is primed with the 5 most similar past corrections (naive keyword overlap — an accepted limitation), merge-deduped per message so an urgency-only row never shadows a category correction, excluding `human_skip`. Few-shot injection exists in the live pipeline, the Gemini fallback, and `/api/test-message` — **deliberately NOT in `/api/eval`**, which stays a raw-model baseline. **[INVARIANT]**
4. **Human urgency is sticky:** a `human_urgency` row, or a `human_ui` row that changed urgency, freezes urgency against grouped re-classification; a passive /train confirm deliberately does NOT freeze (so a genuinely urgent follow-up can still escalate). **[INVARIANT]**
5. A deliberate wrong admin-reply correction can propagate until a human re-corrects — accepted; the newest-wins dedupe bounds the damage.

### FR-6 Dashboard

1. **Ticket feed** sorted by `last_message_at` desc (recently-active first), paginated, with per-row status dropdown, urgency dropdown, category badge, urgency badge, handed-off badge, thread view rendering all reply blocks, and Telegram deep links.
2. **Lanes/filters:** Issues Only (non-noise + non-Low, PLUS any non-Dismissed High/Critical, PLUS still-classifying placeholders), status filter, category, urgency, date ranges (all Lagos calendar days), free-text search — every filter reaches BOTH the table query and the stats RPC (the `status` filter alone is deliberately table-only because the KPI cards break down by status). **[INVARIANT]**
3. **KPI cards** (formulas documented in `KPI_DEFINITIONS.md`, computed in the `tickets_stats` SQL function): Active Issues, In Review ("Admin Replied"), Resolved (+ "N assumed" subline), Resolution Rate, **Median** Response Time, urgency mix, volume-by-day chart, Resolved Today (human-resolved only, Lagos day).
4. **Dismissed Audit modal (🕵️):** scans recent Dismissed tickets for actionable signals (refund/stuck-funds/locked-account/hacked/KYC-stuck, including Pidgin variants) plus the AI-rated-High/Critical contradiction badge; user-text only (admin wording never flags); human-reviewed tickets excluded; one-click Reopen. This is the standing safety net for "a real issue was filed as noise."
5. **Benchmark modal:** runs the 24-case gold suite as a background job with live progress; "Training Loop Verification" panel (see FR-7); Real-Traffic Audit card (build-time-baked from `audit-results.json`; deliberately shows "pending" until an independent rating exists).
6. **Auth:** password login (server-side check) issuing an in-memory Bearer token; the stateless `x-admin-key` header (value = `DASHBOARD_PASSWORD`) for scripts/CLI — login tokens die on every redeploy, so long-running scripts must use the header. No Supabase key ever reaches the frontend. **[INVARIANT]**
7. **Jira escalation:** `POST /api/tickets/:id/jira` creates a Jira issue from a ticket via the configured `JIRA_*` env vars (migration 008-era feature; configured live against a personal Jira; functional but not part of the core pitch).
8. **DEMO_MODE:** env flag that serves canned demo tickets from `/api/tickets` instead of live data (pitch insurance; live value: false).

### FR-7 Measurement and accuracy instruments

1. **`/api/eval` (gold benchmark):** 24 hand-authored cases (English + 6 Pidgin + policy-regression cases) in committed `benchmark-cases.ts` (a gitignored JSON once silently never deployed). Raw-model baseline — no few-shot — so numbers are comparable across time; re-baselined ONCE for the taxonomy change (old 20-case numbers not comparable). Runs as a background job (instant start, `GET /api/eval/progress` polling, 409 double-start guard) because a synchronous run outlived Railway's proxy timeout. Current: **24/24 — category 100 / urgency 100 / overall 100, local AND prod (2026-07-03)**. Its role is an internal regression check, NOT the pitch accuracy claim.
2. **`/api/verify` (training-loop measurement):** re-classifies human-reviewed (`human_ui` only) messages with and without few-shot, leave-one-out (a message never sees its own stored correction), transient errors retried once then excluded from the denominator. Its number is **selection-biased** (the pool is enriched with the AI's hardest cases) and must never be pitched as accuracy. **[INVARIANT]**
3. **Real-traffic accuracy audit (the credible number):** stratified sample of real messages classified by the DEPLOYED eval endpoint, rated BLIND by an independent Quidax agent (worksheets generated 2026-07-03: 54 agreement rows + 145 system rows covering ALL Assumed-Resolved and ALL actionable-category Dismissed tickets, plus fold/split samples). Grading: category exact-match + confusion matrix; urgency within-one-level + recall on High/Critical (the business metric); blank/invalid cells excluded from denominators. **Author-rated numbers are never published** — the dashboard card stays "pending" until the independent rating returns. **[INVARIANT]**
4. **System-level trust metrics** (in the audit): auto-resolve precision (were Assumed-Resolved tickets truly resolved?), noise false-negative rate (did the filter ever hide a real issue?), grouping over-merge/over-split rates.

### FR-8 Outbound status-update bot (BUILT, PARKED)

Dashboard status changes (Resolved / Escalated / Awaiting User) can post an empathetic templated reply to the user's original Telegram message. Shipped behind hard rails: `BOT_REPLIES_ENABLED` default OFF, `BOT_REPLIES_DRY_RUN` default ON (`!== "false"` — fail-safe parsing), claim-then-send dedup through a `bot_replies` row + partial unique index (never twice per ticket+status, concurrency-safe), rate limits, 7-day age guard, admin-ticket skip, target-group hard rail, and a self-ingestion guard (the bot's own messages must never re-ingest as admin replies — they'd corrupt the response-time KPI). **[INVARIANT]**

**Blocked at the group level:** OfficialQuidaxCommunity is broadcast-only — the session account cannot post (`USER_BANNED_IN_CHANNEL`), re-verified on a second account 2026-06-19; the user cannot post manually either. No code change can fix this; go-live requires Quidax granting posting rights. Dry-run structurally cannot catch Telegram-side permission errors, so any future go-live must budget a controlled live test. Failed sends permanently block their (ticket, status) pair until the row is deleted manually (v1 decision).

### FR-9 Security and privacy

1. Backend uses the Supabase **service-role key only** (new-format `sb_secret_…`); legacy JWT keys are disabled and must never be re-enabled (a leaked key from public git history is dead only while they stay disabled). **[INVARIANT]**
2. No secret ever enters the client bundle (nothing sensitive in `VITE_*`/`define`); LLM and DB access go through the backend; `dist/` is grep-checked for key patterns after build changes.
3. All LLM calls send `redactPII(sanitizeForPrompt(text))` (cards, BVN/NIN, phones, emails, API keys, crypto keys); user text rides in `role: user`, never concatenated into the system prompt.
4. Senders are stored as salted hashes (`sender_hash`), not raw Telegram IDs, in tickets; API responses never include tokens/keys; errors are generic to clients with full detail only in logs.
5. Required env vars are validated at startup (process exits loudly); **no hardcoded fallback for any secret** (a fallback password in source once matched the real one in a public repo and forced rotation). **[INVARIANT]**
6. Express hardening: helmet, restricted CORS, 1 MB JSON body limit, rate limits (global 1200/15min tuned above the dashboard's own polling; `heavyLimiter` 20/15min on eval/verify/backfill/ingest), `Cache-Control: no-store` on mutable API responses (a cached response once made ticket statuses snap back on the next poll).
7. The GramJS session string is a de-facto credential for a real Telegram account: never log it, never run two connections (permanent `AUTH_KEY_DUPLICATED` burn), never regenerate without explicit owner instruction. **[INVARIANT]**

### FR-10 Operational requirements

1. **Single instance, always:** `numReplicas = 1`; deploys must survive Railway's rolling overlap via BOTH the SIGTERM graceful-disconnect AND the 60s startup connect delay (`TELEGRAM_CONNECT_DELAY_MS`). Local testing against prod-live sessions is time-boxed. **[INVARIANT]**
2. **LLM budget discipline (Groq free tier: 1,000 req/day, 8K tokens/min, 200K tokens/day):** sequential calls with spacing (eval 15s, D2 20s, ingestion 2.1s), D2 per-ticket verdict cooldowns (24h re-check), quota-aware Gemini cooldown (60 min on 429/RESOURCE_EXHAUSTED — quota errors are "retry much later", never "retry in a second"), circuit breakers per provider. **(2026-07-08, P1-4)** All Groq calls now route through one `groqChatCreate` wrapper that meters daily request/token usage (`groq-budget.ts`) and surfaces it on `/api/health.groqBudget`, with a `GroqBudget` sustained-breach alarm when usage crosses `GROQ_BUDGET_ALERT_PCT` of a daily cap or any 429 is seen today. ⚠ Groq's `x-ratelimit-remaining-tokens` is a per-minute (8K) bucket, not the daily 200K — the daily token pct is therefore tally-based; a header is trusted for a dimension only when its own limit equals the configured daily cap. **[INVARIANT]**
3. **Health & liveness:** `GET /api/health` reports commit, telegramReady, circuit states, `lastMessageReceivedAt` — that field alone is not trustworthy (boot-initialized, reset by reconnects). **(2026-07-07)** The endpoint also reports `ingestLag` (median/max DB ingest lag over the last 50 `messages` rows, `ingested_at − message_timestamp`, refreshed every 60s) and `telegramDownForMs` (continuous session-down duration), with a shared sustained-breach alarm (`observability.ts`) that alerts (log + optional `ALERT_WEBHOOK_URL`) once either signal stays bad past its threshold. **(2026-07-08)** It further reports `lastGapRecovery` (P0-2: the last outage-gap backfill run) and `groqBudget` (P1-4: today's Groq usage) — completing the three-gap reliability roadmap (manual SQL checks are now always-on metrics).
4. All timed sweeps and their schedule are documented in `PULSEDESK_ARCHITECTURE.md`; every sweep is gated by an env flag with fail-safe defaults and has a dry-run mode where it writes.
5. **Quality gates for every change:** `tsc --noEmit` clean, full vitest suite green (currently **460 tests / 29 files**), `npm run build` clean, plus e2e verification on the no-telegram launcher (`scripts/dev-no-telegram.mjs`, PORT 3100) against the live DB with test-data cleanup by `telegram_message_id`. Prod-only legs (anything requiring the live socket) are declared honestly in the handoff rather than claimed verified.

## 7. Explicit non-goals

1. **No posting to the group** while it remains broadcast-only (FR-8); no auto-retry of failed bot sends.
2. **No DM/email visibility.** Off-platform resolutions are structurally invisible; the product answer is the `Handed off` status, not scraping DMs.
3. **No deleting of data as noise handling** — Dismissed is the strongest demotion that exists.
4. **No embeddings/semantic search for few-shot** at current volume (naive keyword overlap accepted; revisit past a few hundred corrections).
5. **No multi-tenant / multi-group support.** One group, one deployment (a `group_id` column exists but the product is single-community).
6. **No horizontal scaling.** The GramJS session forbids replicas; the design goal is graceful behavior at Telegram-group scale, not web scale.
7. **No autonomous outbound AI.** Suggested replies are for humans to send; the (parked) bot posts fixed templates on human status changes only.
8. **No second Telegram session for any purpose** (history re-fetch, testing) while production is live — it permanently burns the session string.
9. **Not a general helpdesk product** — Quidax-specific taxonomy, Nigeria-specific context (NGN, BVN/NIN, Pidgin), and pitch-driven scope are deliberate.

## 8. Success metrics — definitions and honest current values

| Metric | Definition | Value (date) |
|---|---|---|
| Resolution rate | `(Resolved + Assumed Resolved) ÷ (Resolved + Assumed Resolved + Active)`, Dismissed/Handed-off/noise-category-actives excluded | **58% live** (2026-07-06, production API: 87 Resolved + 63 Assumed Resolved vs 107 active); journey: 80% (dishonest) → 53% (honest, Jun 11) → 16% (backlog exposed, Jun 19) → 22% → 38.4% → 43.7% → 46.3% (Jun 22) → ≈54% (Jul 2) → 58% |
| Median first-response time | `percentile_cont(0.5)` over `first_admin_reply_at − created_at` | **6.2 min live** (374,500 ms, 2026-07-06, over 134 responded tickets); 41% under 5 min at the Jun-19 audit (the old mean read 8.4h because of one 18-day mis-attach outlier) |
| Gold benchmark | 24 cases, category / urgency / overall, raw-model | **100 / 100 / 100** local AND prod (2026-07-03) |
| Real-traffic audit | Independent blind rating: category agreement, urgency within-one, High/Critical recall, auto-resolve precision, noise false-negative rate | **Pending independent rater** (worksheets generated 2026-07-03; deliberately unpublished until then) |
| Ingestion lag | `ingested_at − message_timestamp` on recent messages | ~14s via channel-diff (verified 2026-06-14); AutoFetch fallback 37–174s |
| Message completeness | Orphaned `messages` rows (no ticket, not noise) | 0 after each reconcile sweep (live since 2026-06-20) |
| Test suite | vitest | **404 tests / 26 files** green (2026-07-03) |
| Original PRD targets (kept) | 10k messages/day without crashing; 90%+ post-training accuracy; 50% agent-time saved; 3× faster High/Critical handling; secrets never exposed | Aspirational; the audit instruments above are how accuracy will be proven |

## 9. Current deployment truth table (live-verified 2026-07-06 against Railway + /api/health)

| Capability | State | Flag(s) |
|---|---|---|
| Channel-difference live ingestion (15s) | **LIVE** | `CHANNEL_DIFF_ENABLED=true` |
| AutoFetch safety net (3 min) | **LIVE** | always on |
| Orphan reconciliation sweep | **LIVE, writing** | `INGEST_RECONCILE_ENABLED=true`, `DRY_RUN=false` |
| 7-day Assumed-Resolved sweep | **LIVE, writing** | `ASSUMED_RESOLVE_ENABLED=true` |
| D2 conversation-aware resolution | **LIVE, writing** | `RESOLUTION_INFER_ENABLED=true`, `DRY_RUN=false` |
| Outage-gap recovery (P0-2) | **LIVE** (2026-07-08, commit `f28ed79`; startup `reachedCheckpoint` no-op verified in prod) | `GAP_RECOVERY_ENABLED=true`, `GAP_RECOVERY_MAX_MESSAGES=500`, `GAP_RECOVERY_MAX_AGE_HOURS=24` |
| Groq budget accounting (P1-4) | **LIVE** (2026-07-08, commit `f28ed79`; `/api/health.groqBudget` serving) — metering is read-only; alarm only logs/POSTs | `GROQ_DAILY_REQUEST_CAP=1000`, `GROQ_DAILY_TOKEN_CAP=200000`, `GROQ_BUDGET_ALERT_PCT=0.9` (all at code defaults; env unset on Railway) |
| Admin-hash allowlist for reconcile | **ARMED** | `ADMIN_SENDER_HASHES=<long-tenured admin hash>` |
| Bot-sender denylist (grouping tune) | **DORMANT** (2026-07-08, commit `29282df`; content noise-guard active, denylist empty) — arm with the price/welcome bot handles | `TELEGRAM_BOT_USER_IDS`, `TELEGRAM_BOT_USERNAMES` unset |
| Outbound status bot | **PARKED (kill-switched)** | `BOT_REPLIES_ENABLED=false`, `DRY_RUN=true`; group is broadcast-only |
| Demo mode | OFF | `DEMO_MODE=false` |
| Listener debug logger | OFF | `LISTENER_DEBUG=false` |
| Groq model | default `openai/gpt-oss-20b` (env not set; llama rollback lever dies 2026-08-16) | `GROQ_MODEL` unset |
| Deploy-overlap connect delay | code default 60s (env not set) | `TELEGRAM_CONNECT_DELAY_MS` unset |
| Jira escalation | configured (personal Jira, project KAN) | `JIRA_*` set |
| Prod commit | `ed5763b` = HEAD of main — **everything merged is deployed** | — |
| Telegram session | #3 (personal account, member, cannot post), connected | — |
| Known config debt | `SUPPORT_API_KEY` appears to hold a placeholder value; `APP_URL`/`EVAL_BASE_URL` point at localhost on prod (unused in serving paths) | — |

## 10. Definition of done (for any future change)

A change is done when: the type-check, full test suite, and build are green; the behavior is proven e2e on the no-telegram launcher against the live DB (or unit-tested pure modules + an honest "prod-only leg" declaration where the live socket is required); test data is cleaned up by `telegram_message_id`; production health is re-verified after deploy (`/api/health`: new commit, telegramReady, circuits CLOSED, no `AUTH_KEY_DUPLICATED` in logs); the relevant docs (PULSEDESK_HANDOFF.md, KNOWN_ISSUES.md, this PRD's truth table if flags changed) are updated; and any schema change was applied to the live DB via a tracked migration BEFORE the code that needs it, with explicit owner confirmation.
