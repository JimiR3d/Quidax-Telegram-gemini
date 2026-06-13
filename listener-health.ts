// listener-health.ts
//
// Two pure helpers for the LIVE Telegram listener in server.ts. They are
// extracted here so the listener's group-match and watchdog logic can be
// unit-tested without a live GramJS session — the no-telegram launcher sets
// tlClient = null, so the live NewMessage handler and the watchdog never run
// locally and could not otherwise be exercised by a test.
//
// Background (audit 2026-06-12, KNOWN_ISSUES §6 item 1): the live listener
// ingested nothing for days while AutoFetch sweeps carried the whole product.
// Two root causes lived in the listener:
//   (a) the NewMessage handler stamped "last message seen" BEFORE checking the
//       message was even in our group, so DMs and other chats kept the 30-min
//       watchdog timer warm and a silently-dead group listener was never
//       reconnected; and
//   (b) "is this our group?" was a fuzzy username/title/"quidax" substring
//       match instead of an exact match against the resolved channel id.
// Both decisions are now made by the pure functions below.

export interface ChatIdentity {
  id?: string | number | bigint | null;
  username?: string | null;
  title?: string | null;
}

// Decide whether a live message belongs to the target group.
//
// An exact channel-id match is authoritative: Telegram message ids are only
// unique per chat, and the watchdog must only count silence on the group we
// actually monitor. When the channel id has not resolved yet (startup, or a
// transient getEntity failure) we fall back to the historical
// username/title/"quidax" heuristic so messages are never DROPPED while
// resolution is pending — ingestion has its own group hard-rail downstream, so
// the fail-safe direction here is "let it through", not "block it".
export function isMessageInTargetGroup(
  chat: ChatIdentity | null | undefined,
  targetGroup: string,
  targetChannelId: string | null,
): boolean {
  if (!chat) return false;
  if (targetChannelId && chat.id != null) {
    // GramJS ids are BigInteger-like; compare as strings (same convention as
    // telegram-guards.ts).
    return String(chat.id) === targetChannelId;
  }
  const username = chat.username || "";
  const title = chat.title || "";
  return (
    username === targetGroup ||
    title.includes(targetGroup) ||
    title.toLowerCase().includes("quidax")
  );
}

// Reports how the in-target decision was reached, purely so the live handler
// can log it and a short production observation window can confirm the exact
// channel-id path is the one firing (not the fuzzy fallback).
export function matchPath(
  chat: ChatIdentity | null | undefined,
  targetChannelId: string | null,
): "channelId" | "fallback" {
  return targetChannelId && chat?.id != null ? "channelId" : "fallback";
}

// The watchdog reconnects the GramJS client after the TARGET group has been
// silent past the threshold. It must only ever be fed a timestamp that was
// updated by target-group traffic (see root cause (a) above); given that, the
// rule itself is a simple elapsed-time check, isolated here so it is covered
// by a test rather than buried inline in the interval callback.
export function shouldReconnect(
  lastMessageReceivedAt: number,
  now: number,
  silenceThresholdMs: number,
): boolean {
  return now - lastMessageReceivedAt > silenceThresholdMs;
}
