-- 018_messages_deleted_at_down.sql
-- Reverses 018_messages_deleted_at_up.sql.
ALTER TABLE messages DROP COLUMN IF EXISTS deleted_at;
