// handoff-detect.ts
//
// Phase 0 (2026-06-20): the user's complaint that many "In Review" tickets are
// "actually resolved" is largely the DM/email hand-off case — an admin replies
// "send us an email at support@quidax.com" or "DM me", and the resolution then
// happens OFF-PLATFORM where the listener can never see it. Those tickets sit in
// the active queue and read like unanswered failures.
//
// This pure helper detects that hand-off from a ticket's accumulated raw_text so
// the dashboard can show an honest "Handed Off" badge instead of a misleading
// "In Review"/"Admin Replied". It mirrors the noise-prefilter.ts / assumed-
// resolved.ts convention: the decision is a tested pure function; the caller
// (src/App.tsx) only renders a badge from the boolean.
//
// It deliberately looks ONLY at the admin-authored turns, so a USER saying "I
// already emailed support" never trips the badge. Patterns are specific (err
// toward NOT flagging) — a false positive would hide a real open issue.

// Email redirects ("we'll handle it over email"). These are the cleanest,
// most common hand-off — Phase 3 promotes them (plus DM) to a real "Handed off"
// status, not just a display badge.
export const EMAIL_HANDOFF_PATTERNS: RegExp[] = [
  /\bsend (?:us|me) an? email\b/i,
  /\bsend an email\b/i,
  /\bemail (?:us|support)\b/i,
  /support@quidax\.com/i,
];

// DM / direct-message redirects — equally off-platform (the listener only sees
// the group), so they get the same treatment as email.
export const DM_HANDOFF_PATTERNS: RegExp[] = [
  /\b(?:dm|message) me\b/i,
  /\bsend me a (?:dm|direct message)\b/i,
  /\bdrop (?:me )?a dm\b/i,
  /\bin my dms?\b/i,
];

const HANDOFF_PATTERNS: RegExp[] = [
  ...EMAIL_HANDOFF_PATTERNS,
  ...DM_HANDOFF_PATTERNS,
];

// Pull only the [ADMIN_REPLY] ... [/ADMIN_REPLY] turns out of the thread. The
// open tag may carry a suffix — " (Auto-Resolved)" or, from Phase 1, " id=123".
export function extractAdminText(rawText: string): string {
  if (typeof rawText !== "string" || !rawText) return "";
  const blocks = [
    ...rawText.matchAll(/\[ADMIN_REPLY(?:[^\]]*)\]([\s\S]*?)\[\/ADMIN_REPLY\]/g),
  ];
  return blocks.map((m) => m[1]).join("\n");
}

// True when an admin reply in the thread redirected the user to DM/email/support.
export function detectHandoff(rawText: string): boolean {
  const adminText = extractAdminText(rawText);
  if (!adminText) return false;
  return HANDOFF_PATTERNS.some((re) => re.test(adminText));
}

// --- Single-reply detectors (Phase 3) --------------------------------------
// detectHandoff above works on a ticket's accumulated raw_text (badge). These
// operate on ONE admin reply string — reclassifyFromAdminReply has the single
// reply in hand, not the whole thread. Same runtime guard (non-string → false).

// Email-only hand-off in a single admin reply ("send an email to
// support@quidax.com"). The literal isEmailHandoff name the task asked for.
export function isEmailHandoff(text: string): boolean {
  if (typeof text !== "string" || !text) return false;
  return EMAIL_HANDOFF_PATTERNS.some((re) => re.test(text));
}

// Any off-platform hand-off (email OR DM) in a single admin reply. This is the
// one the server uses to set the "Handed off" status, matching the email+DM
// scope of the display badge so status and badge never disagree.
export function isOffPlatformHandoff(text: string): boolean {
  if (typeof text !== "string" || !text) return false;
  return HANDOFF_PATTERNS.some((re) => re.test(text));
}
