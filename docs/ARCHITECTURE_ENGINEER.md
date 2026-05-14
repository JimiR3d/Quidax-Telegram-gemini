# PulseDesk: Comprehensive Systems & Architecture Documentation

## 1. Executive System Overview
PulseDesk is an enterprise-grade, full-stack customer support triage and ticketing platform. It listens to external community communities (primarily Telegram), ingests unstructured user messages, utilizes a Large Language Model (LLM) for natural language understanding and intent classification, and securely persists this structured data into a PostgreSQL database. Finally, it serves this data to support agents through a high-performance React dashboard with strict Role-Based Access Control (RBAC) and Row-Level Security (RLS).

This document serves as the absolute source of truth for the entire architecture, network protocols, system lifecycle, codebase structure, and security posture of the project.

---

## 2. Technological Stack & Frameworks

### 2.1 Backend & Middleware
*   **Runtime**: Node.js (v18+) using TypeScript.
*   **Framework**: Express.js.
*   **Development Server**: `tsx` (TypeScript Execute) for hot-reloading and direct TS execution.
*   **Production Bundler**: `esbuild` for compiling the backend into a highly optimized, minified CommonJS bundle (`dist/server.cjs`).
*   **API Protocols**: RESTful HTTP layer, communicating over TLS 1.2/1.3 (HTTPS via Cloud Run ingress).

### 2.2 Frontend
*   **Core**: React 18+ utilizing functional components and hooks.
*   **Build Tool**: Vite, configured for deeply optimized Single Page Application (SPA) delivery.
*   **Styling**: Tailwind CSS for utility-first, atomic CSS styling.
*   **Icons & UI Elements**: Lucide-React for vector icons.
*   **Data Visualization**: Recharts for rendering SVG-based analytic charts on the dashboard.

### 2.3 Database & ORM
*   **Engine**: PostgreSQL (managed via Supabase).
*   **Client SDK**: `@supabase/supabase-js` for API interactions.
*   **Security Layer**: Native PostgreSQL Row-Level Security (RLS) configured via SQL migrations.

### 2.4 AI & Inference
*   **Provider**: Groq API.
*   **Model**: `llama-3.3-70b-versatile` (Meta's LLaMA 3.3 70B parameter model, optimized on Groq's LPU inference hardware).
*   **SDK**: `@google/genai` (acting as an OpenAI-compatible interface by rerouting the base URL to Groq).

### 2.5 Testing & CI/CD
*   **Unit & Integration Testing**: `vitest` combined with `supertest` for mocking the Express API and validating logic.

---

## 3. Database Schema & Models

The system architecture utilizes a relational model consisting of five core tables, designed with strict constraints.

1.  **`communities`**: Tracks the Telegram Groups (`telegram_group_id`) connected to the system.
2.  **`users`**: Manages RBAC identities. 
    *   *Columns*: `id` (UUID), `email`, `role` (Enum: `super_admin`, `support_agent`, `viewer`), `tenant_id` (Mapped to a community group), `created_at`.
3.  **`messages`**: Raw ingestion log containing every message received from an integration.
    *   *Columns*: `id`, `telegram_message_id`, `group_id`, `sender_id`, `sender_name`, `raw_text`, `timestamp`.
4.  **`tickets`**: The structured output of the LLM pipeline.
    *   *Columns*: `id`, `group_id`, `message_id`, `customer_id`, `customer_name`, `raw_text`, `category` (e.g., wallet_issue, bug), `product_area`, `urgency` (low, medium, high), `sentiment`, `status` (Open, In Progress, Resolved), `created_at`.
5.  **`audit_logs`**: Immutable ledger of all system state changes.
    *   *Columns*: `id`, `actor_id`, `action`, `target_resource`, `previous_state` (JSONB), `new_state` (JSONB), `ip_address`, `timestamp`.

---

## 4. Lifecycle & Data Flow

### Phase 1: Ingestion
1.  **Protocol**: Messages are ingested from Telegram (via MTProto/GramJS simulation or direct Webhooks) into the `POST /api/ingest` or `POST /api/simulate-webhook` endpoints.
2.  **Validation**: The Express server validates the payload size (Max `50kb`) and strips malicious headers using Helmet.js.
3.  **Filtration**: Messages with fewer than 5 words are discarded to reduce noise and LLM cost.

