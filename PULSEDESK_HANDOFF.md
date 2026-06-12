# PulseDesk: AI Handoff Document

## 1. What PulseDesk Is & Why It Exists
**PulseDesk** is a production-grade Telegram support triage tool built specifically for **Quidax** (a Nigerian crypto exchange). Its primary purpose is to allow their support team to immediately start using an AI-augmented triage system to manage community inquiries, drastically reducing response times and ensuring critical issues are highlighted. 
*Strategic Purpose:* This project also serves as a high-value pitch asset to demonstrate concrete, deployable value to the Quidax team.

## 2. Full Tech Stack
*   **Backend:** Node.js + Express + TypeScript (`server.ts`)
*   **Frontend:** React 19 + Vite + Tailwind CSS v4 (`src/App.tsx`)
*   **Telegram Integration:** GramJS (Persistent TCP connection for live listening)
*   **Classification Engine:** Groq API running the LLaMA model
*   **Suggested Replies:** Gemini API (specifically Gemini 3.1-Pro)
*   **Database:** Supabase (PostgreSQL)
*   **Deployment:** Containerized on Cloud Run / AI Studio (Internal Port 3000)

## 3. Environment Variables
*   `GROQ_API_KEY`: Used by the backend to authenticate with the Groq API for LLaMA-based classification of incoming messages.
*   `NODE_ENV`: Standard environment flag (`development` or `production`). Dictates strictness of security headers (e.g., Helmet CSP).
*   `ENABLE_BETA_FEATURES`: Boolean flag used for phased rollouts of experimental UI/UX features.
*   `APP_URL`: The deployed Cloud Run/AI Studio URL. Used for self-referential links or OAuth callbacks.
*   `SUPABASE_URL`: The URL endpoint for the Supabase project.
*   `SUPABASE_ANON_KEY`: The public anonymous key for Supabase (Must NEVER be used for backend operations to ensure server authority).
*   `SUPABASE_SERVICE_ROLE_KEY`: The admin key used by the backend to bypass Row Level Security (RLS) and enforce server-side authority.
*   `TELEGRAM_API_ID` & `TELEGRAM_API_HASH`: Telegram developer credentials required to initialize the GramJS client.
*   `TELEGRAM_SESSION_STRING`: A generated persistent string allowing GramJS to authenticate without requiring a 2FA code on every restart.
*   `TELEGRAM_GROUP_USERNAME`: The target Telegram group to monitor (e.g., `OfficialQuidaxCommunity`).
*   `VITE_DASHBOARD_PASSWORD`: The password required by users to unlock and access the frontend React dashboard.
*   `SUPPORT_API_KEY`: An internal token/key for secure backend administrative endpoints.

## 4. Complete Data Flow
1.  **Telegram Listener:** GramJS maintains a persistent connection and listens for `NewMessage` events in the specified group.
2.  **Pre-Filter:** Checks `shouldProcessMessage` to drop spam, bot messages, or short non-actionable text.
3.  **PII Redaction:** Strips sensitive data (phone numbers, emails) before sending to external APIs.
4.  **Groq Classification:** The sanitized message is sent to LLaMA via Groq to extract JSON containing category, urgency, product area, and summary.
5.  **Gemini Reply Generation:** Gemini 3.1-Pro generates a context-aware suggested reply based on the classification.
6.  **Supabase Storage:** The backend validates the JSON (using Zod/custom fallback) and inserts the record into PostgreSQL using the Service Role Key.
7.  **React Dashboard Polling:** The frontend UI polls the `/api/tickets` endpoint every 5 seconds to display real-time updates to human agents.

## 5. Every Bug Fixed & How It Was Fixed
*   **Supabase RLS/Insertion Failures:** 
    *   *Bug:* `getSupabase()` used `SUPABASE_ANON_KEY`, causing backend inserts to fail or trigger RLS blocks. 
    *   *Fix:* Switched strictly to `SUPABASE_SERVICE_ROLE_KEY` on the backend to maintain absolute server authority and bypass RLS safely.
*   **Schema Output Validation Failures:** 
    *   *Bug:* The LLM returned custom keys (e.g., `priority` instead of `urgency`). The validator blindly defaulted unrecognized fields to `Medium` and `General Question`.
    *   *Fix:* Mapped `responseSchema` directly into the System Prompt via `JSON.stringify` and built a case-insensitive fallback mapping (`validateTicketSchema`) to guarantee DB schema compliance.
