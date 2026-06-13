// quoted-parent.ts
//
// Fix 5 (KNOWN_ISSUES section 6, items 5 & 8): when an admin reply QUOTES a
// message that was never ingested — because the live listener was down, or the
// quoted message predates the 2-hour AutoFetch window — the old code degraded
// the reply into a standalone admin "ticket" and the whole conversation thread
// was lost (this ate the 16:39 support issue + 16:44 admin quote in the audit).
//
// Instead we fetch the quoted (parent) message from Telegram by its id, ingest
// it as a normal ticket first, then attach the admin reply to it.
//
// The Telegram fetch and all DB writes are INJECTED as async dependencies so
// this orchestration is unit-testable without a live GramJS session (the
// no-telegram local launcher has no client) and stays idempotent across the
// three ingestion paths (live listener, 15-min AutoFetch, manual backfill).

export interface FetchedParentMessage {
  text: string;
  msgId: number | string;
  msgDate: number; // unix seconds, as GramJS provides
  isAdmin: boolean;
  senderId: string;
  senderUsername: string;
  deepLink?: string;
}

export interface RecoverQuotedParentDeps {
  // Resolve an already-stored ticket whose underlying message has this Telegram
  // id (returns the ticket row, or null). Keeps recovery idempotent: a parent
  // ingested by an earlier pass is reused instead of fetched and re-created.
  findTicketByTelegramId: (
    telegramId: number | string,
  ) => Promise<any | null>;
  // Fetch the quoted message from Telegram. Returns null when there is no live
  // client (local launcher), the message has been deleted, or it has no text.
  fetchQuotedMessage: (
    replyToMsgId: number | string,
  ) => Promise<FetchedParentMessage | null>;
  // Ingest the fetched parent as a ROOT message (the caller's adapter passes no
  // replyToMsgId, so recovery never recurses up an unbounded reply chain).
  // Returns the newly created ticket, or null.
  ingestParent: (parent: FetchedParentMessage) => Promise<any | null>;
}

// Returns the parent ticket the admin reply should attach to, or null if the
// thread genuinely cannot be recovered (no live client, message deleted, or the
// ingest produced nothing). On null the caller falls back to its previous
// standalone-admin behavior — never crashes, never loses the admin reply.
export async function recoverQuotedParent(
  replyToMsgId: number | string | null | undefined,
  deps: RecoverQuotedParentDeps,
): Promise<any | null> {
  if (replyToMsgId == null) return null;
  // 1. Already in our DB (re-ingest, or a concurrent pass beat us to it). Reuse
  //    it without calling Telegram again.
  const existing = await deps.findTicketByTelegramId(replyToMsgId);
  if (existing) return existing;
  // 2. Pull the quoted message from Telegram.
  const fetched = await deps.fetchQuotedMessage(replyToMsgId);
  if (!fetched) return null;
  // 3. Ingest it as a ticket so the admin reply has a real parent to attach to.
  const ingested = await deps.ingestParent(fetched);
  if (ingested) return ingested;
  // 4. ingestParent returned null (the telegram_message_id UNIQUE constraint
  //    caught a race, or the parent was too short / one of our own bot replies).
  //    Re-resolve so we still attach to whatever actually landed rather than
  //    losing the thread.
  return await deps.findTicketByTelegramId(replyToMsgId);
}
