import { describe, it, expect } from "vitest";
import {
  normalizeReplyToMsgId,
  selectReplyToTarget,
  REPLY_ATTACH_STATUSES,
  type ReplyTargetTicket,
} from "../reply-target";

describe("normalizeReplyToMsgId", () => {
  it("returns a positive integer unchanged", () => {
    expect(normalizeReplyToMsgId(139652)).toBe(139652);
  });

  it("coerces a numeric string", () => {
    expect(normalizeReplyToMsgId("140053")).toBe(140053);
  });

  it("truncates a float to an integer", () => {
    expect(normalizeReplyToMsgId(123.9)).toBe(123);
  });

  it("returns null for null / undefined / empty string", () => {
    expect(normalizeReplyToMsgId(null)).toBeNull();
    expect(normalizeReplyToMsgId(undefined)).toBeNull();
    expect(normalizeReplyToMsgId("")).toBeNull();
  });

  it("returns null for zero, negatives and NaN (the load-bearing > 0 guard)", () => {
    // Number(null) === 0 and Number("") === 0 — a non-reply must never store 0.
    expect(normalizeReplyToMsgId(0)).toBeNull();
    expect(normalizeReplyToMsgId(-5)).toBeNull();
    expect(normalizeReplyToMsgId("not-a-number")).toBeNull();
    expect(normalizeReplyToMsgId(Number.NaN)).toBeNull();
  });
});

describe("selectReplyToTarget", () => {
  const active: ReplyTargetTicket = {
    id: "t1",
    status: "In Review",
    is_admin_message: false,
  };

  it("returns an active non-admin ticket", () => {
    expect(selectReplyToTarget(active)?.id).toBe("t1");
  });

  it("accepts every active / assumed-resolved status", () => {
    for (const status of REPLY_ATTACH_STATUSES) {
      expect(
        selectReplyToTarget({ id: "x", status, is_admin_message: false }),
      ).not.toBeNull();
    }
  });

  it("accepts a Handed off ticket (a fresh reply reopens it)", () => {
    expect(
      selectReplyToTarget({ id: "h", status: "Handed off", is_admin_message: false })?.id,
    ).toBe("h");
  });

  it("rejects Resolved and Dismissed (closed-out threads)", () => {
    expect(
      selectReplyToTarget({ id: "x", status: "Resolved", is_admin_message: false }),
    ).toBeNull();
    expect(
      selectReplyToTarget({ id: "x", status: "Dismissed", is_admin_message: false }),
    ).toBeNull();
  });

  it("rejects an admin-message ticket even when active", () => {
    expect(
      selectReplyToTarget({ id: "x", status: "Open", is_admin_message: true }),
    ).toBeNull();
  });

  it("rejects null / undefined / id-less / status-less tickets", () => {
    expect(selectReplyToTarget(null)).toBeNull();
    expect(selectReplyToTarget(undefined)).toBeNull();
    expect(selectReplyToTarget({ id: "", status: "Open" } as ReplyTargetTicket)).toBeNull();
    expect(selectReplyToTarget({ id: "x", status: null })).toBeNull();
    expect(selectReplyToTarget({ id: "x" } as ReplyTargetTicket)).toBeNull();
  });

  it("honours a custom status allowlist", () => {
    expect(
      selectReplyToTarget({ id: "x", status: "Resolved", is_admin_message: false }, [
        "Resolved",
      ])?.id,
    ).toBe("x");
    expect(
      selectReplyToTarget(active, ["Resolved"]),
    ).toBeNull();
  });
});
