import { describe, it, expect } from "vitest";
import {
  decideClassificationOutcome,
  isCategoryFallback,
  AUTO_DISMISS_CATEGORIES,
} from "../classification-policy";

const td = (over: Partial<any> = {}) => ({
  category: "Withdrawal Issue",
  urgency: "Medium",
  summary: "User cannot withdraw",
  ...over,
});

const flags = (over: Partial<any> = {}) => ({
  isAdminSender: false,
  isResolution: false,
  isPreFiltered: false,
  ...over,
});

describe("isCategoryFallback", () => {
  it("is false for a genuine General Question the model actually said", () => {
    expect(isCategoryFallback("General Question", "General Question")).toBe(
      false,
    );
    expect(isCategoryFallback("General Question", "general enquiry")).toBe(
      false,
    );
    expect(
      isCategoryFallback("General Question", "what is this question"),
    ).toBe(false);
  });

  it("is true when category was missing (Zod .catch defaulted it)", () => {
    expect(isCategoryFallback("General Question", undefined)).toBe(true);
    expect(isCategoryFallback("General Question", null)).toBe(true);
  });

  it("is true when an unknown label was defaulted by normalizeCategory", () => {
    expect(isCategoryFallback("General Question", "Banana")).toBe(true);
    expect(isCategoryFallback("General Question", "lorem ipsum")).toBe(true);
  });

  it("is false for any non-General-Question category", () => {
    expect(isCategoryFallback("Withdrawal Issue", "withdraw")).toBe(false);
    expect(isCategoryFallback("Spam/Irrelevant", undefined)).toBe(false);
  });
});

describe("decideClassificationOutcome - auto-dismiss policy", () => {
  it("dismisses only Spam/Irrelevant, Praise, and Community Chat", () => {
    expect(AUTO_DISMISS_CATEGORIES).toEqual([
      "Praise",
      "Spam/Irrelevant",
      "Community Chat",
    ]);
    expect(
      decideClassificationOutcome(td({ category: "Spam/Irrelevant" }), flags())
        .status,
    ).toBe("Dismissed");
    expect(
      decideClassificationOutcome(td({ category: "Praise" }), flags()).status,
    ).toBe("Dismissed");
    expect(
      decideClassificationOutcome(td({ category: "Community Chat" }), flags())
        .status,
    ).toBe("Dismissed");
  });

  it("forces Community Chat to Low urgency (like General Question)", () => {
    const o = decideClassificationOutcome(
      td({ category: "Community Chat", urgency: "High" }),
      flags(),
    );
    expect(o.status).toBe("Dismissed");
    expect(o.urgency).toBe("Low");
  });

  it("keeps General Question Open at Low urgency (no longer dismissed)", () => {
    const o = decideClassificationOutcome(
      td({ category: "General Question", urgency: "Medium" }),
      flags(),
    );
    expect(o.status).toBe("Open");
    expect(o.urgency).toBe("Low");
    expect(o.summary).toBe("User cannot withdraw");
  });

  it("a real issue stays Open", () => {
    expect(
      decideClassificationOutcome(
        td({ category: "Withdrawal Issue", urgency: "Medium" }),
        flags(),
      ).status,
    ).toBe("Open");
  });

  it("keeps a fresh Critical issue Open, flagged [ESCALATED] (never In Review)", () => {
    // "In Review" renders as "Admin Replied" on the dashboard — dishonest for
    // a ticket no admin has touched (Phase 3, 2026-07-02).
    const o = decideClassificationOutcome(
      td({ category: "Withdrawal Issue", urgency: "Critical" }),
      flags(),
    );
    expect(o.status).toBe("Open");
    expect(o.summary).toBe("[ESCALATED] User cannot withdraw");
  });

  it("dismisses pre-filtered chatter regardless of category", () => {
    expect(
      decideClassificationOutcome(
        td({ category: "General Question" }),
        flags({ isPreFiltered: true }),
      ).status,
    ).toBe("Dismissed");
  });

  it("admin and user-resolution messages resolve", () => {
    expect(
      decideClassificationOutcome(td(), flags({ isAdminSender: true })).status,
    ).toBe("Resolved");
    expect(
      decideClassificationOutcome(td(), flags({ isResolution: true })).status,
    ).toBe("Resolved");
  });
});

describe("decideClassificationOutcome - failed classifications are never dismissible", () => {
  it("keeps a failed classification Open and flags [NEEDS REVIEW]", () => {
    const o = decideClassificationOutcome(
      td({
        category: "General Question",
        summary: "Unable to classify message",
        classification_failed: true,
      }),
      flags(),
    );
    expect(o.status).toBe("Open");
    expect(o.summary).toBe("[NEEDS REVIEW] Unable to classify message");
  });

  it("never dismisses a failure even if it parsed to Spam", () => {
    // Defensive: a failure flag wins over a dismissible category.
    const o = decideClassificationOutcome(
      td({ category: "Spam/Irrelevant", classification_failed: true }),
      flags(),
    );
    expect(o.status).toBe("Open");
  });

  it("never escalates a failure even if urgency parsed Critical", () => {
    const o = decideClassificationOutcome(
      td({ urgency: "Critical", classification_failed: true }),
      flags(),
    );
    expect(o.status).toBe("Open");
    expect(o.summary.startsWith("[NEEDS REVIEW]")).toBe(true);
  });

  it("a failed admin message still resolves (admin path wins)", () => {
    expect(
      decideClassificationOutcome(
        td({ classification_failed: true }),
        flags({ isAdminSender: true }),
      ).status,
    ).toBe("Resolved");
  });
});