*   **Telemetry Caching Bugs:** 
    *   *Bug:* Outdated telemetry/cache data causing stale reads. 
    *   *Fix:* Corrected the caching headers and logic in the backend serving layer.
*   **PowerShell Command Execution Failures:** 
    *   *Bug:* Using `&&` in terminal commands failed due to Windows PowerShell constraints. 
    *   *Fix:* Switched to using `;` or sequential isolated commands for local scripts.
*   **Demo Mode Interference:** 
    *   *Bug:* The system was not fetching live data due to `DEMO_MODE`. 
    *   *Fix:* Disabled `DEMO_MODE=false` in the `.env` to verify live connection.
*   **Admin Reply Duplication (fixed 2026-06-11, commit `3b04b54`):**
    *   *Bug:* Admin/user replies appeared 2-3x (worst case 23x) on the dashboard. The duplicate-message check in `processAndIngestMessage` ran *after* the reply-handling branches, so AutoFetch (every 15 min, 2-hour lookback) and backfills re-appended `[ADMIN_REPLY]`/`[USER_REPLY]` blocks to tickets on every pass.
    *   *Fix:* Moved the `telegram_message_id` dedup check to the top of the function; user replies are now also recorded in `messages`. Existing data cleaned via previewed script: 446 duplicate blocks removed across 82 tickets, re-scan confirmed zero remain.
*   **Dishonest KPI Calculations (fixed 2026-06-11, commit `2ea6bea`):**
    *   *Bug:* "Resolved" metrics counted Dismissed spam as resolutions (rate showed 80%, truth 53%); "Resolved Today" read the never-maintained `updated_at` column; "today" used server (UTC) timezone.
    *   *Fix:* Dismissed excluded from all resolved metrics (Resolution Rate = Resolved ÷ (Resolved + Active)); all four status-writing paths (status endpoint, user auto-resolve, Telegram delete handler, admin-message insert) now stamp `resolved_at`/`updated_at`; "today" computed in Africa/Lagos. Verified by live API comparison and a resolve/reopen round-trip.
*   **Filter Inconsistency on KPI Cards (audited & fixed 2026-06-11, commit `9c2ea4f`):**
    *   *Audit result:* category, urgency, and date filters already reached the stats query (verified live: stats row counts tracked table totals exactly). The real problems: (a) the search box filtered the table but the KPI cards kept showing unfiltered numbers (proven: 103 table rows vs 822 stats rows); (b) a custom date range dropped the entire end day — "today to today" returned 0 tickets while 4 existed; (c) the "last N days" cutoff used the server clock (UTC on Railway) instead of Lagos.
    *   *Fix:* search moved into the shared base filters so both queries see it; all date boundaries (`days=N`, custom start/end) computed as Lagos calendar days. Verified against a server running with TZ=UTC (Railway simulation). Note: the `status` filter intentionally never reaches stats — the KPI cards break tickets down by status.
*   **Unquoted Admin Replies Created Orphan Tickets (fixed 2026-06-11, commit `6c66bf2`):**
    *   *Bug:* When an admin answered in the group without quoting the user, the system could not link the reply to a ticket, so it was stored as its own separate Resolved "ticket" and the real ticket looked untouched.
    *   *Fix:* 90-second window heuristic in `processAndIngestMessage` — an unquoted admin message attaches to the most recently ingested Open/In Review non-admin ticket in the same group if that ticket arrived within the previous 90 seconds; the ticket gets the `[ADMIN_REPLY]` block and is marked "In Review". Outside the window, behavior is unchanged. The top-of-function dedup makes re-scans idempotent. Verified end-to-end via the extended `/api/ingest` endpoint (attach-within-window, ignore-outside-window, re-ingest idempotency), test data cleaned up.

## 6. Every Feature Added & Why
*   **Async Ingestion Pipeline:** To prevent the GramJS listener from blocking the main thread during high message volume.
*   **Min Urgency Filter (Extraction Filtering):** Added a `minUrgency` selector to the Backfill modal and `/api/backfill` to allow historical extraction of only `High` or `Critical` tickets, preventing DB bloat with general chatter.
*   **Gemini 3.1-Pro Integration:** Added for high-quality, empathetic suggested replies, reducing the cognitive load on agents.
*   **Amber Classification Indicators:** Added to the UI to quickly visually signal items needing human review.
*   **Editable Suggested Reply Fields:** To allow human agents to tweak AI responses before sending them, enforcing the "Human in the Loop" philosophy.

