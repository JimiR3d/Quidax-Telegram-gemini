import { describe, it, expect } from "vitest";
import {
  isSweepEligible,
  sweepCandidateIds,
  selectMessagesToIngest,
} from "../autofetch-dedup";

// A fixed "now" and a 2-hour lookback cutoff, matching runAutoFetch.
const NOW = 1_000_000; // unix seconds
const CUTOFF = NOW - 2 * 60 * 60; // 992800

const recent = (id: number, text = "help") => ({ id, text, date: NOW - 60 });

describe("isSweepEligible", () => {
  it("accepts a recent message with text", () => {
    expect(isSweepEligible(recent(1), CUTOFF)).toBe(true);
  });

  it("rejects a message with no text (media-only / empty)", () => {
    expect(isSweepEligible({ id: 1, text: "", date: NOW }, CUTOFF)).toBe(false);
    expect(isSweepEligible({ id: 1, text: null, date: NOW }, CUTOFF)).toBe(false);
  });

  it("rejects a message older than the lookback cutoff", () => {
    expect(isSweepEligible({ id: 1, text: "old", date: CUTOFF - 1 }, CUTOFF)).toBe(false);
  });

  it("accepts a message exactly at the cutoff (inclusive boundary)", () => {
    expect(isSweepEligible({ id: 1, text: "edge", date: CUTOFF }, CUTOFF)).toBe(true);
  });

  it("never throws on null / undefined", () => {
    expect(isSweepEligible(null, CUTOFF)).toBe(false);
    expect(isSweepEligible(undefined, CUTOFF)).toBe(false);
  });
});

describe("sweepCandidateIds", () => {
  it("returns string ids only for eligible messages", () => {
    const messages = [
      recent(101),
      { id: 102, text: "", date: NOW }, // no text
      { id: 103, text: "old", date: CUTOFF - 5 }, // too old
      recent(104),
    ];
    expect(sweepCandidateIds(messages, CUTOFF)).toEqual(["101", "104"]);
  });

  it("skips messages with a null id", () => {
    const messages = [{ id: null, text: "hi", date: NOW }, recent(7)];
    expect(sweepCandidateIds(messages, CUTOFF)).toEqual(["7"]);
  });

  it("handles an empty / null list without throwing", () => {
    expect(sweepCandidateIds([], CUTOFF)).toEqual([]);
    expect(sweepCandidateIds(null, CUTOFF)).toEqual([]);
    expect(sweepCandidateIds(undefined, CUTOFF)).toEqual([]);
  });
});

describe("selectMessagesToIngest", () => {
  it("drops messages whose id is already ingested, keeps new ones", () => {
    const messages = [recent(201), recent(202), recent(203)];
    const already = new Set(["202"]);
    const out = selectMessagesToIngest(messages, already, CUTOFF);
    expect(out.map((m) => m.id)).toEqual([201, 203]);
  });

  it("matches already-ingested ids by string regardless of numeric vs string id", () => {
    // GramJS gives numeric ids; the DB returns telegram_message_id as a string.
    const messages = [recent(300), recent(301)];
    const already = new Set(["300"]); // string, as returned from Supabase
    const out = selectMessagesToIngest(messages, already, CUTOFF);
    expect(out.map((m) => m.id)).toEqual([301]);
  });

  it("still applies eligibility (text + cutoff) on top of the dedup", () => {
    const messages = [
      recent(401),
      { id: 402, text: "", date: NOW }, // ineligible: no text
      { id: 403, text: "old", date: CUTOFF - 1 }, // ineligible: too old
      recent(404),
    ];
    const out = selectMessagesToIngest(messages, new Set<string>(), CUTOFF);
    expect(out.map((m) => m.id)).toEqual([401, 404]);
  });

  it("preserves input order (so oldest-first reversal upstream is honored)", () => {
    const messages = [recent(1), recent(2), recent(3), recent(4)];
    const out = selectMessagesToIngest(messages, new Set<string>(), CUTOFF);
    expect(out.map((m) => m.id)).toEqual([1, 2, 3, 4]);
  });

  it("returns everything when nothing is ingested yet (first sweep)", () => {
    const messages = [recent(11), recent(12)];
    expect(selectMessagesToIngest(messages, new Set<string>(), CUTOFF)).toHaveLength(2);
  });

  it("returns nothing when the whole window is already ingested (steady state)", () => {
    const messages = [recent(21), recent(22)];
    const already = new Set(["21", "22"]);
    expect(selectMessagesToIngest(messages, already, CUTOFF)).toEqual([]);
  });

  it("handles an empty / null list without throwing", () => {
    expect(selectMessagesToIngest([], new Set<string>(), CUTOFF)).toEqual([]);
    expect(selectMessagesToIngest(null, new Set<string>(), CUTOFF)).toEqual([]);
  });
});
