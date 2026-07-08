# PulseDesk — Lessons as Requirements

> **Provenance.** Written 2026-07-07. Every entry below is a **permanent requirement** that was purchased with a real incident in this project's history — a production failure, a live-data audit finding, or a proven bug class — discovered from the project's own record (git history 2026-05-13 → 2026-07-05, KNOWN_ISSUES.md, PULSEDESK_HANDOFF.md, `.claude/rules/world-class-audit.md`, the pure modules and their 404 tests, and live production state). Citations name the real commit/date/incident; none are invented. Treat every entry as non-negotiable unless the owner explicitly retires it; "cleanup" that deletes one of these re-opens a bug that already happened once.
>
> Companions: `PULSEDESK_PRD.md` (product spec), `PULSEDESK_ARCHITECTURE.md` (system spec). Format: **requirement** — *why, with evidence*.

---

## A. Telegram session & deployment

**R1. Exactly one GramJS connection may exist, ever — `numReplicas = 1`, and never open a second session for ANY purpose (history re-fetch, testing, "quick checks") while production is live.** — *Two simultaneous connections make Telegram permanently invalidate the session string (`406: AUTH_KEY_DUPLICATED`); sessions #1 and #2 were both burned this way (2026-06-15, 2026-06-16). A burned string never recovers.*

**R2. Deploys must keep BOTH rolling-overlap guards: the SIGTERM graceful-disconnect handler AND the startup connect delay (`TELEGRAM_CONNECT_DELAY_MS`, default 60s; "0" only for a cold first deploy).** — *The 2026-06-16 rolling deploy burned session #2 (commits `0bd0dbb`+`3a7da84`); each guard alone has a failure mode (no SIGTERM delivered / old container slow to release), so both are required.*

**R3. A failed initial connect must arm bounded retries (5 × backoff) plus a 10-minute slow-recovery loop — never leave a healthy-looking process that ingests nothing.** — *Before commit `b707aa2` (2026-06-15), one failed connect left Express serving 200s forever while ingestion was dead; Railway's ON_FAILURE policy never restarted it.*

**R4. Session regeneration happens only on explicit owner instruction (`node -r dotenv/config scripts/generate-session.cjs`); the generator stays `.cjs` (ESM project) with a `.gitignore` negation.** — *The project is `"type":"module"` so a `require` script must be `.cjs` (hit 2026-06-15, `e8ce391`); `*.cjs` is gitignored by convention, so real utilities need explicit `!` negations or the rename silently un-tracks them.*

**R5. `AUTH_KEY_DUPLICATED` on a lone container after the overlap fix means the string was invalidated on Telegram's side — regenerate; don't debug a deploy race that isn't there.** — *Established during the session #2 post-mortem: three failures occurred while the container ran alone, proving permanent burn, not a transient race.*

## B. Ingestion pipeline

**R6. All ingestion paths (channel-diff, AutoFetch, reconcile, backfill/ingest) call ONE shared `processAndIngestMessage`, whose FIRST decision is the `telegram_message_id` dedup; every mutation inside must be idempotent.** — *Admin replies once duplicated up to 23× per ticket because the dedup ran after the reply branches and the 15-min re-scan re-appended blocks every pass (fix `3b04b54`, 2026-06-11; 446 duplicate blocks cleaned across 82 tickets).*

**R7. The DB UNIQUE constraint on `messages.telegram_message_id` is the concurrency-safe last line of dedup; the in-code check alone is not.** — *The check-then-insert is racy across overlapping paths/containers; the 23505 handler exists because the race is real (documented since the Milestone-5/replica analysis).*

**R8. Every non-duplicate group message persists a `messages` row BEFORE any attach/drop decision, and every skip is logged.** — *Fix 1 (`586dedf`, 2026-06-13): a quoted user reply matching no ticket was thrown away with no record — telegram ids ~139581/139582 verified absent from the DB — and every later sweep re-dropped it identically.*

**R9. A quoted USER reply that matches no active ticket must FALL THROUGH to grouping/new-ticket — never `return null`.** — *`cc07f58` (2026-06-20): a real account-access issue arriving as a reply to an old/welcome message created no ticket; the admin's answers then dropped as unattached-admin, making the whole live conversation invisible ("I'm not seeing today's messages").*

**R10. An admin message that attaches to nothing is dropped (`disposeUnattachedMessage`) — never a standalone ticket.** — *Bug 3 (`cda3ebc`, 2026-06-14): unattached admin messages became fake standalone "Resolved" tickets and inflated the resolution rate; 170 historical ones were deleted after preview.*

