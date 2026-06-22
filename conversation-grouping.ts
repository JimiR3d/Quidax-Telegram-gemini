// conversation-grouping.ts
//
// Pure helpers for CONVERSATION GROUPING in server.ts — folding a user's
// consecutive un-quoted messages (and user↔admin back-and-forth) within a
// rolling time window into ONE ticket/thread, so the classifier and the /train
// reviewer see the whole issue instead of isolated fragments.
//
// Background (KNOWN_ISSUES §8/§9; elevated to the user's #1 ask 2026-06-15):
// one user posts ~5 un-quoted messages about ONE issue within a few minutes and
// each becomes its own ticket — the issue is split, siblings stay Open after the
// admin resolves one, and fragments are misclassified because urgency/category
// come from a single message's text (e.g. "USDT too" → High/Withdrawal with no
// surrounding context). The grouping branch lives in processAndIngestMessage,
// which runs on all four ingestion paths (live listener, channel-diff,
// AutoFetch, backfill) — none of which the no-telegram launcher can exercise
// live — so the text-thread extraction and the window math are isolated here to
// be unit-tested without a live DB or Telegram session, mirroring the existing
// pure-module convention (listener-health.ts, classification-policy.ts, …).
//
// tickets.raw_text block format (constructed in server.ts — MUST stay in sync):
//   <original user message>
//   \n\n[USER_FOLLOWUP]\n<text>\n[/USER_FOLLOWUP]   ← grouped user message (NEW)
//   \n\n[USER_REPLY]\n<text>\n[/USER_REPLY]         ← user reply to Awaiting User
//   \n\n[ADMIN_REPLY]\n<text>\n[/ADMIN_REPLY]       ← admin reply (excluded here)

// Block tags whose inner text is part of the USER-SIDE thread fed to the
// classifier and /train. [ADMIN_REPLY] is deliberately NOT here: grouping
// re-classifies the user's ISSUE, never the admin's answer.
const USER_BLOCK_TAGS: readonly string[] = ["USER_REPLY", "USER_FOLLOWUP"];

// Matches one appended block: [TAG]\n<inner>\n[/TAG]. The inner group is
// non-greedy so it stops at the first matching close tag, and the \1
// backreference pins the close tag to the same name as the open tag. Blocks are
// appended sequentially and never nested, so this is unambiguous.
const BLOCK_RE =
  /\[(ADMIN_REPLY|USER_REPLY|USER_FOLLOWUP)\]\n([\s\S]*?)\n\[\/\1\]/g;

// The first appended block, used to slice off the leading original message.
// Mirrors the regex in server.ts's originalMessageText, extended for the new
// [USER_FOLLOWUP] tag.
const FIRST_BLOCK_RE = /\n\n\[(ADMIN_REPLY|USER_REPLY|USER_FOLLOWUP)\]/;

// The USER-SIDE thread text for a ticket: the original message plus the inner
// text of every [USER_REPLY] / [USER_FOLLOWUP] block, in document order,
// joined by blank lines, with [ADMIN_REPLY] blocks omitted and all block tags
// stripped. This is what classification and the /train reviewer should judge —
// the whole issue, not one fragment.
//
// For a ticket with no user-side blocks (the common case: a plain message, or a
// message that only ever received [ADMIN_REPLY] blocks) the result is exactly
// the trimmed original — i.e. identical to today's originalMessageText, so
// swapping it in at the review/classify sites is a no-op for ungrouped tickets.
// (It deliberately DIVERGES for tickets carrying [USER_REPLY] blocks — those
// user words are now included, which is the intended "full user-side thread"
// behaviour.)
export function userThreadText(rawText: string | null | undefined): string {
  const text = String(rawText ?? "");
  if (!text) return "";

  // 1. The original user message is everything before the first appended block.
  const firstBlock = text.search(FIRST_BLOCK_RE);
  const original = (
    firstBlock === -1 ? text : text.slice(0, firstBlock)
  ).trim();

  const parts: string[] = [];
  if (original) parts.push(original);

  // 2. Every USER-side block's inner text, in the order it appears.
  for (const match of text.matchAll(BLOCK_RE)) {
    const tag = match[1];
    const inner = (match[2] ?? "").trim();
    if (inner && USER_BLOCK_TAGS.includes(tag)) parts.push(inner);
  }

  return parts.join("\n\n");
}

