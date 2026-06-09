-- Migration 005: Edit/Delete support + Dedup + Indexes
-- Down Script

DROP INDEX IF EXISTS messages_telegram_message_id_unique;
DROP INDEX IF EXISTS idx_tickets_created_at;
DROP INDEX IF EXISTS idx_tickets_urgency;
DROP INDEX IF EXISTS idx_tickets_status;
DROP INDEX IF EXISTS idx_tickets_group_id;
DROP INDEX IF EXISTS idx_tickets_category;
DROP INDEX IF EXISTS idx_messages_group_id;
ALTER TABLE messages DROP COLUMN IF EXISTS edited_at;