**R11. Attach admin replies generously BEFORE that drop: quoted → the quoted message's `ticket_id` (ground truth); quoted-a-folded-follow-up → resolve via the quoted message's `sender_hash`; un-quoted → the single most-recently-active user ticket within ~30 min of last activity (`ADMIN_UNQUOTED_ATTACH_WINDOW_MS`); missing parent → fetch-by-id and ingest as a ROOT (never recurse).** — *`f6eb52d` (2026-06-22): the old quote-to-root-or-90s-window asymmetry dropped the COMMON case — ticket `5aec106f` lost 4 real admin replies; Fix 5 (`e848d5f`) added parent recovery after the June-12 audit showed threads degrading to standalone admin tickets.*

**R12. Reply-to metadata is ground truth: persist `reply_to_msg_id` on every message (normalization must keep the `> 0` guard — `Number(null) === 0`), stamp `messages.ticket_id` at every attach site (best-effort; a link failure never aborts ingestion), and check it FIRST in both quoted branches.** — *Migration 019 + `3191cd5` (2026-06-22): time/sender guessing provably mis-attached ~25 admin messages (ticket `bad126a1` showed 5 `[ADMIN_REPLY]` blocks of which only 1 was real) and split threads when a user answered an admin's question (message 139904).*

**R13. AutoFetch processes its batch OLDEST-FIRST.** — *Fix 3 (`990e1cd`, 2026-06-13): Telegram returns newest-first, so replies processed before their parents could never attach, and thread blocks appended in reverse order (proven on ticket `6784c670`).*

**R14. The AutoFetch pre-dedup is an optimization only and fail-open; the authoritative dedup stays inside the pipeline.** — *Fix 11 (`38f9d57`, 2026-06-14, `autofetch-dedup.ts`): the pre-query exists to skip the admin-check round-trip and Groq spacing for known ids — if it errors, correctness must not depend on it.*

**R15. The reconcile sweep replays orphans through the SAME pipeline via the `reconcileOpts` bypass (stored `sender_hash` preserved so conversations re-group; existing `messages.id` reused), and must exclude admin/bot content via content recognizers (`isSystemBotMessage`) + the live noise gates + the `ADMIN_SENDER_HASHES` env allowlist.** — *`f00dfba` (2026-06-20): the dry-run preview caught welcome/ban-bot messages coming back as Open tickets — `messages` stores no senderId, so `checkIsAdmin` cannot re-run offline, and dropped-admin hashes are absent from any ticket-derived set; the allowlist (`5e4ad36`, 2026-07-03, armed on Railway) closes the new-admin case.*

**R16. The bot self-ingestion guard (`botSentMessageIds`, seeded at startup from 24h of `bot_replies` even with the kill switch off) must never be removed.** — *Bot replies skip the `messages` insert, so normal dedup cannot catch them; without the guard the bot's own replies would re-ingest as admin replies, stamp `first_admin_reply_at`, and corrupt the response-time KPI (Milestone 5 design, `c9bdeea`).*

**R17. The quoted-reply sender-hash fallback is bounded to recent activity (`QUOTED_FALLBACK_MAX_AGE_MS`, 48h) and picks the most-recently-active ticket.** — *`f00dfba` (2026-06-20): the unbounded fallback attached a fresh "Sol/USDC" reply to a month-old ticket.*

**R18. When admin-related ingestion symptoms appear, the bug is downstream of detection — `checkIsAdmin` is verified correct on all four paths; check the drop guard / attach windows instead.** — *Bug 3's audit (2026-06-14) proved the `checkIsAdmin` hypothesis was a red herring: the "Resolved" status of the bogus tickets itself proved detection worked.*

## C. Edits, deletes, cross-chat safety

**R19. Edit/delete handlers act ONLY on events matching the resolved target-group channel id; DM/small-group edit events (which carry no channel identity) are ignored outright.** — *Fix 2 (`048cf40`, 2026-06-13, `telegram-guards.ts`): Telegram message IDs are per-chat — colliding ids 221507/55659/55660 from unrelated chats overwrote stored rows in production and could silently Dismiss real tickets.*

**R20. Edit/delete handling must ride the WORKING ingestion path: `extractChannelEditsDeletes(otherUpdates)` on the channel-diff drain, with shared appliers (no fork with the legacy Raw handler). Root delete = soft-delete (`messages.deleted_at`) + guarded Dismiss (`.in` active+AR statuses — never Escalated/Resolved); follow-up delete = `deleted_at` only.** — *Phase B (`61dfdbd`, 2026-06-22): the logic originally rode only the dead Raw push listener, so production never handled an edit or delete; migration 018 added the column.*

