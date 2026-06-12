---
paths:
  - "server.ts"
  - "src/**"
---

# PulseDesk Production Rules (distilled from world-class-app-final.md audit, 2026-06-11)

Most of these are ALREADY IMPLEMENTED in server.ts / src/App.tsx. Treat them as
regression guards: never remove or weaken them while editing nearby code.

## LLM pipeline (server.ts)

- Pre-flight duplicate check (`telegram_message_id`) runs BEFORE any DB write or
  LLM call. Three ingestion paths share `processAndIngestMessage`; the dedup
  check must stay at the very top. Never re-classify an already-processed message.
- User text goes in `role: user`, never concatenated into the system prompt.
  System prompt contains the exact JSON schema with exact enum values.
- `temperature: 0` for all classification calls.
- Every LLM output passes: strip code fences → JSON.parse → normalize common
  field-name variants (`priority`→`urgency`, `type`→`category`) → Zod parse.
  On 3 failures return the safe fallback object with `classification_failed: true`
  — never crash, never silently default a *successfully parsed* wrong value.
- `redactPII(sanitizeForPrompt(text))` is applied before every third-party LLM
  call (covers cards, NIN/BVN, phones, emails, API keys, crypto keys). Any new
  LLM call site must use the same wrapper.
- Batch LLM work is sequential with a delay (~2.1s for Groq free tier), never
  `Promise.all`. New batch features inherit this.
- Noise gating: Spam / Irrelevant / Praise / low-urgency messages must not
  create dashboard tickets. Pre-LLM rule filter first (free), LLM second.
- If classification fails, still create the ticket (flagged degraded) — the
  user's message is never lost because an LLM was down.
- Every external call (Groq, Gemini, Telegram, Supabase REST) has a timeout
  (`AbortSignal.timeout(...)`). Retry only 429/5xx with backoff + jitter; never
  retry other 4xx.

## Telegram ingestion (server.ts)

- GramJS needs a persistent process. Never propose serverless (Vercel/Lambda)
  for this app; it deploys to Railway as a long-running container.
- The connection can die silently (no exception, no log). The AutoFetch sweeper
  (15 min, 2-hour lookback) is the safety net — every mutation it triggers must
  be idempotent. Keep `/health` meaningful (DB + Telegram connection state).
- Admin replies append to the existing open ticket (`ticket_replies`), they
  never create a new ticket. Re-processing the same Telegram message must not
  duplicate replies (recent bug, fixed — don't regress).
- Known gap (intentional, not yet built): edited/deleted Telegram messages are
  not handled. If asked to add this: update content + flag `is_edited` +
  re-classify on edit; soft-delete + Dismiss on delete. Requires schema change
  → needs explicit confirmation first.

## API surface (server.ts)

- Status updates validate against the exact enum: Open | In Review | Resolved |
  Dismissed (Zod `z.enum`). Same for category/urgency fields. Never accept
  free-text into a constrained column.
- Never spread `req.body` into a DB write — allowlist fields with a Zod schema.
- Mutable `/api/` responses keep `Cache-Control: no-store` (ghost-ticket bug
  otherwise: status snaps back on the next poll). Keep helmet, the 1MB JSON
  body limit, and restricted CORS in place.
- Required env vars are checked at startup and the process exits loudly if one
  is missing. NEVER write `process.env.X || 'fallback'` for a secret — a
  fallback is a hardcoded backdoor.
- Every env var referenced in `.env.example` must actually be enforced in code
  (e.g. an API-key middleware that exists but is never `app.use`d protects
  nothing). No fake/simulated features: every UI action must reach a real
  backend effect or the UI element gets removed.
- Generic error message to the client, full details (incl. stack) to logs only.
  Never log tokens, keys, or raw PII.

## Frontend (src/App.tsx)

- Dashboard data refresh is polling-based. Any `setState` from a poll must
  diff first (compare or `JSON.stringify` guard) so identical data doesn't
  re-render the whole tree every tick.
- Keep `useMemo` for filtered/derived ticket lists and `useCallback` for
  handlers passed to children; if a list can exceed ~100 rows, virtualize.
- Keep ErrorBoundary wrappers around each major section — one section crashing
  must not white-screen the app.
- Any fetch helper must check the Content-Type is JSON before `.json()` — a
  502 HTML page must surface as a readable error, not `Unexpected token '<'`.
- No secret ever enters the client bundle: nothing sensitive in `VITE_`
  variables or a `vite.config.ts` `define` block (both are inlined into the
  shipped JS as plaintext). LLM/Supabase service calls go through the backend.
  After build changes, it's cheap to grep `dist/` for `gsk_|eyJ|sk-|AIza`.

## Database (Supabase)

- Money/never-FLOAT, TIMESTAMPTZ/UTC, UNIQUE on natural keys
  (`telegram_message_id`) with `ON CONFLICT DO NOTHING` — the DB constraint is
  the last line of dedup defense, the pre-flight check is the first.
- `tickets.updated_at` has no trigger — set it explicitly on every update.
  `resolved_at` is the source of truth for closure; reopening clears it.
- Migration files do NOT match the live schema — verify columns against the
  live DB before writing queries against "documented" columns.
