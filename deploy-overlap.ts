// deploy-overlap.ts
//
// Pure helper for the ROLLING-DEPLOY SESSION-OVERLAP guard in server.ts.
//
// Background (2026-06-15 incident, burned TWO session strings in one day):
// Railway does zero-downtime ROLLING deploys, and /api/health returns "ok" the
// instant Express is up — BEFORE GramJS connects. So on every deploy Railway
// keeps the OLD container alive (still holding the Telegram session) until the
// NEW container is "healthy", then tears the old one down. If the new container
// connects to Telegram immediately, its socket overlaps the old container's
// still-open session socket and BOTH connections get 406 AUTH_KEY_DUPLICATED —
// which PERMANENTLY poisons the session string (not transient: a lone container
// kept failing 20+ min after the overlap was gone).
//
// The fix is two complementary parts, BOTH in server.ts:
//   (A) a SIGTERM/SIGINT handler that disconnects the client cleanly on
//       teardown, so the OLD container releases its session promptly; and
//   (B) an initial-connect DELAY so the NEW container waits for the old one to
//       be gone before its first connect().
// Only (B)'s value parsing lives here so it can be unit-tested. The delay/await
// and the signal handler are imperative and tied to the live client, so they
// stay in server.ts — and because the no-telegram launcher never runs that path
// (tlClient is null), the real overlap behaviour is only verifiable in
// production. (Same pure-module convention as telegram-guards.ts,
// listener-health.ts, conversation-grouping.ts, …)

// Default initial-connect delay (ms). 60s comfortably outlasts Railway's
// healthcheck-pass → old-container-teardown window without making a cold deploy
// feel broken; AutoFetch's 2h lookback backfills the startup gap anyway.
export const DEFAULT_CONNECT_DELAY_MS = 60 * 1000;

// Upper bound so a fat-fingered env var can't strand ingestion for hours.
export const MAX_CONNECT_DELAY_MS = 5 * 60 * 1000;

// Resolve the initial-connect delay from TELEGRAM_CONNECT_DELAY_MS:
//   - unset / empty / non-numeric → defaultMs (DEFAULT_CONNECT_DELAY_MS)
//   - "0" or negative             → 0 (disables the wait; e.g. a cold first
//                                      deploy where there is no old container)
//   - greater than the max        → clamped to MAX_CONNECT_DELAY_MS
// Always returns a non-negative integer count of milliseconds.
export function resolveConnectDelayMs(
  raw: string | undefined | null,
  defaultMs: number = DEFAULT_CONNECT_DELAY_MS,
): number {
  if (raw == null || String(raw).trim() === "") return defaultMs;
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultMs;
  if (n <= 0) return 0;
  return Math.min(Math.floor(n), MAX_CONNECT_DELAY_MS);
}
