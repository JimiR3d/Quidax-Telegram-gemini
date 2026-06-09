-- Migration 007: Telegram Deep Links
-- Up Script

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS telegram_message_id TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS telegram_deep_link  TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_telegram_message_id ON tickets (telegram_message_id);
