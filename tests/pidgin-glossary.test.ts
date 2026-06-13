import { describe, it, expect } from "vitest";
import { PIDGIN_TERMS, PIDGIN_GLOSSARY_PROMPT } from "../pidgin-glossary";

// Mirrors VALID_CATEGORIES / VALID_URGENCIES from server.ts (~248 / ~266).
// Duplicated here intentionally — same convention as other test files.
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

describe("pidgin-glossary — Nigerian Pidgin prompt section", () => {
  it("PIDGIN_TERMS is a non-empty array", () => {
    expect(Array.isArray(PIDGIN_TERMS)).toBe(true);
    expect(PIDGIN_TERMS.length).toBeGreaterThan(0);
  });

  it("every term has phrase, meaning, and hint fields", () => {
    for (const t of PIDGIN_TERMS) {
      expect(typeof t.phrase).toBe("string");
      expect(t.phrase.trim().length).toBeGreaterThan(0);
      expect(typeof t.meaning).toBe("string");
      expect(t.meaning.trim().length).toBeGreaterThan(0);
      expect(typeof t.hint).toBe("string");
      expect(t.hint.trim().length).toBeGreaterThan(0);
    }
  });

  it("PIDGIN_GLOSSARY_PROMPT is a non-empty string", () => {
    expect(typeof PIDGIN_GLOSSARY_PROMPT).toBe("string");
    expect(PIDGIN_GLOSSARY_PROMPT.trim().length).toBeGreaterThan(0);
  });

  it("prompt covers the four key Pidgin phrases called out in KNOWN_ISSUES §3", () => {
    const p = PIDGIN_GLOSSARY_PROMPT;
    expect(p).toMatch(/e don do/i);
    expect(p).toMatch(/money never enter|e never enter/i);
    expect(p).toMatch(/dem block/i);
    expect(p).toMatch(/abeg/i);
  });

  it("prompt includes worked examples with valid categories", () => {
    // Extract category names mentioned after '→' in the examples section.
    const matches = PIDGIN_GLOSSARY_PROMPT.matchAll(/→\s*([A-Za-z/]+(?:\s[A-Za-z/]+)*),/g);
    const foundCategories = [...matches].map((m) => m[1].trim());
    expect(foundCategories.length).toBeGreaterThan(0);
    for (const cat of foundCategories) {
      expect(VALID_CATEGORIES).toContain(cat);
    }
  });

  it("prompt includes worked examples with valid urgencies", () => {
    const validUrgencies = ["Critical", "High", "Medium", "Low"];
    const matches = PIDGIN_GLOSSARY_PROMPT.matchAll(/,\s*(Critical|High|Medium|Low)\b/g);
    const foundUrgencies = [...matches].map((m) => m[1]);
    expect(foundUrgencies.length).toBeGreaterThan(0);
    for (const u of foundUrgencies) {
      expect(validUrgencies).toContain(u);
    }
  });

  it("prompt examples use different wording from benchmark cases 13-18", () => {
    // Guard that the key distinguishing phrases of each benchmark Pidgin case
    // are NOT present verbatim in the glossary examples, so /api/eval measures
    // generalisation and not memorisation.
    const p = PIDGIN_GLOSSARY_PROMPT;
    expect(p).not.toMatch(/abeg help me o/i);               // case 13
    expect(p).not.toMatch(/200 USDT.*TRC20/i);               // case 14
    expect(p).not.toMatch(/dem block my account since morning/i); // case 15
    expect(p).not.toMatch(/I don submit my NIN/i);           // case 16
    expect(p).not.toMatch(/Anytime I tap Portfolio/i);       // case 17
    expect(p).not.toMatch(/Quidax na correct exchange/i);    // case 18
  });
});