// Is a candidate parent ticket within the rolling grouping window for an
// incoming message? True iff the parent's last activity is at or before the new
// message AND no older than windowMs before it — i.e.
//   0 <= (messageDate - lastMessageAt) <= windowMs
// (boundaries inclusive, matching the Supabase query's
// `.gte(last_message_at, cutoff).lte(last_message_at, messageDate)`).
//
// A missing/invalid timestamp returns false (fail-safe): a ticket that never set
// last_message_at simply never groups, and a parent MORE RECENT than the
// incoming message (possible under out-of-order ingestion across the four paths)
// must never pull the rolling window backward.
export function isWithinGroupingWindow(
  lastMessageAtISO: string | null | undefined,
  messageDateISO: string | null | undefined,
  windowMs: number,
): boolean {
  const last = Date.parse(String(lastMessageAtISO ?? ""));
  const msg = Date.parse(String(messageDateISO ?? ""));
  if (Number.isNaN(last) || Number.isNaN(msg)) return false;
  const diff = msg - last;
  return diff >= 0 && diff <= windowMs;
}

// The oldest last_message_at a parent ticket may carry and still group with this
// message: messageDate - windowMs, as an ISO string for the Supabase query's
// `.gte("last_message_at", cutoff)`. Returns null for a missing/invalid message
// date so the caller skips grouping rather than querying with a bad bound.
export function groupingCutoffISO(
  messageDateISO: string | null | undefined,
  windowMs: number,
): string | null {
  const msg = Date.parse(String(messageDateISO ?? ""));
  if (Number.isNaN(msg)) return null;
  return new Date(msg - windowMs).toISOString();
}

// Phase 3 — which grouping band an incoming message falls into relative to a
// candidate parent ticket's last activity. `fastMs` is the cheap immediate-fold
// window (GROUPING_WINDOW_MS, ~5 min); `wideMs` is the wider active-thread
// window (GROUPING_ACTIVE_WINDOW_MS, ~6 h). With gap = messageDate - lastMessage:
//   "fast"     0 <= gap <= fastMs        → fold immediately, no topic-shift LLM
//   "extended" fastMs < gap <= wideMs    → run topic-shift; fold only if same issue
//   "none"     gap < 0, gap > wideMs, or any missing/invalid timestamp → no fold
// Mirrors isWithinGroupingWindow's fail-safe: an out-of-order parent (newer than
// the message) or an unparseable timestamp is "none", never a fold. Assumes
// fastMs <= wideMs (the call site's constants guarantee it).
export type GroupingBand = "fast" | "extended" | "none";
export function groupingBand(
  lastMessageAtISO: string | null | undefined,
  messageDateISO: string | null | undefined,
  fastMs: number,
  wideMs: number,
): GroupingBand {
  const last = Date.parse(String(lastMessageAtISO ?? ""));
  const msg = Date.parse(String(messageDateISO ?? ""));
  if (Number.isNaN(last) || Number.isNaN(msg)) return "none";
  const diff = msg - last;
  if (diff < 0) return "none";
  if (diff <= fastMs) return "fast";
  if (diff <= wideMs) return "extended";
  return "none";
}

// Phase 2 (reply-to attribution, 2026-06-22) — UNANSWERED-BURST fast-fold.
// When a candidate ticket is still UNANSWERED (status "Open" with no admin reply
// yet), a same-sender un-quoted message landing in the EXTENDED band is almost
// certainly the same user piling on the same not-yet-handled issue — not a topic
// shift. Folding it WITHOUT the topic-shift Groq call cuts both an LLM round-trip
// and a fragment ticket. Once an admin has replied (first_admin_reply_at set) or
// the ticket has moved out of Open, the conversation has structure and we defer
// to the normal topic-shift decision instead.
//
// True iff: ticket exists, status === "Open", first_admin_reply_at is null, and
// the gap (messageDate - lastMessage) is in [0, burstMs]. Any
// missing/invalid/out-of-order timestamp is false (fail-safe: fall back to the
// topic-shift LLM, never a blind fold). burstMs is expected to sit between the
// fast window and the wide window (the call site's constants guarantee it).
export interface BurstFoldTicket {
  status?: string | null;
  first_admin_reply_at?: string | null;
}
export function shouldBurstFold(
  ticket: BurstFoldTicket | null | undefined,
  lastMessageAtISO: string | null | undefined,
  messageDateISO: string | null | undefined,
  burstMs: number,
): boolean {
  if (!ticket) return false;
  if (ticket.status !== "Open") return false;
  if (ticket.first_admin_reply_at != null) return false;
  const last = Date.parse(String(lastMessageAtISO ?? ""));
  const msg = Date.parse(String(messageDateISO ?? ""));
  if (Number.isNaN(last) || Number.isNaN(msg)) return false;
  const diff = msg - last;
  return diff >= 0 && diff <= burstMs;
}
