# PulseDesk — AI Support Triage for Quidax Telegram

PulseDesk is a production-deployed AI support-triage tool that reads every message in a busy Telegram community, picks out real support issues, classifies and prioritizes them, drafts suggested replies, and presents them on a dashboard — while keeping a human in control of every decision.

Built specifically for [Quidax](https://quidax.com), a Nigerian crypto exchange. Running live on the real community since mid-June 2026.

---

## What it does

- **Reads every group message** via a persistent Telegram connection (GramJS user-client, not a bot — bots can't see all messages)
- **Classifies real issues** using Groq/LLaMA: category (Withdrawal Issue, Deposit Issue, Account Access, etc.), urgency (Critical / High / Medium / Low), summary
- **Understands Nigerian Pidgin** — "money never enter" = deposit problem; "dem block my account" = access issue; built into the base prompt, not just examples
- **Drafts empathetic suggested replies** using Google Gemini, for agents to edit and send
- **Shows a live dashboard** with a ticket feed, filters, honest KPIs, and a volume chart
- **Learns from human corrections** — agents correct the AI on a training screen; corrections feed back into future classifications via few-shot injection
- **Self-heals** — a background reconciliation sweep finds messages that ended up without a ticket (due to a transient error) and replays them automatically

---

## Architecture

```
Telegram community  →  4 ingestion paths  →  processAndIngestMessage()
                           (channel-diff/15s,       ↓
                            AutoFetch/3min,     Dedup → Noise gate → PII redact
                            reconcile sweep,        ↓
                            manual backfill)   Groq classify → Gemini reply
                                                    ↓
                                             Supabase (PostgreSQL)
                                                    ↑
                                    React dashboard (polls every 10s)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full diagram and all design decisions.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + TypeScript (`server.ts`) |
| Frontend | React 19 + Vite + Tailwind CSS v4 |
| Database | Supabase (PostgreSQL) |
| Classification | Groq API (LLaMA 3.1 8B Instant) |
| Suggested replies | Google Gemini |
| Telegram | GramJS (MTProto user-client) |
| Hosting | Railway (container — persistent connection required) |

---

## Key design decisions

- **`getChannelDifference` for live ingestion:** The standard GramJS push listener silently never delivers supergroup messages (GramJS 2.26.x never syncs the channel `pts`). The system actively polls Telegram every 15 seconds instead. Diagnosed with on-server update-stream logging; verified in production at ~14s ingest lag.
- **Two AI providers matched to two jobs:** Groq (fast + cheap) for high-volume classification; Gemini (quality) for lower-volume reply drafting.
- **Exactly one running instance:** Two instances would open two Telegram connections with the same session and permanently burn it (`AUTH_KEY_DUPLICATED`). Enforced via `numReplicas = 1` + SIGTERM graceful-disconnect + 60s startup delay.
- **All authority on the backend:** Service role key only. Frontend never writes to the database directly and never holds a powerful key.
- **Pure modules for testable logic:** The 15 trickiest decisions are extracted into small, side-effect-free modules, each with its own test file. 332 tests total.

---

## KPIs

See [KPI_DEFINITIONS.md](KPI_DEFINITIONS.md) for the exact formula of every number on the dashboard.

**Resolution Rate** = (Resolved + Assumed Resolved) ÷ (those + Active), where:
- Active excludes noise categories (General Question / Praise / Spam/Irrelevant)
- Dismissed (spam/chatter) is excluded from both numerator and denominator
- Handed Off (admin redirected user to email / DMs) is excluded from both — the resolution happens off-platform and is unobservable

**Median Response Time** uses `percentile_cont(0.5)` — the mean was 8.4 hours due to one outlier; the median is 6.5 minutes.

---

## Running locally (no Telegram connection)

The `scripts/dev-no-telegram.mjs` launcher blanks `TELEGRAM_SESSION_STRING` and sets `PORT=3100`, so you can test the full pipeline (including Groq and Gemini) without risking the production Telegram session.

```bash
# Install dependencies
npm install

# Create .env with credentials (see Environment Variables below)

# Start local server (port 3100, no Telegram)
node scripts/dev-no-telegram.mjs
```

The frontend is served from `dist/` if a build exists. For UI changes, rebuild first: `npm run build`.

---

## Environment variables

```
SUPABASE_URL              Supabase project URL
SUPABASE_SERVICE_ROLE_KEY Service role key (sb_secret_... format)
GROQ_API_KEY              Groq API key
GEMINI_API_KEY            Google Gemini API key
TELEGRAM_API_ID           From my.telegram.org
TELEGRAM_API_HASH         From my.telegram.org
TELEGRAM_SESSION_STRING   Generated by scripts/generate-session.cjs
TELEGRAM_GROUP_USERNAME   Target group (e.g. OfficialQuidaxCommunity)
VITE_DASHBOARD_PASSWORD   Dashboard access password
CHANNEL_DIFF_ENABLED      true  (set on Railway; enables the 15s poll)
ASSUMED_RESOLVE_ENABLED   true  (enables 7-day quiet auto-resolution)
RESOLUTION_INFER_ENABLED  true  (enables conversation-aware inference)
TELEGRAM_CONNECT_DELAY_MS 60000 (Railway rolling-deploy overlap protection)
```

Never use the anon key. Never set `numReplicas > 1`.

---

## Deployment (Railway)

The project is configured for Railway via `railway.toml`. It runs `node dist/server.mjs`.

Do not use `npm start` on Railway — it has a Windows-only `chcp` command that breaks on Linux containers.

---

## Tests

```bash
npm test
```

332 tests across 21 files. All pure modules (no live Telegram, no database) — safe to run while production is live.

---

## Documentation

- [KPI_DEFINITIONS.md](KPI_DEFINITIONS.md) — every dashboard number explained with its exact formula
- [ARCHITECTURE.md](ARCHITECTURE.md) — full architecture diagram and design decisions
- [DEMO_SCRIPT.md](DEMO_SCRIPT.md) — 3-minute demo video script and outreach plan
- [INTERVIEW_PREP.md](INTERVIEW_PREP.md) — pitch narrative and STAR stories
- [PULSEDESK_HANDOFF.md](PULSEDESK_HANDOFF.md) — engineering handoff document (full history)
- [KNOWN_ISSUES.md](KNOWN_ISSUES.md) — honest log of every known limitation
- [docs/guide/](docs/guide/) — complete study guide (architecture through interview prep)
- [PULSEDESK_MASTER_GUIDE.md](PULSEDESK_MASTER_GUIDE.md) — assembled single-file version of the guide

---

## What is NOT live (and why)

**Outbound bot replies** — fully built behind a kill switch (`BOT_REPLIES_ENABLED=false`), verified in dry-run, but blocked because OfficialQuidaxCommunity is broadcast-only. The account cannot post. This is a group-permission limitation, not a code problem. One environment variable change away from live, pending Quidax granting posting rights.

---

Built by [Jimi Aboderin](mailto:folajinmi13@gmail.com) · github.com/JimiR3d
