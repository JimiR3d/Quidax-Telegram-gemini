// admin-message-policy.ts
//
// Bug 3 (2026-06-14): a message from a known admin (TELEGRAM_ADMIN_USER_IDS, an
// admin @username, or a fetched group admin — detected by checkIsAdmin) must
// NEVER become a standalone ticket. An admin post is only ever useful as an
// [ADMIN_REPLY] attached to a user's ticket (via the quoted-reply branch or the
// 90-second window heuristic) for response-time tracking and context; an admin
// message that attaches to nothing is a welcome note, an answer to someone, or
// chatter — not a support request.
//
// Before this fix, an admin message that matched no user ticket fell through to
// the single ticket insert in processAndIngestMessage and was created with
// `status: isAdminSender ? "Resolved" : "Open"` — i.e. a standalone Resolved
// ticket. In production this produced 169 such tickets, polluting the dashboard
// and inflating the Resolved side of the Resolution Rate KPI (Resolved ÷
// (Resolved + Active)).
//
// The audit (2026-06-14) confirmed checkIsAdmin runs with a matching senderId
// string on every ingestion path (live NewMessage, AutoFetch, getChannelDifference,
// backfill); /api/ingest takes isAdmin from the request body by design. So the
// bug was never a missing/broken admin guard — it was this downstream
// disposition. The "Resolved" status is itself proof admin detection succeeded
// (Resolved is only set when isAdminSender is true).
//
// This module owns ONLY the pure final decision reached AFTER the attach
// attempts have already failed. The attach attempts themselves are DB-bound and
// stay in processAndIngestMessage. Mirrors the classification-policy.ts /
// listener-health.ts pure-module convention so it is unit-testable with plain
// values and locked against regression.

export type UnattachedMessageDisposition = "create-ticket" | "drop-admin";

// Decide what to do with a message that did NOT attach to any existing user
// ticket. Admin messages are dropped (no standalone ticket); everyone else gets
// a ticket. Coerced to a boolean so a truthy/falsy isAdminSender flag from any
// call site behaves identically.
export function disposeUnattachedMessage(
  isAdminSender: unknown,
): UnattachedMessageDisposition {
  return isAdminSender ? "drop-admin" : "create-ticket";
}
