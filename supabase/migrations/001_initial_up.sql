-- Migration 001: Initial Schema
-- Up Script (reconstructed from 001_initial_down.sql)

CREATE TABLE IF NOT EXISTS communities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_group_id TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_message_id TEXT,
    group_id TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    edited_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    group_id TEXT NOT NULL,
    summary TEXT,
    category TEXT,
    urgency TEXT CHECK (urgency IN ('Critical', 'High', 'Medium', 'Low')),
    product_area TEXT,
    sentiment TEXT,
    is_complaint BOOLEAN DEFAULT FALSE,
    suggested_action TEXT,
    status TEXT DEFAULT 'Open' CHECK (status IN ('Open', 'In Review', 'Resolved', 'Dismissed', 'Classifying')),
    raw_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed the default community
INSERT INTO communities (telegram_group_id, display_name)
VALUES ('OfficialQuidaxCommunity', 'Quidax Official Community')
ON CONFLICT (telegram_group_id) DO NOTHING;
