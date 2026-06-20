import { describe, it, expect } from "vitest";
import { isBanterNoise } from "../noise-prefilter";

// ─── 1a: bare price/chart bot commands ───────────────────────────────────────
describe("1a – bare price/chart bot commands", () => {
  it("catches /p BTC", () => expect(isBanterNoise("/p BTC")).toBe(true));
  it("catches /p ZEC", () => expect(isBanterNoise("/p ZEC")).toBe(true));
  it("catches /p zec (lowercase)", () => expect(isBanterNoise("/p zec")).toBe(true));
  it("catches /p btc (lowercase)", () => expect(isBanterNoise("/p btc")).toBe(true));
  it("catches /price eth", () => expect(isBanterNoise("/price eth")).toBe(true));
  it("catches /c SOL", () => expect(isBanterNoise("/c SOL")).toBe(true));
  it("catches /chart xrp", () => expect(isBanterNoise("/chart xrp")).toBe(true));
  it("catches /p BTC with leading/trailing whitespace", () =>
    expect(isBanterNoise("  /p BTC  ")).toBe(true));

  // Must NOT catch — something follows the command
  it("does NOT catch /p BTC followed by a question", () =>
    expect(isBanterNoise("/p BTC why is it dropping?")).toBe(false));
  it("does NOT catch /p BTC with a sentence after it", () =>
    expect(isBanterNoise("/p BTC I think it will moon")).toBe(false));
  // Must NOT catch — not a price command
  it("does NOT catch a normal message starting with /", () =>
    expect(isBanterNoise("/start")).toBe(false));
});

// ─── 1b: pasted news / external promo ────────────────────────────────────────
describe("1b – pasted news / external promo", () => {
  it("catches a long third-person news paste (Iran/Strait of Hormuz)", () =>
    expect(
      isBanterNoise(
        "Iran to allow free transit through the Strait of Hormuz for 60 days under reported pact, easing global supply concerns and reducing tensions with international shipping partners.",
      ),
    ).toBe(true));

  it("catches a long third-person promo paste (Bleep! platform)", () =>
    expect(
      isBanterNoise(
        "I found this impartial social networking platform, Bleep!, it aims to foster global unity through anti-radicalization measures, creating a safe space for meaningful discussions and connections across the world.",
      ),
    ).toBe(false)); // has "I found" → first-person → NOT caught

  it("catches a Breaking News style paste", () =>
    expect(
      isBanterNoise(
        "Breaking: The United States Federal Reserve has signalled a pause in interest rate hikes, citing slowing inflation data and concerns about economic growth in the coming quarters.",
      ),
    ).toBe(true));

  it("catches a long third-person tech announcement", () =>
    expect(
      isBanterNoise(
        "Apple has announced the launch of its next-generation iPhone series featuring advanced AI capabilities, improved battery life, and a new titanium chassis design across all premium models.",
      ),
    ).toBe(true));

  // Must NOT catch — first-person pronoun
  it("does NOT catch a message with first-person pronoun despite being long", () =>
    expect(
      isBanterNoise(
        "I have been using this platform for months and I think the recent changes have been positive for the overall experience of users in the community.",
      ),
    ).toBe(false));

  // Must NOT catch — contains a question mark
  it("does NOT catch a long message that ends with a question mark", () =>
    expect(
      isBanterNoise(
        "Iran to allow free transit through the Strait of Hormuz for 60 days under reported pact, easing global supply concerns. What does this mean for crypto?",
      ),
    ).toBe(false));

  // Must NOT catch — contains Quidax keyword
  it("does NOT catch a long message that mentions Quidax", () =>
    expect(
      isBanterNoise(
        "Reports suggest that Quidax has announced a new partnership with major African banks to expand crypto access across Nigeria and Ghana, with rollout planned for Q3.",
      ),
    ).toBe(false));

  // Must NOT catch — too short
  it("does NOT catch a short news-style sentence (< 25 words)", () =>
    expect(
      isBanterNoise("Iran signs peace deal with Hormuz partners."),
    ).toBe(false));

  // CRITICAL: the bc7abd76 real support question must never be caught
  it("does NOT catch bc7abd76 real support question (deposit crypto / assets lost)", () =>
    expect(
      isBanterNoise(
        "Is true that if I deposit crypto from another wallet into my quidax wallet my assets may lost?",
      ),
    ).toBe(false));
});

// ─── Must never catch real support issues ────────────────────────────────────
describe("real support issues — must never be caught", () => {
  it("does NOT catch a withdrawal complaint", () =>
    expect(
      isBanterNoise("My withdrawal has been pending for 3 days, please help me resolve this"),
    ).toBe(false));

  it("does NOT catch a deposit issue", () =>
    expect(
      isBanterNoise("I deposited USDT 2 hours ago and it hasn't reflected in my balance"),
    ).toBe(false));

  it("does NOT catch a Pidgin support message", () =>
    expect(isBanterNoise("Abeg my money never enter my account, wetin dey happen?")).toBe(false));

  it("does NOT catch an account access issue", () =>
    expect(
      isBanterNoise("I cannot login to my account, it says invalid credentials"),
    ).toBe(false));

  it("does NOT catch a KYC issue", () =>
    expect(
      isBanterNoise("My KYC verification has been pending for over a week now"),
    ).toBe(false));

  it("does NOT catch an empty string", () =>
    expect(isBanterNoise("")).toBe(false));
});
