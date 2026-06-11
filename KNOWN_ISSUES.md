# PulseDesk: Known Issues & Pending Features

This document provides a brutally honest, exhaustive tracking of every bug, suspected bug, untested area, repeated fix, and pending feature in the PulseDesk application.

## 1. Repeated Fixes & Chronic Bugs
*   **LLM Schema Hallucinations:** The Groq/LLaMA integration has repeatedly returned JSON payloads with incorrect keys (e.g., `priority` instead of `urgency`) or varying casing. This was patched multiple times: first with stricter system prompts, then with Zod validation, and finally with a custom `normalizeCategory` fallback function. It remains an area of fragility if the model updates or shifts behavior.
*   **Supabase Row Level Security (RLS) Conflicts:** Initially, the backend attempted to insert records using the `SUPABASE_ANON_KEY`, which failed because RLS policies blocked anonymous inserts. This was fixed by exclusively using `SUPABASE_SERVICE_ROLE_KEY` on the backend, but any future frontend direct-database writes will instantly hit this wall if not properly scoped.
*   **AI Context Degradation:** Development environments (like AI agents) repeatedly lost the context of the project or hallucinated previous fixes because temporary build artifacts and test scripts polluted the context window. This required aggressive `.gitignore` management and manual context handoffs.

## 2. BUGS (confirmed)
*   **Admin reply duplication:** When an admin replies to a message, the reply text appears duplicated 2-3 times in the real-time stream on the dashboard.
*   **KPI cards unverified:** Resolution rate, resolved all time, and other calculated metrics have not been verified against real data and are suspected inaccurate.
*   **Filter inconsistency:** Date/category/urgency filters may not be updating all KPI cards simultaneously when changed.

## 3. ARCHITECTURE GAPS & Suspected Bugs
*   **Resolution detection is unreliable for unquoted admin replies:** When multiple users raise issues simultaneously and an admin responds without quoting anyone, the system cannot match the reply to the correct ticket.
*   **Binary Resolution Status:** Resolution status is binary (open/resolved) but real support workflows have intermediate states: In Review, Escalated to Engineering, Awaiting User Response.
*   **Nigerian Pidgin English:** This is not accounted for in the classification system — common phrases like "e don do", "e never enter", "dem block my account" may be misclassified.
*   **Keyword Learning System:** The `learned_keywords` system exists but its long-term effectiveness has not been measured or verified in a live, prolonged production environment to prove it actually improves accuracy.
*   **GramJS Session Expiry:** The `TELEGRAM_SESSION_STRING` is currently treated as permanent. It has never been tested against Telegram's forced session revocations or expiry intervals. If it expires, the listener will silently die without auto-recovery.
*   **Extreme High-Volume Concurrency:** The async ingestion pipeline and heavy limiters work for standard volume. It is highly suspected that a massive raid or spam attack (e.g., 5,000 messages in 10 seconds) could overwhelm the Groq rate limits, causing the backend to start dropping messages despite the circuit breaker.
*   **Cloud Run / Railway Deployment:** GramJS requires a persistent TCP connection (WebSocket), which traditionally conflicts with serverless environments like Vercel. While containerization (Cloud Run / Railway) works in theory, long-running persistent connections often get severed by load balancers after 30-60 minutes unless active keep-alives are meticulously tuned. This tuning is currently unverified.

## 4. PENDING FEATURES (not yet built)
*   **Human feedback training interface:** A dedicated session/interface for reviewing and correcting AI classifications like flashcards.
*   **Few-shot correction database:** Storing human corrections and injecting them into the Groq prompt to improve future accuracy.
*   **Admin reply re-classification:** Using admin reply content to detect and dynamically fix wrong classifications without manual dashboard correction.
*   **Automated status update bot:** A bot that automatically replies in the Telegram group thread when a ticket status changes in the dashboard.
*   **Improved category taxonomy:** With granular Quidax-specific categories (e.g., distinguishing between "Withdrawal Issue" and "Transaction Dispute").
*   **PR-Based Development Workflow:** Enforcing strict PRs for all feature additions with mandatory plain-English documentation.