**R21. Before treating "urgent ticket became Dismissed" as a bug, check `messages.deleted_at`.** — *The 2026-07-02 audit proved the June 25/28 Withdrawal/High → Dismissed scares were users deleting their own messages — the delete handler working exactly as designed (and the first prod proof of the Phase-B live leg).*

**R22. On `ChannelDifferenceTooLong`: re-seed pts from `resp.dialog.pts` and NEVER bulk-ingest its `messages` (they are latest-state, not the gap); AutoFetch's 2-hour lookback carries the gap.** — *`channel-difference.ts` design (2026-06-14); ingesting that payload would write wrong history.*

## D. Listener liveness

**R23. Live MTProto push is structurally dead for this supergroup — GramJS 2.26.x never syncs channel `pts`, so Telegram withholds `UpdateNewChannelMessage`; the fix is the pts-tracking `getChannelDifference` poll. Explicitly disproven dead ends (do not re-try): `getDialogs` priming as a fix, `connect()` vs `start()`, ChannelTooLong triggers, and the Milestone-5 ban theory.** — *Research spike `1f110a5` (2026-06-14): a metadata-only Raw logger captured the channel's CONTROL updates (`UpdateReadChannelInbox pts:215292`) while test messages 139652/3 never pushed; the poll (`f475d0d`) verified in prod at 14s lag (`0bc534e`).*

**R24. Keep `getDialogs()` priming at startup and after every reconnect — it is also the only safe MEMBERSHIP probe (target absent from dialogs ⇒ banned/not a member ⇒ only an account swap helps); re-seed the channel pts after every reconnect too.** — *Fix 10 (`14abd74`) + the Fix-11 verdict (2026-06-14): priming succeeded and membership was confirmed while push stayed dead — necessary-looking, not sufficient, and still the membership signal.*

**R25. The watchdog clock (`lastMessageReceivedAt`) is stamped ONLY by target-group messages, and is RESET after a successful reconnect.** — *Fix 6 (`1a7130d`): DM traffic kept the clock warm while the group listener was dead for days and `/api/health` looked fine; Fix 11 (`38f9d57`): without the reconnect reset, the watchdog force-reconnected every 5 minutes forever (silence counter climbing 500→530 min).*

**R26. Never judge listener health from `lastMessageReceivedAt` alone — it initializes to boot time and advances on reconnects. The authoritative signal is DB ingest lag (`ingested_at − message_timestamp`): sub-15s = channel-diff healthy; ~60–180s = AutoFetch carrying; sustained ≥3 min = both degraded.** — *A freshly-deployed-but-dead listener read "healthy" for up to 30 minutes; the June-13/14 diagnosis keyed entirely on lag clustering.*

## E. Classification & LLM policy

**R27. The classifier system prompt must contain the `=== OUTPUT SCHEMA ===` block naming the exact output keys, generated from the `VALID_*` arrays so it can't drift.** — *`07fc427` (2026-07-02): the field list was silently lost in a refactor and 101 of 102 recent tickets carried fallback "User inquiry" summaries for weeks — Zod `.catch()` defaults masked the omission.*

**R28. Classification failure policy: after retries, create the ticket anyway with `classification_failed`, flag the summary `[NEEDS REVIEW]`, keep it Open — a fumbled message is never dismissed and never lost.** — *Fix 4 (`0494a1a`, 2026-06-13): "General Question" is also the failure default, and the old auto-dismiss of that category made every model failure invisible.*

**R29. Auto-dismiss is limited to Praise, Spam/Irrelevant, Community Chat, and pre-filtered noise; General Question stays visible (Open/Low).** — *Same incident/policy (approved 2026-06-13); General Question ≠ noise because it's also the fallback bucket.*

**R30. The urgent-is-never-noise guard lives at the READ layer, in TWO synchronized places (`issuesOnlyOrClause` in `classification-policy.ts` and the `tickets_stats` SQL, migration 023) plus the sweeps' `sweepCategoryOrClause` and the Dismissed-Audit contradiction badge. The exact-string unit tests on the PostgREST `.or()` clauses are load-bearing. Deliberately KEPT: High-urgency Spam/Praise still auto-dismisses at classification time (the audit badge covers it).** — *Ticket `25f6281d` — a "scammed me of 100k" complaint — went invisible when an admin-reply reclassify rewrote only the category (2026-07-03); category-only side paths never re-derive urgency, and historical rows exist, so a classification-time rule could not fix it. A malformed or-string fails only at runtime as a silent 400 in a sweep. Un-dismissing urgent spam would put screaming phishing in the Open queue.*