## 7. Important Decisions Made & Reasoning
*   **GramJS over Webhooks:** Telegram's MTProto (via GramJS) was chosen because standard bot API webhooks cannot read all group messages unless the bot is an admin with privacy disabled. GramJS acts as a user/client.
*   **Separation of AI Models:** Groq (LLaMA) is used for rapid, cheap classification, while Gemini is reserved for generating nuanced, context-aware suggested replies.
*   **Service Role Key Exclusivity:** The backend is the absolute source of truth. Frontend clients never write directly to Supabase.
*   **Polling over WebSockets (Frontend):** 5-second polling was chosen for the React dashboard for simplicity and resilience in the current deployment constraint, avoiding WebSocket state management complexity on Cloud Run.

## 8. What is Confirmed Working
*   Live Telegram listening and ingestion via GramJS.
*   Groq LLaMA classification into strict JSON.
*   Supabase data insertion bypassing RLS.
*   Frontend dashboard rendering, data fetching, and UI updates.
*   Demo Mode toggling.
*   Re-processing the same Telegram message is now idempotent (verified 2026-06-11: "Skipping duplicate telegramId" fires; replies never duplicate).
*   KPI cards verified against ground-truth DB counts (2026-06-11): Active, In Review, Resolved (Dismissed excluded), Resolution Rate 53%, with `resolved_at` stamped on every resolution path and Lagos-timezone day boundaries.
*   Every dashboard filter (search, category, urgency, date, custom range) updates the KPI cards together with the table (verified 2026-06-11 against a UTC server).
*   Unquoted admin replies attach to the right ticket via the 90-second window heuristic and mark it "In Review" (verified end-to-end 2026-06-11).
*   Production build artifact verified locally (2026-06-11): `npm run build` then `node dist/server.mjs` boots, connects to Telegram, and answers `/api/health` ok — this is exactly what Railway runs per `railway.toml`.
*   **Milestone 3 (2026-06-12): The Human Loop — corrections table, admin-reply re-classification, few-shot learning, /train interface.**
    *   **`corrections` table (migration 010, applied with explicit confirmation):** every human fix to an AI classification is stored — `ticket_id`, `message_text` (snapshot of the original user message, clean of reply blocks), `original_category`, `correct_category`, `corrected_by`, `correction_source` (`human_ui` | `admin_reply`), `created_at`. A row with `original_category = correct_category` means a human reviewed and CONFIRMED the AI — that is how /train marks tickets "reviewed" without a second table. RLS enabled (service role bypasses). Migration 011 also enabled RLS on `learned_keywords` and `filtered_messages` (Supabase security advisory, both approved).
    *   **Admin-reply re-classification:** both admin-reply attachment paths (quoted and 90-second window) fire `reclassifyFromAdminReply`, which asks Groq whether the admin's reply contradicts the assigned category. It updates ONLY `category` + `updated_at` (never status — cannot un-escalate/reopen/resolve), requires an exact case-insensitive category match from the model (no normalizeCategory fallback that could default to General Question), waits 12s and re-checks once if classification is still pending, and records the correction with source `admin_reply`. Verified live: "Deposit Issue" → "Account Access" on a contradicting reply; a generic "we are looking into it" reply changed nothing.
    *   **Few-shot injection:** before each classification, `getFewShotCorrections` extracts keywords (≥4 chars, stopwords removed, max 12) from the incoming message, scores the 200 most recent corrections by keyword overlap (deduped newest-first per message), and appends the top 5 to the system prompt as worked examples. Applied to the main Groq classification, the Gemini fallback (same block, fetched once), and `/api/test-message`. **`/api/eval` deliberately does NOT inject** so the benchmark stays a comparable raw-model baseline. Verified live: after one stored correction, a similar "money never enter" message flipped from Deposit Issue to Account Access in both the test panel and the real ingestion pipeline; a dissimilar message got no injection.
    *   **/train interface:** separate route (no client router — the SPA fallback serves any path; `App.tsx` branches on `window.location.pathname`). `GET /api/train/next` pages newest-first through classified non-admin tickets and returns the first with no corrections row, plus the category list and counts. `POST /api/train/correct` (Zod-validated) stores the verdict; "wrong" also updates the ticket category and writes an audit log entry; a per-ticket `human_ui` double-submit guard returns `alreadyReviewed`. Dashboard polling is disabled on /train. Verified end-to-end with API round-trips and UI screenshots; all test data cleaned up.
