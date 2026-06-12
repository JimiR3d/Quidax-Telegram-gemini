-- Migration 010: corrections table (Milestone 3 — human feedback loop)
-- Stores every human correction (or confirmation) of an AI classification.
-- A row with original_category = correct_category means a human reviewed the
-- ticket and confirmed the AI was right; tickets with no row are "unreviewed".
-- message_text is a snapshot of the original user message taken at correction
-- time, because tickets.raw_text accumulates [ADMIN_REPLY]/[USER_REPLY] blocks
-- that would pollute keyword-similarity matching for few-shot examples.
-- No CHECK on the category columns: the server validates against
-- VALID_CATEGORIES, and historical rows must stay valid when the taxonomy
-- expands later.
-- Applied to the live DB on 2026-06-12 with explicit confirmation.

create table public.corrections (
  id                uuid primary key default gen_random_uuid(),
  ticket_id         uuid not null references public.tickets(id) on delete cascade,
  message_text      text not null,
  original_category text not null,
  correct_category  text not null,
  corrected_by      text not null,
  correction_source text not null
    check (correction_source in ('human_ui', 'admin_reply')),
  created_at        timestamptz not null default now()
);

create index corrections_created_at_idx on public.corrections (created_at desc);
create index corrections_ticket_id_idx  on public.corrections (ticket_id);

alter table public.corrections enable row level security;
