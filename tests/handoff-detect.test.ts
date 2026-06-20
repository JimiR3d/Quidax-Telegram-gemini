import { describe, it, expect } from "vitest";
import { detectHandoff, extractAdminText } from "../handoff-detect";

describe("detectHandoff", () => {
  it("flags an admin email hand-off (the e374c960 live case)", () => {
    const raw =
      "good day how do i contact support\n\n[ADMIN_REPLY]\nHello,\n\nSend us an email support@quidax.com\nPlease include your Quidax UID\n[/ADMIN_REPLY]";
    expect(detectHandoff(raw)).toBe(true);
  });

  it("flags a DM hand-off (the e4dbdf89 live case)", () => {
    const raw =
      "Please quidax reverse my money\n\n[ADMIN_REPLY]\nSend me a DM with the transaction receipt and details\n[/ADMIN_REPLY]";
    expect(detectHandoff(raw)).toBe(true);
  });

  it("flags a bare support@quidax.com mention by an admin", () => {
    const raw =
      "I sent XRP without a memo\n\n[ADMIN_REPLY]\nSend an email to support@quidax.com\n[/ADMIN_REPLY]";
    expect(detectHandoff(raw)).toBe(true);
  });

  it("tolerates an id= suffix on the admin tag (Phase 1 format)", () => {
    const raw = "help\n\n[ADMIN_REPLY id=140066]\nDM me your UID\n[/ADMIN_REPLY]";
    expect(detectHandoff(raw)).toBe(true);
  });

  it("does NOT flag a normal admin reply with no redirect", () => {
    const raw =
      "withdrawal stuck\n\n[ADMIN_REPLY]\nWhat asset are you trying to withdraw?\n[/ADMIN_REPLY]";
    expect(detectHandoff(raw)).toBe(false);
  });

  it("does NOT flag when only the USER mentions email (no admin redirect)", () => {
    const raw =
      "I already sent an email to support@quidax.com but no reply\n\n[USER_FOLLOWUP]\nany update?\n[/USER_FOLLOWUP]";
    expect(detectHandoff(raw)).toBe(false);
  });

  it("returns false for empty / non-string / tagless input", () => {
    expect(detectHandoff("")).toBe(false);
    expect(detectHandoff("just a plain message, no admin block")).toBe(false);
    // exercise the runtime guard (strictNullChecks is off in this project)
    expect(detectHandoff(null as unknown as string)).toBe(false);
  });

  it("extractAdminText pulls only admin turns", () => {
    const raw =
      "user msg\n\n[ADMIN_REPLY]\nadmin one\n[/ADMIN_REPLY]\n\n[USER_REPLY]\nuser two\n[/USER_REPLY]\n\n[ADMIN_REPLY]\nadmin three\n[/ADMIN_REPLY]";
    const out = extractAdminText(raw);
    expect(out).toContain("admin one");
    expect(out).toContain("admin three");
    expect(out).not.toContain("user two");
  });
});
