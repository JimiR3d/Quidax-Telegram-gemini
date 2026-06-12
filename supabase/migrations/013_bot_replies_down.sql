-- Migration 013 down: remove the automated status update bot's audit table.
-- Indexes and the RLS setting drop with the table.

drop table if exists public.bot_replies;