**R31. `reclassifyFromAdminReply` accepts a category only on an exact case-insensitive match against `VALID_CATEGORIES` — never reintroduce a normalize-to-default fallback there.** — *Milestone 3 (2026-06-12): a hallucinated category would silently rewrite real tickets to "General Question".*

**R32. Language coverage (Pidgin today; Yoruba/Hausa tomorrow) is a BASE-PROMPT glossary, never few-shot.** — *Fix 9 (`0354351`, 2026-06-13): few-shot requires stored corrections to fire and never reaches the raw-model benchmark; the glossary lifted Pidgin from 67% to 100% in both the live pipeline and `/api/eval` simultaneously.*

**R33. The noise pre-filter is built from conservative AND-gates biased toward LETTING MESSAGES THROUGH, and `refund(?:ed|s)?` stays in `ISSUE_SIGNALS`.** — *Design rule since `fad4fdc` (2026-06-20; a false positive hides a real issue, a false negative costs one Groq call); `01f0769` (2026-07-03): `\b(fund)\b` never matches inside "refund", so "Pls do a refund" was pre-filtered to Dismissed — the audit's worst-class find.*

**R34. Pre-filtered tickets carry category "Community Chat" but their summary stays exactly `"General Chat"` — the reply-repair sweep excludes BY SUMMARY.** — *Phase 3 (`7f9ff26`, 2026-07-03) deliberately kept the summary string when the category changed; renaming it re-enrolls all pre-filtered tickets into the Gemini repair sweep.*

**R35. `redactPII(sanitizeForPrompt(text))` wraps EVERY third-party LLM call; user text rides only in `role: user`, never concatenated into a system prompt.** — *World-class audit rules (2026-06-11): PII (cards, BVN/NIN, phones, emails, keys) and prompt-injection containment; every new call site since has inherited the wrapper.*

**R36. If a Groq call site starts deterministically 400ing with "Tool choice is none, but model called a tool", remove THAT site's trailing assistant-prefill turn first — response_format changes will not fix it — and A/B-probe the live failing inputs before shipping any hypothesis.** — *D2 sweep under gpt-oss-20b (`e363a8b`+`601eea1`, 2026-07-02): every request variant 400'd with the prefill present and succeeded without it; a plausible "documented" response_format theory was disproven only by the live probe.*

**R37. Every classifier write goes through `applyClassification`'s guarded two-step (status written only while status == inserted status; else fields-only) at ALL THREE sites (Groq, Gemini fallback, failure path).** — *`94bbe2f` (2026-06-12): the async classifier clobbered "In Review"/"Escalated" set during its 5–10s window; proven with a live race test.*

## F. LLM budget, retries, quotas

