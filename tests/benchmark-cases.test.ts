import { describe, it, expect } from "vitest";
import { BENCHMARK_CASES } from "../benchmark-cases";

// Mirrors VALID_CATEGORIES / VALID_URGENCIES in server.ts (~248 / ~266).
// Those constants are not exported, so they are duplicated here on purpose —
// same convention the other test files follow. If server.ts changes its enums,
// this guard should be updated to match.
const VALID_CATEGORIES = [
  "Withdrawal Issue",
  "Deposit Issue",
  "KYC/Verification",
  "Trading Problem",
  "App Bug",
  "Fee Complaint",
  "Account Access",
  "Network/Downtime",
  "General Question",
  "Praise",
  "Spam/Irrelevant",
];
const VALID_URGENCIES = ["Critical", "High", "Medium", "Low"];

describe("benchmark-cases — the gold fixture that ships to production", () => {
  it("has exactly 12 cases", () => {
    expect(BENCHMARK_CASES).toHaveLength(12);
  });

  it("has unique ids", () => {
    const ids = BENCHMARK_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every case has a non-empty message", () => {
    for (const c of BENCHMARK_CASES) {
      expect(typeof c.message).toBe("string");
      expect(c.message.trim().length).toBeGreaterThan(0);
    }
  });

  it("every expectedCategory is a valid classifier category", () => {
    for (const c of BENCHMARK_CASES) {
      expect(VALID_CATEGORIES).toContain(c.expectedCategory);
    }
  });

  it("every expectedUrgency is a valid urgency level", () => {
    for (const c of BENCHMARK_CASES) {
      expect(VALID_URGENCIES).toContain(c.expectedUrgency);
    }
  });

  it("every case carries the fields the eval endpoint and CLI read", () => {
    for (const c of BENCHMARK_CASES) {
      expect(typeof c.id).toBe("number");
      expect(typeof c.description).toBe("string");
      expect(typeof c.expectedIsComplaint).toBe("boolean");
    }
  });
});
