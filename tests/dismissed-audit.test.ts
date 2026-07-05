import { describe, it, expect } from "vitest";
import {
  findActionableSignals,
  buildAuditSnippet,
  urgencyContradictionLabel,
  AUDIT_SNIPPET_LEN,
} from "../dismissed-audit";

describe("findActionableSignals — flags real issues", () => {
  it("flags the exact audit find: a bare refund request", () => {
    expect(findActionableSignals("Pls do a refund")).toContain("refund");
  });

  it("flags refund variants", () => {
    expect(findActionableSignals("I want to be refunded now")).toContain("refund");
    expect(findActionableSignals("any update on refunds?")).toContain("refund");
  });

  it("flags a stuck withdrawal (either word order)", () => {
    expect(findActionableSignals("my withdrawal is stuck")).toContain("stuck funds");
    expect(findActionableSignals("stuck withdrawal since yesterday")).toContain("stuck funds");
  });

  it("flags money that never arrived, including Pidgin phrasings", () => {
    expect(findActionableSignals("money never enter my account")).toContain("stuck funds");
    expect(findActionableSignals("dem don chop my money")).toContain("stuck funds");
    expect(findActionableSignals("USDT not yet received")).toContain("stuck funds");
  });

  it("flags being locked out of the account", () => {
    expect(findActionableSignals("my account has been blocked")).toContain("account access");
    expect(findActionableSignals("I can't login to the app")).toContain("account access");
    expect(findActionableSignals("i no fit access my account")).toContain("account access");
  });

  it("flags first-person hack/scam claims", () => {
    expect(findActionableSignals("my account was hacked")).toContain("hacked/stolen");
    expect(findActionableSignals("they scammed me of 50k")).toContain("hacked/stolen");
  });

  it("flags KYC verification that is going wrong", () => {
    expect(findActionableSignals("my kyc has been pending for days")).toContain("kyc stuck");
    expect(findActionableSignals("verification failed again")).toContain("kyc stuck");
  });

  it("can return multiple labels for a compound complaint", () => {
    const labels = findActionableSignals(
      "my withdrawal is stuck and now my account is blocked",
    );
    expect(labels).toContain("stuck funds");
    expect(labels).toContain("account access");
  });
});

describe("findActionableSignals — stays quiet on banter (precision bias)", () => {
  it("ignores greetings and small talk", () => {
    expect(findActionableSignals("gm fam, how una dey")).toEqual([]);
    expect(findActionableSignals("lol that's funny")).toEqual([]);
  });

  it("ignores price talk without a problem", () => {
    expect(findActionableSignals("BTC is pumping today, buy the dip")).toEqual([]);
  });

  it("ignores third-party anti-scam warnings (no first person)", () => {
    expect(
      findActionableSignals("Beware of scammers. Do not respond to anyone in your DM"),
    ).toEqual([]);
  });

  it("ignores a plain money word with no problem term", () => {
    expect(findActionableSignals("what is the withdrawal fee?")).toEqual([]);
  });

  it("ignores a plain how-to verification question with no trouble term", () => {
    expect(findActionableSignals("how do I verify?")).toEqual([]);
  });

  it("handles empty and non-string input", () => {
    expect(findActionableSignals("")).toEqual([]);
    expect(findActionableSignals("   ")).toEqual([]);
    expect(findActionableSignals(null as unknown as string)).toEqual([]);
  });
});

describe("urgencyContradictionLabel — urgent-is-never-noise flag", () => {
  it("flags a Dismissed ticket the AI itself rated High or Critical", () => {
    expect(urgencyContradictionLabel("High")).toBe("AI-rated High");
    expect(urgencyContradictionLabel("Critical")).toBe("AI-rated Critical");
  });

  it("stays quiet for Medium/Low (the normal Dismissed population)", () => {
    expect(urgencyContradictionLabel("Medium")).toBeNull();
    expect(urgencyContradictionLabel("Low")).toBeNull();
  });

  it("handles null, undefined, and non-enum values safely", () => {
    expect(urgencyContradictionLabel(null)).toBeNull();
    expect(urgencyContradictionLabel(undefined)).toBeNull();
    expect(urgencyContradictionLabel(3)).toBeNull();
    // Exact enum casing only — never invent a flag from a garbage column.
    expect(urgencyContradictionLabel("high")).toBeNull();
  });
});

describe("buildAuditSnippet", () => {
  it("collapses whitespace and trims", () => {
    expect(buildAuditSnippet("  hello\n\n   world  ")).toBe("hello world");
  });

  it("bounds long text with an ellipsis at the limit", () => {
    const long = "a".repeat(AUDIT_SNIPPET_LEN * 2);
    const snippet = buildAuditSnippet(long);
    expect(snippet.length).toBe(AUDIT_SNIPPET_LEN);
    expect(snippet.endsWith("…")).toBe(true);
  });

  it("leaves short text untouched", () => {
    expect(buildAuditSnippet("Pls do a refund")).toBe("Pls do a refund");
  });

  it("handles null safely", () => {
    expect(buildAuditSnippet(null as unknown as string)).toBe("");
  });
});
