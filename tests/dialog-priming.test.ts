import { describe, it, expect } from "vitest";
import { findTargetInDialogs } from "../dialog-priming";

const TARGET_GROUP = "OfficialQuidaxCommunity";
const TARGET_CHANNEL_ID = "2129818880";

// A realistic mixed dialog list (DMs, other groups, then the target).
const otherDialogs = [
  { id: "111", username: "some_user", title: null },
  { id: "222", username: "RandomCrypto", title: "Random Crypto Chat" },
  { id: "333", username: null, title: "Family group" },
];

describe("findTargetInDialogs — exact channel-id match (the priming check)", () => {
  it("finds the target by resolved channel id and reports channelId", () => {
    const dialogs = [
      ...otherDialogs,
      { id: TARGET_CHANNEL_ID, username: TARGET_GROUP, title: "Official Quidax Community" },
    ];
    const r = findTargetInDialogs(dialogs, TARGET_GROUP, TARGET_CHANNEL_ID);
    expect(r.present).toBe(true);
    expect(r.matchedBy).toBe("channelId");
    expect(r.matchedId).toBe(TARGET_CHANNEL_ID);
    expect(r.dialogCount).toBe(4);
  });

  it("matches GramJS BigInteger / numeric ids via string conversion", () => {
    expect(
      findTargetInDialogs(
        [{ id: BigInt(TARGET_CHANNEL_ID) }],
        TARGET_GROUP,
        TARGET_CHANNEL_ID,
      ).present,
    ).toBe(true);
    expect(
      findTargetInDialogs(
        [{ id: Number(TARGET_CHANNEL_ID) }],
        TARGET_GROUP,
        TARGET_CHANNEL_ID,
      ).present,
    ).toBe(true);
  });

  it("does NOT match a same-named dialog whose id differs (id is authoritative)", () => {
    // An impostor group with the right username but a different id must not pass
    // the exact-id check — mirrors isMessageInTargetGroup's authority rule.
    const dialogs = [{ id: "9999999999", username: TARGET_GROUP }];
    const r = findTargetInDialogs(dialogs, TARGET_GROUP, TARGET_CHANNEL_ID);
    expect(r.present).toBe(false);
    expect(r.matchedBy).toBe(null);
    expect(r.matchedId).toBe(null);
  });
});

describe("findTargetInDialogs — fallback while channel id unresolved", () => {
  it("matches on exact username when the channel id is not resolved yet", () => {
    const dialogs = [...otherDialogs, { id: "444", username: TARGET_GROUP }];
    const r = findTargetInDialogs(dialogs, TARGET_GROUP, null);
    expect(r.present).toBe(true);
    expect(r.matchedBy).toBe("fallback");
    expect(r.matchedId).toBe("444");
  });

  it("matches on a title containing 'quidax' (case-insensitive) when unresolved", () => {
    const dialogs = [{ id: "555", title: "QUIDAX Support" }];
    expect(findTargetInDialogs(dialogs, TARGET_GROUP, null).present).toBe(true);
  });
});

describe("findTargetInDialogs — ABSENT target reveals non-membership (H2)", () => {
  it("returns present:false when the target group is not in the dialog list", () => {
    // This is the signal that the account is not a member / is banned: getDialogs
    // succeeded but the group is absent, so no code change can revive live delivery.
    const r = findTargetInDialogs(otherDialogs, TARGET_GROUP, TARGET_CHANNEL_ID);
    expect(r.present).toBe(false);
    expect(r.matchedBy).toBe(null);
    expect(r.dialogCount).toBe(3);
  });
});

describe("findTargetInDialogs — empty / malformed input never crashes", () => {
  it("handles an empty dialog list", () => {
    const r = findTargetInDialogs([], TARGET_GROUP, TARGET_CHANNEL_ID);
    expect(r).toEqual({ present: false, matchedBy: null, matchedId: null, dialogCount: 0 });
  });

  it("handles null / undefined dialog list", () => {
    expect(findTargetInDialogs(null, TARGET_GROUP, TARGET_CHANNEL_ID).dialogCount).toBe(0);
    expect(findTargetInDialogs(undefined, TARGET_GROUP, TARGET_CHANNEL_ID).present).toBe(false);
  });

  it("skips null entries inside the list without throwing", () => {
    const dialogs = [null, undefined, { id: TARGET_CHANNEL_ID }];
    const r = findTargetInDialogs(dialogs, TARGET_GROUP, TARGET_CHANNEL_ID);
    expect(r.present).toBe(true);
    expect(r.dialogCount).toBe(3);
  });
});
