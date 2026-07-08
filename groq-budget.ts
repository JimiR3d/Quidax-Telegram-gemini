// groq-budget.ts
//
// Pure helpers for P1-4 Groq budget accounting in server.ts.
//
// Background: after the 2026-07-02 model migration, all 8 Groq call sites run on
// the free tier (openai/gpt-oss-20b: 1,000 requests/day, 200K tokens/day — 14x
// tighter than the old llama tier). Nothing meters usage. A busy day, a runaway
// sweep, or a /api/verify run can silently exhaust the daily quota; after that
// every classification 429s and degrades quietly — no signal until someone
// notices bad output. This module turns Groq consumption into a metered,
// visible-on-/api/health, alarms-before-it-degrades signal, reusing the same
// evaluateBreach/fireAlert alerting mechanism P0-1/P1-3 already established.
//
// Two sources of truth, in priority order:
//  1. Groq's own authoritative x-ratelimit-* response headers (account-side
//     remaining — restart-proof, survives a redeploy mid-day), preferred when
//     the captured header snapshot is from the current UTC day.
//  2. An in-memory per-process daily tally as the fallback (resets at UTC
//     midnight, matching Groq's free-tier daily reset).
//
// server.ts owns the groqChatCreate wrapper (the live openai call + .withResponse
// header/usage capture); this module owns the day-key, header parsing, tally
// arithmetic, and breach decision — the testable logic — with no live client,
// exactly like observability.ts / gap-recovery.ts / autofetch-dedup.ts.

export const DEFAULT_GROQ_REQUEST_CAP = 1000;
export const DEFAULT_GROQ_TOKEN_CAP = 200000;
export const DEFAULT_GROQ_BUDGET_WARN_PCT = 0.9;

