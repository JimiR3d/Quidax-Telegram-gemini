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

const HANDOFF_PATTERNS: RegExp[] = [
  /\bsend (?:us|me) an? email\b/i,
  /\bsend an email\b/i,
  /\bemail (?:us|support)\b/i,
  /support@quidax\.com/i,
  /\b(?:dm|message) me\b/i,
  /\bsend me a (?:dm|direct message)\b/i,
  /\bdrop (?:me )?a dm\b/i,
  /\bin my dms?\b/i,
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
