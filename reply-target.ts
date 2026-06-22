// reply-target.ts
//
// Reply-to ground-truth attribution (Phase 2, 2026-06-22).
//
// Background: a live audit proved admin replies were landing on the WRONG ticket
// and one user issue was splitting into several. The single missing signal was
// Telegram's reply-to: `messages` never stored which message a reply answered and
// had no durable message->ticket link, so attachment fell back to time/sender
// GUESSING. Migration 019 adds `messages.reply_to_msg_id` + `messages.ticket_id`;
// every attach site now stamps `ticket_id` (server.ts linkMessageToTicket), so a
// later reply can load the quoted message's ticket and attach there as GROUND
// TRUTH before any heuristic fallback.
//
// This module owns the PURE pieces of that flow — id normalisation for the insert
// and the gate that decides whether a quoted message's linked ticket is a valid
// attach target — mirroring the existing pure-module convention
// (admin-reply-attach.ts, assumed-resolved.ts, …) so the live DB attach paths
// (which the no-telegram launcher can still exercise) stay thin and the decision
// is unit-tested without a DB.

// Statuses a reply may attach to as ground truth. These are the ACTIVE states
// (plus Assumed Resolved and Handed off, both of which a fresh reply correctly
// reopens — see the user-reply reopen logic in server.ts). Resolved and
// Dismissed are deliberately excluded: a reply quoting a closed-out thread should
// fall through to the heuristic fallbacks / a new ticket, not silently revive a
// human-closed ticket. Mirrors the status sets used at the live attach sites.
export const REPLY_ATTACH_STATUSES: readonly string[] = [
  "Open",
  "In Review",
  "Escalated",
  "Awaiting User",
  "Assumed Resolved",
  "Handed off",
];

// Normalise a Telegram reply-to id for the `messages.reply_to_msg_id` (bigint)
// column. Real Telegram message ids are positive integers; anything else
// (null/undefined/empty string, non-numeric, zero, negative, NaN) becomes null
// so the column stays clean and "is this a quoted reply?" is a simple non-null
// check. Number(null) === 0 and Number("") === 0, so the > 0 guard is load-
// bearing — without it a non-reply would store 0.
export function normalizeReplyToMsgId(
  value: unknown,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

// Minimal shape the ground-truth gate needs from a ticket row.
export interface ReplyTargetTicket {
  id: string;
  status?: string | null;
  is_admin_message?: boolean | null;
}

// Given the ticket a quoted message is linked to (loaded via the quoted message's
// `ticket_id`), is it a valid GROUND-TRUTH attach target for an incoming reply?
//   - must exist and have an id,
//   - must NOT be an admin-message ticket (admin standalones are dropped, never a
//     real thread; never attach a reply to one),
//   - must be in an attachable status (active / assumed-resolved).
// Returns the ticket when valid, else null so the caller falls through to the
// existing message_id / sender-hash / time-window fallbacks. Pure: no DB, no I/O.
export function selectReplyToTarget<T extends ReplyTargetTicket>(
  ticket: T | null | undefined,
  statuses: readonly string[] = REPLY_ATTACH_STATUSES,
): T | null {
  if (!ticket || !ticket.id) return null;
  if (ticket.is_admin_message) return null;
  const status = ticket.status;
  if (!status || !statuses.includes(status)) return null;
  return ticket;
}
