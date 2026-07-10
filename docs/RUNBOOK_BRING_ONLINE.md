# Runbook — Bring PulseDesk Back Online

Use this when the app has been **fully stopped** (e.g. the Railway trial expired, 2026-07-08)
and you want to redeploy it and recover any messages missed during the downtime.

Your **data is safe** the whole time it's down — it lives in Supabase, not on the host.
This runbook is about restarting the process and backfilling the ingestion gap.

---

## ⚠️ The one rule that can break everything

**Only ONE GramJS Telegram session may ever be connected at a time.** If two run at
once, Telegram returns `AUTH_KEY_DUPLICATED` and **permanently burns the session
string** (it has happened twice — each time needed a full regeneration on a new
account). So:

- Before the new host connects, make sure **no other copy is running** — the old
  Railway service must be truly stopped/deleted, and you must not have the local
  server running with a real `TELEGRAM_SESSION_STRING`.
- The `scripts/dev-no-telegram.mjs` launcher is safe (it blanks the session string).
- Keep `numReplicas = 1`. Never scale up.

---

## Step 0 — Unpause Supabase (only if it paused)

Supabase free-tier projects **auto-pause after ~7 days of inactivity**. If the app was
down that long, the DB may be paused. This is **not data loss** — data is retained.

1. Open the Supabase dashboard → project **`dovgochitqpuvmneqeqz`** (Quidax_Telegram).
2. If it shows "Paused", click **Restore / Resume** and wait for it to come back.
3. Confirm it's live (the Table Editor loads `tickets`).

---

## Step 1 — Pick a host and set the environment

