import { describe, it, expect } from "vitest";
import {
  parseBotList,
  buildBotSenderConfig,
  isBotSender,
} from "../bot-sender";

describe("parseBotList", () => {
  it("returns an empty set for undefined / empty", () => {
    expect(parseBotList(undefined).size).toBe(0);
    expect(parseBotList("").size).toBe(0);
    expect(parseBotList("   ").size).toBe(0);
  });

  it("splits, trims, and drops empties", () => {
    const s = parseBotList(" 111 , 222 ,, 333 ");
    expect([...s].sort()).toEqual(["111", "222", "333"]);
  });

  it("keeps ids verbatim (no lowercasing)", () => {
    expect(parseBotList("ABC123").has("ABC123")).toBe(true);
    expect(parseBotList("ABC123").has("abc123")).toBe(false);
  });

  it("lowercases and strips a leading @ when lowercase:true", () => {
    const s = parseBotList("@QuidaxPriceBot, WelcomeBot", { lowercase: true });
    expect(s.has("quidaxpricebot")).toBe(true);
    expect(s.has("welcomebot")).toBe(true);
    expect(s.has("QuidaxPriceBot")).toBe(false);
  });
});

describe("buildBotSenderConfig", () => {
  it("builds ids (verbatim) and usernames (lowercased)", () => {
    const cfg = buildBotSenderConfig("111,222", "@PriceBot");
    expect(cfg.ids.has("111")).toBe(true);
    expect(cfg.usernames.has("pricebot")).toBe(true);
  });

  it("is empty when both env vars are absent (dormant)", () => {
    const cfg = buildBotSenderConfig(undefined, undefined);
    expect(cfg.ids.size).toBe(0);
    expect(cfg.usernames.size).toBe(0);
  });
});

describe("isBotSender", () => {
  const cfg = buildBotSenderConfig("111,222", "PriceBot,@WelcomeBot");

  it("matches a denylisted id", () => {
    expect(isBotSender("111", "", cfg)).toBe(true);
    expect(isBotSender(222, "", cfg)).toBe(true); // numeric id coerced
  });

  it("matches a denylisted username case- and @-insensitively", () => {
    expect(isBotSender("999", "pricebot", cfg)).toBe(true);
    expect(isBotSender("999", "@PriceBot", cfg)).toBe(true);
    expect(isBotSender("999", "WELCOMEBOT", cfg)).toBe(true);
  });

  it("does NOT match a non-bot sender", () => {
    expect(isBotSender("999", "some_user", cfg)).toBe(false);
    expect(isBotSender("999", "", cfg)).toBe(false);
  });

  it("never matches under an empty config (dormant denylist)", () => {
    const empty = buildBotSenderConfig(undefined, undefined);
    expect(isBotSender("111", "pricebot", empty)).toBe(false);
  });

  it("handles missing / null sender fields without throwing", () => {
    expect(isBotSender(null, null, cfg)).toBe(false);
    expect(isBotSender(undefined, undefined, cfg)).toBe(false);
    expect(isBotSender("", "", cfg)).toBe(false);
  });
});
