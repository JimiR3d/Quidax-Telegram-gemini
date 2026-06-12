import { describe, it, expect } from "vitest";
import {
  extractUpdateChannelId,
  updateTargetsChannel,
} from "../telegram-guards";

const TARGET = "1234567890";

const editUpdate = (channelId: any) => ({
  className: "UpdateEditChannelMessage",
  message: {
    id: 139500,
    message: "edited text",
    peerId: { className: "PeerChannel", channelId },
  },
});

const deleteUpdate = (channelId: any, ids: number[] = [139501]) => ({
  className: "UpdateDeleteChannelMessages",
  channelId,
  messages: ids,
});

describe("edit/delete updates are matched to the target group only", () => {
  it("accepts an edit in the target supergroup", () => {
    expect(updateTargetsChannel(editUpdate("1234567890"), TARGET)).toBe(true);
  });

  it("rejects an edit from a different channel", () => {
    expect(updateTargetsChannel(editUpdate("9876543210"), TARGET)).toBe(false);
  });

  it("accepts a delete in the target supergroup", () => {
    expect(updateTargetsChannel(deleteUpdate("1234567890"), TARGET)).toBe(
      true,
    );
  });

  it("rejects a delete from a different channel (the live corruption case)", () => {
    // Railway logs 2026-06-12: foreign-chat ids 55659/55660 collided with our
    // rows; the delete handler could have dismissed real tickets.
    expect(
      updateTargetsChannel(deleteUpdate("9876543210", [55659, 55660]), TARGET),
    ).toBe(false);
  });

  it("rejects DM/basic-group edits (UpdateEditMessage has no channel id)", () => {
    const update = {
      className: "UpdateEditMessage",
      message: {
        id: 221507,
        message: "edited in a DM",
        peerId: { className: "PeerUser", userId: "42" },
      },
    };
    expect(extractUpdateChannelId(update)).toBe(null);
    expect(updateTargetsChannel(update, TARGET)).toBe(false);
  });

  it("rejects DM/basic-group deletes (UpdateDeleteMessages carries no chat identity)", () => {
    const update = {
      className: "UpdateDeleteMessages",
      messages: [55659, 55660],
    };
    expect(extractUpdateChannelId(update)).toBe(null);
    expect(updateTargetsChannel(update, TARGET)).toBe(false);
  });

  it("fails safe while the target channel id is not resolved yet", () => {
    expect(updateTargetsChannel(editUpdate("1234567890"), null)).toBe(false);
  });

  it("matches GramJS BigInteger channel ids via string conversion", () => {
    expect(
      updateTargetsChannel(editUpdate(BigInt("1234567890")), TARGET),
    ).toBe(true);
    expect(
      updateTargetsChannel(deleteUpdate(BigInt("1234567890")), TARGET),
    ).toBe(true);
  });

  it("rejects malformed updates without crashing", () => {
    expect(updateTargetsChannel(undefined, TARGET)).toBe(false);
    expect(
      updateTargetsChannel({ className: "UpdateEditChannelMessage" }, TARGET),
    ).toBe(false);
    expect(
      updateTargetsChannel(
        { className: "UpdateDeleteChannelMessages" },
        TARGET,
      ),
    ).toBe(false);
  });
});
