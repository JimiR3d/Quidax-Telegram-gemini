import { describe, it, expect } from "vitest";
import {
  currentDayKeyUTC,
  parseGroqRateHeaders,
  initGroqBudgetState,
  recordGroqUsage,
  computeGroqBudgetStatus,
  isGroqBudgetBreached,
  resolveGroqBudgetPct,
  DEFAULT_GROQ_REQUEST_CAP,
  DEFAULT_GROQ_TOKEN_CAP,
  DEFAULT_GROQ_BUDGET_WARN_PCT,
} from "../groq-budget";

// A fixed UTC instant for deterministic day-key math.
const T = (iso: string) => new Date(iso).getTime();
const DAY1_NOON = T("2026-07-08T12:00:00Z");
const DAY1_LATE = T("2026-07-08T23:59:00Z");
const DAY2_EARLY = T("2026-07-09T00:01:00Z");

// A Headers-like object (fetch Response.headers) for the parse tests.
const headersFrom = (obj: Record<string, string>) => ({
  get: (name: string) => (name in obj ? obj[name] : null),
});

describe("currentDayKeyUTC", () => {
  it("returns the UTC calendar day, not the local day", () => {
    expect(currentDayKeyUTC(DAY1_NOON)).toBe("2026-07-08");
    // 00:01 UTC on the 9th is the 9th even though many local zones read the 8th.
    expect(currentDayKeyUTC(DAY2_EARLY)).toBe("2026-07-09");
  });
});

describe("parseGroqRateHeaders", () => {
  it("parses a full x-ratelimit-* header set from a Headers object", () => {
    const parsed = parseGroqRateHeaders(
      headersFrom({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "994",
        "x-ratelimit-reset-requests": "8.64s",
        "x-ratelimit-limit-tokens": "200000",
        "x-ratelimit-remaining-tokens": "198500",
        "x-ratelimit-reset-tokens": "2m59.56s",
      }),
      DAY1_NOON,
    );
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      limitRequests: 1000,
      remainingRequests: 994,
      resetRequests: "8.64s",
      limitTokens: 200000,
      remainingTokens: 198500,
      resetTokens: "2m59.56s",
      capturedAt: DAY1_NOON,
    });
  });

  it("also reads from a plain object (case-insensitive fallback)", () => {
    const parsed = parseGroqRateHeaders({
      "x-ratelimit-remaining-requests": "500",
      "x-ratelimit-remaining-tokens": "100000",
    });
    expect(parsed?.remainingRequests).toBe(500);
    expect(parsed?.remainingTokens).toBe(100000);
  });

  it("returns null when no rate fields are present or headers are missing", () => {
    expect(parseGroqRateHeaders(headersFrom({ "content-type": "application/json" }))).toBeNull();
    expect(parseGroqRateHeaders(null)).toBeNull();
    expect(parseGroqRateHeaders(undefined)).toBeNull();
  });

  it("treats a blank/garbage remaining as null (not 0) so it can't fake exhaustion", () => {
    const parsed = parseGroqRateHeaders({
      "x-ratelimit-limit-requests": "1000",
      "x-ratelimit-remaining-requests": "",
      "x-ratelimit-remaining-tokens": "notanumber",
    });
    // limit is present so the snapshot is non-null, but remaining stays null.
    expect(parsed?.limitRequests).toBe(1000);
    expect(parsed?.remainingRequests).toBeNull();
    expect(parsed?.remainingTokens).toBeNull();
  });
});