**R38. Retry taxonomy: retry ONLY 429/5xx/capacity/`[Timeout]` (our wrapper's literal marker); never a `[CircuitBreaker]` fast-fail; never other 4xx.** — *Discovered live: the retry regex matched "timed out" but our wrapper throws `[Timeout]`, so a retryable timeout was classified non-retryable.*

**R39. Quota exhaustion (429/RESOURCE_EXHAUSTED/"quota" — NOT a transient 503/overload) is "retry much later": arm a 60-minute cooldown after ONE failing call; sweeps skip with a single log line.** — *Fix 8 (`7a09b15`, 2026-06-13): the 15-min repair sweep fired 3 real calls per ticket into a dead daily quota, tripping the shared Gemini breaker every cycle and re-burning the quota each time it half-recovered.*

**R40. Log FULL LLM error detail (`describeLLMError`: status/statusText/errorDetails), never `e.message` alone.** — *Fix 8's root cause could not be told apart (quota vs. bad model name vs. overload) from the message-only log; a 404 means model-name bug and the cooldown correctly won't engage.*

**R41. Groq free-tier budget discipline is a design constraint (1,000 req/day, 8K TPM, 200K TPD): sequential calls only, spaced (2.1s ingestion-adjacent, 15s eval/verify, 20s D2), per-sweep caps (D2 ≤ 40), and the D2 per-ticket 24h re-check cooldown (`shouldRecheckResolution`) stays.** — *Groq model migration (`81f9d6f`, 2026-07-02): without the cooldown the hourly sweep alone approached the entire daily request budget; >4 calls/min blows the 8K TPM; `/api/eval` has no 429 retry, so overruns score as misses.*

**R42. Anything a deploy needs at runtime ships as a committed, non-gitignored file (benchmark data lives in `benchmark-cases.ts`, bundled into dist).** — *Fix 7 (`c8b2ea9`, 2026-06-13): the gitignored `benchmark_cases.json` never reached Railway; `/api/eval` returned `total: 0` and the modal rendered a bare "%".*

## G. Conversation threading & the raw_text contract

**R43. Grouping bands are keyed on the gap since the candidate ticket's `last_message_at` (which admin replies also advance): fast ≤5 min folds outright; extended 5 min–6 h asks the topic-shift LLM; >6 h is a new ticket. The candidate is the sender's SINGLE most-recent ACTIVE ticket; `Assumed Resolved` is deliberately not a candidate (the quoted-reply path reopens it).** — *KNOWN_ISSUES C1 (2026-06-19): one user's single 4-hour conversation became 14 In-Review tickets — 10% of the entire In-Review queue — under the old 5-minute-consecutive-only window; locked product decision #1.*

**R44. Topic-shift is strict (`same_issue === true` only) and EVERY failure path (parse, error, timeout, breaker) yields a NEW ticket.** — *Phase 3 design (2026-06-19): the system must never wrongly merge two issues; a Groq outage degrades to pre-threading behavior instead of corrupting threads.*

**R45. The unanswered-burst fast-fold (candidate still Open, no admin reply, ≤30 min) folds WITHOUT the LLM call.** — *`3191cd5` (2026-06-22): a user adding detail to an unhandled issue is almost never a topic shift; the shortcut saves budget and prevents over-split fragments.*

**R46. Grouped re-classification (`reclassifyGroupedTicket`) never touches status and preserves human-set urgency via `buildGroupedUpdatePayload` (omits the urgency KEY when preserving; a corrections-lookup error preserves — fail-safe).** — *Urgency-correction Phase 2 (migration 021 + `06384d0`, 2026-07-02): a fold's re-classify must not overwrite a human's deliberate urgency choice; verified live with a preserved Critical through a fast-fold.*

**R47. The reply-block tags (`[ADMIN_REPLY]`/`[USER_REPLY]`/`[USER_FOLLOWUP]`) are a parsing CONTRACT. Before changing their syntax, grep every consumer — `conversation-grouping.ts`'s `BLOCK_RE`/`FIRST_BLOCK_RE` require a bare `]`, and both auto-resolve sweeps use literal `.includes("[ADMIN_REPLY]")`. The era-agnostic "already attached?" check is a raw_text substring probe, not a tag.** — *The planned `id=<telegramId>` tagging (2026-06-20) was dropped when the consumer grep showed it would silently break thread extraction AND freeze both sweeps' admin-engaged detection.*

**R48. "Admin-engaged" = `raw_text LIKE '%[ADMIN_REPLY]%' OR first_admin_reply_at IS NOT NULL` — never the column alone.** — *Live evidence (2026-06-19): 20 tickets by column vs 49 by raw_text; the column only exists on newer attach paths, so column-only gating starves the auto-resolve sweeps.*

## H. Status machine & automation guards

**R49. `Escalated` is a human fortress: no automatic path may set it, resolve it, hand it off, or move a ticket out of it.** — *Design invariant since Milestone 2 (2026-06-12), enforced in every sweep and resolver since; it's the one status a human can trust absolutely.*

**R50. Every automated status write is a guarded conditional update (`.eq`/`.in("status", …)` in the same statement).** — *The defense shared by the classifier race fix (`94bbe2f`), both auto-resolve sweeps, the delete handler, and the admin-reply resolver — concurrent human changes are never clobbered.*

**R51. Admin-reply automation order and guards: hand-off check FIRST (`shouldHandOffFromAdminReply`), then auto-resolve (`shouldResolveFromAdminReply`, strict `resolved === true`); both restricted to Open/In Review (`AUTO_RESOLVABLE_STATUSES`); hand-off does NOT stamp `resolved_at`; the category branch logs-and-continues so a category hiccup never blocks the resolve.** — *Bug 4 (`510848e`, 2026-06-14): a definitive "Yes, you can…" left tickets In Review forever; Phase 3 (`c5a0a0f`, 2026-06-22): a hand-off mislabeled Resolved would claim an unobservable close.*

**R52. `first_admin_reply_at` is stamped exactly once, with the reply message's OWN Telegram timestamp.** — *Milestone 2 (`63e791e`, 2026-06-12): stamping `now()` would fabricate response times on every backfill/recovery.*

**R53. A fresh Critical lands `Open` with an `[ESCALATED]` summary prefix — never "In Review".** — *Phase 3 (`7f9ff26`, 2026-07-03): the dashboard renders In Review as "Admin Replied", which is dishonest for a ticket no admin has touched.*

**R54. A new in-channel user reply reopens Awaiting User / Assumed Resolved / Handed off → In Review and clears `resolved_at`; reopen logic lives in the USER-reply paths only, never the admin paths.** — *Assumed-Resolved design (2026-06-19) + Handed-off (2026-06-22): an admin's later message must not reopen a parked ticket, but the user coming back always does.*

**R55. `tickets.updated_at` is set explicitly on every write (no DB trigger exists); `resolved_at` is the single source of truth for closure and every reopen clears it; legacy nulls stay null (no fabricated timestamps).** — *The 2026-06-11 KPI audit (`2ea6bea`): "Resolved Today" was reading `updated_at`, which nothing maintained — 797 of 822 tickets shared one backfill date — while `resolved_at` was populated on zero tickets.*

## I. Training loop & corrections

**R56. Corrections-source semantics are load-bearing: `human_ui` with original == correct means a human CONFIRMED the AI; `human_skip` is a reviewed-no-op (excluded from few-shot AND /verify; the double-submit guard treats both as reviewed); `human_urgency` is urgency-only (category columns are placeholders; excluded from the /train reviewed-set; few-shot must never present it as a category confirmation); NULL urgency columns mean "urgency not reviewed". Adding a new source value REQUIRES widening the live CHECK constraint by migration first.** — *Migrations 015 (2026-06-19) and 021 (2026-07-02); the live constraint literally rejected the new values until ALTERed, and the reconstructed migration files did not show the real constraint.*

**R57. Few-shot retrieval merge-dedupes per message (`dedupeAndMergeCorrections`: category from the newest non-urgency row, urgency from the newest urgency-bearing row), and the /verify path always passes the leave-one-out `excludeMessageText` argument.** — *Phase 2 (2026-07-02): a plain newest-wins dedupe let an urgency-only row shadow a category correction; dropping the third argument lets a verified message see its own stored answer, making the "with training" score meaningless (Milestone 4, `ed36afe`).*

**R58. `/api/eval` stays a RAW-model baseline — no few-shot injection, ever.** — *Milestone 3 decision (2026-06-12), reaffirmed at every audit: comparability across time is the entire value of the gold benchmark; the live pipeline and `/api/test-message` are where few-shot belongs.*

**R59. `/api/verify` grades `human_ui` rows only, retries transient errors once and then EXCLUDES them from the denominator; its number is selection-biased and must never be pitched as accuracy.** — *`2fdc763` (2026-06-21): grading machine-inferred `admin_reply` rows on context-free fragments scored ~0% by construction and rate-limit errors counted as wrong — the panel read "0% baseline / 5% trained" while measuring nothing.*

**R60. Ticket deletion cascades its corrections — before deleting a merged-away ticket, re-point its corrections (and `messages.ticket_id`, which has no FK) to the survivor, then verify the global corrections count is unchanged.** — *Phase-1 merge cleanup (2026-06-22): a training signal silently dies with its ticket; corrections held at 69 only because re-pointing happened first.*

**R61. Accuracy publishing rule: only independently-rated numbers are published (the dashboard audit card stays "pending" until the blind Quidax-agent rating returns); worksheets generated under an older model/taxonomy are archived and never scored.** — *User decision (2026-07-03); the Jun-21 package was invalidated by the llama→gpt-oss and taxonomy changes (`audit/stale-2026-06-21/`); "you wrote the test and the answer key" is the objection the whole audit instrument exists to defeat.*

## J. Data & schema

**R62. The reconstructed files in `supabase/migrations/` do NOT match the live schema — verify against the live DB before trusting any column; migration numbering in the repo is a manual convention (`ls` first — the DB tracks by NAME and won't catch a filename collision).** — *Proven repeatedly: `messages.telegram_message_id` BIGINT vs `tickets.telegram_message_id` TEXT; `messages` has NO `created_at` (use `ingested_at`/`message_timestamp`); the "migration 013" plan collided with the existing `013_bot_replies` and shipped as 014 (2026-06-15).*

**R63. Schema + code changes ship migration-FIRST (additive, applied to the live DB with explicit owner confirmation), code second.** — *Phases 2/3 (2026-07-02/03): PostgREST 23514s on writes naming values the live CHECK constraint doesn't know; old code is safe against an additive migration, but new code is broken without it.*

**R64. A data-modifying CTE and a `count(*)` in the SAME statement read the same pre-statement snapshot — always confirm deletes/cleanups with a SEPARATE follow-up SELECT; the CTE's RETURNING count is the authoritative "rows deleted".** — *Hit 2026-06-15: `tickets_deleted: 2` yet `tickets_left: 2` in one statement made a successful cleanup look failed.*

**R65. Historical thread repair sources text FROM the `messages` table via SQL relocation — never hand-typed (hand-typed admin text is indistinguishable from fabrication and is blocked); reply-to links that were never stored are UNRECOVERABLE — state that honestly; never spin up a second session to re-fetch.** — *The 2026-06-20 recovery + Phase-C post-mortem (2026-06-22); the re-fetch temptation is exactly how sessions get burned (R1).*

**R66. KPIs are computed in the `tickets_stats` SQL function — never JS row-scans — and every new base filter must reach BOTH the table query and the RPC params; all date boundaries are Africa/Lagos calendar days.** — *`171ce9c` (2026-06-12): the in-memory stats silently stopped counting at 5,000 rows; `9c2ea4f` (2026-06-11): search filtered the table but not the KPIs, custom ranges dropped the whole end day, and "last N days" cut at UTC midnight.*

## K. KPI honesty (locked product decisions)

**R67. Resolution rate = (Resolved + Assumed Resolved) ÷ (that + Active), with Dismissed excluded everywhere, noise-category actives excluded from the denominator (except High/Critical, R30), Handed off excluded from BOTH sides, and Assumed Resolved kept as its own auditable status.** — *The journey is the evidence: 80% (spam counted as resolutions, `2ea6bea`) → 53% honest → 16% (the graveyard exposed, 2026-06-19 audit: fragmentation + invisible DM/email closes + 33% noise) → each exclusion decision reconciled against live SQL and signed off by the owner (2026-06-19/22).*

**R68. Response time is the MEDIAN (`percentile_cont(0.5)`), never the mean.** — *Phase 1 (`7b96d49`, 2026-06-19): one 18.1-day mis-attach outlier dragged the mean to 8.4 hours when the median was 6.5 minutes — the number the team actually experiences.*

**R69. Noise is excluded, never deleted: Dismissed is the strongest demotion; suspected banter stays visible, filterable, reversible in /train, and watched by the Dismissed Audit.** — *User-locked decision #3 (2026-06-19), reaffirmed by the Dismissed Audit's live catches (a 4-month-old missing-deposit complaint surfaced 2026-07-03).*

## L. Security

**R70. Backend uses the Supabase service-role key only; the legacy JWT keys stay DISABLED forever — re-enabling them resurrects a key leaked in public git history.** — *Key rotation 2026-06-12 (`0e68d7a`): the leaked key is verified dead (401) only because legacy keys are off.*

**R71. No secret ever has a code fallback; required env vars fail loudly at startup.** — *`c08a35b` (2026-06-12): a hardcoded fallback password in a public repo matched the real one and forced a rotation — removing the line doesn't remove it from git history.*

**R72. No secret enters the client bundle (`VITE_*` and `define` values inline into shipped JS); grep `dist/` for `gsk_|eyJ|sk-|AIza` after build changes.** — *World-class audit rule (2026-06-11).*

**R73. Long-running scripts authenticate with the stateless `x-admin-key` header, never a login Bearer token.** — *`57e3b2e` (2026-07-03): login tokens live in an in-memory map and die on every redeploy — a mid-run deploy 401'd the audit sampler's polling loop.*

**R74. Mutable `/api/` responses carry `Cache-Control: no-store`; writes are Zod-allowlisted (never spread `req.body`); status/category/urgency validate against exact enums.** — *World-class audit (2026-06-11): a cached response made ticket statuses snap back on the next poll (the ghost-ticket bug); free text into constrained columns breaks the CHECK-constraint contract.*

## M. Frontend

**R75. Poll-driven `setState` diffs before updating; the dashboard poll (10s) and the global rate limit (1,200/15min) stay sized so the app can never rate-limit itself.** — *`768ba95` (2026-06-15): a 5s poll against a 200/15min limiter had every open tab self-tripping the cap in ~17 minutes — blank KPIs and 429s while the data sat intact.*

**R76. Large blur effects stay bounded and GPU-promoted (`transform-gpu`, moderate radii); iOS-visual bugs are verified on the physical device — the preview screenshot tool stalls on blur-heavy pages and every iOS browser shares WebKit.** — *Bug 1 (`1e90ff4`, 2026-06-19): oversized `blur-[120px/150px]` layers made iOS Safari fail first-paint compositing — a blank white page that only painted after rotation/tap; not a JS/CSS-compat issue.*

**R77. The audit card (and any static JSON import) is BUILD-TIME-BAKED — Vite constant-folds the import and dead-code-eliminates the other branch; `npm run build` after changing `audit-results.json`, and remember the local server serves a stale `dist/` over Vite middleware.** — *2026-06-21 (Rollup constant-folding) and the standing local-dev gotcha: UI edits are invisible until rebuild.*

## N. Verification methodology & tooling

**R78. Risky logic lives in small PURE modules with injected dependencies and exhaustive vitest coverage; live legs that need `tlClient` are declared "prod-only verifiable" honestly in the handoff instead of claimed verified.** — *The Fix-5 pattern (2026-06-13), reused for channel-diff, edit/delete, priming, reconcile: the no-telegram launcher can exercise everything except the socket, and pretending otherwise once masked the dead-listener class.*

**R79. Every new sweep or data operation runs DRY-RUN / PREVIEW-FIRST against live data before it may write.** — *The D2 dry-run caught it closing a ticket where the admin awaited a screenshot (prompt fixed before go-live, `ad2efda`); the reconcile preview caught welcome-bots resurrecting as tickets; the Phase-C preview caught "GM Quidax Fam" polluting threads; the handed-off preview caught a scam-warning false positive. Four catches, zero live damage.*

**R80. E2E happens on the no-telegram launcher (PORT 3100, live DB): clean up test rows by `telegram_message_id` (cascades the ticket; verify corrections count after), isolate grouping tests with a unique `senderId`, avoid thanks/resolved wording unless testing auto-resolve (that branch runs FIRST), restart to reset `heavyLimiter`, and kill lingering node processes on 3100 between runs.** — *Accumulated testing gotchas, each hit for real (2026-06-13 → 2026-07-03).*

**R81. vitest excludes `**/.claude/**`, and CLI path args are FILTERS (they don't scope out the worktree copy).** — *`a4609e1` (2026-07-03): an agent worktree inside the repo silently double-counted the suite as 794/52 instead of the real 397/26.*

**R82. Railway CLI realities: `variables --set` does NOT auto-redeploy (follow with `railway redeploy --yes`); a running container keeps boot-time env; `railway logs` streams the current container's recent buffer only (capture WITHOUT pipes — `| grep` loses it); detect env-only redeploys via `lastMessageReceivedAt` jumping (commit doesn't change); wait for the new container before testing a flipped flag.** — *Each half-truth cost a debugging detour (2026-06-14 → 2026-06-20); the D2 enable "didn't work" until the redeploy was forced.*

**R83. Windows/PowerShell hazards: send JSON POST bodies as UTF-8 BYTES (`Get-Content -Raw` reads UTF-8 as cp1252 and mangles emoji — it fabricated a phantom benchmark miss); commit messages go via `git commit -F <temp file outside the repo>` (here-string inner quotes split into pathspecs); PowerShell cannot set an env var to empty (use the launcher or Git Bash).** — *All three bitten live (2026-06-19 → 2026-07-03).*

**R84. Build-time npm installs for throwaway artifacts run in a temp dir OUTSIDE the repo tree; `git status package.json package-lock.json` afterward must be clean; stage docs by explicit path, never `git add -A`.** — *2026-06-19: a `.docx` build silently added `docx` to the app's real dependencies — npm resolves up to the nearest manifest.*

**R85. Long-running server work (>~1 min) is a background job (instant start + progress polling + 409 double-start), never a synchronous response.** — *`80e63e8` (2026-07-03): a full eval run died at Railway's proxy edge as "upstream error" while the server kept burning Groq budget; the two-halves workaround this replaced was itself scar tissue.*

**R86. Production health is checked as: `/api/health` → commit == expected, `telegramReady:true`, circuits CLOSED (1–2 Gemini failures = normal micro-hits; only OPEN matters) → then DB ingest lag per R26. This is the mandatory pre-demo check.** — *The standing runbook pattern, validated through every deploy since 2026-06-13.*
