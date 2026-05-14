-- Migration 001: Initial Schema
-- Down Script (Rollback Plan)

DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS communities CASCADE;
DROP TABLE IF EXISTS users CASCADE;
