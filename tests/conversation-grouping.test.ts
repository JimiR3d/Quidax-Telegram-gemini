import { describe, it, expect } from "vitest";
import {
  userThreadText,
  isWithinGroupingWindow,
  groupingCutoffISO,
  groupingBand,
} from "../conversation-grouping";

// Helpers to build raw_text exactly as server.ts appends blocks.
const followup = (t: string) => `\n\n[USER_FOLLOWUP]\n${t}\n[/USER_FOLLOWUP]`;
const userReply = (t: string) => `\n\n[USER_REPLY]\n${t}\n[/USER_REPLY]`;
const adminReply = (t: string) => `\n\n[ADMIN_REPLY]\n${t}\n[/ADMIN_REPLY]`;

const WINDOW_MS = 5 * 60 * 1000; // 300000 — the default GROUPING_WINDOW_MS

describe("userThreadText — ungrouped tickets are unchanged (no-op vs originalMessageText)", () => {
  it("returns a plain message untouched", () => {
    expect(userThreadText("my withdrawal is stuck")).toBe(
      "my withdrawal is stuck",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(userThreadText("  hello there  \n")).toBe("hello there");
  });

  it("returns the original only when the ticket has just [ADMIN_REPLY] blocks", () => {
    const raw = "my deposit never arrived" + adminReply("We are looking into it");
    expect(userThreadText(raw)).toBe("my deposit never arrived");
  });

  it("drops every [ADMIN_REPLY] block even when there are several", () => {
    const raw =
      "account locked" + adminReply("checking") + adminReply("please wait");
    expect(userThreadText(raw)).toBe("account locked");
  });
});

describe("userThreadText — grouped tickets fold the full user-side thread", () => {
  it("appends a single [USER_FOLLOWUP] after the original", () => {
    const raw = "my withdrawal is stuck" + followup("USDT too");
    expect(userThreadText(raw)).toBe("my withdrawal is stuck\n\nUSDT too");
  });

  it("appends multiple followups in document order", () => {
    const raw =
      "withdrawal pending" + followup("since morning") + followup("any update?");
    expect(userThreadText(raw)).toBe(
      "withdrawal pending\n\nsince morning\n\nany update?",
    );
  });

  it("includes [USER_REPLY] blocks (user-side content)", () => {
    const raw = "is my KYC done?" + userReply("still waiting");
    expect(userThreadText(raw)).toBe("is my KYC done?\n\nstill waiting");
  });

  it("keeps user blocks but drops admin blocks when interleaved, preserving order", () => {
    const raw =
      "my withdrawal is stuck" +
      followup("USDT too") +
      adminReply("Which network?") +
      followup("ERC20");
    expect(userThreadText(raw)).toBe(
      "my withdrawal is stuck\n\nUSDT too\n\nERC20",
    );
  });

  it("preserves multi-line text inside a block", () => {
    const raw = "problem" + followup("line one\nline two");
    expect(userThreadText(raw)).toBe("problem\n\nline one\nline two");
  });
});

describe("userThreadText — malformed / edge input never crashes", () => {
  it("returns empty string for null/undefined/empty", () => {
    expect(userThreadText(null)).toBe("");
    expect(userThreadText(undefined)).toBe("");
    expect(userThreadText("")).toBe("");
  });

  it("skips a followup with empty inner text (no stray blank line)", () => {
    const raw = "hello" + followup("");
    expect(userThreadText(raw)).toBe("hello");
  });

  it("treats bracket-like text inside a block as literal content, not a tag", () => {
    // A user can type "[ADMIN_REPLY]" in their own message; only a real
    // [TAG]\n…\n[/TAG] block is a boundary, so this stays user content.
    const raw = "I need help" + followup("see [ADMIN_REPLY] in my last chat");
    expect(userThreadText(raw)).toBe(
      "I need help\n\nsee [ADMIN_REPLY] in my last chat",
    );
  });
});

describe("isWithinGroupingWindow — rolling window math", () => {
  const last = "2026-06-15T12:00:00.000Z";

  it("groups a message 3 minutes after the parent's last activity", () => {
    expect(
      isWithinGroupingWindow(last, "2026-06-15T12:03:00.000Z", WINDOW_MS),
    ).toBe(true);
  });

  it("groups a message exactly at the window boundary (inclusive)", () => {
    expect(
      isWithinGroupingWindow(last, "2026-06-15T12:05:00.000Z", WINDOW_MS),
    ).toBe(true);
  });

  it("does NOT group a message just past the window", () => {
    expect(
      isWithinGroupingWindow(last, "2026-06-15T12:05:00.001Z", WINDOW_MS),
    ).toBe(false);
  });

  it("groups simultaneous timestamps (diff 0)", () => {
    expect(isWithinGroupingWindow(last, last, WINDOW_MS)).toBe(true);
  });

  it("does NOT group when the parent is more recent than the message (out-of-order)", () => {
    expect(
      isWithinGroupingWindow(last, "2026-06-15T11:59:00.000Z", WINDOW_MS),
    ).toBe(false);
  });
});

describe("isWithinGroupingWindow — missing / invalid timestamps fail safe to false", () => {
  const valid = "2026-06-15T12:00:00.000Z";

  it("returns false when last_message_at is null/undefined/empty", () => {
    expect(isWithinGroupingWindow(null, valid, WINDOW_MS)).toBe(false);
    expect(isWithinGroupingWindow(undefined, valid, WINDOW_MS)).toBe(false);
    expect(isWithinGroupingWindow("", valid, WINDOW_MS)).toBe(false);
  });

  it("returns false when the message date is null/invalid", () => {
    expect(isWithinGroupingWindow(valid, null, WINDOW_MS)).toBe(false);
    expect(isWithinGroupingWindow(valid, "not-a-date", WINDOW_MS)).toBe(false);
  });
});

describe("groupingCutoffISO — the oldest groupable last_message_at", () => {
  it("returns messageDate minus the window as an ISO string", () => {
    expect(groupingCutoffISO("2026-06-15T12:05:00.000Z", WINDOW_MS)).toBe(
      "2026-06-15T12:00:00.000Z",
    );
  });

  it("is consistent with isWithinGroupingWindow at the boundary", () => {
    const msg = "2026-06-15T12:05:00.000Z";
    const cutoff = groupingCutoffISO(msg, WINDOW_MS)!;
    // A parent sitting exactly on the cutoff is in-window.
    expect(isWithinGroupingWindow(cutoff, msg, WINDOW_MS)).toBe(true);
    // One millisecond older than the cutoff is out.
    const justOlder = new Date(Date.parse(cutoff) - 1).toISOString();
    expect(isWithinGroupingWindow(justOlder, msg, WINDOW_MS)).toBe(false);
  });

  it("returns null for a missing/invalid message date", () => {
    expect(groupingCutoffISO(null, WINDOW_MS)).toBeNull();
    expect(groupingCutoffISO("nonsense", WINDOW_MS)).toBeNull();
  });
});

describe("groupingBand — Phase 3 fast / extended / none classification", () => {
  const FAST_MS = 5 * 60 * 1000; // 5 min
  const WIDE_MS = 6 * 60 * 60 * 1000; // 6 h
  const last = "2026-06-15T12:00:00.000Z";
  const at = (mins: number) =>
    new Date(Date.parse(last) + mins * 60 * 1000).toISOString();

  it("is 'fast' for a simultaneous message (diff 0)", () => {
    expect(groupingBand(last, last, FAST_MS, WIDE_MS)).toBe("fast");
  });

  it("is 'fast' within the 5-min window", () => {
    expect(groupingBand(last, at(3), FAST_MS, WIDE_MS)).toBe("fast");
  });

  it("is 'fast' exactly at the 5-min boundary (inclusive)", () => {
    expect(groupingBand(last, at(5), FAST_MS, WIDE_MS)).toBe("fast");
  });

  it("is 'extended' just past the fast window", () => {
    expect(
      groupingBand(last, new Date(Date.parse(at(5)) + 1).toISOString(), FAST_MS, WIDE_MS),
    ).toBe("extended");
  });

  it("is 'extended' at 20 minutes (the Phase-3 topic-shift case)", () => {
    expect(groupingBand(last, at(20), FAST_MS, WIDE_MS)).toBe("extended");
  });

  it("is 'extended' exactly at the 6-h boundary (inclusive)", () => {
    expect(groupingBand(last, at(360), FAST_MS, WIDE_MS)).toBe("extended");
  });

  it("is 'none' just past the 6-h window", () => {
    expect(
      groupingBand(last, new Date(Date.parse(at(360)) + 1).toISOString(), FAST_MS, WIDE_MS),
    ).toBe("none");
  });

  it("is 'none' for an out-of-order parent (newer than the message)", () => {
    expect(groupingBand(last, at(-1), FAST_MS, WIDE_MS)).toBe("none");
  });

  it("is 'none' for missing / invalid timestamps", () => {
    expect(groupingBand(null, at(20), FAST_MS, WIDE_MS)).toBe("none");
    expect(groupingBand(last, null, FAST_MS, WIDE_MS)).toBe("none");
    expect(groupingBand(last, "not-a-date", FAST_MS, WIDE_MS)).toBe("none");
    expect(groupingBand("", "", FAST_MS, WIDE_MS)).toBe("none");
  });
});
