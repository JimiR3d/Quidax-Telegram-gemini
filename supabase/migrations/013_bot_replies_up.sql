-- Migration 013: bot_replies table (Milestone 5 — automated status update bot)
-- Records every outbound (or would-be outbound) Telegram reply the bot makes
-- when an admin changes a ticket status in the dashboard.
--
-- Safety semantics:
--   * The partial UNIQUE index on (ticket_id, status) WHERE dry_run = false is
--     the concurrency-safe "never reply twice" guarantee: the server inserts a
--     claim row (result = 'pending') BEFORE talking to Telegram, so two racing
--     status changes can never both send. Failed sends keep their row and are
--     deliberately never auto-retried (v1 decision).
--   * dry_run = true rows are pure audit trail — many are allowed per ticket;
--     they never block a live send.
--   * sent_telegram_message_id is the bot reply's OWN Telegram message id; the
--     ingestion pipeline uses it to skip re-ingesting our own messages (which
--     would otherwise appear as admin replies and pollute first_admin_reply_at
--     and the Avg Response Time KPI).
--   * No CHECK on status: the server validates against VALID_STATUSES, and
--     historical rows must stay valid if the workflow grows new states.
--
-- Applied to the live DB on 2026-06-12 with explicit confirmation (approved
-- Milestone 5 plan).

create table public.bot_replies (
  id                             uuid primary key default gen_random_uuid(),
  ticket_id                      uuid not null references public.tickets(id) on delete cascade,
  status                         text not null,
  dry_run                        boolean not null,
  result                         text not null
    check (result in ('pending', 'sent', 'dry_run', 'failed')),
  message_text                   text not null,
  replied_to_telegram_message_id text,
  sent_telegram_message_id       bigint,
  group_id                       text not null,
  triggered_by                   text,
  error                          text,
  created_at                     timestamptz not null default now()
);

create unique index bot_replies_once_per_live_status
  on public.bot_replies (ticket_id, status) where dry_run = false;
create index bot_replies_sent_tg_id_idx  on public.bot_replies (sent_telegram_message_id);
create index bot_replies_created_at_idx  on public.bot_replies (created_at desc);

alter table public.bot_replies enable row level security;
