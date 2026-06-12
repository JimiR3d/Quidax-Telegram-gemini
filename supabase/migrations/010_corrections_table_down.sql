-- Rollback for migration 010: drops the corrections table and its indexes.
drop table if exists public.corrections;
