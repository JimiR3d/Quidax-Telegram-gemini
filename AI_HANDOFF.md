# AI Handoff Document: PulseDesk

## Overview
Welcome! You have been assigned to continue development on **PulseDesk**, an AI-powered triage and ticketing system. This full-stack application ingests messages from Telegram using GramJS, processes them using the Groq API (LLaMA model), stores the classification in Supabase, and provides a modern React dashboard for support agents to review and update tickets.

This document serves as your operational blueprint, capturing the complete development context, recent iterations, architecture, and important lessons learned during previous development phases.

## 1. Project Context & Objectives
- **Goal**: Read incoming Telegram messages from a group, classify them automatically using an LLM, and display them in a web UI where support agents can resolve or update them.
- **Constraints**: 
  - Runs in a containerized environment (Cloud Run / AI Studio).
  - Backend is Node.js, Frontend is React (Vite).
  - Port `3000` is the single ingress point.
  - Secret keys must not be exposed to the client-side.
  
## 2. Recent Development Iterations and Fixes
The project evolved through a series of tactical improvements to fix bugs and improve reliability:

*   **Supabase Client Fix (Lazy Initialization & Keys)**: 
    - Initially, `getSupabase()` used `SUPABASE_ANON_KEY` which failed backend inserts bypassing RLS. We reverted it strictly to use `SUPABASE_SERVICE_ROLE_KEY` inside the Node environment to maintain absolute server authority. The application will explicitly fail loudly on boot if it is missing, preventing silent data losses.
*   **Stale Data / Caching Bug**:
    - The dashboard was rendering stale tickets from older times. This was caused by aggressive browser or proxy caching on the `/api/tickets` endpoint.
    - **Fix**: Added explicit HTTP cache headers (`Cache-Control: no-store`, `Pragma: no-cache`) in `server.ts` and `{ cache: 'no-store' }` to the frontend `apiFetch` utility to guarantee fresh data every time `fetchTickets()` is called (which now polls every 5 seconds).
*   **Missed Message Auto-Fetch (Cron)**:
    - Live Telegram streaming (GramJS `NewMessage`) can sometimes drop connections. 
    - **Fix**: Added a background run `runAutoFetch` that acts as a cron job, fetching unseen messages every 15 minutes, skipping ones already imported.
*   **Message Backfill System**:
    - Added an `/api/backfill` endpoint to ingest historic messages on command.
    - **Backpressure & Rate Limiting Fix**: We encountered `429 Rate limit reached` from the Groq API (`llama-3.1-8b-instant`) strictly capped at 30 requests per minute (RPM).
    - **Fix**: Replaced parallel `Promise.all` in the backfill logic with sequential iteration using `await new Promise(r => setTimeout(r, 2100))` to enforce strict adherence to a 2.1-second delay between LLM calls, staying safely under 30 RPM.
*   **Admin Reply Chain Tracking**:
    - Re-configured the ingestion processor to detect replies by group admins `checkIsAdmin()`. Admin replies append text to the original ticket (`[ADMIN_REPLY] ...text [/ADMIN_REPLY]`) and switch the ticket status back to 'In Review' instead of creating an orphan ticket.
*   **LLM Hallucination / Null Defaulting Bug**:
    - Found a bug where the classification schema was absent from the OpenAI Groq prompt context, causing the LLM to output custom keys (like `priority` instead of `urgency`). The validator was blindly defaulting all unrecognized fields to `Medium` and `General Question`.
    - **Fix**: Directly mapped `responseSchema` into the System Prompt `JSON.stringify` context, and built a case-insensitive fallback mapping into `validateTicketSchema` to guarantee proper schema compliance.
*   **Extraction Filtering**:
    - Added a `minUrgency` selector to the Backfill modal (`App.tsx`) and the `/api/backfill` backend logic. Permits historical extraction of solely `High` or `Critical` tickets without bloating the UI with general questions.

## 3. Key Components
- `server.ts`: The core backend entry point. Contains Express API, Vite middleware for development, Telegram listener, Supabase ORM layer, Groq API LLM logic, and rate-limiting limits.
- `src/App.tsx`: The primary frontend UI dashboard, polling `/api/tickets` every 5 seconds.
- `/api/tickets`: Fetches tickets dynamically respecting RBAC.
- `/api/backfill`: Initiates a background backfill job for historic indexing (sequentially throttled).
- `metadata.json`: Contains project permissions and name.

## 4. Current State & Instructions for Next AI
The application is fully functional. 
- The backend successfully connects to Telegram via a session string.
- Telemetry caching bugs are fixed.
- Historic backfill processes run sequentially without hitting API rate limits.
- Ensure that any future integrations with external APIs adhere strictly to rate limit bounds, and any new backend environmental keys are documented within `.env.example`. 

You can refer to `SYSTEM_ARCHITECTURE_EXPERT.md` for specific security bounds, or `SYSTEM_ARCHITECTURE_BEGINNER.md` for high-level analogies.

Continue developing, debugging, or extending functionality purely based on the user's explicit request.
