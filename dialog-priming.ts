// dialog-priming.ts
//
// Pure helper for the LIVE Telegram listener's startup/reconnect priming step.
//
// Background (KNOWN_ISSUES §6 item 1, Fix 6 follow-up 2026-06-13): on the
// production build the live NewMessage listener delivered NOTHING — every
// recent message was ingested by the 15-min AutoFetch sweep (min ingest lag
// 186s, never the 1-5s of live delivery), while the same client's getEntity /
// getMessages calls worked fine. Root cause: GramJS 2.26.x has a PUSH-ONLY
// update system — catchUp() is a no-op stub and there is no getDifference /
// getChannelDifference recovery (node_modules/telegram/client/updates.js). To
// be pushed UpdateNewChannelMessage for a SUPERGROUP, the session must be
// primed once with client.getDialogs() after connecting from a StringSession.
// The listener never primed, so Telegram never pushed the group's messages.
//
// getDialogs() priming also answers the question the audit could not settle
// without a second live session (forbidden while production runs): is the
// account even a MEMBER of the target group? If the target channel is ABSENT
// from the dialog list, the account is not a member (e.g. the Milestone 5
// USER_BANNED_IN_CHANNEL ban), and no code change can revive live delivery —
// AutoFetch keeps working only because public-channel history is readable by
// non-members. This decision is extracted here so it is unit-testable without
// a live GramJS session (tlClient is null on the no-telegram launcher), exactly
// like listener-health.ts / telegram-guards.ts.

import {
  ChatIdentity,
  isMessageInTargetGroup,
  matchPath,
} from "./listener-health";

export interface TargetDialogResult {
  // Is the target group present in the fetched dialog list?
  present: boolean;
  // How the match was made (or null when not present), purely for logging so a
  // production observation can confirm the exact channel-id path is firing.
  matchedBy: "channelId" | "fallback" | null;
  // The matched dialog's id (string) when present, else null.
  matchedId: string | null;
  // How many dialogs were scanned (0 when the list was empty/unavailable).
  dialogCount: number;
}

// Decide whether the target group appears among the dialogs returned by
// getDialogs(). Reuses the already-tested isMessageInTargetGroup matching rules
// (exact resolved-channel-id match, with the username/title fallback only while
// the id is unresolved) so the dialog-membership decision can never drift from
// the live NewMessage handler's in-target decision.
export function findTargetInDialogs(
  dialogs: Array<ChatIdentity | null | undefined> | null | undefined,
  targetGroup: string,
  targetChannelId: string | null,
): TargetDialogResult {
  const dialogCount = dialogs ? dialogs.length : 0;
  if (!dialogs || dialogCount === 0) {
    return { present: false, matchedBy: null, matchedId: null, dialogCount: 0 };
  }
  for (const d of dialogs) {
    if (isMessageInTargetGroup(d, targetGroup, targetChannelId)) {
      return {
        present: true,
        matchedBy: matchPath(d, targetChannelId),
        matchedId: d && d.id != null ? String(d.id) : null,
        dialogCount,
      };
    }
  }
  return { present: false, matchedBy: null, matchedId: null, dialogCount };
}
