-- 019_messages_reply_to_and_ticket_id_up.sql
--
-- Reply-to ground-truth attribution (2026-06-22).
--
-- Background: a live audit proved admin replies were landing on the wrong
-- ticket and one user issue was splitting into several tickets. The single
-- missing signal is Telegram's reply-to: `messages` never stored which message
-- a reply answered, and there was no durable message->ticket link, so the code
-- fell back to time/sender guessing. These two additive, nullable columns make
-- reply-to attribution possible:
--   - reply_to_msg_id : the telegram_message_id this message replied to (null
--                       when the message is not a quoted reply).
--   - ticket_id       : the ticket this message was attached to (root, admin
--                       reply, user reply, or grouped follow-up). Null when the
--                       message was dropped/unattached or predates this column.
--
-- Both are nullable and additive; no existing code reads them until the Phase 2
-- deploy, so applying this early is harmless.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_msg_id bigint;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS ticket_id uuid;

-- Index the durable link so "find the ticket a quoted message belongs to" is a
-- fast lookup on the live attach path.
CREATE INDEX IF NOT EXISTS idx_messages_ticket_id ON messages (ticket_id);
