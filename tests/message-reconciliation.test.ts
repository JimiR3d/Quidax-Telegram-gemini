import { describe, it, expect } from "vitest";
import {
  filterReconcileCandidates,
  escapeLikePattern,
  buildRepresentationProbe,
  isSystemBotMessage,
  parseAdminSenderHashes,
  MIN_RECOVERABLE_LEN,
  PROBE_MAX_LEN,
  type ReconcileMessage,
} from "../message-reconciliation";

const msg = (over: Partial<ReconcileMessage>): ReconcileMessage => ({
  id: 1,
  telegramMessageId: "100",
  rawText: "I need help to gain access to my account",
  senderHash: "user_aaa",
  messageTimestamp: "2026-06-20T09:18:00.000Z",
  groupId: "-100123",
  ...over,
});

const ctx = (over: Partial<Parameters<typeof filterReconcileCandidates>[1]> = {}) => ({
  rootTelegramIds: new Set<string>(),
  adminSenderHashes: new Set<string>(),
  ...over,
});

describe("filterReconcileCandidates", () => {
  it("keeps a genuine orphan user message", () => {
    const out = filterReconcileCandidates([msg({})], ctx());
    expect(out.map((m) => m.telegramMessageId)).toEqual(["100"]);
  });

  it("drops messages shorter than the min recoverable length", () => {
    const short = msg({ telegramMessageId: "101", rawText: "ok" });
    expect(short.rawText.length).toBeLessThan(MIN_RECOVERABLE_LEN);
    const out = filterReconcileCandidates([short], ctx());
    expect(out).toHaveLength(0);
  });

  it("drops whitespace-only messages", () => {
    const blank = msg({ telegramMessageId: "102", rawText: "      " });
    const out = filterReconcileCandidates([blank], ctx());
    expect(out).toHaveLength(0);
  });

  it("drops admin-authored messages (dropped by design, never orphans)", () => {
    const adminMsg = msg({ telegramMessageId: "103", senderHash: "admin_xyz" });
    const out = filterReconcileCandidates(
      [adminMsg],
      ctx({ adminSenderHashes: new Set(["admin_xyz"]) }),
    );
    expect(out).toHaveLength(0);
  });

  it("drops a message that is already a ticket root", () => {
    const out = filterReconcileCandidates(
      [msg({ telegramMessageId: "100" })],
      ctx({ rootTelegramIds: new Set(["100"]) }),
    );
    expect(out).toHaveLength(0);
  });

  it("matches root ids by string even if given as a number", () => {
    const out = filterReconcileCandidates(
      [msg({ telegramMessageId: "100" })],
      // a numeric-typed id in the set must still match the stringified candidate
      ctx({ rootTelegramIds: new Set([String(100)]) }),
    );
    expect(out).toHaveLength(0);
  });

  it("returns survivors oldest-first so a conversation rebuilds in order", () => {
    const a = msg({
      telegramMessageId: "140064",
      messageTimestamp: "2026-06-20T09:25:00.000Z",
    });
    const b = msg({
      telegramMessageId: "140062",
      messageTimestamp: "2026-06-20T09:18:00.000Z",
    });
    const c = msg({
      telegramMessageId: "140063",
      messageTimestamp: "2026-06-20T09:21:00.000Z",
    });
    const out = filterReconcileCandidates([a, b, c], ctx());
    expect(out.map((m) => m.telegramMessageId)).toEqual([
      "140062",
      "140063",
      "140064",
    ]);
  });

  it("applies all filters together over a mixed batch (the morning case)", () => {
    const batch = [
      msg({ telegramMessageId: "140062", messageTimestamp: "2026-06-20T09:18:00.000Z" }),
      msg({ telegramMessageId: "140063", messageTimestamp: "2026-06-20T09:21:00.000Z" }),
      msg({ telegramMessageId: "140064", messageTimestamp: "2026-06-20T09:25:00.000Z" }),
      // admin reply — must be dropped
      msg({ telegramMessageId: "140065", senderHash: "admin_xyz", messageTimestamp: "2026-06-20T09:27:00.000Z" }),
      // an unrelated message that already became its own ticket — must be dropped
      msg({ telegramMessageId: "200", messageTimestamp: "2026-06-20T10:00:00.000Z" }),
      // a too-short emoji — must be dropped
      msg({ telegramMessageId: "201", rawText: "👍", messageTimestamp: "2026-06-20T10:01:00.000Z" }),
    ];
    const out = filterReconcileCandidates(
      batch,
      ctx({
        adminSenderHashes: new Set(["admin_xyz"]),
        rootTelegramIds: new Set(["200"]),
      }),
    );
    expect(out.map((m) => m.telegramMessageId)).toEqual([
      "140062",
      "140063",
      "140064",
    ]);
  });

  it("tolerates a malformed message object without throwing", () => {
    const out = filterReconcileCandidates(
      [null as unknown as ReconcileMessage, msg({})],
      ctx(),
    );
    expect(out.map((m) => m.telegramMessageId)).toEqual(["100"]);
  });
});

