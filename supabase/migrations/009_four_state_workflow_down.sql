-- Rollback for 009_four_state_workflow_up.sql.
-- WARNING: fails if any ticket still holds status 'Escalated' or
-- 'Awaiting User' — re-map those to 'In Review' first, e.g.:
--   UPDATE tickets SET status = 'In Review'
--   WHERE status IN ('Escalated', 'Awaiting User');

ALTER TABLE tickets DROP COLUMN first_admin_reply_at;
ALTER TABLE tickets DROP CONSTRAINT tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status = ANY (ARRAY['Open'::text, 'In Review'::text, 'Resolved'::text, 'Dismissed'::text]));
