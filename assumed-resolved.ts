// assumed-resolved.ts
//
// Phase 2 (2026-06-19): "In Review" had become a graveyard of actually-resolved
// tickets — an admin helps a user, the user goes quiet (resolved in DM/email or
// just satisfied), and nothing ever flips the ticket to a closed state. That
// dragged the resolution-rate denominator down and made a responsive admin look
// poor-performing.
//
// This module owns the PURE decision for a periodic sweep that moves an
// admin-engaged ticket that has been quiet for N days into a new, system-only,
// auditable status: "Assumed Resolved" (counted as a resolution in the rate,
// kept separate from a human "Resolved"; a new user message reopens it).
//
// It mirrors admin-reply-resolution.ts: the time/status logic lives here as a
// pure function so every branch is unit-testable with plain values, and the
// caller (server.ts) still applies the write as a GUARDED conditional update
// (WHERE status IN ASSUME_RESOLVABLE_STATUSES) so a concurrent human or
// ingestion change between the read and the write is never clobbered.
//
// Eligibility (product decision, 2026-06-19): Open / In Review / Awaiting User
// may be assumed-resolved. "Awaiting User" is included deliberately — an admin
// explicitly asked and the user never returned, which is the strongest
// assumed-resolved signal. "Escalated" is NEVER auto-resolved (a human parked it
// for attention); "Resolved" / "Dismissed" are terminal.

export const ASSUME_RESOLVABLE_STATUSES = [
  "Open",
  "In Review",
  "Awaiting User",
];

// Quiet threshold (product decision, 2026-06-19): 7 days with no new activity.
export const ASSUMED_RESOLVED_QUIET_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// True only when ALL hold:
//   - the ticket is in an assume-resolvable state,
//   - an admin has engaged the ticket at least once (adminEngaged), and
//   - the last activity is at least `quietDays` old.
// `lastActivityMs` / `nowMs` are epoch-millisecond timestamps. The caller still
// re-asserts the status in the DB write (conditional update), so this function
// only has to encode the heuristic, not win a race.
export function shouldAssumeResolved(
  status: string,
  adminEngaged: boolean,
  lastActivityMs: number,
  nowMs: number,
  quietDays: number = ASSUMED_RESOLVED_QUIET_DAYS,
): boolean {
  if (!ASSUME_RESOLVABLE_STATUSES.includes(status)) return false;
  if (adminEngaged !== true) return false;
  if (!Number.isFinite(lastActivityMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - lastActivityMs >= quietDays * MS_PER_DAY;
}
