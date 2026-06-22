import { describe, it, expect } from "vitest";
import {
  classifyChannelDifference,
  buildUsernameMap,
  normalizeDiffMessage,
  sortDiffMessagesOldestFirst,
  extractChannelEditsDeletes,
} from "../channel-difference";

// A minimal raw TL Message (className "Message" with a `message` text field).
const rawMessage = (over: Record<string, any> = {}) => ({
  className: "Message",
  id: 100,
  message: "hello support",
  date: 1_700_000_000,
  fromId: { className: "PeerUser", userId: 42 },
  ...over,
});

describe("classifyChannelDifference", () => {
  it("classifies updates.ChannelDifference as messages with pts + final", () => {
    const resp = {
      className: "updates.ChannelDifference",
      pts: 215300,
      final: true,
      newMessages: [rawMessage()],
      otherUpdates: [],
      users: [],
      chats: [],
    };
    const c = classifyChannelDifference(resp);
    expect(c.kind).toBe("messages");
    if (c.kind === "messages") {
      expect(c.newPts).toBe(215300);
      expect(c.final).toBe(true);
      expect(c.messages).toHaveLength(1);
      expect(c.otherUpdates).toEqual([]);
    }
  });

  it("surfaces otherUpdates on the messages result (defaults to [])", () => {
    const withUpd = classifyChannelDifference({
      className: "updates.ChannelDifference",
      pts: 5,
      newMessages: [],
      otherUpdates: [{ className: "UpdateDeleteChannelMessages", messages: [9] }],
    });
    expect(withUpd.kind === "messages" && withUpd.otherUpdates).toHaveLength(1);
    const missing = classifyChannelDifference({
      className: "updates.ChannelDifference",
      pts: 5,
      newMessages: [],
    });
    expect(missing.kind === "messages" && missing.otherUpdates).toEqual([]);
  });

  it("treats a non-true `final` as not-final (keep draining)", () => {
    const c = classifyChannelDifference({
      className: "updates.ChannelDifference",
      pts: 1,
      newMessages: [],
    });
    expect(c.kind === "messages" && c.final).toBe(false);
  });

  it("defaults missing newMessages to an empty array", () => {
    const c = classifyChannelDifference({
      className: "updates.ChannelDifference",
      pts: 5,
    });
    expect(c.kind === "messages" && c.messages).toEqual([]);
  });

  it("classifies updates.ChannelDifferenceEmpty and reads its pts", () => {
    const c = classifyChannelDifference({
      className: "updates.ChannelDifferenceEmpty",
      pts: 215292,
      final: true,
    });
    expect(c).toEqual({ kind: "empty", newPts: 215292 });
  });

  it("classifies updates.ChannelDifferenceTooLong, reading pts from dialog (no messages)", () => {
    const c = classifyChannelDifference({
      className: "updates.ChannelDifferenceTooLong",
      dialog: { pts: 999 },
      messages: [rawMessage(), rawMessage({ id: 101 })], // must be ignored
    });
    expect(c).toEqual({ kind: "tooLong", newPts: 999 });
    // No `messages` field on the tooLong result — history is never bulk-ingested.
    expect((c as any).messages).toBeUndefined();
  });

  it("returns newPts null for TooLong without a dialog pts", () => {
    const c = classifyChannelDifference({
      className: "updates.ChannelDifferenceTooLong",
    });
    expect(c).toEqual({ kind: "tooLong", newPts: null });
  });

  it("returns unknown for an unexpected className", () => {
    expect(classifyChannelDifference({ className: "updates.State" })).toEqual({
      kind: "unknown",
      newPts: null,
    });
  });

  it("never throws on null / garbage input", () => {
    expect(classifyChannelDifference(null)).toEqual({ kind: "unknown", newPts: null });
    expect(classifyChannelDifference(undefined)).toEqual({ kind: "unknown", newPts: null });
    expect(classifyChannelDifference(42 as any)).toEqual({ kind: "unknown", newPts: null });
  });

  it("coerces a non-finite pts to null so it is never advanced to NaN", () => {
    const c = classifyChannelDifference({
      className: "updates.ChannelDifferenceEmpty",
      pts: "not-a-number",
    });
    expect(c).toEqual({ kind: "empty", newPts: null });
  });
});

describe("buildUsernameMap", () => {
  it("maps user id (string) to username and skips users without a username", () => {
    const map = buildUsernameMap([
      { id: 42, username: "alice" },
      { id: 43, username: null },
      { id: 44 },
      null,
      undefined,
    ]);
    expect(map.get("42")).toBe("alice");
    expect(map.has("43")).toBe(false);
    expect(map.has("44")).toBe(false);
    expect(map.size).toBe(1);
  });

  it("returns an empty map for empty / null input", () => {
    expect(buildUsernameMap([]).size).toBe(0);
    expect(buildUsernameMap(null).size).toBe(0);
    expect(buildUsernameMap(undefined).size).toBe(0);
  });
});

