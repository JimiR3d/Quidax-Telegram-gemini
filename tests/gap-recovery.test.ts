import { describe, it, expect } from "vitest";
import {
  filterNewerThan,
  reachedCheckpoint,
  reachedAgeCutoff,
  capReached,
  nextOffsetId,
} from "../gap-recovery";

// getMessages returns newest-first; a "batch" below is ordered newest → oldest.
const NOW = 1_000_000; // unix seconds
const msg = (id: number, date = NOW) => ({ id, date });

describe("filterNewerThan", () => {
  it("keeps only messages with id strictly greater than the checkpoint", () => {
    const batch = [msg(105), msg(104), msg(103), msg(102)]; // stored max = 103
    expect(filterNewerThan(batch, 103).map((m) => m.id)).toEqual([105, 104]);
  });

  it("returns empty when the newest message IS the checkpoint (quiet group)", () => {
    const batch = [msg(200), msg(199), msg(198)];
    expect(filterNewerThan(batch, 200)).toEqual([]);
  });

  it("drops messages with an unusable (null/non-numeric) id", () => {
    const batch = [msg(10), { id: null, date: NOW }, { id: "x", date: NOW }, msg(9)];
    expect(filterNewerThan(batch, 5).map((m) => m.id)).toEqual([10, 9]);
  });

  it("applies the age cutoff, dropping messages older than it", () => {
    const cutoff = NOW - 60 * 60; // 1h ago
    const batch = [msg(10, NOW), msg(9, cutoff - 1), msg(8, cutoff + 1)];
    // id > 0 for all; 9 is too old → dropped; 8 is within window → kept.
    expect(filterNewerThan(batch, 0, cutoff).map((m) => m.id)).toEqual([10, 8]);
  });

  it("keeps a message with no date (defensive, err toward ingesting)", () => {
    const batch = [{ id: 10 }, { id: 9, date: NOW }];
    expect(filterNewerThan(batch, 0, NOW - 100).map((m) => m.id)).toEqual([10, 9]);
  });

  it("never throws on null / undefined / empty", () => {
    expect(filterNewerThan(null, 1)).toEqual([]);
    expect(filterNewerThan(undefined, 1)).toEqual([]);
    expect(filterNewerThan([], 1)).toEqual([]);
    expect(filterNewerThan([null, undefined], 1)).toEqual([]);
  });
});

describe("reachedCheckpoint", () => {
  it("is true when the batch contains a message at/below the checkpoint", () => {
    expect(reachedCheckpoint([msg(105), msg(104), msg(103)], 103)).toBe(true);
    expect(reachedCheckpoint([msg(105), msg(102)], 103)).toBe(true); // below
  });

  it("is false for a batch entirely newer than the checkpoint (keep paging)", () => {
    expect(reachedCheckpoint([msg(110), msg(109), msg(108)], 100)).toBe(false);
  });

  it("is true for an empty batch (no more history)", () => {
    expect(reachedCheckpoint([], 100)).toBe(true);
    expect(reachedCheckpoint(null, 100)).toBe(true);
  });

  it("ignores unusable ids when deciding", () => {
    // The only real id (110) is above the checkpoint → not reached yet.
    expect(reachedCheckpoint([msg(110), { id: null, date: NOW }], 100)).toBe(false);
  });
});

describe("reachedAgeCutoff", () => {
  it("is true once any message is older than the cutoff", () => {
    const cutoff = NOW - 60 * 60;
    expect(reachedAgeCutoff([msg(10, NOW), msg(9, cutoff - 1)], cutoff)).toBe(true);
  });

  it("is false when the whole batch is within the window", () => {
    const cutoff = NOW - 60 * 60;
    expect(reachedAgeCutoff([msg(10, NOW), msg(9, cutoff + 5)], cutoff)).toBe(false);
  });

  it("never throws on null / empty / dateless messages", () => {
    expect(reachedAgeCutoff([], NOW)).toBe(false);
    expect(reachedAgeCutoff(null, NOW)).toBe(false);
    expect(reachedAgeCutoff([{ id: 1 }], NOW)).toBe(false);
  });
});

describe("capReached", () => {
  it("is true only at or above the cap", () => {
    expect(capReached(499, 500)).toBe(false);
    expect(capReached(500, 500)).toBe(true);
    expect(capReached(501, 500)).toBe(true);
  });
});

describe("nextOffsetId", () => {
  it("returns the oldest id in a newest-first batch (its last element)", () => {
    expect(nextOffsetId([msg(105), msg(104), msg(103)])).toBe(103);
  });

  it("returns null for an empty / null batch (stop paging)", () => {
    expect(nextOffsetId([])).toBeNull();
    expect(nextOffsetId(null)).toBeNull();
  });

  it("returns null when the oldest id is unusable (stop paging safely)", () => {
    expect(nextOffsetId([msg(105), { id: null, date: NOW }])).toBeNull();
  });
});
