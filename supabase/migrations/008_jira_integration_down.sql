-- Migration 008: Jira Integration
-- Down Script

DROP INDEX IF EXISTS idx_tickets_jira_issue_key;
ALTER TABLE tickets DROP COLUMN IF EXISTS jira_issue_url;
ALTER TABLE tickets DROP COLUMN IF EXISTS jira_issue_key;
