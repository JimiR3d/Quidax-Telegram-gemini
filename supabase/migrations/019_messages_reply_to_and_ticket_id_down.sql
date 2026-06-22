-- 019_messages_reply_to_and_ticket_id_down.sql
-- Reverses 019_messages_reply_to_and_ticket_id_up.sql.
DROP INDEX IF EXISTS idx_messages_ticket_id;
ALTER TABLE messages DROP COLUMN IF EXISTS ticket_id;
ALTER TABLE messages DROP COLUMN IF EXISTS reply_to_msg_id;