describe("normalizeDiffMessage", () => {
  it("normalizes a real message and joins the username from the map", () => {
    const map = buildUsernameMap([{ id: 42, username: "alice" }]);
    const n = normalizeDiffMessage(rawMessage(), map);
    expect(n).toEqual({
      id: 100,
      text: "hello support",
      date: 1_700_000_000,
      replyToMsgId: null,
      senderId: "42",
      senderUsername: "alice",
    });
  });

  it("extracts replyToMsgId when present", () => {
    const n = normalizeDiffMessage(
      rawMessage({ replyTo: { replyToMsgId: 77 } }),
      null,
    );
    expect(n?.replyToMsgId).toBe(77);
  });

  it("extracts senderId from a PeerChannel sender", () => {
    const n = normalizeDiffMessage(
      rawMessage({ fromId: { className: "PeerChannel", channelId: 555 } }),
      null,
    );
    expect(n?.senderId).toBe("555");
  });

  it("yields senderId null + empty username when fromId is missing", () => {
    const n = normalizeDiffMessage(rawMessage({ fromId: null }), null);
    expect(n?.senderId).toBeNull();
    expect(n?.senderUsername).toBe("");
  });

  it("returns null for a MessageService (join/pin/etc.)", () => {
    expect(
      normalizeDiffMessage({ className: "MessageService", id: 1 }, null),
    ).toBeNull();
  });

  it("returns null for a MessageEmpty", () => {
    expect(
      normalizeDiffMessage({ className: "MessageEmpty", id: 1 }, null),
    ).toBeNull();
  });

  it("returns null for media-only / empty text", () => {
    expect(normalizeDiffMessage(rawMessage({ message: "" }), null)).toBeNull();
    expect(normalizeDiffMessage(rawMessage({ message: null }), null)).toBeNull();
    expect(normalizeDiffMessage(rawMessage({ message: undefined }), null)).toBeNull();
  });

  it("returns null when the message has no id (cannot dedup)", () => {
    expect(normalizeDiffMessage(rawMessage({ id: null }), null)).toBeNull();
  });

  it("never throws on null / undefined raw input", () => {
    expect(normalizeDiffMessage(null, null)).toBeNull();
    expect(normalizeDiffMessage(undefined, null)).toBeNull();
  });
});

describe("sortDiffMessagesOldestFirst", () => {
  it("sorts ascending by id so parents precede replies", () => {
    const out = sortDiffMessagesOldestFirst([
      { id: 103 },
      { id: 101 },
      { id: 102 },
    ]);
    expect(out.map((m) => m.id)).toEqual([101, 102, 103]);
  });

  it("does not mutate the input array", () => {
    const input = [{ id: 2 }, { id: 1 }];
    sortDiffMessagesOldestFirst(input);
    expect(input.map((m) => m.id)).toEqual([2, 1]);
  });

  it("handles null / empty without throwing", () => {
    expect(sortDiffMessagesOldestFirst([])).toEqual([]);
    expect(sortDiffMessagesOldestFirst(null)).toEqual([]);
    expect(sortDiffMessagesOldestFirst(undefined)).toEqual([]);
  });
});

describe("extractChannelEditsDeletes", () => {
  it("extracts an edit (text is .message, not .text)", () => {
    const { edits, deletedIds } = extractChannelEditsDeletes([
      {
        className: "UpdateEditChannelMessage",
        message: { className: "Message", id: 140111, message: "edited body" },
      },
    ]);
    expect(edits).toEqual([{ id: 140111, text: "edited body" }]);
    expect(deletedIds).toEqual([]);
  });

  it("extracts deleted ids from UpdateDeleteChannelMessages", () => {
    const { edits, deletedIds } = extractChannelEditsDeletes([
      { className: "UpdateDeleteChannelMessages", messages: [11, 12, 13] },
    ]);
    expect(deletedIds).toEqual([11, 12, 13]);
    expect(edits).toEqual([]);
  });

  it("handles a mixed batch of edits and deletes", () => {
    const out = extractChannelEditsDeletes([
      { className: "UpdateNewChannelMessage" }, // ignored
      { className: "UpdateEditChannelMessage", message: { id: 5, message: "x" } },
      { className: "UpdateDeleteChannelMessages", messages: [7, 8] },
    ]);
    expect(out.edits).toEqual([{ id: 5, text: "x" }]);
    expect(out.deletedIds).toEqual([7, 8]);
  });

  it("skips an edit with empty/missing text or id", () => {
    const out = extractChannelEditsDeletes([
      { className: "UpdateEditChannelMessage", message: { id: 5, message: "" } },
      { className: "UpdateEditChannelMessage", message: { id: 6 } },
      { className: "UpdateEditChannelMessage", message: { message: "no id" } },
    ]);
    expect(out.edits).toEqual([]);
  });

  it("ignores unparseable / non-numeric ids and other-chat updates", () => {
    const out = extractChannelEditsDeletes([
      { className: "UpdateDeleteChannelMessages", messages: ["x", 9, null] },
      { className: "UpdateEditMessage", message: { id: 1, message: "dm" } }, // not a channel update
    ]);
    expect(out.deletedIds).toEqual([9]);
    expect(out.edits).toEqual([]);
  });

  it("never throws on null / empty / garbage input", () => {
    expect(extractChannelEditsDeletes(null)).toEqual({ edits: [], deletedIds: [] });
    expect(extractChannelEditsDeletes(undefined)).toEqual({ edits: [], deletedIds: [] });
    expect(extractChannelEditsDeletes([null, 1, "x"] as any)).toEqual({
      edits: [],
      deletedIds: [],
    });
  });
});
