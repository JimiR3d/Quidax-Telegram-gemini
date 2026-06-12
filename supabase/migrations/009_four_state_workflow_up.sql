-- Milestone 2: 4-state resolution workflow + Avg Response Time data.
-- Applied to the live DB on 2026-06-12 via the Supabase MCP
-- (migration name: four_state_workflow_and_first_admin_reply).
--
-- Adds 'Escalated' and 'Awaiting User' to the allowed ticket statuses, and a
-- first_admin_reply_at column used to compute the Avg Response Time KPI.
-- first_admin_reply_at stays NULL for all legacy tickets (same precedent as
-- resolved_at — no fabricated timestamps).

ALTER TABLE tickets DROP CONSTRAINT tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY['Open'::text, 'In Review'::text, 'Escalated'::text, 'Awaiting User'::text, 'Resolved'::text, 'Dismissed'::text]));
ALTER TABLE tickets ADD COLUMN first_admin_reply_at timestamptz NULL;
