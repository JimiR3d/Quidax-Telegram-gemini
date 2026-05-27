# PulseDesk System Audit & Mistake Review

This is a formal review of the PulseDesk codebase against the 10 core architectural and deployment mistakes requested for evaluation.

## Security & Architecture Mistakes

### 1. Access control is binary
**Status: Failed.**
Access control in PulseDesk is completely binary and shared. `server.ts` uses a single `requireAuth` middleware that checks against a single environment variable (`VITE_DASHBOARD_PASSWORD = YOUR_ADMIN_PASSWORD`). 
*   **Issues**: There is no concept of users, teams, or scopes. You are either a global super-admin or you are blocked. If someone gets the password, they can view, modify, and ingest tickets across *all* communities.
*   **Fix**: Implement true stateless JWTs or session-based authentication (via Supabase Auth) with a `roles` table. Permissions should be mapped to `tenant_id` (Telegram Group ID).

### 2. No audit log
**Status: Failed.**
There is absolutely no audit logging in the current codebase. When a ticket status is updated via `app.post("/api/tickets/:id/status")`, it blindly overwrites the `status` column in Supabase.
*   **Issues**: If a malicious admin or a compromised key starts resolving all critical tickets asynchronously, you will not know who did it, when they did it, or from what IP address. 
*   **Fix**: Introduce an `audit_logs` table. Every `create`, `update`, and `delete` operation must insert a record containing `user_id` (or IP/key), `action` (e.g., `TICKET_STATUS_CHANGED`), `target_id`, `previous_state`, `new_state`, and `timestamp`.

### 3. No tenant isolation
**Status: Failed.**
While the database schema loosely has a `group_id` dimension (logical separation), the API does not enforce strict tenant isolation.
*   **Issues**: The dashboard queries `/api/tickets?group_id=...`, but any authenticated client can simply omit the `group_id` query param to dump the tickets of all tenants. There is no Row-Level Security (RLS) enforcement on the backend linking the caller's credentials to specific allowed communities.
*   **Fix**: Enforce Tenant boundaries at the DB layer using RLS, or strictly validate at the API layer that the authenticated user's `team_id` matches the target `group_id` they are querying.

### 4. Security as an afterthought
**Status: Failed.**
The API rate limit, the basic `x-admin-key` authentication, and headers like `helmet` were bolted onto the `server.ts` file in a later phase. 
*   **Issues**: Security wasn't designed from the inside-out. Supabase keys (`SUPABASE_URL`, `SUPABASE_ANON_KEY`) are passed directly from the client side in some older revisions. We've mostly moved to the backend, but the schema has not been hardened with zero-trust in mind.

---

## Deployment & Testing Mistakes

### 5. Shipped straight to prod
**Status: Failed.**
There are no deployment boundaries. Pushing to this environment builds the code and immediately serves it. 
*   **Issues**: Any typo in `server.ts` or a broken dependency update immediately crashes the liverelease.

### 6. Only tested on localhost
**Status: Failed.**
There is absolutely zero automated testing in the repository. No Unit Tests (e.g., Vitest), no Integration Tests (e.g., API supertest), and no E2E UI Tests (e.g., Playwright). Testing relies completely on "clicking the UI to see if it works".

### 7. No dev environment
**Status: Failed.**
The application relies on a single set of third-party API keys (Supabase, Groq, Telegram). A developer trying out a test script natively triggers real LLM credits and hits the real production Supabase database. There is no isolated `dev_supabase` environment defined.

### 8. No staging environment
**Status: Failed.**
There is no production-mirror staging environment configured to handle mock loads or simulated traffic before a production swap.

### 9. No beta / phased rollout
**Status: Failed.**
There are no feature flags (`LaunchDarkly`, `Statsig`, or even custom DB flags) to enable features for specific communities. If you update the Groq prompt block, *all* communities immediately get the new behavior, whether it hallucinates or not.

### 10. No rollback plan 
**Status: Failed.**
*   Database migrations are not versioned (e.g., using Prisma, Drizzle, or Supabase Migrations). If we add a column, drop a column, and the code breaks, rolling back the codebase via git will cause a fatal collision with the new live database schema. Reverting user impact is thus entirely manual and extremely risky.
