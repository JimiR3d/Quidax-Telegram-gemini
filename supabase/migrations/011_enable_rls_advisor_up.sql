-- Migration 011: enable RLS on tables flagged by the Supabase security advisor.
-- The backend uses the service role key exclusively (bypasses RLS), so no
-- policies are needed; this simply blocks anon-key access to these tables.
-- Applied to the live DB on 2026-06-12 with explicit confirmation.

alter table public.learned_keywords enable row level security;
alter table public.filtered_messages enable row level security;
