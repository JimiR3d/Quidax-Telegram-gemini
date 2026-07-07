// observability.ts
//
// Pure helpers for the ingestion-lag gauge (P0-1) and the Telegram
// session-liveness alarm (P1-3) in server.ts. Both signals share the same
// problem: a raw number/boolean is noisy tick-to-tick, so alerting on the raw
// value either flaps (fires repeatedly on a transient blip) or floods (fires
// every check once something is actually wrong). evaluateBreach() below is
// the one state machine both signals are run through.
//
// Background: every past "the live listener is dead" incident (Fix 6, Fix 10,
// Fix 11 — see PULSEDESK_HANDOFF.md) was found by a human running SQL by hand
// against `ingested_at - message_timestamp`, because /api/health's existing
// `lastMessageReceivedAt` field is boot-initialized and only advances on real
// delivery (or a watchdog reconnect) — it reads "healthy" for up to 30 minutes
// after a real failure. This module turns that manual SQL check into a real
// metric, plus a second, independent signal for "is the Telegram session even
// connected" with its own sustained-breach alarm.

export interface LagStats {
  medianMs: number;
  maxMs: number;
  sampleSize: number;
}

// Null on an empty sample — matches the existing "null not NaN" convention
// used elsewhere for empty-population stats (audit-scoring.ts, /api/eval
// accuracy) so a caller never has to special-case NaN.
export function computeLagStats(lagsMs: number[]): LagStats | null {
  if (lagsMs.length === 0) return null;
  const sorted = [...lagsMs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianMs =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const maxMs = sorted[sorted.length - 1];
  return { medianMs, maxMs, sampleSize: sorted.length };
}

export interface BreachTracker {
  firstBreachAt: number | null;
  lastAlertAt: number | null;
}

export interface BreachResult {
  tracker: BreachTracker;
  shouldAlert: boolean;
}

// The shared alerting mechanism for both P0-1 and P1-3:
//  - not breached                                  -> reset, never alerts
//  - breached, but under `sustainedMs` so far       -> no alert yet (too new
//                                                       to be sure it's real,
//                                                       not a single-tick blip)
//  - breached >= sustainedMs, no alert yet (or the
//    last alert is older than `repeatMs`)           -> alert, stamp lastAlertAt
//  - breached >= sustainedMs, already alerted within
//    `repeatMs`                                     -> no alert (no spam)
export function evaluateBreach(
  isBreached: boolean,
  now: number,
  tracker: BreachTracker,
  sustainedMs: number,
  repeatMs: number,
): BreachResult {
  if (!isBreached) {
    return { tracker: { firstBreachAt: null, lastAlertAt: null }, shouldAlert: false };
  }
  const firstBreachAt = tracker.firstBreachAt ?? now;
  if (now - firstBreachAt < sustainedMs) {
    return { tracker: { firstBreachAt, lastAlertAt: tracker.lastAlertAt }, shouldAlert: false };
  }
  const shouldAlert = tracker.lastAlertAt == null || now - tracker.lastAlertAt >= repeatMs;
  return {
    tracker: { firstBreachAt, lastAlertAt: shouldAlert ? now : tracker.lastAlertAt },
    shouldAlert,
  };
}

// Same guarded parse-or-default pattern as resolveConnectDelayMs in
// deploy-overlap.ts: garbage/negative/zero env input silently falls back to
// the default rather than disabling the alarm or throwing at startup.
export function resolveAlertThresholdMs(
  envValue: string | undefined,
  defaultMs: number,
): number {
  if (!envValue) return defaultMs;
  const parsed = Number(envValue);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultMs;
  return parsed;
}

export const DEFAULT_INGEST_LAG_ALERT_MS = 10 * 60 * 1000; // 10 min median lag
export const DEFAULT_SESSION_DOWN_ALERT_MS = 10 * 60 * 1000; // 10 min disconnected
// Fixed (not env-tunable) — internal tuning of the shared breach mechanism,
// not an operator-facing knob like the two thresholds above.
export const INGEST_LAG_SUSTAINED_MS = 5 * 60 * 1000;
export const ALERT_REPEAT_MS = 30 * 60 * 1000;
export const INGEST_LAG_SAMPLE_SIZE = 50;
