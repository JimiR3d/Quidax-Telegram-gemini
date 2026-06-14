// admin-reply-resolution.ts
//
// Bug 4 (2026-06-14): an admin's reply that is a complete, direct answer should
// auto-RESOLVE the ticket, not leave it sitting in "In Review". Confirmed live
// example: user "can I send money from my Quidax wallet to another wallet?" →
// admin "Yes, you can send crypto from your Quidax wallet to an external
// wallet" left the ticket In Review forever.
//
// reclassifyFromAdminReply already asks Groq to audit the CATEGORY from the
// admin reply; Bug 4 extends that same call to also return whether the reply
// resolves the ticket. This module owns the two pure pieces — parsing the
// model's JSON verdict and the status guard — so they are unit-testable with
// plain values, mirroring classification-policy.ts / admin-message-policy.ts.
//
// IMPORTANT history: reclassifyFromAdminReply used to touch ONLY `category`,
// never status (so it could never un-escalate / reopen / resolve). Bug 4
// deliberately revises that for the auto-resolve case, but ONLY from an active
// queue state. An admin's affirmative answer must NEVER auto-resolve a ticket a
// human deliberately parked (Escalated / Awaiting User), nor re-touch a ticket
// that is already Resolved / Dismissed. The status enum stays exact strings as
// used everywhere in server.ts.

export interface ReclassifyVerdict {
  category: string;
  resolved: boolean;
}

// Safe-parse the model's `{ "category": "...", "resolved": true|false }` reply.
// Returns null on any malformed/non-object JSON so the caller skips (never
// throws, never guesses). `resolved` is strict — only a literal boolean true
// counts, so a missing/garbage field defaults to NOT resolving (fail-safe).
export function parseReclassifyVerdict(
  jsonStr: string,
): ReclassifyVerdict | null {
  let obj: any;
  try {
    obj = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  return {
    category: typeof obj.category === "string" ? obj.category : "",
    resolved: obj.resolved === true,
  };
}

// Only these active "queue" states may be auto-resolved by an affirmative admin
// reply. Escalated and Awaiting User are deliberately excluded (a human parked
// them); Resolved and Dismissed are terminal.
export const AUTO_RESOLVABLE_STATUSES = ["Open", "In Review"];

// True only when the model says the reply resolves the ticket AND the ticket is
// currently in an auto-resolvable state. The caller still applies this as a
// conditional DB update (WHERE status IN auto-resolvable) so a concurrent
// dashboard change between the read and the write is never clobbered.
export function shouldResolveFromAdminReply(
  resolved: boolean,
  currentStatus: string,
): boolean {
  return resolved === true && AUTO_RESOLVABLE_STATUSES.includes(currentStatus);
}