Any host that runs a **long-running Node container** works (Railway-with-a-card is the
least effort since it's already configured; Fly.io or a small VPS also work). It must
**not** be serverless (Vercel/Lambda can't hold the Telegram socket).

Build & start (already in `railway.toml`; replicate on any host):

- **Build:** `npm run build`  → produces `dist/server.mjs` + the Vite dashboard in `dist/`
- **Start:** `node dist/server.mjs`  (never `npm start` — it has a Windows-only `chcp`)
- **Healthcheck path:** `/api/health`
- **Replicas:** exactly **1**

### Required environment variables

These must be set or the process exits at startup:

| Var | Value / notes |
|---|---|
| `GROQ_API_KEY` | classification LLM |
| `GEMINI_API_KEY` | suggested-reply LLM |
| `DASHBOARD_PASSWORD` | dashboard login **and** the `x-admin-key` for admin endpoints |
| `SUPABASE_URL` | `https://dovgochitqpuvmneqeqz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the `sb_secret_…` key (`railway_backend`). **Never** the anon key; never re-enable legacy JWT keys |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | Telegram app credentials |
| `TELEGRAM_SESSION_STRING` | **session #3** (personal account, group member). Do **not** regenerate unless burned |
| `TELEGRAM_GROUP_USERNAME` | `OfficialQuidaxCommunity` |
| `SUPPORT_GROUP_ID` | `OfficialQuidaxCommunity` |

> Copy these from the old Railway project's Variables tab if you still can, or from your
> local `.env`. Treat every value as a secret.

### Feature flags — set to the known-good production state

| Var | Set to | Why |
|---|---|---|
| `CHANNEL_DIFF_ENABLED` | `true` | live ingestion via getChannelDifference (15s) |
| `GAP_RECOVERY_ENABLED` | `true` | outage-gap recovery on startup (this run needs it) |
| `INGEST_RECONCILE_ENABLED` | `true` | orphan reconciliation sweep |
| `INGEST_RECONCILE_DRY_RUN` | `false` | sweep actually writes |
| `ASSUMED_RESOLVE_ENABLED` | `true` | 7-day auto-resolve sweep |
| `RESOLUTION_INFER_ENABLED` | `true` | D2 conversation-aware resolution |
| `RESOLUTION_INFER_DRY_RUN` | `false` | D2 actually writes |
| `ADMIN_SENDER_HASHES` | `7b08fcbe362a78e6` | long-tenured admin allowlist for reconcile |
| `TELEGRAM_CONNECT_DELAY_MS` | `0` on a **cold** first deploy (no old container); leave unset (60s default) once it's a normal running service | avoids a needless 60s wait when nothing else holds the session |
| `BOT_REPLIES_ENABLED` | `false` | outbound bot parked (group is broadcast-only) |
| `BOT_REPLIES_DRY_RUN` | `true` | fail-safe |
| `GROQ_MODEL` | leave unset | defaults to `openai/gpt-oss-20b` |

Optional/off unless you want them: `TELEGRAM_BOT_USER_IDS` / `TELEGRAM_BOT_USERNAMES`
(bot-sender denylist — dormant; arm only if you capture the price/welcome bot handles),
`ALERT_WEBHOOK_URL`, `HEARTBEAT_URL`, `JIRA_*`.

---

## Step 2 — Deploy

- **Railway (same project, re-billed):** add a payment method → it redeploys `main`
  automatically. Confirm the build ran `npm run build` and start is `node dist/server.mjs`.
- **New host:** point it at the GitHub repo `JimiR3d/Quidax-Telegram-gemini`, branch
  `main`, with the build/start commands above and all env vars from Step 1.

Wait ~2–3 minutes (the deploy includes the 60s connect delay unless you set it to 0).

---

## Step 3 — Verify it's healthy

Set `APP_URL` to your deployment's URL, then:

```bash
curl -s "$APP_URL/api/health" | python -m json.tool
```

Confirm:

- `commit` = the `main` HEAD you deployed
- `telegramReady: true` **and** `telegramConnected: true`  ← the session connected, no burn
- `circuits` — groq / gemini / supabase all `CLOSED`
- `lastGapRecovery` — populated with `reason:"startup"` (see Step 4)
- `ingestLag.medianMs` — a small number once messages start flowing (single-digit seconds)

If you see `telegramReady: false` for more than a few minutes, or an
`AUTH_KEY_DUPLICATED` error in the logs, **stop** — something else is holding the
session (or it was externally invalidated). Do not loop-redeploy. See "Session burned" below.

---

## Step 4 — Recover the downtime gap

**Automatic (already happened at startup if `GAP_RECOVERY_ENABLED=true`):** the server
reads the newest `telegram_message_id` it has stored and pages Telegram history back to
that checkpoint. `/api/health.lastGapRecovery` shows the result. Defaults cap it at
**500 messages / 24 hours** — enough for a short outage, **not** a week.

**For a longer outage (e.g. a week), do a one-time manual backfill.** This is safe now
because the new container is the only session running. Authenticate with the
`x-admin-key` header (= `DASHBOARD_PASSWORD`):

```bash
# fetch the most-recent messages, keep only those from the last N days
curl -s -X POST "$APP_URL/api/backfill" \
  -H "Content-Type: application/json" \
  -H "x-admin-key: $DASHBOARD_PASSWORD" \
  -d '{"limit": 500, "days": 8}'

# poll progress
curl -s "$APP_URL/api/backfill/progress" -H "x-admin-key: $DASHBOARD_PASSWORD"
```

Notes:
- `limit` is capped at **500** (the most recent 500 messages). For a very busy week that
  may not reach all the way back — run it, check the oldest recovered `message_timestamp`
  in the DB, and repeat isn't possible past 500 in one call (Telegram returns newest-first).
  If you truly need more than 500, raise `GAP_RECOVERY_MAX_MESSAGES` and redeploy so the
  startup gap-recovery pages further, or accept the 500 most-recent as sufficient.
- Everything is **idempotent** — the `telegram_message_id` dedup means re-running never
  duplicates. Safe to run more than once.
- Backfill/gap-recovery are **backfill**, not live delivery — they never stamp
  `lastMessageReceivedAt`, so they won't fool the liveness watchdog.

---

## Step 5 — Confirm end-to-end

1. Open `$APP_URL` in a browser, log in with `DASHBOARD_PASSWORD`, confirm the dashboard
   loads with the ticket history.
2. Post a test message in the group (or wait for a real one) and confirm a new ticket
   appears within ~15s (channel-diff) to ~3 min (AutoFetch fallback).
3. Re-check `/api/health.ingestLag` — median should settle to single-digit seconds.

Done. Update `PULSEDESK_HANDOFF.md` with the new host + the date it came back.

---

## If the session got burned (`AUTH_KEY_DUPLICATED`)

Only if a second session ran concurrently, or Telegram invalidated it externally:

1. Regenerate on the existing account (or a fresh one) — explicit decision only:
   `node -r dotenv/config scripts/generate-session.cjs`
2. Put the new value in `TELEGRAM_SESSION_STRING`, redeploy.
3. This is session **#4** — record it in the handoff and the CLAUDE.md session-rotation lesson.

## Quick reference

- **Health:** `GET $APP_URL/api/health` — the authoritative liveness check
- **DB project:** Supabase `dovgochitqpuvmneqeqz` (Quidax_Telegram)
- **Repo / branch:** `JimiR3d/Quidax-Telegram-gemini` @ `main`
- **Admin auth:** header `x-admin-key: $DASHBOARD_PASSWORD` (super_admin) on `/api/ingest`,
  `/api/backfill`, `/api/tickets/:id/status`, etc.
- **Cost floor:** ~$5/mo — there is no free always-on host for a persistent-socket app.
