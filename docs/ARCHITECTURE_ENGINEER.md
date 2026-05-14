# PulseDesk Architecture & Engineering Documentation

## 1. System Overview
PulseDesk is a full-stack, AI-powered customer support triage and ticketing system. It listens to a specific Telegram community group, ingests messages, uses a Large Language Model (LLM) to classify them based on intent/urgency, and stores them in a structured database for support agents to review via a web dashboard.

## 2. Core Stack & Frameworks
*   **Frontend**: React 19, Vite, Tailwind CSS (v4), Lucide React (icons), Recharts (analytics).
*   **Backend**: Node.js, Express (TypeScript), `tsx` for development, `esbuild` for production bundling.
*   **Database**: Supabase (PostgreSQL) with Row-Level Security (RLS).
*   **LLM Inference**: Groq API (using the `llama-3.3-70b-versatile` model via the OpenAI compatible SDK) for ultra-fast, structured JSON generation.
*   **Messaging Pipeline**: `telegram` (GramJS) for real-time MTProto listening to Telegram groups.

## 3. Data Architecture
The data layer is managed in Supabase with the following core entities:
*   `tickets`: The primary entity. Contains classification data (category, urgency, sentiment), the raw text, and status (e.g., Open, Resolved).
*   `messages`: The raw message ingestion log mapping directly to `telegram_message_id`.
*   `users`: Represents authenticated agents and their Role-Based Access Control (RBAC) levels.
*   `audit_logs`: An append-only log of critical mutations (e.g., status changes) containing the actor, previous state, new state, and IP context.

## 4. Security & Compliance Measures
We have addressed critical security flaws through the following implementations:

### 4.1. Row-Level Security (RLS) & Tenant Isolation
Access control is not merely handled at the API level but enforced deep within the PostgreSQL layer via RLS:
```sql
CREATE POLICY ticket_tenant_isolation ON tickets FOR ALL USING (
  auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin') 
  OR group_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
);
```

### 4.2. API & Application Security protocols
*   **Helmet.js**: Injected into the Express pipeline to sanitize headers.
*   **Express Rate Limiting**: Mitigates brute-force logic and noisy neighbors (Max 200 requests / 15 mins).
*   **Strict Payload Size Limits**: `express.json({ limit: "50kb" })` prevents buffer overflow or massive memory saturation by rejecting excessively large payloads.
*   **Audit Logging**: Every state change (e.g., Ticket Status update) automatically writes a log to `audit_logs` capturing `actor_id`, `action`, `previous_state`, `new_state`, and `ip_address`.

### 4.3 HTTP Headers & Authentication
Currently, the system authenticates the client via an `x-admin-key` header mapped back to environmental boundaries (mapped functionally over RBAC context). For extensive production environments, this transitions into Supabase JWTs attached as `Authorization: Bearer <token>`.

## 5. Asynchronous Messaging Pipeline
1.  **GramJS Listener**: Sustains a persistent WebSocket/MTProto connection directly to Telegram's DC.
2.  **Filter**: Only messages with $\ge$ 5 words are accepted to reduce "hello" span.
3.  **LLM Prompting**: The raw payload is passed to Groq. Strict schema adherence is defined in the chat completion to enforce returning fields such as `category`, `product_area`, `sentiment`, and `is_complaint`.
4.  **Database Ingestion**: Writes to `messages`. If it represents a reply to an existing parent message, it updates the parent `ticket.raw_text`. Otherwise, it generates a fresh `ticket`.

## 6. Deployment & CI/CD
*   **Build Phase**: Vite builds the CSR React artifacts. `esbuild` compiles `server.ts` into a CommonJS bundle (`dist/server.cjs`).
*   **Runtime**: Designed to run statelessly in containerized environments (like Google Cloud Run). The Express server acts as a middleware router, API backend, and static file server for the Vite distributions natively. 
*   **Feature Flags**: Implementation of `ENABLE_BETA_FEATURES` for decoupled releases.
