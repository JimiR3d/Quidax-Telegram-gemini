import { describe, it, expect, vi } from "vitest";
import {
  recoverQuotedParent,
  type FetchedParentMessage,
  type RecoverQuotedParentDeps,
} from "../quoted-parent";

const fetchedParent: FetchedParentMessage = {
  text: "I sent a withdrawal 3 hours ago and it never arrived",
  msgId: 139581,
  msgDate: 1_749_000_000,
  isAdmin: false,
  senderId: "user-42",
  senderUsername: "victim",
};

// Build a deps object whose three async dependencies are vi spies, so each test
// can assert exactly which were called. Defaults model "nothing in the DB, a
// real quoted message on Telegram, ingest succeeds".
function makeDeps(
  overrides: Partial<RecoverQuotedParentDeps> = {},
): RecoverQuotedParentDeps {
  return {
    findTicketByTelegramId: vi.fn(async () => null),
    fetchQuotedMessage: vi.fn(async () => fetchedParent),
    ingestParent: vi.fn(async () => ({ id: "ticket-parent", raw_text: fetchedParent.text })),
    ...overrides,
  };
}

describe("recoverQuotedParent (Fix 5: admin reply quoting a missing parent)", () => {
  it("recovers the lost thread: fetch → ingest → return the new parent ticket", async () => {
    // The audit case: the live listener was down, so the quoted user message
    // (~139581) was never ingested. We must fetch it and build a ticket.
    const deps = makeDeps();
    const result = await recoverQuotedParent(139581, deps);

    expect(result).toEqual({ id: "ticket-parent", raw_text: fetchedParent.text });
    expect(deps.fetchQuotedMessage).toHaveBeenCalledWith(139581);
    expect(deps.ingestParent).toHaveBeenCalledWith(fetchedParent);
  });

  it("is idempotent: reuses an already-stored parent and never calls Telegram", async () => {
    // A later sweep (or a concurrent pass) already ingested the parent — recover
    // must not fetch it again or create a duplicate.
    const deps = makeDeps({
      findTicketByTelegramId: vi.fn(async () => ({ id: "existing-parent" })),
    });
    const result = await recoverQuotedParent(139581, deps);

    expect(result).toEqual({ id: "existing-parent" });
    expect(deps.fetchQuotedMessage).not.toHaveBeenCalled();
    expect(deps.ingestParent).not.toHaveBeenCalled();
  });

  it("no live client (local launcher / deleted message): returns null, ingests nothing", async () => {
    // fetchQuotedMessage returns null when there is no GramJS client or the
    // quoted message is gone — the caller then falls back to its old behavior.
    const deps = makeDeps({
      fetchQuotedMessage: vi.fn(async () => null),
    });
    const result = await recoverQuotedParent(139581, deps);

    expect(result).toBeNull();
    expect(deps.ingestParent).not.toHaveBeenCalled();
  });

  it("UNIQUE-constraint race: ingest returns null, re-resolves to the row that landed", async () => {
    // A concurrent path inserted the parent between our existence check and our
    // ingest, so ingest hit the telegram_message_id UNIQUE constraint and
    // returned null. We re-resolve so the admin reply still finds its parent.
    const findTicketByTelegramId = vi
      .fn()
      .mockResolvedValueOnce(null) // step 1: not there yet
      .mockResolvedValueOnce({ id: "raced-parent" }); // step 4: it is now
    const deps = makeDeps({
      findTicketByTelegramId,
      ingestParent: vi.fn(async () => null),
    });
    const result = await recoverQuotedParent(139581, deps);

    expect(result).toEqual({ id: "raced-parent" });
    expect(findTicketByTelegramId).toHaveBeenCalledTimes(2);
  });

  it("returns null without any work when there is no replyToMsgId", async () => {
    const deps = makeDeps();
    expect(await recoverQuotedParent(null, deps)).toBeNull();
    expect(await recoverQuotedParent(undefined, deps)).toBeNull();
    expect(deps.findTicketByTelegramId).not.toHaveBeenCalled();
    expect(deps.fetchQuotedMessage).not.toHaveBeenCalled();
  });
});
