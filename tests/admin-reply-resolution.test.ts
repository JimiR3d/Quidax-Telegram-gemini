import { describe, it, expect } from "vitest";
import {
  parseReclassifyVerdict,
  shouldResolveFromAdminReply,
  shouldHandOffFromAdminReply,
  AUTO_RESOLVABLE_STATUSES,
} from "../admin-reply-resolution";

describe("parseReclassifyVerdict", () => {
  it("parses a well-formed verdict", () => {
    expect(
      parseReclassifyVerdict('{"category":"General Question","resolved":true}'),
    ).toEqual({ category: "General Question", resolved: true });
  });

  it("treats resolved strictly — only literal true counts", () => {
    expect(parseReclassifyVerdict('{"category":"X","resolved":false}')?.resolved).toBe(false);
    // truthy-but-not-true values must NOT resolve (fail-safe)
    expect(parseReclassifyVerdict('{"category":"X","resolved":"true"}')?.resolved).toBe(false);
    expect(parseReclassifyVerdict('{"category":"X","resolved":1}')?.resolved).toBe(false);
    expect(parseReclassifyVerdict('{"category":"X"}')?.resolved).toBe(false);
  });

  it("defaults a missing/invalid category to empty string", () => {
    expect(parseReclassifyVerdict('{"resolved":true}')?.category).toBe("");
    expect(parseReclassifyVerdict('{"category":123,"resolved":true}')?.category).toBe("");
  });

  it("returns null on malformed or non-object JSON", () => {
    expect(parseReclassifyVerdict("not json")).toBeNull();
    expect(parseReclassifyVerdict("")).toBeNull();
    expect(parseReclassifyVerdict("null")).toBeNull();
    expect(parseReclassifyVerdict("[1,2,3]")).toBeNull();
    expect(parseReclassifyVerdict('"a string"')).toBeNull();
  });
});

describe("shouldResolveFromAdminReply", () => {
  it("resolves an affirmative answer from an active queue state", () => {
    expect(shouldResolveFromAdminReply(true, "Open")).toBe(true);
    expect(shouldResolveFromAdminReply(true, "In Review")).toBe(true);
  });

  it("never auto-resolves Escalated or Awaiting User (human-parked)", () => {
    expect(shouldResolveFromAdminReply(true, "Escalated")).toBe(false);
    expect(shouldResolveFromAdminReply(true, "Awaiting User")).toBe(false);
  });

  it("never re-touches terminal states", () => {
    expect(shouldResolveFromAdminReply(true, "Resolved")).toBe(false);
    expect(shouldResolveFromAdminReply(true, "Dismissed")).toBe(false);
  });

  it("does nothing when the reply does not resolve", () => {
    for (const s of AUTO_RESOLVABLE_STATUSES) {
      expect(shouldResolveFromAdminReply(false, s)).toBe(false);
    }
  });

  it("only Open and In Review are auto-resolvable", () => {
    expect(AUTO_RESOLVABLE_STATUSES).toEqual(["Open", "In Review"]);
  });
});

describe("shouldHandOffFromAdminReply", () => {
  it("hands off from an active queue state", () => {
    expect(shouldHandOffFromAdminReply(true, "Open")).toBe(true);
    expect(shouldHandOffFromAdminReply(true, "In Review")).toBe(true);
  });

  it("never hands off Escalated or Awaiting User (human-parked)", () => {
    expect(shouldHandOffFromAdminReply(true, "Escalated")).toBe(false);
    expect(shouldHandOffFromAdminReply(true, "Awaiting User")).toBe(false);
  });

  it("never re-touches terminal/closed states", () => {
    expect(shouldHandOffFromAdminReply(true, "Resolved")).toBe(false);
    expect(shouldHandOffFromAdminReply(true, "Dismissed")).toBe(false);
    expect(shouldHandOffFromAdminReply(true, "Assumed Resolved")).toBe(false);
    expect(shouldHandOffFromAdminReply(true, "Handed off")).toBe(false);
  });

  it("does nothing when the reply is not a hand-off", () => {
    for (const s of AUTO_RESOLVABLE_STATUSES) {
      expect(shouldHandOffFromAdminReply(false, s)).toBe(false);
    }
  });
});
