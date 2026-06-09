-- Migration 006: Vocabulary Learning System
-- Up Script

-- 1. learned_keywords: stores keywords extracted from resolved/replied tickets
CREATE TABLE IF NOT EXISTS learned_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT UNIQUE NOT NULL,
    frequency INTEGER NOT NULL DEFAULT 1,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learned_keywords_active_freq ON learned_keywords (active, frequency DESC);

-- 2. filtered_messages: audit trail of messages rejected by the pre-filter
CREATE TABLE IF NOT EXISTS filtered_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_message_id TEXT,
    group_id TEXT,
    raw_text TEXT,
    reason TEXT NOT NULL DEFAULT 'pre_filter',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filtered_messages_created ON filtered_messages (created_at DESC);
