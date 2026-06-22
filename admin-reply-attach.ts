// admin-reply-attach.ts
//
// Symptom 1 & 2 (2026-06-22): admin replies were being DROPPED. The live audit
// proved ticket 5aec106f sat Open with zero [ADMIN_REPLY] blocks while the
// admin's four real replies (telegram 140091/092/094/097) sat in `messages`,
// unattached. Root cause = an asymmetry in processAndIngestMessage:
//   - a USER's un-quoted message attaches to their active ticket across a wide
//     window (grouping 6h + quoted-fallback 48h, keyed on sender_hash), but
//   - an ADMIN's reply only attaches via a quoted reply *to a ticket root* or the
//     narrow 90-second window — everything else fell through to
//     disposeUnattachedMessage and was dropped.
// An admin answering ~4 minutes after the user (the common case in a real
// support group) therefore vanished from the dashboard.
//
// This module owns the PURE selection a reply needs: "given the active user
// tickets in the group, which one is this admin reply answering?". It mirrors
// the assumed-resolved.ts / admin-message-policy.ts convention — a tested pure
// decision, with the DB queries and the guarded write kept in server.ts. The
// fallback remains DROP (disposeUnattachedMessage): genuine admin chatter /
// market commentary / news that matches no active ticket still correctly never
// becomes a ticket. This only governs replies to an active user ticket.

// How far back from an admin reply we still treat the most-recently-active user
// ticket as the one being answered. Replaces the old hard 90-second window — a
// real admin answer commonly lands a few minutes after the user. Default 30 min;
// env-overridable for quick rollback (the wrong-attach risk in a busy burst is
// bounded by "single most-recently-active", and this group is low-volume).
export const ADMIN_UNQUOTED_ATTACH_WINDOW_MS =
  Number(process.env.ADMIN_REPLY_ATTACH_WINDOW_MS) || 30 * 60 * 1000;

// Minimal shape the selection needs from a ticket row.
export interface AdminAttachCandidate {
  id: string;
  // ISO timestamp of the ticket's last activity (advances on every reply). Falls
  // back to created_at when null (legacy tickets). A fresh ticket sets
  // last_message_at = created_at at insert, so a brand-new ticket is matchable.
  last_message_at?: string | null;
  created_at?: string | null;
}

// Choose the single best active ticket for an UN-QUOTED admin reply: the most-
// recently-active candidate whose last activity is at or before the admin
// message and no older than `windowMs`. Returns null when nothing qualifies
// (caller then falls through to the DROP fallback — never a wrong attach, never
// a standalone admin ticket).
//
// The caller pre-filters to active, non-admin tickets in the same group; this
// function re-asserts the time window (defense in depth) and picks the winner so
// the gate is unit-testable with plain values.
export function selectAdminAttachTarget<T extends AdminAttachCandidate>(
  candidates: T[] | null | undefined,
  adminMsgTimeMs: number,
  windowMs: number = ADMIN_UNQUOTED_ATTACH_WINDOW_MS,
): T | null {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  if (!Number.isFinite(adminMsgTimeMs)) return null;
  let best: T | null = null;
  let bestMs = -Infinity;
  for (const c of candidates) {
    if (!c) continue;
    const ref = c.last_message_at ?? c.created_at;
    if (!ref) continue;
    const ms = new Date(ref).getTime();
    if (!Number.isFinite(ms)) continue;
    // A reply cannot answer a ticket whose last activity is in the FUTURE
    // relative to the reply (out-of-order ingestion), and must be within window.
    if (ms > adminMsgTimeMs) continue;
    if (adminMsgTimeMs - ms > windowMs) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = c;
    }
  }
  return best;
}
