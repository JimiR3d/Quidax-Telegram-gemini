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
