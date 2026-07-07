import { describe, it, expect } from "vitest";
import {
  computeLagStats,
  evaluateBreach,
  resolveAlertThresholdMs,
  type BreachTracker,
} from "../observability";

describe("computeLagStats", () => {
  it("returns null for an empty sample", () => {
    expect(computeLagStats([])).toBeNull();
  });

  it("handles a single value", () => {
    expect(computeLagStats([42])).toEqual({ medianMs: 42, maxMs: 42, sampleSize: 1 });
  });

  it("computes the median for an odd count", () => {
    expect(computeLagStats([10, 50, 30])).toEqual({ medianMs: 30, maxMs: 50, sampleSize: 3 });
  });

  it("averages the two middle values for an even count", () => {
    expect(computeLagStats([10, 20, 30, 40])).toEqual({ medianMs: 25, maxMs: 40, sampleSize: 4 });
  });

  it("does not mutate or depend on input order", () => {
    const input = [100, 5, 50];
    const result = computeLagStats(input);
    expect(input).toEqual([100, 5, 50]);
    expect(result).toEqual({ medianMs: 50, maxMs: 100, sampleSize: 3 });
  });

  it("handles an all-zero sample", () => {
    expect(computeLagStats([0, 0, 0])).toEqual({ medianMs: 0, maxMs: 0, sampleSize: 3 });
  });
});

describe("evaluateBreach", () => {
  const freshTracker = (): BreachTracker => ({ firstBreachAt: null, lastAlertAt: null });
  const sustainedMs = 5 * 60 * 1000;
  const repeatMs = 30 * 60 * 1000;

  it("never alerts when not breached", () => {
    const result = evaluateBreach(false, 1_000_000, freshTracker(), sustainedMs, repeatMs);
    expect(result.shouldAlert).toBe(false);
    expect(result.tracker).toEqual({ firstBreachAt: null, lastAlertAt: null });
  });

  it("does not alert on the first breached tick", () => {
    const now = 1_000_000;
    const result = evaluateBreach(true, now, freshTracker(), sustainedMs, repeatMs);
    expect(result.shouldAlert).toBe(false);
    expect(result.tracker.firstBreachAt).toBe(now);
  });

  it("does not alert while still under the sustained window", () => {
    const start = 1_000_000;
    const tracker: BreachTracker = { firstBreachAt: start, lastAlertAt: null };
    const result = evaluateBreach(true, start + sustainedMs - 1, tracker, sustainedMs, repeatMs);
    expect(result.shouldAlert).toBe(false);
    expect(result.tracker.firstBreachAt).toBe(start);
  });

  it("alerts once the breach has been sustained past the window", () => {
    const start = 1_000_000;
    const tracker: BreachTracker = { firstBreachAt: start, lastAlertAt: null };
    const now = start + sustainedMs;
    const result = evaluateBreach(true, now, tracker, sustainedMs, repeatMs);
    expect(result.shouldAlert).toBe(true);
    expect(result.tracker.lastAlertAt).toBe(now);
    expect(result.tracker.firstBreachAt).toBe(start);
  });

  it("suppresses a repeat alert before the repeat interval elapses", () => {
    const start = 1_000_000;
    const firstAlertAt = start + sustainedMs;
    const tracker: BreachTracker = { firstBreachAt: start, lastAlertAt: firstAlertAt };
    const now = firstAlertAt + repeatMs - 1;
    const result = evaluateBreach(true, now, tracker, sustainedMs, repeatMs);
    expect(result.shouldAlert).toBe(false);
    expect(result.tracker.lastAlertAt).toBe(firstAlertAt);
  });

  it("fires again once the repeat interval has elapsed", () => {
    const start = 1_000_000;
    const firstAlertAt = start + sustainedMs;
    const tracker: BreachTracker = { firstBreachAt: start, lastAlertAt: firstAlertAt };
    const now = firstAlertAt + repeatMs;
    const result = evaluateBreach(true, now, tracker, sustainedMs, repeatMs);
    expect(result.shouldAlert).toBe(true);
    expect(result.tracker.lastAlertAt).toBe(now);
  });

  it("resets the tracker once the breach clears, so a later re-breach needs its own sustained window", () => {
    const alertedTracker: BreachTracker = { firstBreachAt: 1_000_000, lastAlertAt: 1_300_000 };
    const cleared = evaluateBreach(false, 2_000_000, alertedTracker, sustainedMs, repeatMs);
    expect(cleared.tracker).toEqual({ firstBreachAt: null, lastAlertAt: null });

    // Immediately re-breaching should NOT alert again right away — it must
    // wait out a fresh sustained window, proving the reset actually happened.
    const rebreached = evaluateBreach(true, 2_000_001, cleared.tracker, sustainedMs, repeatMs);
    expect(rebreached.shouldAlert).toBe(false);
    expect(rebreached.tracker.firstBreachAt).toBe(2_000_001);
  });
});

describe("resolveAlertThresholdMs", () => {
  const defaultMs = 600_000;

  it("falls back to the default when unset", () => {
    expect(resolveAlertThresholdMs(undefined, defaultMs)).toBe(defaultMs);
  });

  it("falls back to the default for an empty string", () => {
    expect(resolveAlertThresholdMs("", defaultMs)).toBe(defaultMs);
  });

  it("falls back to the default for non-numeric garbage", () => {
    expect(resolveAlertThresholdMs("not-a-number", defaultMs)).toBe(defaultMs);
  });

  it("falls back to the default for zero or negative values", () => {
    expect(resolveAlertThresholdMs("0", defaultMs)).toBe(defaultMs);
    expect(resolveAlertThresholdMs("-5000", defaultMs)).toBe(defaultMs);
  });

  it("parses a valid numeric string", () => {
    expect(resolveAlertThresholdMs("120000", defaultMs)).toBe(120000);
  });
});
