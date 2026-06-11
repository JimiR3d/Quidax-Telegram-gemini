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

## 9. Suspected Broken, Untested, or Needs Verification
*   **GramJS Session String Expiration:** Needs verification on how long the `TELEGRAM_SESSION_STRING` lasts before a re-auth is required.
*   **High-Volume Concurrency:** The async ingestion handles moderate loads, but behavior under extreme spikes (e.g., thousands of messages per minute) is untested.
*   **Rate Limit Edge Cases:** The `heavyLimiter` might trigger false positives if the Cloud Run proxy headers are misconfigured.
*   **Keyword Learning System:** Basic logic exists but long-term effectiveness is unverified.

## 10. Repeatedly Revisited / Fixed Multiple Times
*   **Schema Validation:** The LLM hallucinating category strings or casing has required multiple patches (strict prompting, Zod integration, fallback normalization).
*   **Project Context Wipes:** The AI environment frequently lost context, requiring aggressive tracking files and ignore-file management to prevent artifacts from confusing the agent.
