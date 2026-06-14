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
  it("has exactly 20 cases (12 English + 6 Pidgin + 2 feature-existence)", () => {
    expect(BENCHMARK_CASES).toHaveLength(20);
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

  it("includes at least 4 Pidgin cases covering the KNOWN_ISSUES §3 phrases", () => {
    const all = BENCHMARK_CASES.map((c) => c.message).join("\n");
    expect(all).toMatch(/abeg/i);
    expect(all).toMatch(/money never enter|e never enter|never enter/i);
    expect(all).toMatch(/dem block|block my account/i);
    expect(all).toMatch(/e don do/i);
  });

  it("Pidgin cases have valid categories and urgencies", () => {
    const pidginCases = BENCHMARK_CASES.filter((c) => c.id >= 13 && c.id <= 18);
    expect(pidginCases.length).toBe(6);
    for (const c of pidginCases) {
      expect(VALID_CATEGORIES).toContain(c.expectedCategory);
      expect(VALID_URGENCIES).toContain(c.expectedUrgency);
    }
  });

  it("includes feature-existence cases (Bug 4b) expecting General Question", () => {
    const featureCases = BENCHMARK_CASES.filter((c) => c.id >= 19);
    expect(featureCases.length).toBe(2);
    for (const c of featureCases) {
      expect(c.expectedCategory).toBe("General Question");
    }
  });
});
