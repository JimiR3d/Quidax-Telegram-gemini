-- Migration 003: Suggested Reply column
-- Down Script

ALTER TABLE tickets DROP COLUMN IF EXISTS suggested_reply;
