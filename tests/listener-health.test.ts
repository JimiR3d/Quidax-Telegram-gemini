import { describe, it, expect } from "vitest";
import {
  isMessageInTargetGroup,
  matchPath,
  shouldReconnect,
} from "../listener-health";

const TARGET_GROUP = "OfficialQuidaxCommunity";
const TARGET_CHANNEL_ID = "1234567890";

describe("isMessageInTargetGroup — exact channel-id match (the fix)", () => {
  it("accepts a message whose chat id equals the resolved channel id", () => {
    expect(
      isMessageInTargetGroup(
        { id: "1234567890", username: "OfficialQuidaxCommunity" },
        TARGET_GROUP,
        TARGET_CHANNEL_ID,
      ),
    ).toBe(true);
  });

  it("rejects a DM/other chat even if its title mentions quidax", () => {
    // The old fuzzy match would have accepted this; the exact id match does not.
    expect(
      isMessageInTargetGroup(
        { id: "9876543210", title: "Quidax fan chat" },
        TARGET_GROUP,
        TARGET_CHANNEL_ID,
      ),
    ).toBe(false);
  });

  it("rejects a DM with no title or username", () => {
    expect(
      isMessageInTargetGroup({ id: "555000111" }, TARGET_GROUP, TARGET_CHANNEL_ID),
    ).toBe(false);
  });

  it("matches GramJS BigInteger ids via string conversion", () => {
    expect(
      isMessageInTargetGroup(
        { id: BigInt("1234567890") },
        TARGET_GROUP,
        TARGET_CHANNEL_ID,
      ),
    ).toBe(true);
    expect(
      isMessageInTargetGroup(
        { id: 1234567890 },
        TARGET_GROUP,
        TARGET_CHANNEL_ID,
      ),
    ).toBe(true);
  });
});

describe("isMessageInTargetGroup — fallback while channel id unresolved", () => {
  it("matches on exact username when the channel id is not resolved yet", () => {
    expect(
      isMessageInTargetGroup(
        { id: "1234567890", username: "OfficialQuidaxCommunity" },
        TARGET_GROUP,
        null,
      ),
    ).toBe(true);
  });

  it("matches on a title containing the group name when unresolved", () => {
    expect(
      isMessageInTargetGroup(
        { id: "1234567890", title: "OfficialQuidaxCommunity (main)" },
        TARGET_GROUP,
        null,
      ),
    ).toBe(true);
  });

  it("matches on a title containing 'quidax' (case-insensitive) when unresolved", () => {
    expect(
      isMessageInTargetGroup(
        { id: "1234567890", title: "QUIDAX Support" },
        TARGET_GROUP,
        null,
      ),
    ).toBe(true);
  });

  it("falls back when the resolved id is present but the chat carries no id", () => {
    expect(
      isMessageInTargetGroup(
        { username: "OfficialQuidaxCommunity" },
        TARGET_GROUP,
        TARGET_CHANNEL_ID,
      ),
    ).toBe(true);
  });

  it("rejects an unrelated chat while unresolved", () => {
    expect(
      isMessageInTargetGroup(
        { id: "777", username: "SomeRandomGroup", title: "Random" },
        TARGET_GROUP,
        null,
      ),
    ).toBe(false);
  });
});

describe("isMessageInTargetGroup — malformed input never crashes", () => {
  it("returns false for null/undefined chat", () => {
    expect(isMessageInTargetGroup(null, TARGET_GROUP, TARGET_CHANNEL_ID)).toBe(
      false,
    );
    expect(
      isMessageInTargetGroup(undefined, TARGET_GROUP, TARGET_CHANNEL_ID),
    ).toBe(false);
  });
});

describe("matchPath — instrumentation for the live observation window", () => {
  it("reports channelId when id and resolved id are both present", () => {
    expect(matchPath({ id: "1234567890" }, TARGET_CHANNEL_ID)).toBe("channelId");
  });
  it("reports fallback when the channel id is unresolved", () => {
    expect(matchPath({ id: "1234567890" }, null)).toBe("fallback");
  });
  it("reports fallback when the chat carries no id", () => {
    expect(matchPath({ username: "x" }, TARGET_CHANNEL_ID)).toBe("fallback");
  });
});

describe("shouldReconnect — watchdog elapsed-time rule", () => {
  const THRESHOLD = 30 * 60 * 1000; // 30 minutes

  it("does NOT reconnect inside the silence window", () => {
    const now = 1_000_000_000_000;
    expect(shouldReconnect(now - 29 * 60 * 1000, now, THRESHOLD)).toBe(false);
  });

  it("does NOT reconnect exactly at the threshold (strict >)", () => {
    const now = 1_000_000_000_000;
    expect(shouldReconnect(now - THRESHOLD, now, THRESHOLD)).toBe(false);
  });

  it("reconnects once past the threshold", () => {
    const now = 1_000_000_000_000;
    expect(shouldReconnect(now - 31 * 60 * 1000, now, THRESHOLD)).toBe(true);
  });
});
