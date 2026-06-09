-- Migration 005: Edit/Delete support + Dedup constraint + Performance Indexes
-- Up Script

-- 1. Add edited_at column to messages (if not present)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;

-- 2. UNIQUE constraint on telegram_message_id to prevent duplicate ingestion
--    Use a partial index so NULLs are not constrained.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'messages_telegram_message_id_unique'
    ) THEN
        CREATE UNIQUE INDEX messages_telegram_message_id_unique
            ON messages (telegram_message_id)
            WHERE telegram_message_id IS NOT NULL;
    END IF;
END $$;

-- 3. Performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_tickets_created_at  ON tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_urgency     ON tickets (urgency);
CREATE INDEX IF NOT EXISTS idx_tickets_status      ON tickets (status);
CREATE INDEX IF NOT EXISTS idx_tickets_group_id    ON tickets (group_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category    ON tickets (category);
CREATE INDEX IF NOT EXISTS idx_messages_group_id   ON messages (group_id);