describe("recordGroqUsage", () => {
  it("increments the request count and tallies usage tokens", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, {
      now: DAY1_NOON,
      usage: { prompt_tokens: 300, completion_tokens: 120, total_tokens: 420 },
    });
    expect(s.requests).toBe(1);
    expect(s.promptTokens).toBe(300);
    expect(s.completionTokens).toBe(120);
    expect(s.totalTokens).toBe(420);
  });

  it("derives total from prompt+completion when total_tokens is absent", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, {
      now: DAY1_NOON,
      usage: { prompt_tokens: 200, completion_tokens: 55 },
    });
    expect(s.totalTokens).toBe(255);
  });

  it("counts a 429 and still increments the request count", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, { now: DAY1_NOON, wasRateLimited: true });
    expect(s.requests).toBe(1);
    expect(s.rateLimited).toBe(1);
    expect(s.totalTokens).toBe(0);
  });

  it("auto-rolls the tally on a new UTC day", () => {
    let s = initGroqBudgetState(DAY1_LATE);
    s = recordGroqUsage(s, {
      now: DAY1_LATE,
      usage: { total_tokens: 5000 },
    });
    expect(s.requests).toBe(1);
    expect(s.totalTokens).toBe(5000);
    // First call on the next UTC day resets the counters.
    s = recordGroqUsage(s, {
      now: DAY2_EARLY,
      usage: { total_tokens: 100 },
    });
    expect(s.day).toBe("2026-07-09");
    expect(s.requests).toBe(1);
    expect(s.totalTokens).toBe(100);
  });

  it("stores the latest header snapshot but never mutates the input state", () => {
    const s0 = initGroqBudgetState(DAY1_NOON);
    const s1 = recordGroqUsage(s0, {
      now: DAY1_NOON,
      headers: headersFrom({ "x-ratelimit-remaining-requests": "990" }),
    });
    expect(s1.lastHeaders?.remainingRequests).toBe(990);
    // purity: the original object is untouched
    expect(s0.requests).toBe(0);
    expect(s0.lastHeaders).toBeNull();
  });
});

describe("computeGroqBudgetStatus", () => {
  const caps = { reqCap: 1000, tokenCap: 200000 };

  it("uses the in-memory tally when there is no header snapshot", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, { now: DAY1_NOON, usage: { total_tokens: 20000 } });
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY1_NOON });
    expect(status.requestSource).toBe("tally");
    expect(status.tokenSource).toBe("tally");
    expect(status.requests).toBe(1);
    expect(status.remainingRequests).toBe(999);
    expect(status.remainingTokens).toBe(180000);
    expect(status.tokensPctUsed).toBeCloseTo(0.1, 5);
    expect(status.header).toBeNull();
  });

  it("prefers a header dimension only when its own limit matches the daily cap", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, {
      now: DAY1_NOON,
      usage: { total_tokens: 1000 },
      headers: headersFrom({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "100",
        "x-ratelimit-limit-tokens": "200000",
        "x-ratelimit-remaining-tokens": "20000",
      }),
    });
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY1_NOON });
    // Both header limits match the caps → both remaining come from the header.
    expect(status.requestSource).toBe("header");
    expect(status.tokenSource).toBe("header");
    expect(status.remainingRequests).toBe(100);
    expect(status.remainingTokens).toBe(20000);
    expect(status.requestsPctUsed).toBeCloseTo(0.9, 5);
    expect(status.tokensPctUsed).toBeCloseTo(0.9, 5);
  });

  it("REJECTS Groq's per-minute token header for the daily token budget (real bug 2026-07-08)", () => {
    // Live Groq returns remaining-tokens against the ~8K/min bucket, NOT the
    // daily 200K budget. Trusting it would read ~97% used after one 2.5K call.
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, {
      now: DAY1_NOON,
      usage: { prompt_tokens: 2084, completion_tokens: 415, total_tokens: 2499 },
      headers: headersFrom({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "999",
        "x-ratelimit-limit-tokens": "8000", // per-MINUTE bucket, not 200000/day
        "x-ratelimit-remaining-tokens": "5915",
      }),
    });
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY1_NOON });
    // Requests: header limit == cap → trusted (restart-proof).
    expect(status.requestSource).toBe("header");
    expect(status.remainingRequests).toBe(999);
    // Tokens: header limit (8000) != cap (200000) → REJECTED, use daily tally.
    expect(status.tokenSource).toBe("tally");
    expect(status.remainingTokens).toBe(200000 - 2499);
    expect(status.tokensPctUsed).toBeCloseTo(2499 / 200000, 5); // ~1.2%, not 97%
    // The raw per-minute header is still surfaced for observability.
    expect(status.header?.remainingTokens).toBe(5915);
    expect(status.header?.limitTokens).toBe(8000);
  });

  it("ignores a stale-day header snapshot and falls back to the tally", () => {
    let s = initGroqBudgetState(DAY1_LATE);
    s = recordGroqUsage(s, {
      now: DAY1_LATE,
      headers: headersFrom({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "5",
      }),
    });
    // Next day, no call yet: header snapshot is from yesterday → not trusted.
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY2_EARLY });
    expect(status.requestSource).toBe("tally");
    expect(status.headerCapturedAt).toBeNull();
    expect(status.header).toBeNull();
    // A stale-day tally reads as 0 used (fresh day).
    expect(status.requests).toBe(0);
    expect(status.remainingRequests).toBe(1000);
  });

  it("clamps pct to >= 0 when header remaining exceeds the cap (burst credits)", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, {
      now: DAY1_NOON,
      headers: headersFrom({
        "x-ratelimit-limit-requests": "1000",
        "x-ratelimit-remaining-requests": "1200", // > limit (defensive)
      }),
    });
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY1_NOON });
    expect(status.requestSource).toBe("header");
    expect(status.requestsPctUsed).toBe(0);
  });
});