*   **Milestone 2 (2026-06-12): 4-state resolution workflow + Avg Response Time.** Statuses are now Open / In Review / Escalated / Awaiting User / Resolved / Dismissed (DB CHECK constraint widened, migration 009). Workflow rules: admin reply moves Open → In Review but never un-escalates (Escalated / Awaiting User keep their state); a user reply to an Awaiting User ticket flips it back to In Review; all four active states accept replies and count as Active in the resolution rate. New `first_admin_reply_at` column is stamped once per ticket (with the reply message's own timestamp) by both admin-reply paths; the dashboard has a new Avg Response Time KPI card (legacy tickets are null and excluded). The stats payload gained `inReviewCount`, real `escalatedCount`, `awaitingUserCount`, `avgResponseMs`, `respondedCount` — the "In Review" card previously read a field misleadingly named `escalatedCount`. `/api/ingest` (super_admin) now also accepts `replyToMsgId` for simulating quoted reply threads. Everything verified end-to-end on a local server against the live DB (status round-trips, both reply paths, re-ingest idempotency, 23s measured avg response) and all test data deleted afterwards.

## 8b. Deployment (Railway — production)
*   **Production URL: `https://quidax-telegram-gemini-production.up.railway.app/`** (verified healthy 2026-06-12: `/api/health` returned ok, `telegramConnected: true`, all circuit breakers closed).
*   **Decision (2026-06-12): staying on Railway.** The Fly.io migration was abandoned because Fly requires a payment method; `fly.toml`, `Dockerfile`, and `.dockerignore` were removed from the repo (commit `510cb0c`). If hosting is revisited, that commit has the full working Fly config and section 8c/8d of this doc's git history has the runbook.
*   `railway.toml` at the repo root: builds with `npm run build`, starts with `node dist/server.mjs` (NOT `npm start` — that script contains a Windows-only `chcp` command), health check `/api/health` (5-min timeout for Telegram connect), `numReplicas = 1` pinned because each replica would open its own GramJS session and double-ingest.
*   Railway injects `PORT` automatically — never set it manually.
*   Env vars to set in the Railway dashboard (values from local `.env`): `GROQ_API_KEY`, `GEMINI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DASHBOARD_PASSWORD`, `TELEGRAM_API_ID`, `TELEGRAM_API_HASH`, `TELEGRAM_SESSION_STRING`, `TELEGRAM_GROUP_USERNAME`, `TELEGRAM_ADMIN_USER_IDS`, `NODE_ENV=production`, `DEMO_MODE=false`; optional: `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`, `HEARTBEAT_URL`, `SUPPORT_API_KEY`.
*   Railway free tier is a $5/month credit (~16 days of runtime) — watch the balance; deploys after the credit runs out will need a paid plan.

## 8c. Local testing (safe — no Telegram session)
*   Run `npx tsx scripts/dev-no-telegram.mjs` (gitignored like all `*.mjs` scripts; recreate from this note if missing — it sets `TELEGRAM_SESSION_STRING=""` and `PORT=3100` before importing `server.ts`, and dotenv never overrides existing env vars).
*   This keeps the GramJS listener OFF so production on Railway stays the only live Telegram session, while the local server still uses the live Supabase DB, Groq, and Gemini.
*   `.claude/launch.json` has a `pulsedesk-local` preview config that uses this launcher.
*   PowerShell gotcha: `$env:X = ""` DELETES the variable instead of setting it empty — use the launcher script (or Git Bash `X="" command`) to blank an env var.

## 9. Suspected Broken, Untested, or Needs Verification
*   **GramJS Session String Expiration:** Needs verification on how long the `TELEGRAM_SESSION_STRING` lasts before a re-auth is required.
*   **High-Volume Concurrency:** The async ingestion handles moderate loads, but behavior under extreme spikes (e.g., thousands of messages per minute) is untested.
*   **Rate Limit Edge Cases:** The `heavyLimiter` might trigger false positives if the Cloud Run proxy headers are misconfigured.
*   **Keyword Learning System:** Basic logic exists but long-term effectiveness is unverified.

## 10. Repeatedly Revisited / Fixed Multiple Times
*   **Schema Validation:** The LLM hallucinating category strings or casing has required multiple patches (strict prompting, Zod integration, fallback normalization).
*   **Project Context Wipes:** The AI environment frequently lost context, requiring aggressive tracking files and ignore-file management to prevent artifacts from confusing the agent.
