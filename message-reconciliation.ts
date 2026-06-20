// message-reconciliation.ts
//
// Phase 1 (2026-06-20): the recurring "I can't see today's messages" blocker.
// Every inbound message is written to `messages` BEFORE its ticket is built, and
// the authoritative dedup keys on that `messages` row. So if anything throws
// while building the ticket (a transient Groq/DB hiccup, a heuristic edge case),
// the message stays in `messages` forever but produces NO ticket — and every
// later re-scan skips it as "already seen". The raw `messages` log is complete
// and reliable; only the projection into tickets is fragile.
//
// This module owns the DETERMINISTIC part of a self-healing reconciliation
// sweep: given the recent `messages` and a little context, decide which ones are
// orphans worth rebuilding into tickets. It mirrors the project convention of a
// tested pure decision + a thin DB-bound sweep in server.ts (assumed-resolved.ts
// / noise-prefilter.ts / conversation-resolution.ts).
//
// Deliberately era-agnostic and tag-free: it does NOT rely on any new id= tag in
// the raw_text blocks (which would have rippled into the grouping parser). The
// caller answers "is this text already attached to a ticket?" with a plain
// substring search over `tickets.raw_text`, which catches every attach path past
// and future. Every filter here biases toward the SAFE failure — under-recover,
// never duplicate: when unsure, drop the candidate rather than risk a double.

// Mirrors processAndIngestMessage's own "Message too short or empty" guard — a
// sub-5-char message never became a ticket by design, so it is not a bug-orphan.
export const MIN_RECOVERABLE_LEN = 5;

export interface ReconcileMessage {
  // messages.id (PK) — reused as the ticket's message_id FK on recovery so no
  // duplicate `messages` row is created.
  id: number;
  // messages.telegram_message_id (the natural dedup key).
  telegramMessageId: string;
  // messages.raw_text (the original message content).
  rawText: string;
  // messages.sender_hash — preserved on recovery so consecutive orphans from the
  // same sender re-group into ONE ticket instead of fragmenting.
  senderHash: string;
  // messages.message_timestamp (ISO) — recovery replays in original time order.
  messageTimestamp: string;
  // messages.group_id — passed through to the ticket build.
  groupId: string;
}

export interface ReconcileContext {
  // telegram_message_id of every ticket that already exists as a root. A message
  // that is itself a ticket root is plainly not an orphan.
  rootTelegramIds: Set<string>;
  // sender_hash of every admin-authored ticket. Unattached admin messages are
  // DROPPED by design (admin-message-policy.ts) — they are never bug-orphans, so
  // we must never resurrect them as tickets.
  adminSenderHashes: Set<string>;
}

// Cheap, deterministic pre-filter. Drops:
//   - too-short / empty messages (never ticketed by design),
//   - admin-authored messages (dropped by design, never orphans),
//   - messages that are already a ticket root.
// Returns the survivors OLDEST-FIRST so a recovery replay rebuilds a multi-
// message conversation in order (the first message creates the ticket; the rest
// fold into it as [USER_FOLLOWUP] via the normal grouping path).
//
// The survivors still need ONE more check the caller performs against the DB —
// "is this text already attached inside some ticket's raw_text?" — before they
// are truly orphans. That check is intentionally NOT here: it is an inherently
// DB-bound substring search, kept in the sweep, while this module owns the part
// worth unit-testing.
export function filterReconcileCandidates(
  messages: ReconcileMessage[],
  ctx: ReconcileContext,
): ReconcileMessage[] {
  return messages
    .filter((m) => {
      if (!m || typeof m.rawText !== "string") return false;
      if (m.rawText.trim().length < MIN_RECOVERABLE_LEN) return false;
      if (ctx.adminSenderHashes.has(m.senderHash)) return false;
      if (ctx.rootTelegramIds.has(String(m.telegramMessageId))) return false;
      return true;
    })
    .sort(
      (a, b) =>
        new Date(a.messageTimestamp).getTime() -
        new Date(b.messageTimestamp).getTime(),
    );
}

// Telegram group system/bot messages that the LIVE pipeline drops via
// checkIsAdmin (the welcome bot and the moderation/ban bot), but which the
// reconciliation sweep cannot re-detect that way: `messages` stores only a
// sender_hash, not the senderId checkIsAdmin needs, and these bots are dropped
// (never ticketed) so their hashes are absent from the admin-ticket set. Without
// this gate the welcome greetings — which are long enough to pass
// shouldProcessMessage and contain "Quidax" so they dodge the news-paste filter —
// would be resurrected as real Open tickets, polluting the dashboard.
//
// Deliberately matches only unmistakable bot TEMPLATES (a real user typing these
// verbatim is implausible); refine from the dry-run preview if a new bot appears.
const SYSTEM_BOT_PATTERNS: RegExp[] = [
  /welcome to (?:the )?quidax official community/i,
  /\b(?:has|have) been banned!?\s*reason:/i,
];

export function isSystemBotMessage(text: string): boolean {
  if (typeof text !== "string" || !text) return false;
  return SYSTEM_BOT_PATTERNS.some((re) => re.test(text));
}

// Escape a probe string for use inside a PostgREST ILIKE `%...%` pattern so that
// any literal % or _ in the message text is matched literally (backslash is the
// default ILIKE escape char). Erring here is safe in the "more matches" direction
// — a broader match only makes a candidate look MORE represented, which biases to
// under-recovery, never to a duplicate.
export function escapeLikePattern(text: string): string {
  return String(text).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// Build the bounded, escaped substring used to ask the DB "is this message's text
// already present inside any ticket's raw_text?". Bounded so a very long paste
// does not produce an unwieldy ILIKE pattern; the leading slice stays distinctive
// enough for substring identity on real messages.
export const PROBE_MAX_LEN = 200;
export function buildRepresentationProbe(rawText: string): string {
  const trimmed = String(rawText || "").trim().slice(0, PROBE_MAX_LEN);
  return escapeLikePattern(trimmed);
}
