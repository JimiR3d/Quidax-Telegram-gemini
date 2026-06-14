import { describe, it, expect } from "vitest";
import { disposeUnattachedMessage } from "../admin-message-policy";

// Bug 3 (2026-06-14): an admin message that did not attach to any user ticket
// must be dropped, never turned into a standalone (Resolved) ticket. A regular
// user's unattached message still becomes a ticket. These tests lock that
// policy so a future "simplify" cannot silently bring admin tickets back.
describe("disposeUnattachedMessage", () => {
  it("drops an unattached admin message", () => {
    expect(disposeUnattachedMessage(true)).toBe("drop-admin");
  });

  it("creates a ticket for an unattached non-admin (user) message", () => {
    expect(disposeUnattachedMessage(false)).toBe("create-ticket");
  });

  it("treats any truthy admin flag as an admin (drop)", () => {
    // call sites pass !!isAdminSender today, but the policy must not regress if
    // a truthy non-boolean is ever passed.
    expect(disposeUnattachedMessage(1 as unknown as boolean)).toBe("drop-admin");
    expect(disposeUnattachedMessage("yes" as unknown as boolean)).toBe(
      "drop-admin",
    );
  });

  it("treats falsy/absent flags as a user (create ticket)", () => {
    expect(disposeUnattachedMessage(0 as unknown as boolean)).toBe(
      "create-ticket",
    );
    expect(disposeUnattachedMessage("" as unknown as boolean)).toBe(
      "create-ticket",
    );
    expect(disposeUnattachedMessage(null as unknown as boolean)).toBe(
      "create-ticket",
    );
    expect(disposeUnattachedMessage(undefined as unknown as boolean)).toBe(
      "create-ticket",
    );
  });
});
