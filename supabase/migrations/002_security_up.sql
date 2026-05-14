-- Migration 002: Security, RBAC and Audit Logging
-- Up Script

-- 1. Create RBAC Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'support_agent', 'viewer')),
    tenant_id TEXT, -- e.g., the Telegram group ID they are scoped to
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Audit Logs Table for Compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id TEXT NOT NULL, -- Could be user UUID or 'system'
    action TEXT NOT NULL,
    target_resource TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    ip_address TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Row Level Security for Tenant Isolation and Compliance
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- A ticket is visible to super_admins or users whose tenant_id matches the ticket's group_id
CREATE POLICY ticket_tenant_isolation ON tickets
    FOR ALL
    USING (
        auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin') 
        OR 
        group_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    );

-- Similar policy for messages
CREATE POLICY message_tenant_isolation ON messages
    FOR ALL
    USING (
        auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin') 
        OR 
        group_id IN (SELECT tenant_id FROM users WHERE id = auth.uid())
    );