### Phase 2: AI Triage
1.  **Prompt Engineering**: The backend constructs a system prompt instructing the `llama-3.3-70b` model to act as a strict JSON-outputting support triage agent.
2.  **Inference**: The unstructured message is pushed to Groq over a secure HTTPS API call.
3.  **Parsing**: The system expects a strict JSON interface back containing `category`, `product_area`, `urgency`, `sentiment`, and `is_complaint`.

### Phase 3: Database Storage
1.  The raw text is stored in `messages`.
2.  Structured triaged data is written to the `tickets` table mapped to the originating `group_id` (Tenant ID).

### Phase 4: UI Serving
1.  React dashboard queries `GET /api/tickets` polling for updates.
2.  The backend passes the request through the `requireAuth` middleware, extracting the user's `role` and `tenantId`.
3.  PostgreSQL RLS ensures that only data matching the user's tenant boundary is returned to the client.

---

## 5. Security & Architecture Fixes (The "Mistake" Resolutions)

The system underwent a massive security audit and refactor. Here is pixel-perfect documentation of the vulnerabilities fixed:

### 5.1. Overcoming Binary Access Control -> Implementing RBAC
*   **Vulnerability**: The previous iteration utilized a monolithic `VITE_DASHBOARD_PASSWORD` shared across all users.
*   **Protocol Implemented**: We introduced a robust authentication context middleware mapping distinct keys (or JWTs) to specific privileges.
*   **Execution**:
    *   `super_admin`: Has global read/write privileges.
    *   `support`: Is strictly bounded by a `tenantId`.

### 5.2. Implementing the Immutable Audit Log
*   **Vulnerability**: Ticket statuses could be mutated silently. 
*   **Protocol Implemented**: Complete temporal tracking. 
*   **Execution**: The backend API (`POST /api/tickets/:id/status`) was intercepted. Before any mutation is committed, the application queries the *previous* state (`oldTicket`), applies the mutation, and asynchronously invokes `logAuditAction()`. This writes a cryptographic-style record into the PostgreSQL `audit_logs` table containing `{ status: 'open' }` -> `{ status: 'resolved' }` along with the `req.ip` and actor.

### 5.3. Tenant Isolation (Row-Level Security)
*   **Vulnerability**: Multi-tenant data could bleed across support agents. The API just checked `req.query.group_id`, which a malicious actor could drop.
*   **Protocol Implemented**: Deep-layer database sandboxing via PostgreSQL Row Level Security (RLS) coupled with API guardrails.
*   **Execution**: We applied `ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;`. We created a policy: `USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin') OR group_id IN (SELECT tenant_id FROM users WHERE id = auth.uid()));`. 
*   In the Node.js API, the query builder was rewritten to **force** `query.eq('group_id', user.tenantId)` if the user is not an admin, ignoring whatever the client requested.

### 5.4. Hardening Network & App Layers (Defense in Depth)
*   **Vulnerability**: Missing basic HTTP protections resulting in vulnerability to XSS or DDoS.
*   **Protocol Implemented**: 
    1.  `express-rate-limit`: Configured natively on `/api/` paths blocking IPs that exceed 200 requests per 15 minutes.
    2.  `helmet`: Injected into the middleware pipeline to obfuscate server signatures (`X-Powered-By`) and enforce strict MIME sniffing and XSS protection headers.

### 5.5. Deployment, Rollbacks, and Environments
*   **Vulnerability**: Application was deployed straight-to-prod with no rollback mechanisms, mixed environments, or isolated tests.
*   **Protocol Implemented**: 
    1.  **Testing**: Configured `vitest` and `supertest` for isolated, automated API route testing without hitting production databases.
    2.  **Environment Variables**: Setup strict separation via `NODE_ENV`. Added feature flags (`ENABLE_BETA_FEATURES`) so that unstable code could be triggered only if explicit env vars are present.
    3.  **Rollback Playbook**: Engineered reversible database migrations via `.sql` scripts. `001_initial_down.sql` and `002_security_down.sql` map directly to schema tear-downs, giving the team a safe fallback path during broken deployments.

---

## 6. End-to-End File Map & Directory Structure

*   `/server.ts`: The monolithic API backend, Express router, authentication middleware, and React static file server.
*   `/src/App.tsx`: The heart of the React Front-End application.
*   `/src/index.css`: Tailwind configuration and global CSS variables.
*   `/tests/auth.test.ts`: Supertest suite verifying Tenant Isolation and RBAC.
*   `/supabase/migrations/`: SQL migration files dictating table structures, RLS policies, and downgrade instructions.
*   `/.env.example`: The template defining standard environmental architecture variables.

*Document finalized by the Principal Security & Architecture Engineer.*
