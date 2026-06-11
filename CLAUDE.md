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
- **`/api/ingest` (super_admin) accepts `isAdmin` and `msgDate`** — use it to simulate admin replies and historical timestamps when testing ingestion heuristics end-to-end. Always clean up test tickets/messages by `telegram_message_id` afterward, and guard against attaching test admin replies to real live tickets (check no newer Open ticket exists first).
- **Railway runs `node dist/server.mjs` via railway.toml, not `npm start`** — the npm script has a Windows-only `chcp` command. Keep `numReplicas = 1`: each replica opens its own GramJS session and double-ingests.
- **Async classification can overwrite statuses set by reply-attachment** (~5-10s race): if an admin reply lands before Groq classifies the parent ticket, "In Review" can be clobbered back to "Open"/"Dismissed". Known, documented in KNOWN_ISSUES.
