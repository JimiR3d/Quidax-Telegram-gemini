-- Migration 007: Telegram Deep Links
-- Down Script

DROP INDEX IF EXISTS idx_tickets_telegram_message_id;
ALTER TABLE tickets DROP COLUMN IF EXISTS telegram_deep_link;
ALTER TABLE tickets DROP COLUMN IF EXISTS telegram_message_id;
