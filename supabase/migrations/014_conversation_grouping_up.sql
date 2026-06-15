-- Migration 014: conversation grouping — rolling last_message_at window
-- Folds a user's consecutive un-quoted messages (and user↔admin back-and-forth)
-- within a rolling time window (GROUPING_WINDOW_MS, default 5 min) into ONE
-- ticket/thread, so the classifier and the /train reviewer see the whole issue
-- instead of isolated fragments (KNOWN_ISSUES §8/§9; user's #1 ask 2026-06-15).
--
--   * last_message_at is the rolling window anchor. Nullable on purpose: a
--     ticket that never sets it simply never groups (fail-safe). The server
--     stamps it on every attach/insert site (new-ticket insert, grouping
--     attach, both admin-reply paths, the user quoted-reply path, and user
--     auto-resolve).
--   * Existing rows are backfilled to COALESCE(updated_at, created_at); a legacy
--     row with neither stays NULL and therefore never groups.
--   * idx_tickets_grouping matches the grouping query's access pattern —
--     equality on (group_id, sender_hash) then range+order on last_message_at —
--     restricted to non-admin tickets, the only ones that ever group.
--
-- NOTE: this is the 14th migration; "013" was already taken by bot_replies
-- (Milestone 5). Applied to the live DB on 2026-06-15 with explicit
-- confirmation; Supabase tracks it under the name `conversation_grouping`.

alter table public.tickets add column if not exists last_message_at timestamptz;

update public.tickets
set last_message_at = coalesce(updated_at, created_at)
where last_message_at is null;

create index if not exists idx_tickets_grouping
  on public.tickets (group_id, sender_hash, last_message_at)
  where is_admin_message = false;
