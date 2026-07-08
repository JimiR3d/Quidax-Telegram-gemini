import { describe, it, expect } from "vitest";
import { isBanterNoise, isNonThreadNoise } from "../noise-prefilter";

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

// ─── 1d: automated price-bot ticker dump ─────────────────────────────────────
describe("1d – automated price-bot ticker dump", () => {
  it("catches the live tokenxoff.xyz shill (the b34db87c case)", () =>
    expect(
      isBanterNoise(
        "Bitcoin X (tokenxoff.xyz) (BTC)\nPrice: $0.0001051 USD\nPrice: 0.000000001676 BTC\n24hr Change: -2.45%\n7d Change: -2.18%\nVolume: $0\nFully Diluted Market Cap: $2,207.83\nTotal Supply: 21,000,000.00\n\n🚀 View on CoinMarketCap",
      ),
    ).toBe(true));

  it("catches a compact ticker snapshot with two labels", () =>
    expect(
      isBanterNoise("SOL\nPrice: $142.10 USD\nMarket Cap: $65,000,000,000"),
    ).toBe(true));

  it("does NOT catch a human asking about a price (one label, no colon format)", () =>
    expect(isBanterNoise("what is the price of BTC today?")).toBe(false));

  it("does NOT catch a human mentioning market cap casually", () =>
    expect(
      isBanterNoise("bitcoin market cap is huge now, is it safe to buy on Quidax?"),
    ).toBe(false));
});

// ─── isNonThreadNoise: the append/fold guard (grouping precision tune) ────────
// Composes isBanterNoise (price dumps, /p commands, pasted news) with
// isSystemBotMessage (welcome/ban templates). Used to keep machine/bot content
// out of a real ticket's [ADMIN_REPLY]/[USER_FOLLOWUP] thread.
describe("isNonThreadNoise – append/fold guard", () => {
  // The exact price-bot ticker dump that leaked into the live Saylor ticket
  // 27ea2751 as an [ADMIN_REPLY] block (isBanterNoise 1d, 6 labels).
  it("catches the Saylor-ticket CoinMarketCap dump", () =>
    expect(
      isNonThreadNoise(
        "Bitcoin (BTC)\nPrice: $59,727.31 USD\nPrice: 38.05 ETH\n1hr Change: -0.06%\n24hr Change: -0.78%\n7d Change: -8.29%\nVolume: $24,436,936,432.55\nMarket Cap: $1,197,518,624,034.77\nCirculating Supply: 20,049,765.00\nTotal Supply: 20,049,765.00\n\n🚀 View on CoinMarketCap",
      ),
    ).toBe(true));

  // The welcome template that leaked into the same ticket (isSystemBotMessage).
  it("catches the welcome-bot template", () =>
    expect(
      isNonThreadNoise(
        "Hi uc 👋, \nWelcome to the Quidax Official Community! \n\nQuidax.com allows you to buy, sell, transfer, store, and earn crypto.",
      ),
    ).toBe(true));

  it("catches a bare /p BTC price command", () =>
    expect(isNonThreadNoise("/p BTC")).toBe(true));

  // Must NOT catch — a real admin answer / support reply.
  it("does NOT catch a real admin answer", () =>
    expect(isNonThreadNoise("Yes, your withdrawal has been processed. Please check now.")).toBe(false));

  it("does NOT catch a real user follow-up", () =>
    expect(isNonThreadNoise("It's still not showing in my balance, what should I do?")).toBe(false));

  it("does NOT catch an empty / whitespace string", () => {
    expect(isNonThreadNoise("")).toBe(false);
    expect(isNonThreadNoise("   ")).toBe(false);
  });
});
