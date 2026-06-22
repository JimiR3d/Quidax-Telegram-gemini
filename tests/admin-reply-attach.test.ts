import { describe, it, expect } from "vitest";
import {
  selectAdminAttachTarget,
  ADMIN_UNQUOTED_ATTACH_WINDOW_MS,
  type AdminAttachCandidate,
} from "../admin-reply-attach";

const MIN = 60 * 1000;
const NOW = 1_750_000_000_000; // fixed epoch ms for deterministic boundaries

// Build a candidate whose last activity is `minsAgo` before the admin reply.
function cand(id: string, minsAgo: number): AdminAttachCandidate {
  return { id, last_message_at: new Date(NOW - minsAgo * MIN).toISOString() };
}

describe("constants", () => {
  it("defaults the un-quoted attach window to 30 minutes", () => {
    // No env override in the test runner.
    expect(ADMIN_UNQUOTED_ATTACH_WINDOW_MS).toBe(30 * MIN);
  });
});

describe("selectAdminAttachTarget", () => {
  it("attaches to a single in-window candidate", () => {
    const t = cand("a", 10);
    expect(selectAdminAttachTarget([t], NOW)?.id).toBe("a");
  });

  it("returns null when the only candidate is older than the window", () => {
    expect(selectAdminAttachTarget([cand("a", 45)], NOW)).toBeNull();
  });

  it("picks the most-recently-active of several in-window candidates", () => {
    const chosen = selectAdminAttachTarget(
      [cand("old", 25), cand("recent", 3), cand("mid", 12)],
      NOW,
    );
    expect(chosen?.id).toBe("recent");
  });

  it("ignores candidates whose last activity is AFTER the admin reply (out-of-order)", () => {
    const future: AdminAttachCandidate = {
      id: "future",
      last_message_at: new Date(NOW + 5 * MIN).toISOString(),
    };
    expect(selectAdminAttachTarget([future], NOW)).toBeNull();
    // ...but still selects a valid older one alongside it.
    expect(selectAdminAttachTarget([future, cand("ok", 8)], NOW)?.id).toBe("ok");
  });

  it("treats exactly the window boundary as inclusive, one ms past as excluded", () => {
    const atEdge = cand("edge", 0); // override below for ms precision
    atEdge.last_message_at = new Date(NOW - ADMIN_UNQUOTED_ATTACH_WINDOW_MS).toISOString();
    expect(selectAdminAttachTarget([atEdge], NOW)?.id).toBe("edge");
    const pastEdge: AdminAttachCandidate = {
      id: "past",
      last_message_at: new Date(NOW - ADMIN_UNQUOTED_ATTACH_WINDOW_MS - 1).toISOString(),
    };
    expect(selectAdminAttachTarget([pastEdge], NOW)).toBeNull();
  });

  it("falls back to created_at when last_message_at is null", () => {
    const legacy: AdminAttachCandidate = {
      id: "legacy",
      last_message_at: null,
      created_at: new Date(NOW - 5 * MIN).toISOString(),
    };
    expect(selectAdminAttachTarget([legacy], NOW)?.id).toBe("legacy");
  });

  it("honours a custom window override", () => {
    expect(selectAdminAttachTarget([cand("a", 50)], NOW, 60 * MIN)?.id).toBe("a");
    expect(selectAdminAttachTarget([cand("a", 50)], NOW, 10 * MIN)).toBeNull();
  });

  it("returns null on empty / nullish input and non-finite time", () => {
    expect(selectAdminAttachTarget([], NOW)).toBeNull();
    expect(selectAdminAttachTarget(null, NOW)).toBeNull();
    expect(selectAdminAttachTarget(undefined, NOW)).toBeNull();
    expect(selectAdminAttachTarget([cand("a", 1)], NaN)).toBeNull();
  });

  it("skips candidates with an unparseable timestamp", () => {
    const bad: AdminAttachCandidate = { id: "bad", last_message_at: "not-a-date" };
    expect(selectAdminAttachTarget([bad], NOW)).toBeNull();
    expect(selectAdminAttachTarget([bad, cand("good", 4)], NOW)?.id).toBe("good");
  });
});
