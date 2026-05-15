# PulseDesk: System Architecture & Security Documentation

## 1. Executive Summary
PulseDesk is a fintech-oriented, AI-powered triage and ticketing system designed to automatically ingest, classify, and prioritize messages from Telegram communities. This application employs a robust Full-Stack architecture combining React + Vite on the frontend with a custom Node.js/Express backend running within a containerized environment (Cloud Run/AI Studio constraints).

## 2. Core Architecture Stack

### 2.1 Backend (Node.js + Express)
*   **Runtime:** Node.js processing inside a Docker container (deployed via Cloud Run), binding solely to Port `3000` via `0.0.0.0` as per infrastructure constraints.
*   **Framework:** Express.js `4.21.2` handles routing and custom middleware.
*   **Ingestion:** Telegram AT protocol via GramJS (`telegram: 2.26.22`) acts as a persistent TCP listener for live messages.
*   **AI Service:** Groq API (`llama-3.3-70b-versatile`) acts as the natural language understanding agent to classify text into structured JSON shapes with 7 parameters (category, urgency, product_area, sentiment, is_complaint, suggested_action, summary).
*   **Database Integration:** `@supabase/supabase-js` provides ORM-like access to PostgreSQL. All environment variables dictate Supabase connections dynamically.
*   **Bundling/Transpilation:** Development utilizes `tsx` for on-the-fly TS execution. Production builds are bundled with `esbuild`, enabling full ESM to CJS translation in a single `dist/server.cjs` file to bypass ES Module restrictions natively.

### 2.2 Frontend (React 19 + Vite)
*   **Framework:** React 19.
*   **UI/Styling:** Tailwind CSS `4.x` combined with Framer Motion (`motion`) for layout animations.
*   **Data Visualization:** Recharts for telemetry graphing.
*   **Icons:** Lucide React for consistent SVG primitives.
*   **Vite Integration:** In development, Vite operates in `middlewareMode`, seamlessly injecting static SPA fallbacks through the Express server without requiring parallel port mapping.

## 3. Security Implementation (In-Depth)
During the audit and iterative development process, several severe security limitations were addressed to elevate this from a prototype to a production-ready application.

### 3.1 Network Edge Security
*   **Proxy Bounding:** `app.set("trust proxy", 1);` explicitly trusts the single ingress controller to ensure accurate IP derivation, preventing spoofing of the `X-Forwarded-For` headers.
*   **Helmet Middleware:** Provides out-of-the-box header protections (XSS filters, frame options). CSP was selectively relaxed to accommodate Vite HMR during development.
*   **Rate Limiting:** `express-rate-limit` enforces a strict 200 req per 15 min boundary on the `/api/*` endpoints to throttle brute-forcing on auth and scraping on ticket feeds.
*   **Payload Bounds Check:** `express.json({ limit: "50kb" })` guarantees memory is not exhausted by malformed ingest payload attacks.

### 3.2 Authentication & Tenant Isolation (RBAC)
*   **Custom Key Authentication:** Instead of exposing DB JWTs directly, the API mandates an `x-admin-key`.
*   **Tenant Mapping:** The `getAuthContext()` isolates user domains into rigid roles (`super_admin` vs `support`). Super Admins have global access (`tenantId: null`), whereas Support users are bounded by row-level filtering applied explicitly in the Route handlers (e.g., `query.eq('group_id', user.tenantId)`).
*   **Authorization Enforcement:** `requireAuth` middleware guarantees that no `/api/` route performs unauthenticated access. 
*   **Boundary Checking on Writes:** The backend double-checks the previous state of a record before executing mutations (`POST /api/tickets/:id/status`). A `support` user mutating a ticket belonging to the wrong tenant returns an immediate HTTP 403 Forbidden.

### 3.3 Defensive Coding Against Payload Anomalies
*   **Safe JSON Parsing Pipeline:** `App.tsx`'s `apiFetch` was deeply refactored to validate the `Content-Type: application/json` header prior to invoking `res.json()`. This structurally resolves the infamous `Unexpected token '<'` error natively caused by SPAs fetching uncaught 502/HTML errors or navigating dead routes.
*   **Type Coercion via Validation:** The Groq AI output is fed through an internal `validateTicketSchema` which normalizes unpredictable Enums (like falling back incorrect `urgency` outputs to `"Medium"`), preventing Postgres Type Constraint Violations on INSERT operations.

## 4. Telemetry & Auditing
*   **Audit Logging:** Critical mutations implement asynchronous write-behind checks using `logAuditAction()`. Any state change records the `actor_id`, `action`, `previous_state`, `new_state`, and `ip_address` into a dedicated `audit_logs` table (matching migration `002_security_up.sql`).

## 5. Deployment Mechanism
1.  **Build Phase:** `NODE_ENV=production npm run build` compiles `index.html` via Vite and bundles `server.ts` into a lightweight CJS format via esbuild.
2.  **Runtime:** `package.json` initiates `node dist/server.cjs`.
3.  **Static Serving:** Express shifts from active HMR injection to static file serving directly from the `dist/` root, enabling robust edge serving from within a single Cloud Run container.
