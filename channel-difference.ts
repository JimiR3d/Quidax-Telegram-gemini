// channel-difference.ts
//
// Pure helpers for the LIVE getChannelDifference ingestion path (Phase 2).
//
// Background (KNOWN_ISSUES §6 item 1, root cause PROVEN by the 2026-06-14
// research spike, diagnostic commit 1f110a5): GramJS 2.26.x never tracks the
// supergroup's channel `pts` and never calls updates.getChannelDifference, so
// Telegram WITHHOLDS the channel's UpdateNewChannelMessage from the push stream
// while still delivering the channel's lightweight CONTROL updates and the
// account's common/DM box. The live NewMessage listener therefore delivers
// nothing and AutoFetch (3-min sweep) has been the SOLE ingestion path.
//
// The real fix is to actively sync the channel pts and poll
// updates.GetChannelDifference, feeding new_messages into
// processAndIngestMessage. server.ts owns the live calls (client.invoke, pts
// seeding, the poll loop, guarded on tlClient + CHANNEL_DIFF_ENABLED); this
// module owns the response-shape classification and raw-TL message
// normalization — the only genuinely fiddly part — so it is unit-testable with
// plain objects, no live session, exactly like telegram-guards.ts /
// listener-health.ts / dialog-priming.ts / autofetch-dedup.ts.
//
// updates.GetChannelDifference returns one of three shapes (verified against
// node_modules/telegram/tl/api.d.ts):
//   - updates.ChannelDifference        { pts, final, newMessages, otherUpdates, chats, users }
//   - updates.ChannelDifferenceEmpty   { pts, final }                       (no new messages)
//   - updates.ChannelDifferenceTooLong { dialog, messages, chats, users }   (gap too large)
// For TooLong the new pts lives in dialog.pts, and its `messages` are the
// channel's LATEST state, NOT the gap — so TooLong must NEVER bulk-ingest:
// we only re-seed the pts and let AutoFetch's 2-hour lookback carry the gap.

// A raw TL Api.Message from a difference response. Only the fields the
// ingestion pipeline needs are typed; everything is optional/defensive because
// the input is server-controlled and may be a MessageService/MessageEmpty.
export interface RawDiffMessage {
  className?: string;
  id?: number | string | null;
  // The TL text field is `message` (NOT `text`).
  message?: string | null;
  // Unix SECONDS, matching processAndIngestMessage's `msgDate * 1e3`.
  date?: number;
  replyTo?: { replyToMsgId?: number | null } | null;
  // PeerUser { userId } | PeerChannel { channelId } | PeerChat { chatId } | null.
  fromId?: any;
  [k: string]: any;
}

// A raw TL user from a difference response's `users[]`, used to resolve a
// sender's @username (raw messages only carry the numeric fromId).
export interface DiffUser {
  id?: number | string | null;
  username?: string | null;
  [k: string]: any;
}

// The arguments the ingestion pipeline needs, extracted from a raw message.
export interface NormalizedDiffMessage {
  id: number | string;
  text: string;
  date: number | undefined;
  replyToMsgId: number | null;
  senderId: string | null;
  senderUsername: string;
}

export type ChannelDifferenceClassification =
  | {
      kind: "messages";
      messages: RawDiffMessage[];
      newPts: number | null;
      final: boolean;
    }
  | { kind: "empty"; newPts: number | null }
  | { kind: "tooLong"; newPts: number | null }
  | { kind: "unknown"; newPts: null };

// Coerce a TL `int` (plain number in GramJS) to a finite number, or null. pts
// must never be advanced to NaN/undefined, so the caller only advances when this
// returns non-null.
function toFinitePts(x: unknown): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Classify a GetChannelDifference response by its className. Never throws — a
// surprise/empty shape returns { kind: "unknown" } so the poll loop can leave
// the tracked pts untouched and try again next tick.
export function classifyChannelDifference(
  resp: any,
): ChannelDifferenceClassification {
  if (!resp || typeof resp !== "object") {
    return { kind: "unknown", newPts: null };
  }
  switch (resp.className) {
    case "updates.ChannelDifferenceEmpty":
      return { kind: "empty", newPts: toFinitePts(resp.pts) };
    case "updates.ChannelDifferenceTooLong":
      // New pts is on the dialog, NOT a top-level pts. Carry NO messages.
      return { kind: "tooLong", newPts: toFinitePts(resp.dialog?.pts) };
    case "updates.ChannelDifference":
      return {
        kind: "messages",
        messages: Array.isArray(resp.newMessages) ? resp.newMessages : [],
        newPts: toFinitePts(resp.pts),
        // `final` is a TL flag: true means the difference is complete. Only an
        // explicit true stops the drain loop; anything else means "maybe more,
        // keep paging" (the caller bounds the loop and advances pts each pass).
        final: resp.final === true,
      };
    default:
      return { kind: "unknown", newPts: null };
  }
}

// Build a userId(string) -> username map from a difference response's users[].
// Users without a username are skipped (raw messages still ingest with "").
export function buildUsernameMap(
  users: Array<DiffUser | null | undefined> | null | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const u of users || []) {
    if (u && u.id != null && u.username) {
      map.set(String(u.id), String(u.username));
    }
  }
  return map;
}

// Extract a sender id (as a string, like every other ingestion path) from a raw
// message's fromId peer, regardless of peer variant. Returns null when there is
// no resolvable sender (e.g. anonymous/channel posts with no fromId) — then
// checkIsAdmin simply treats it as a normal user, which is fail-safe.
function extractSenderId(fromId: any): string | null {
  if (!fromId || typeof fromId !== "object") return null;
  const raw =
    fromId.userId != null
      ? fromId.userId
      : fromId.channelId != null
        ? fromId.channelId
        : fromId.chatId != null
          ? fromId.chatId
          : null;
  return raw != null ? String(raw) : null;
}

// Normalize a raw TL message into the exact arguments processAndIngestMessage
// needs. Returns null for anything not ingestable: a MessageService/MessageEmpty
// (joins, pins, deletions), a media-only / empty-text post, or a message with no
// id (can't dedup). Mirrors the !msg.text guard in the live handler / AutoFetch;
// the <5-char rule stays in processAndIngestMessage so behavior matches the
// other paths exactly.
export function normalizeDiffMessage(
  raw: RawDiffMessage | null | undefined,
  usernameMap: Map<string, string> | null | undefined,
): NormalizedDiffMessage | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.className === "MessageService" || raw.className === "MessageEmpty") {
    return null;
  }
  const text = typeof raw.message === "string" ? raw.message : "";
  if (!text) return null;
  if (raw.id == null) return null;
  const senderId = extractSenderId(raw.fromId);
  const senderUsername =
    senderId && usernameMap ? usernameMap.get(senderId) ?? "" : "";
  const replyToMsgId =
    raw.replyTo && raw.replyTo.replyToMsgId != null
      ? raw.replyTo.replyToMsgId
      : null;
  return {
    id: raw.id,
    text,
    date: typeof raw.date === "number" ? raw.date : undefined,
    replyToMsgId,
    senderId,
    senderUsername,
  };
}

// Sort messages ascending by id (oldest-first) so a parent is always ingested
// before its replies within a single batch — the same invariant AutoFetch
// enforces by reversing getMessages' newest-first result.
export function sortDiffMessagesOldestFirst<T extends { id: number | string }>(
  messages: T[] | null | undefined,
): T[] {
  return [...(messages || [])].sort((a, b) => Number(a.id) - Number(b.id));
}
