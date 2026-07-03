# PulseDesk — Architecture Overview

This document explains how PulseDesk is structured and how data moves through it. It is the right thing to read before touching the codebase, and the right thing to show a technical reviewer.

---

## The three-layer model

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM COMMUNITY                        │
│            (OfficialQuidaxCommunity, MTProto)                │
└────────────────────────┬────────────────────────────────────┘
                         │ messages (live)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND  (server.ts on Railway)              │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │               4 INGESTION PATHS                      │    │
│  │                                                      │    │
│  │  1. getChannelDifference  (15s poll, primary)        │    │
│  │     Seeds channel pts via GetFullChannel → polls     │    │
│  │     GetChannelDifference every 15s → feeds           │    │
│  │     new_messages into processAndIngestMessage        │    │
│  │     ~14s typical lag; re-seeds on reconnect          │    │
│  │                                                      │    │
│  │  2. AutoFetch              (3-min sweep, safety net) │    │
│  │     getMessages() 2h lookback, 20-message limit,    │    │
│  │     batched pre-dedup (autofetch-dedup.ts)           │    │
│  │     ~37–174s typical lag                             │    │
│  │                                                      │    │
│  │  3. ReconcileOrphans       (hourly background sweep) │    │
│  │     Finds messages rows with no ticket, replays      │    │
│  │     through processAndIngestMessage                  │    │
│  │     Self-heals mid-build crashes                     │    │
│  │                                                      │    │
│  │  4. Manual backfill        (POST /api/backfill)      │    │
│  │     Admin-triggered; same processing function        │    │
│  │                                                      │    │
│  │  All 4 paths → one shared processAndIngestMessage()  │    │
│  └──────────────────┬──────────────────────────────────┘    │
│                     │                                        │
│  ┌──────────────────▼──────────────────────────────────┐    │
│  │           processAndIngestMessage()                  │    │
│  │                                                      │    │
│  │  1. telegram_message_id dedup (FIRST, always)        │    │
│  │  2. isAdminMessage check → drop unattached admin     │    │
│  │  3. shouldProcessMessage / isBanterNoise gates       │    │
│  │  4. Reply-to ground-truth attachment:                │    │
│  │     • quoted reply → load parent's ticket_id →      │    │
│  │       selectReplyToTarget() → attach if valid        │    │
│  │     • unquoted admin → 30-min window heuristic       │    │
│  │     • user reply → grouping (fast/extended/none)     │    │
│  │  5. PII redaction (sanitizeForPrompt + redactPII)    │    │
│  │  6. Groq classification (async, guarded write)       │    │
│  │  7. Gemini suggested reply                           │    │
│  │  8. messages row insert + linkMessageToTicket        │    │
│  │  9. tickets row insert / update                      │    │
│  └──────────────────┬──────────────────────────────────┘    │
│                     │                                        │
│  ┌──────────────────▼──────────────────────────────────┐    │
│  │              BACKGROUND SWEEPS                       │    │
│  │                                                      │    │
│  │  assumeResolveQuietTickets   (hourly +3min)          │    │
│  │    7-day quiet + admin-engaged → Assumed Resolved    │    │
│  │                                                      │    │
│  │  inferResolvedFromConversation  (hourly +4min)       │    │
│  │    24h quiet + Groq "was this resolved?" → AR        │    │
│  │                                                      │    │
│  │  repairMissingSuggestedReplies  (15-min)             │    │
│  │    Fills null suggested_reply on active tickets      │    │
│  │    (uses Gemini, respects quota cooldown)            │    │
│  │                                                      │    │
│  │  reconcileOrphanMessages   (hourly +5min)            │    │
│  │    Finds orphaned messages rows, replays them        │    │
│  └──────────────────┬──────────────────────────────────┘    │
│                     │                                        │
│  ┌──────────────────▼──────────────────────────────────┐    │
│  │             REST API  (/api/*)                       │    │
│  │                                                      │    │
│  │  GET  /api/tickets        ticket feed + stats RPC    │    │
│  │  POST /api/tickets/:id/status  status change         │    │
│  │  POST /api/train/correct  human correction           │    │
│  │  POST /api/ingest         manual message inject      │    │
│  │  GET  /api/eval           benchmark accuracy         │    │
│  │  POST /api/verify         training-loop accuracy     │    │
│  │  GET  /api/health         system status              │    │
│  └──────────────────┬──────────────────────────────────┘    │
└─────────────────────┼────────────────────────────────────────┘
                      │ Supabase service-role key (server only)
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 SUPABASE (PostgreSQL)                         │
│                                                              │
│  tickets          — one row per support issue                │
│  messages         — one row per Telegram message             │
│                     (reply_to_msg_id, ticket_id stored)      │
│  corrections      — human + admin-reply training data        │
│  bot_replies      — outbound message dedup log               │
│  (tickets_stats PostgreSQL function — KPI aggregation)       │
└──────────────────────────────────────────────────────────────┘
                      ▲
                      │ GET /api/tickets (polls every 10s)
┌─────────────────────────────────────────────────────────────┐
│             FRONTEND  (React + Vite + Tailwind)              │
│                   served from dist/ by server.ts             │
│                                                              │
│  Ticket feed · KPI cards · Filters · /train · Benchmark      │
└──────────────────────────────────────────────────────────────┘
```

---

## Key architectural decisions

### Why GramJS (user-client) instead of the Telegram Bot API

A bot can only see messages it is @-mentioned in, or messages in groups it was explicitly added to with the right permissions. A user-client (MTProto) sees every message in a group as a regular member would. Quidax's community has thousands of messages daily; the bot API would miss almost all of them.

The cost: a persistent TCP connection is required. Railway (containerized, always-on) is the only viable hosting option — serverless platforms like Vercel would kill the connection between requests.

### Why `getChannelDifference` as the primary ingestion path (not live push)

GramJS 2.26.x never tracks a channel's `pts` counter. Telegram withholds `UpdateNewChannelMessage` for a supergroup unless the client demonstrates it is in sync. The library has no `getChannelDifference` implementation. Symptom: the `NewMessage` handler receives 0 supergroup messages; only DMs and other-chat updates arrive.

The fix: actively track `pts` (seed from `GetFullChannel.fullChat.pts`, advance on every `ChannelDifference` response), poll `GetChannelDifference` every 15 seconds, feed `newMessages` into the shared `processAndIngestMessage`. Verified in production: 14-second ingest lag. The `NewMessage` handler stays in the code but is effectively a no-op for this group.

### Why two separate AI providers

**Groq** (`GROQ_MODEL`, currently `openai/gpt-oss-20b`; migrated from `llama-3.1-8b-instant` in July 2026 ahead of its free-tier retirement) for classification: high throughput, very low latency, free tier handles the message volume. Classification must run on every message.

**Google Gemini** for suggested replies: higher-quality natural language generation for empathetic, contextual customer replies. Runs once per ticket, not per message.

Using one expensive model for everything is slow and costly. Using one cheap model for everything gives weak replies. Tool matched to task.

### Why exactly one running instance (`numReplicas = 1`)

GramJS sessions are single-tenancy. Two running instances each open an MTProto connection with the same session string → Telegram returns `406: AUTH_KEY_DUPLICATED` and permanently invalidates the session. Recovery requires generating a new session string with a phone number login. This has happened twice during development.

Prevention: `numReplicas = 1` in `railway.toml`, a SIGTERM graceful-disconnect handler (old container disconnects before new one connects), and a 60-second startup delay on connect.

### Why the dedup check is the very first thing in `processAndIngestMessage`

The `messages` row is written inside the function. All four ingestion paths overlap in time. The `telegram_message_id` unique check at the top ensures that even if all four paths see the same message simultaneously, only one wins and the rest stop immediately — before any AI is called or any ticket is written. This is the primary idempotency guarantee; everything else is belt-and-suspenders.

### Why KPI aggregation lives in the database (`tickets_stats` function)

An earlier version fetched all rows into Node.js and counted them. It silently stopped working at 5,000 rows. Moving the aggregation to a PostgreSQL function (migration 012, replaced by 016/017/020) means the counts are always accurate at any ticket volume, and the Lagos-timezone day bucketing is computed by the database, not by a server whose clock is UTC.

### Why the frontend polls instead of using WebSockets

A 10-second poll is stateless, trivial to reason about, and robust against dropped connections. The internal dashboard has no latency requirement that makes 10-second polling unacceptable. WebSockets would add connection-state management for a marginal improvement nobody would notice. Simplicity chosen deliberately.

---

## Ticket status machine

Eight statuses. Four count as ACTIVE (the resolution-rate denominator), two count as resolved (the numerator), and two are excluded from the rate entirely — because counting them anywhere would be dishonest.

| Status | Meaning | Rate role |
|--------|---------|-----------|
| `Open` | Real issue, no admin engagement yet. A fresh **Critical** lands here with an `[ESCALATED]` prefix in the summary (never as "In Review", which would falsely imply an admin replied) | denominator |
| `In Review` | An admin has engaged, or a user replied to a parked/closed ticket | denominator |
| `Escalated` | Human-flagged for priority handling. **No automatic path ever writes this status or moves a ticket out of it** | denominator |
| `Awaiting User` | Human-parked, waiting on the user | denominator |
| `Resolved` | Closed with evidence: a human, an admin's definitive answer, or the user's own "thanks, it worked" | numerator |
| `Assumed Resolved` | Auto-closed by the quiet-time or thread-reading sweeps; auditable as its own status, reopens on any user reply | numerator |
| `Handed off` | The admin redirected the user off-platform (email/DM) — the outcome is invisible to the listener, so the ticket neither claims a resolution nor drags the denominator | excluded |
| `Dismissed` | Noise: banter, spam, price commands, scams. Never deleted, always reversible in /train, and watched by the Dismissed Audit surface | excluded |

(The denominator additionally excludes the noise *categories* — General Question, Praise, Spam/Irrelevant, Community Chat — whatever their status.)

```
  new user message ──┬── noise ──────────────────────────────► Dismissed
                     └── real issue ──► Open ── admin reply ──► In Review
                                          │                        │
        user: "thanks, it worked" ────────┼────────────────────────┼──► Resolved
        admin gives a definitive answer ──┼────────────────────────┘        ▲
                                          │                                 │
        7 days quiet, or the AI reads ────┴──► Assumed Resolved ── user ────┤
        the thread as settled (sweeps)              │             replies   │
                                                    ▼                       │
        admin redirects to email/DM ──► Handed off ─┴── user replies ──► In Review

        Escalated / Awaiting User: entered ONLY from the dashboard, by a human.
```

### Every transition, with its trigger and guard

| From | To | Trigger | Guard |
|------|----|---------|-------|
| *(new)* | `Open` | Real user message (all four ingestion paths share `processAndIngestMessage`) | Dedup on `telegram_message_id` runs first |
| *(new)* | `Dismissed` | Pre-filter banter (price commands, news pastes) or a noise category from the classifier | The `messages` row is always persisted; reversible in /train |
| *(new)* | *(no ticket)* | An admin message that attaches to no ticket is dropped by design | `disposeUnattachedMessage` |
| `Open` | `In Review` | Admin reply attaches | Never touches Escalated / Awaiting User / Resolved |
| `Open` / `In Review` | `Resolved` | Admin gives a definitive answer (AI verdict, strict `resolved === true`) | Conditional `.in(AUTO_RESOLVABLE_STATUSES)` update; stamps `resolved_at` |
| `Open` / `In Review` | `Handed off` | Admin redirects off-platform (`handoff-detect.ts`, email + DM patterns) | Checked *before* auto-resolve; `resolved_at` NOT stamped |
| `Open` / `In Review` / `Awaiting User` | `Assumed Resolved` | Hourly sweeps: 7-day quiet (`assumed-resolved.ts`) or AI thread-reading (`conversation-resolution.ts`), admin-engaged tickets only | **Never Escalated**; conditional update; stamps `resolved_at`; never posts to Telegram |
| `Awaiting User` / `Assumed Resolved` / `Handed off` | `In Review` | New user reply | Clears `resolved_at` |
| any active | `Resolved` | User confirms ("thanks", "it worked", "resolved") | Stamps `resolved_at` |
| `Open` / `In Review` / `Awaiting User` / `Assumed Resolved` | `Dismissed` | User deletes their root message (edit/delete ride the channel-difference drain) | Soft-delete: `messages.deleted_at`; guarded, never clobbers Escalated/Resolved |
| any | any | Human, via the dashboard status dropdown (`POST /api/tickets/:id/status`) | The only trigger for the outbound bot rails (which ship kill-switched) |
| `Dismissed` | `Open` | Human clicks Reopen in the Dismissed Audit modal | — |

Every automatic status write is a **guarded conditional update** (`.in("status", […])` in the same statement), so a concurrent human change is never clobbered — the async classifier, both auto-resolve sweeps, the delete handler, and the admin-reply resolver all share this defense. `resolved_at` is the source of truth for closure; every reopen path clears it.

---

## Pure modules (the testable core)

The trickiest logic is extracted into small modules with no side effects, so it can be tested without a live Telegram connection or database:

| Module | What it decides |
|--------|----------------|
| `channel-difference.ts` | Classifies GetChannelDifference response shapes; normalizes raw TL messages |
| `conversation-grouping.ts` | Fast/extended/none band for folding follow-up messages |
| `topic-shift.ts` | Groq-based "same issue or new ticket?" in the extended band |
| `admin-reply-attach.ts` | Which ticket should an unquoted admin reply attach to? |
| `admin-reply-resolution.ts` | Should this admin reply auto-resolve or hand-off the ticket? |
| `handoff-detect.ts` | Is this reply redirecting the user off-platform? |
| `assumed-resolved.ts` | Is this ticket eligible for the 7-day quiet auto-resolution? |
| `conversation-resolution.ts` | Did the conversation thread indicate resolution? |
| `autofetch-dedup.ts` | Pre-dedup before expensive per-message operations |
| `reply-target.ts` | Ground-truth ticket attachment from reply-to metadata |
| `noise-prefilter.ts` | Fast rule-based noise gate (price commands, news pastes) |
| `dismissed-audit.ts` | Which Dismissed tickets carry actionable signals and deserve a human look? |
| `listener-health.ts` | Is this message in the target group? Should the watchdog reconnect? |
| `classification-policy.ts` | Async classifier concurrency and fallback behavior |
| `admin-message-policy.ts` | Should an unattached admin message become a ticket? |
| `telegram-guards.ts` | Sender extraction, admin detection, update classification |

Each has its own `tests/*.test.ts` file. Total: 397 tests across 26 files.

---

## Data persistence model

```
tickets
  id, telegram_message_id (TEXT), sender_hash, raw_text,
  category, urgency, summary, suggested_reply,
  status, created_at, resolved_at, last_message_at,
  first_admin_reply_at, is_admin_message, group_id

messages
  id, telegram_message_id (BIGINT), sender_hash, sender_username,
  raw_text, is_admin_message, message_timestamp, ingested_at,
  reply_to_msg_id, ticket_id, deleted_at

corrections
  ticket_id, message_text, original_category, correct_category,
  correction_source ('human_ui' | 'admin_reply' | 'human_skip' | 'human_urgency'),
  original_urgency, correct_urgency,   -- nullable; NULL = urgency not reviewed (migration 021)
  corrected_by, created_at

bot_replies
  ticket_id, status, dry_run, result, telegram_message_id, created_at
  UNIQUE (ticket_id, status) WHERE dry_run = false
```

Key invariants:
- `messages.telegram_message_id` is the dedup key (BIGINT, unique constraint)
- `tickets.telegram_message_id` is TEXT (schema mismatch from early development; PostgREST handles the cast)
- `tickets.updated_at` is NOT auto-maintained — code sets it on every write
- `tickets.last_message_at` is the authoritative "last activity" signal; `messages` has no `ticket_id` FK so joins cannot be used for this
- `resolved_at` is the source of truth for when a ticket was closed; `Handed off` tickets have `resolved_at = NULL` by design
