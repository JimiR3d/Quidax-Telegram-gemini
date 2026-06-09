-- Migration 008: Jira Integration
-- Up Script

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS jira_issue_key TEXT;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS jira_issue_url TEXT;

CREATE INDEX IF NOT EXISTS idx_tickets_jira_issue_key ON tickets (jira_issue_key)
    WHERE jira_issue_key IS NOT NULL;