// UTC day key (YYYY-MM-DD). Groq's free-tier daily quota resets at UTC midnight,
// so the tally must roll on the UTC calendar, NOT the server's local clock
// (Railway runs UTC, but a local launcher may not).
export function currentDayKeyUTC(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

// Coerce a header value to a non-negative finite number, or null when absent /
// unparseable. remaining/limit headers are integers; a blank or garbage value
// is treated as "unknown" (null) rather than 0 — 0 would look like "quota
// exhausted" and could fire a false alert.
function toHeaderNumber(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Non-negative integer coercion for usage token counts. Number(null)/Number("")
// are both 0, and a negative/NaN count is meaningless — clamp to 0.
function toNonNegInt(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

// Read a header by name from either a fetch Headers object (has .get()) or a
// plain object. Defensive because the input is whatever .withResponse() /
// APIError.headers hands us — could be a Headers, a plain record, or undefined.
function readHeader(headers: any, name: string): string | undefined {
  if (!headers) return undefined;
  if (typeof headers.get === "function") {
    const v = headers.get(name);
    return v == null ? undefined : String(v);
  }
  const v = headers[name] ?? headers[name.toLowerCase()];
  return v == null ? undefined : String(v);
}

export interface GroqRateHeaders {
  limitRequests: number | null;
  remainingRequests: number | null;
  resetRequests: string | null;
  limitTokens: number | null;
  remainingTokens: number | null;
  resetTokens: string | null;
  // When this snapshot was captured (unix ms) — used to decide if it is still
  // from the current UTC day before we trust its "remaining" values.
  capturedAt: number;
}

// Parse Groq's x-ratelimit-* headers into a snapshot, or null when none of the
// meaningful rate fields are present (so the caller keeps its previous snapshot
// rather than storing an empty one). The reset-* fields are duration strings
// like "7.66s" / "2m59.56s" — kept verbatim (display only, not parsed to ms).
export function parseGroqRateHeaders(
  headers: any,
  now = Date.now(),
): GroqRateHeaders | null {
  if (!headers) return null;
  const num = (name: string) => toHeaderNumber(readHeader(headers, name));
  const str = (name: string) => {
    const raw = readHeader(headers, name);
    return raw == null || raw === "" ? null : raw;
  };
  const limitRequests = num("x-ratelimit-limit-requests");
  const remainingRequests = num("x-ratelimit-remaining-requests");
  const limitTokens = num("x-ratelimit-limit-tokens");
  const remainingTokens = num("x-ratelimit-remaining-tokens");
  if (
    limitRequests == null &&
    remainingRequests == null &&
    limitTokens == null &&
    remainingTokens == null
  ) {
    return null;
  }
  return {
    limitRequests,
    remainingRequests,
    resetRequests: str("x-ratelimit-reset-requests"),
    limitTokens,
    remainingTokens,
    resetTokens: str("x-ratelimit-reset-tokens"),
    capturedAt: now,
  };
}

export interface GroqBudgetState {
  // The UTC day this tally belongs to; a record on a new day auto-rolls it.
  day: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  // Count of 429 (rate-limited / budget-exhausted) responses today.
  rateLimited: number;
  // Latest parsed x-ratelimit-* snapshot (may be from a prior day — the compute
  // step validates the day before trusting it).
  lastHeaders: GroqRateHeaders | null;
}

export function initGroqBudgetState(now = Date.now()): GroqBudgetState {
  return {
    day: currentDayKeyUTC(now),
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    rateLimited: 0,
    lastHeaders: null,
  };
}

// Record one Groq call. Pure: returns a NEW state, never mutates the input.
// Auto day-rolls the tally on a UTC day change. Increments the request count
// always; adds usage tokens when present (prefers the provider's total_tokens,
// else derives from prompt+completion); counts a 429; and stores the latest
// header snapshot when the response carried usable x-ratelimit-* headers.
export function recordGroqUsage(
  state: GroqBudgetState,
  opts: {
    now?: number;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    } | null;
    headers?: any;
    wasRateLimited?: boolean;
  } = {},
): GroqBudgetState {
  const now = opts.now ?? Date.now();
  const day = currentDayKeyUTC(now);
  const next: GroqBudgetState =
    state.day === day
      ? { ...state }
      : {
          day,
          requests: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          rateLimited: 0,
          // Keep the header snapshot across a day-roll; the compute step ignores
          // it once it is no longer from the current UTC day.
          lastHeaders: state.lastHeaders,
        };
  next.requests += 1;
  if (opts.usage) {
    const p = toNonNegInt(opts.usage.prompt_tokens);
    const c = toNonNegInt(opts.usage.completion_tokens);
    const t = toNonNegInt(opts.usage.total_tokens);
    next.promptTokens += p;
    next.completionTokens += c;
    next.totalTokens += t > 0 ? t : p + c;
  }
  if (opts.wasRateLimited) next.rateLimited += 1;
  const parsed = parseGroqRateHeaders(opts.headers, now);
  if (parsed) next.lastHeaders = parsed;
  return next;
}

export interface GroqBudgetStatus {
  day: string;
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCap: number;
  tokenCap: number;
  remainingRequests: number;
  remainingTokens: number;
  // Fraction of the daily cap consumed (0..1+). Drives isGroqBudgetBreached.
  requestsPctUsed: number;
  tokensPctUsed: number;
  // Which source each dimension's "remaining" came from: Groq's own header
  // (authoritative, restart-proof) or the in-memory daily tally (fallback).
  // These are per-dimension because Groq reports them over DIFFERENT windows —
  // see the limit-match guard below.
  requestSource: "header" | "tally";
  tokenSource: "header" | "tally";
  rateLimitedToday: number;
  headerCapturedAt: string | null;
  // The raw Groq header snapshot (today's) for observability. NOTE these are
  // per-WINDOW values as Groq reports them: remaining-requests tracks the daily
  // request budget, but remaining-tokens tracks the PER-MINUTE token bucket
  // (~8K/min), NOT the daily 200K budget — which is exactly why the daily
  // tokensPctUsed above is tally-based, not header-based.
  header: {
    limitRequests: number | null;
    remainingRequests: number | null;
    resetRequests: string | null;
    limitTokens: number | null;
    remainingTokens: number | null;
    resetTokens: string | null;
  } | null;
}

// Snapshot the current daily budget position.
//
// The subtlety (proven against the live Groq API 2026-07-08): Groq's
// x-ratelimit-remaining-REQUESTS reports the DAILY request budget (its
// limit-requests == 1000/day), but x-ratelimit-remaining-TOKENS reports the
// PER-MINUTE token bucket (its limit-tokens == 8000/min), NOT the daily 200K
// budget. Comparing the per-minute token remaining against the daily token cap
// would read ~97% used after a single call and false-alarm every minute.
//
// So a header's "remaining" is trusted as OUR-budget remaining ONLY when that
// header's own limit equals the configured daily cap — i.e. the header is
// reporting the same window we budget against. This auto-adapts: the request
// header matches (used, restart-proof), the token header does not (rejected →
// fall back to the daily tally, the only daily-token signal Groq exposes). If
// Groq ever exposes a daily-token limit that matches the cap, it starts being
// used automatically. A stale-day state (process idle across UTC midnight with
// no call since) reads as 0 used.
export function computeGroqBudgetStatus(
  state: GroqBudgetState,
  opts: { reqCap: number; tokenCap: number; now?: number },
): GroqBudgetStatus {
  const now = opts.now ?? Date.now();
  const day = currentDayKeyUTC(now);
  const sameDay = state.day === day;
  const requests = sameDay ? state.requests : 0;
  const promptTokens = sameDay ? state.promptTokens : 0;
  const completionTokens = sameDay ? state.completionTokens : 0;
  const totalTokens = sameDay ? state.totalTokens : 0;
  const rateLimitedToday = sameDay ? state.rateLimited : 0;
  const reqCap = opts.reqCap;
  const tokenCap = opts.tokenCap;

  const h = state.lastHeaders;
  const headerFresh = !!h && currentDayKeyUTC(h.capturedAt) === day;

  // Limit-match guard: only a header whose own limit equals our configured cap
  // is reporting the same (daily) window we budget against.
  const reqHeaderUsable =
    headerFresh && h.remainingRequests != null && h.limitRequests === reqCap;
  const tokHeaderUsable =
    headerFresh && h.remainingTokens != null && h.limitTokens === tokenCap;

  const remainingRequests = reqHeaderUsable
    ? h.remainingRequests
    : Math.max(0, reqCap - requests);
  const remainingTokens = tokHeaderUsable
    ? h.remainingTokens
    : Math.max(0, tokenCap - totalTokens);
  const requestSource: "header" | "tally" = reqHeaderUsable ? "header" : "tally";
  const tokenSource: "header" | "tally" = tokHeaderUsable ? "header" : "tally";

  // Used is measured against the configured cap, clamped to [0, cap]: if the
  // account cap is larger than ours, header remaining can exceed our cap and
  // used would go negative — clamp so pct never goes below 0.
  const usedRequests = Math.min(reqCap, Math.max(0, reqCap - remainingRequests));
  const usedTokens = Math.min(tokenCap, Math.max(0, tokenCap - remainingTokens));
  const requestsPctUsed = reqCap > 0 ? usedRequests / reqCap : 0;
  const tokensPctUsed = tokenCap > 0 ? usedTokens / tokenCap : 0;

  return {
    day,
    requests,
    promptTokens,
    completionTokens,
    totalTokens,
    requestCap: reqCap,
    tokenCap,
    remainingRequests,
    remainingTokens,
    requestsPctUsed,
    tokensPctUsed,
    requestSource,
    tokenSource,
    rateLimitedToday,
    headerCapturedAt: headerFresh ? new Date(h.capturedAt).toISOString() : null,
    header: headerFresh
      ? {
          limitRequests: h.limitRequests,
          remainingRequests: h.remainingRequests,
          resetRequests: h.resetRequests,
          limitTokens: h.limitTokens,
          remainingTokens: h.remainingTokens,
          resetTokens: h.resetTokens,
        }
      : null,
  };
}

// Breached once EITHER the request or the token budget crosses the warn
// fraction. Also treats any 429 seen today as a breach — a rate-limit response
// means we are already hitting a ceiling regardless of the computed pct.
export function isGroqBudgetBreached(
  status: GroqBudgetStatus,
  warnPct: number,
): boolean {
  return (
    status.rateLimitedToday > 0 ||
    status.requestsPctUsed >= warnPct ||
    status.tokensPctUsed >= warnPct
  );
}

// Guarded parse-or-default for the warn fraction: must be in (0, 1]; garbage /
// out-of-range env input silently falls back to the default (never disables the
// alarm by accepting a nonsense value). Same spirit as resolveAlertThresholdMs.
export function resolveGroqBudgetPct(
  envValue: string | undefined,
  defaultPct: number,
): number {
  if (!envValue) return defaultPct;
  const n = Number(envValue);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return defaultPct;
  return n;
}
