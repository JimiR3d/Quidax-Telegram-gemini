// telegram-guards.ts
//
// Telegram message IDs are only unique PER CHAT. The Raw edit/delete updates
// GramJS delivers cover every chat the session account is in, so a message id
// from an unrelated DM or small group can collide with one of our group's ids
// and corrupt our rows (seen live 2026-06-12: edits to foreign-chat ids
// 221507/55659/55660 overwrote rows while the group's own sequence was
// ~139xxx). Every edit/delete update must therefore prove it belongs to the
// target group before any DB write.
//
// The target group is a public supergroup, so its edits arrive as
// UpdateEditChannelMessage and its deletes as UpdateDeleteChannelMessages —
// both carry a channel id. The DM/basic-group variants (UpdateEditMessage,
// UpdateDeleteMessages) carry no channel id at all (UpdateDeleteMessages has
// no chat identity whatsoever), so they can never be matched to the group and
// are always rejected.

export function extractUpdateChannelId(update: any): string | null {
  if (!update) return null;
  if (update.className === "UpdateEditChannelMessage") {
    const chanId = update.message?.peerId?.channelId;
    return chanId != null ? String(chanId) : null;
  }
  if (update.className === "UpdateDeleteChannelMessages") {
    return update.channelId != null ? String(update.channelId) : null;
  }
  return null;
}

export function updateTargetsChannel(
  update: any,
  targetChannelId: string | null,
): boolean {
  // An unresolved target id fails safe: skip the update rather than risk
  // writing another chat's edit/delete into our rows.
  if (!targetChannelId) return false;
  const chanId = extractUpdateChannelId(update);
  return chanId !== null && chanId === targetChannelId;
}

// Diagnostic-only summary of ANY update, for the LISTENER_DEBUG logger in
// server.ts (live-listener research spike). The live NewMessage handler
// delivers nothing from the target supergroup even though the account is a
// member and getDialogs() priming succeeds (Fix 10 verdict, 2026-06-14), and
// GramJS 2.26.x has no getChannelDifference / UpdateChannelTooLong handling, so
// we are blind to what Telegram actually pushes. This lets a short production
// window reveal whether the channel's UpdateNewChannelMessage arrives or is
// replaced by an UpdateChannelTooLong that GramJS silently drops.
//
// METADATA ONLY — never the message body (audit rule: never log raw PII).
export interface UpdateSummary {
  className: string | null;
  channelId: string | null;
  pts: number | null;
  ptsCount: number | null;
}

export function describeUpdate(update: any): UpdateSummary {
  if (!update) {
    return { className: null, channelId: null, pts: null, ptsCount: null };
  }
  const className =
    typeof update.className === "string" ? update.className : null;
  // Reuse the tested edit/delete extraction, then broaden it to the channel
  // update types this spike cares about: new-message (peerId.channelId) and the
  // "too long" / generic channel updates that carry a top-level channelId.
  let channelId = extractUpdateChannelId(update);
  if (channelId === null) {
    const peerChanId = update.message?.peerId?.channelId;
    if (peerChanId != null) {
      channelId = String(peerChanId);
    } else if (update.channelId != null) {
      channelId = String(update.channelId);
    }
  }
  const pts = typeof update.pts === "number" ? update.pts : null;
  const ptsCount = typeof update.ptsCount === "number" ? update.ptsCount : null;
  return { className, channelId, pts, ptsCount };
}
