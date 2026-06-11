# PulseDesk: Known Issues & Pending Features

This document provides a brutally honest, exhaustive tracking of every bug, suspected bug, untested area, repeated fix, and pending feature in the PulseDesk application.

## 1. Repeated Fixes & Chronic Bugs
*   **LLM Schema Hallucinations:** The Groq/LLaMA integration has repeatedly returned JSON payloads with incorrect keys (e.g., `priority` instead of `urgency`) or varying casing. This was patched multiple times: first with stricter system prompts, then with Zod validation, and finally with a custom `normalizeCategory` fallback function. It remains an area of fragility if the model updates or shifts behavior.
*   **Supabase Row Level Security (RLS) Conflicts:** Initially, the backend attempted to insert records using the `SUPABASE_ANON_KEY`, which failed because RLS policies blocked anonymous inserts. This was fixed by exclusively using `SUPABASE_SERVICE_ROLE_KEY` on the backend, but any future frontend direct-database writes will instantly hit this wall if not properly scoped.
*   **AI Context Degradation:** Development environments (like AI agents) repeatedly lost the context of the project or hallucinated previous fixes because temporary build artifacts and test scripts polluted the context window. This required aggressive `.gitignore` management and manual context handoffs.

## 2. Suspected Bugs & Untested Areas
*   **GramJS Session Expiry:** The `TELEGRAM_SESSION_STRING` is currently treated as permanent. It has never been tested against Telegram's forced session revocations or expiry intervals. If it expires, the listener will silently die without auto-recovery.
*   **Extreme High-Volume Concurrency:** The async ingestion pipeline and heavy limiters work for standard volume. It is highly suspected that a massive raid or spam attack (e.g., 5,000 messages in 10 seconds) could overwhelm the Groq rate limits, causing the backend to start dropping messages despite the circuit breaker.
*   **Keyword Learning System:** Basic logic exists in the architecture for a keyword learning system, but it has never been properly end-to-end tested in a live, prolonged production environment to prove it actually improves accuracy.
*   **Cloud Run / Railway Deployment:** GramJS requires a persistent TCP connection (WebSocket), which traditionally conflicts with serverless environments like Vercel. While containerization (Cloud Run / Railway) works in theory, long-running persistent connections often get severed by load balancers after 30-60 minutes unless active keep-alives are meticulously tuned. This tuning is currently unverified.

## 3. Pending & Unimplemented Features
*   **Feature 1: Improved Category System:** Currently, categories are broad. Distinctions between "Withdrawal Issue" (technical failure) vs "Transaction Dispute" (user contention) need to be rigidly defined and aligned with Quidax's actual support team taxonomy.
*   **Feature 2: Human Feedback and Training Loop:** A dedicated training interface for admins to review AI classifications like flashcards, correct them, and feed them into a reference database for RAG/few-shot prompting.
*   **Feature 3: Admin Reply Learning:** Automatically monitoring admin replies in the Telegram group to detect if the AI got it wrong, dynamically re-classifying the ticket based on human intervention without manual dashboard correction.
*   **Feature 4: Automated Status Update Bot:** A feature where changing a ticket to "Resolved" in the dashboard triggers a professional, empathetic bot reply directly inside the original Telegram thread to notify the user.
*   **Feature 5: PR-Based Development Workflow:** Enforcing strict PRs for all feature additions with mandatory plain-English documentation.
