# PulseDesk Agent Rules

## Stack
Node.js + Express + TypeScript (server.ts), React 19 + Vite + Tailwind v4 (src/App.tsx), Supabase service role key only, Groq for classification, Gemini for replies, GramJS for Telegram.

## Before every task
Read PULSEDESK_HANDOFF.md and PRD.md first. Restate the task, list which files will change, identify risks. Wait for approval before acting on anything non-trivial.

## Rules
- Smallest change only — never touch unrelated files
- Never use SUPABASE_ANON_KEY for backend operations
- Never expose API keys to the frontend
- Never change DB schema without explicit confirmation
- Never regenerate the GramJS session string without explicit instruction
- One task at a time — complete and confirm before moving to the next
- All Git and PR descriptions in plain English a non-developer can understand

## End of every session
Update PULSEDESK_HANDOFF.md, KNOWN_ISSUES.md, and PRD.md. Summarize what was done and what is pending.

## Lessons learned
- **Three overlapping ingestion paths:** live listener, AutoFetch (startup + every 15 min, 2-hour lookback), and manual backfill all call `processAndIngestMessage`. Any mutation inside that function MUST be idempotent — the `telegram_message_id` dedup check must stay at the very top, before any branch that writes.
- **`tickets.updated_at` is NOT auto-maintained** — there is no DB trigger; code must set it explicitly on every update. `resolved_at` is the source of truth for when a ticket was closed; reopening clears it. Legacy tickets resolved before 2026-06-11 have `resolved_at = null` by design.
- **Resolution Rate definition (product decision, 2026-06-11):** Resolved ÷ (Resolved + Active). Dismissed tickets are spam/chatter, never counted as resolutions anywhere.
- **"Today" KPIs use Africa/Lagos**, not server time (Railway runs UTC).
- **The reconstructed migration files do not match the live schema** — always verify columns against the live DB before trusting `supabase/migrations/`.
- **Local testing runs on PORT=3100** (port 3000 is occupied by an unrelated MCP tool). Shell env vars override `.env` because dotenv does not override existing vars.
- **`/api/tickets` filter split:** `applyBaseFilters` (group, issues_only, dates, search) is shared by the table and stats queries; `status` is deliberately table-only because the KPI cards break tickets down by status. All date boundaries are Lagos calendar days — never use server-clock midnight.
- **`/api/ingest` (super_admin) accepts `isAdmin`, `msgDate`, and `replyToMsgId`** — use it to simulate admin replies, historical timestamps, and quoted reply threads when testing ingestion heuristics end-to-end. Always clean up test tickets/messages by `telegram_message_id` afterward (deleting the `messages` row cascades to the ticket via FK), and guard against attaching test admin replies to real live tickets (check no newer Open ticket exists first).
- **4-state workflow semantics (Milestone 2, 2026-06-12):** Active statuses are Open / In Review / Escalated / Awaiting User. An admin reply moves Open → In Review but NEVER changes Escalated, Awaiting User, or Resolved; a user reply to an Awaiting User ticket flips it to In Review; all four active states accept replies and count in the resolution-rate denominator. `first_admin_reply_at` is stamped exactly once, with the reply message's own timestamp (not now()), so backfills stay accurate — never overwrite it.
- **Production runs only ONE GramJS session at a time.** Railway and Fly.io must never both be live (the `telegram_message_id` dedup check is not concurrency-safe; only the DB UNIQUE constraint catches the race). Stop the old platform before deploying the new one — startup AutoFetch's 2-hour lookback recovers messages missed during the gap. Same caution applies to local testing while production is live: keep the window short.
- **Railway runs `node dist/server.mjs` via railway.toml, not `npm start`** — the npm script has a Windows-only `chcp` command. Keep `numReplicas = 1`: each replica opens its own GramJS session and double-ingests.
- **Async classification can overwrite statuses set by reply-attachment** (~5-10s race): if an admin reply lands before Groq classifies the parent ticket, "In Review" can be clobbered back to "Open"/"Dismissed". Known, documented in KNOWN_ISSUES.
- **Corrections semantics (Milestone 3, 2026-06-12):** a `corrections` row with `original_category = correct_category` means a human CONFIRMED the AI — that is how /train marks tickets reviewed; any corrections row (either source) makes /train skip the ticket. `reclassifyFromAdminReply` updates ONLY `category`+`updated_at` (never status) and requires an exact case-insensitive category match from the model — never reintroduce a `normalizeCategory` fallback there, it would default hallucinations to "General Question" and rewrite real tickets.
- **Few-shot injection lives in the main pipeline, the Gemini fallback, and `/api/test-message` — but deliberately NOT `/api/eval`**, which stays a raw-model baseline for comparable benchmark numbers. Deleting a ticket cascades its corrections (FK), so cleaning up test tickets also removes their few-shot examples — always verify the `corrections` count after test cleanup.
- **`*.mjs` is globally gitignored** (one-off test scripts convention). `scripts/dev-no-telegram.mjs` is therefore untracked — it blanks `TELEGRAM_SESSION_STRING` and sets PORT=3100 before importing server.ts, making local testing safe while Railway production is live. PowerShell cannot set an env var to empty (`$env:X=""` deletes it) — use that launcher or Git Bash.
- **Hosting decision (2026-06-12): staying on Railway** — Fly.io requires a payment method. The Fly config was removed in commit `510cb0c`; recover it from git history if ever needed.
- **Local server serves a STALE `dist/` build if one exists** — server.ts prefers `dist/index.html` over Vite middleware, so frontend edits are invisible until `npm run build`. When verifying UI changes locally, rebuild first (a browser reload then picks up the new bundle; the server reads dist from disk per request, no restart needed).
- **KPI stats come from the `tickets_stats` Postgres function (migration 012, Milestone 4)** — `/api/tickets` passes the base filters as RPC params and merges the returned jsonb into the stats payload; `resolutionRate`/`resolutionData`/`totalCount` are still computed in JS. The volume chart reads `stats.volumeByDay` (Lagos-day buckets); `rawStatsData` no longer exists. Any new KPI must be added inside the SQL function, not as a JS row-scan, and any new base filter must reach BOTH the table query and the RPC params.
- **`/api/verify` (Milestone 4) measures training-loop accuracy with leave-one-out** — `getFewShotCorrections(supabase, text, excludeMessageText)` skips rows matching `excludeMessageText` so a verified message never sees its own stored correction. Never drop that third argument from the verify path: without it the few-shot pool leaks the answer and the "with training" score is meaningless.
- **The async classifier writes status through a guarded conditional update (Milestone 4)** — `applyClassification` updates WITH status only where `status = insertedStatus` (atomic), else writes fields without status. All three classifier write sites (Groq, Gemini fallback, failure) must keep using it; a plain `.update({status})` there reintroduces the race where the classifier clobbers "In Review"/"Escalated" set during the ~5-10s window.
- **`isRetryableLLMError` treats `[Timeout]` from `withTimeout` as retryable** — discovered live when the first sweep test timed out and was wrongly classified non-retryable (regex said "timed out", our wrapper throws "[Timeout]"). Retry only 429/5xx/capacity/timeout errors; never a breaker-open fast-fail ("[CircuitBreaker]"), never other 4xx.
- **`messages.telegram_message_id` is BIGINT in the live DB while `tickets.telegram_message_id` is TEXT** — another reconstructed-migrations mismatch. Raw SQL against `messages` needs numeric literals or casts; supabase-js string filters work because PostgREST casts.
- **The reply-repair sweep (every 15 min) only touches tickets that are <24h old, ACTIVE status, classified, non-admin, with `suggested_reply IS NULL`** — and its update is guarded on still-null so it never overwrites an agent's edit. The bound was verified against live data (0 of 661 historical null-reply tickets matched). Widening any of those bounds risks a Gemini-quota burn on history.