describe("isGroqBudgetBreached", () => {
  const caps = { reqCap: 1000, tokenCap: 200000 };

  it("is false comfortably under the warn fraction", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, { now: DAY1_NOON, usage: { total_tokens: 1000 } });
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY1_NOON });
    expect(isGroqBudgetBreached(status, 0.9)).toBe(false);
  });

  it("is true once token usage crosses the warn fraction", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, { now: DAY1_NOON, usage: { total_tokens: 185000 } });
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY1_NOON });
    expect(isGroqBudgetBreached(status, 0.9)).toBe(true);
  });

  it("is true whenever a 429 has been seen today, regardless of pct", () => {
    let s = initGroqBudgetState(DAY1_NOON);
    s = recordGroqUsage(s, { now: DAY1_NOON, wasRateLimited: true });
    const status = computeGroqBudgetStatus(s, { ...caps, now: DAY1_NOON });
    // pct is ~0 (1 request), but a 429 alone is a breach.
    expect(status.requestsPctUsed).toBeLessThan(0.9);
    expect(isGroqBudgetBreached(status, 0.9)).toBe(true);
  });
});

describe("resolveGroqBudgetPct", () => {
  it("returns the default for missing / out-of-range / garbage input", () => {
    expect(resolveGroqBudgetPct(undefined, 0.9)).toBe(0.9);
    expect(resolveGroqBudgetPct("", 0.9)).toBe(0.9);
    expect(resolveGroqBudgetPct("0", 0.9)).toBe(0.9);
    expect(resolveGroqBudgetPct("-0.5", 0.9)).toBe(0.9);
    expect(resolveGroqBudgetPct("1.5", 0.9)).toBe(0.9);
    expect(resolveGroqBudgetPct("abc", 0.9)).toBe(0.9);
  });

  it("accepts a valid fraction in (0, 1]", () => {
    expect(resolveGroqBudgetPct("0.8", 0.9)).toBe(0.8);
    expect(resolveGroqBudgetPct("1", 0.9)).toBe(1);
  });
});

describe("defaults", () => {
  it("match the documented gpt-oss-20b free-tier caps and warn threshold", () => {
    expect(DEFAULT_GROQ_REQUEST_CAP).toBe(1000);
    expect(DEFAULT_GROQ_TOKEN_CAP).toBe(200000);
    expect(DEFAULT_GROQ_BUDGET_WARN_PCT).toBe(0.9);
  });
});
