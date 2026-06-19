import { describe, it, expect } from "vitest";
import {
  shouldAssumeResolved,
  ASSUME_RESOLVABLE_STATUSES,
  ASSUMED_RESOLVED_QUIET_DAYS,
} from "../assumed-resolved";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_750_000_000_000; // fixed epoch ms for deterministic boundaries

describe("constants", () => {
  it("is eligible only for Open / In Review / Awaiting User", () => {
    expect(ASSUME_RESOLVABLE_STATUSES).toEqual([
      "Open",
      "In Review",
      "Awaiting User",
    ]);
  });

  it("quiet threshold is 7 days", () => {
    expect(ASSUMED_RESOLVED_QUIET_DAYS).toBe(7);
  });
});

describe("shouldAssumeResolved", () => {
  it("assumes resolved for an engaged, quiet, eligible ticket", () => {
    for (const s of ASSUME_RESOLVABLE_STATUSES) {
      expect(shouldAssumeResolved(s, true, NOW - 8 * DAY, NOW)).toBe(true);
    }
  });

  it("never assumes resolved for Escalated (human-parked)", () => {
    expect(shouldAssumeResolved("Escalated", true, NOW - 30 * DAY, NOW)).toBe(false);
  });

  it("never re-touches terminal states", () => {
    expect(shouldAssumeResolved("Resolved", true, NOW - 30 * DAY, NOW)).toBe(false);
    expect(shouldAssumeResolved("Dismissed", true, NOW - 30 * DAY, NOW)).toBe(false);
  });

  it("requires an admin to have engaged", () => {
    expect(shouldAssumeResolved("In Review", false, NOW - 30 * DAY, NOW)).toBe(false);
  });

  it("requires the quiet window to have fully elapsed", () => {
    // 6 days quiet — not yet
    expect(shouldAssumeResolved("In Review", true, NOW - 6 * DAY, NOW)).toBe(false);
    // a recently-active ticket is never assumed resolved
    expect(shouldAssumeResolved("Open", true, NOW - 1 * DAY, NOW)).toBe(false);
  });

  it("treats exactly 7 days as the inclusive boundary", () => {
    expect(shouldAssumeResolved("In Review", true, NOW - 7 * DAY, NOW)).toBe(true);
    // one millisecond short of 7 days does NOT qualify
    expect(shouldAssumeResolved("In Review", true, NOW - 7 * DAY + 1, NOW)).toBe(false);
  });

  it("honours a custom quietDays override", () => {
    expect(shouldAssumeResolved("In Review", true, NOW - 4 * DAY, NOW, 3)).toBe(true);
    expect(shouldAssumeResolved("In Review", true, NOW - 2 * DAY, NOW, 3)).toBe(false);
  });

  it("only literal true engages (fail-safe against truthy values)", () => {
    // @ts-expect-error exercising a non-boolean caller bug
    expect(shouldAssumeResolved("In Review", "yes", NOW - 30 * DAY, NOW)).toBe(false);
    // @ts-expect-error
    expect(shouldAssumeResolved("In Review", 1, NOW - 30 * DAY, NOW)).toBe(false);
  });

  it("returns false on non-finite timestamps", () => {
    expect(shouldAssumeResolved("In Review", true, NaN, NOW)).toBe(false);
    expect(shouldAssumeResolved("In Review", true, NOW - 30 * DAY, NaN)).toBe(false);
    expect(shouldAssumeResolved("In Review", true, Infinity, NOW)).toBe(false);
  });
});
