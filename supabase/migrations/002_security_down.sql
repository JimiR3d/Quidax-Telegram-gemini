-- Migration 002: Security, RBAC and Audit Logging
-- Down Script (Rollback)

DROP POLICY IF EXISTS ticket_tenant_isolation ON tickets;
DROP POLICY IF EXISTS message_tenant_isolation ON messages;

ALTER TABLE tickets DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS users CASCADE;
