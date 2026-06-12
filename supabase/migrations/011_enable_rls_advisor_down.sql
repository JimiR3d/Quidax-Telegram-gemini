-- Rollback for migration 011: disables RLS again (returns to the advisor-flagged state).
alter table public.learned_keywords disable row level security;
alter table public.filtered_messages disable row level security;
