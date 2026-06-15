-- Migration 014 down: remove the conversation-grouping rolling-window column
-- and its index. (Backfilled last_message_at values are lost on down.)

drop index if exists idx_tickets_grouping;
alter table public.tickets drop column if exists last_message_at;
