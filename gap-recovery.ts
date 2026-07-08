// gap-recovery.ts
//
// Pure helpers for P0-2 outage-gap recovery.
//
// Background: AutoFetch (the sole live ingestion path — GramJS never pushes this
// supergroup's messages, KNOWN_ISSUES §6 item 1) looks back a FIXED 2 hours
// every sweep. If the process is down longer than 2h (a slow deploy, a crash, a
// Railway incident), the messages that arrived in the window BEYOND 2h are lost
// permanently — nothing backfills them and the channel-diff pts re-seeds to
// "now" on restart. There is no adaptive catch-up.
//
// The fix (chosen 2026-07-07): the `messages` table IS the durable checkpoint.
// On startup and after each watchdog reconnect, page Telegram history newest-
// first from the newest telegram_message_id we've already stored, collecting
// anything newer, bounded by a message-count cap and an age cap, and replay it
// through the SAME idempotent processAndIngestMessage. No schema change.
//
// server.ts owns the live getMessages paging loop (guarded on tlClient +
// GAP_RECOVERY_ENABLED); this module owns the id/age/stop decisions — the only
// fiddly part — so it is unit-testable with plain objects, no live session,
// exactly like autofetch-dedup.ts / channel-difference.ts / observability.ts.

// A raw message from client.getMessages, minimally typed. Only the fields the
// recovery loop reasons about are declared; everything is optional/defensive
// because the input is server-controlled and may be a service/empty message.
export interface GapMessage {
  id?: number | string | null;
  // GramJS msg.date — unix SECONDS (matches SweepCandidate / processAndIngest).
  date?: number | null;
  [k: string]: any;
}

// Coerce a telegram id to a positive finite number for checkpoint comparison,
// or null. Real channel message ids are positive integers well within the JS
// safe range; a non-numeric/absent id can't be checkpoint-compared and is
// treated as null. The `> 0` guard is load-bearing: Number(null) and Number("")
// are both 0, so without it a null id would masquerade as a real (and very low)
// id and could falsely trip reachedCheckpoint.
function toId(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Messages strictly newer than the stored checkpoint id AND within the age
// window (>= ageCutoffUnixSeconds). A message with no usable id is dropped (it
// can't be checkpoint-compared); a message with no date is KEPT (err toward
// ingesting — the top-of-function dedup and the classifier handle it, and
// getMessages always supplies a date in practice).
export function filterNewerThan(
  batch: Array<GapMessage | null | undefined> | null | undefined,
  storedMaxId: number,
  ageCutoffUnixSeconds = -Infinity,
): GapMessage[] {
  const out: GapMessage[] = [];
  for (const m of batch || []) {
    if (!m) continue;
    const id = toId(m.id);
    if (id == null || id <= storedMaxId) continue;
    if (typeof m.date === "number" && m.date < ageCutoffUnixSeconds) continue;
    out.push(m);
  }
  return out;
}

// True once paging has crossed the checkpoint: the batch is empty (no more
// history to page) OR it contains any message at/older than the checkpoint id
// (so everything newer has now been seen). getMessages returns newest-first, so
// once a batch dips to <= storedMaxId there is nothing new left to collect.
export function reachedCheckpoint(
  batch: Array<GapMessage | null | undefined> | null | undefined,
  storedMaxId: number,
): boolean {
  const arr = batch || [];
  if (arr.length === 0) return true;
  return arr.some((m) => {
    const id = toId(m?.id);
    return id != null && id <= storedMaxId;
  });
}

// True once the batch reaches back past the age cutoff — we've gone far enough
// in time and the rest of the gap is beyond the recovery window. Bounds a
// catastrophic (multi-day) gap the same way the message-count cap does.
export function reachedAgeCutoff(
  batch: Array<GapMessage | null | undefined> | null | undefined,
  ageCutoffUnixSeconds: number,
): boolean {
  return (batch || []).some(
    (m) => typeof m?.date === "number" && m.date < ageCutoffUnixSeconds,
  );
}

// Whether the collected count has hit the message-count cap.
export function capReached(collectedCount: number, maxMessages: number): boolean {
  return collectedCount >= maxMessages;
}

// The offsetId for the NEXT (older) page: the oldest id in this newest-first
// batch (its last element). Returns null when there is no usable id, which the
// caller treats as "stop paging" (can't advance safely).
export function nextOffsetId(
  batch: Array<GapMessage | null | undefined> | null | undefined,
): number | null {
  const arr = batch || [];
  if (arr.length === 0) return null;
  return toId(arr[arr.length - 1]?.id);
}

export const DEFAULT_GAP_RECOVERY_MAX_MESSAGES = 500;
export const DEFAULT_GAP_RECOVERY_MAX_AGE_HOURS = 24;
// Per getMessages page. 100 is Telegram's comfortable page size and matches the
// channel-difference drain limit.
export const GAP_RECOVERY_PAGE_SIZE = 100;