describe("escapeLikePattern", () => {
  it("escapes ILIKE wildcards and the escape char itself", () => {
    expect(escapeLikePattern("50% off_now")).toBe("50\\% off\\_now");
    expect(escapeLikePattern("a\\b")).toBe("a\\\\b");
  });

  it("leaves ordinary text untouched", () => {
    expect(escapeLikePattern("withdrawal stuck")).toBe("withdrawal stuck");
  });
});

describe("isSystemBotMessage", () => {
  it("flags both live welcome-bot templates", () => {
    expect(
      isSystemBotMessage(
        "Hi fdgsds👋, Welcome to the Quidax Official Community! Quidax.com allows you to buy, sell, transfer...",
      ),
    ).toBe(true);
    expect(
      isSystemBotMessage(
        "Hi fdgsds 👋 Welcome to Quidax Official Community. You can sign up on Quidax via our website or mobile app",
      ),
    ).toBe(true);
  });

  it("flags the moderation ban-notice templates (singular and plural)", () => {
    expect(isSystemBotMessage("Samar Elaraby has been banned! Reason: CAS ban.")).toBe(true);
    expect(
      isSystemBotMessage("Rabia Zinba, Hijab Model have been banned! Reason: CAS ban."),
    ).toBe(true);
  });

  it("does NOT flag a real user account-access message (the morning orphan)", () => {
    expect(
      isSystemBotMessage(
        "I need help to gain access to my account, don't know what's happening",
      ),
    ).toBe(false);
  });

  it("does NOT flag a real user asking about a fake community group", () => {
    expect(
      isSystemBotMessage(
        "Hi Are you guys the one running another quidax community telegram group where people are doing p2p trades",
      ),
    ).toBe(false);
  });

  it("returns false for empty / non-string input", () => {
    expect(isSystemBotMessage("")).toBe(false);
    expect(isSystemBotMessage(null as unknown as string)).toBe(false);
  });
});

describe("parseAdminSenderHashes", () => {
  it("parses a comma-separated list, trimming whitespace", () => {
    const out = parseAdminSenderHashes(" 7b08fcbe , abc123 ,def456");
    expect(out).toEqual(new Set(["7b08fcbe", "abc123", "def456"]));
  });

  it("returns an empty set for undefined (env var not set)", () => {
    expect(parseAdminSenderHashes(undefined).size).toBe(0);
  });

  it("returns an empty set for an empty or whitespace-only value", () => {
    expect(parseAdminSenderHashes("").size).toBe(0);
    expect(parseAdminSenderHashes("   ").size).toBe(0);
  });

  it("drops empty entries from stray commas", () => {
    const out = parseAdminSenderHashes(",7b08fcbe,,abc123,");
    expect(out).toEqual(new Set(["7b08fcbe", "abc123"]));
  });

  it("keeps a single hash with no commas", () => {
    expect(parseAdminSenderHashes("7b08fcbe")).toEqual(new Set(["7b08fcbe"]));
  });

  it("feeds directly into the candidate filter as an admin drop-set", () => {
    const adminMsg = msg({ telegramMessageId: "300", senderHash: "newadmin_hash" });
    const out = filterReconcileCandidates(
      [adminMsg, msg({})],
      ctx({ adminSenderHashes: parseAdminSenderHashes("newadmin_hash") }),
    );
    expect(out.map((m) => m.telegramMessageId)).toEqual(["100"]);
  });
});

describe("buildRepresentationProbe", () => {
  it("trims, bounds to PROBE_MAX_LEN, and escapes", () => {
    const long = "x".repeat(PROBE_MAX_LEN + 50);
    const probe = buildRepresentationProbe(`   ${long}   `);
    expect(probe.length).toBe(PROBE_MAX_LEN);
    expect(probe.startsWith("x")).toBe(true);
  });

  it("escapes wildcards inside the probe", () => {
    expect(buildRepresentationProbe("100% sure")).toBe("100\\% sure");
  });

  it("handles null/undefined input safely", () => {
    expect(buildRepresentationProbe(null as unknown as string)).toBe("");
    expect(buildRepresentationProbe(undefined as unknown as string)).toBe("");
  });
});
