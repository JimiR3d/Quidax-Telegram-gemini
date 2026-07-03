// dismissed-audit.ts
//
// Phase 4 hardening (2026-07-03): the safety net for the worst failure class —
// a REAL support issue that the noise pipeline filed under Dismissed, where
// nobody ever looks. The 2026-07-02 full-system audit found exactly one of
// these in the wild ("Pls do a refund", pre-filtered before it reached the
// classifier). The pre-filter fix stops that specific miss; this module powers
// the ongoing audit surface (GET /api/dismissed-audit + the dashboard modal)
// that lists Dismissed tickets whose text carries actionable signals, so a
// future miss is caught by a human instead of staying invisible forever.
//
// Design bias: PRECISION over recall. This scans a banter-heavy pool (most
// Dismissed tickets are genuine chatter), and a flood of false flags would
// kill the surface — nobody reviews a list that is 95% noise. A missed flag
// just leaves the ticket Dismissed, which is the status quo. So every signal
// is an AND-gate of independent regexes (all must match), mirroring the
// conservative-AND pattern of noise-prefilter.ts, just pointed the other way.
//
// Pure module, project convention: no I/O, unit-tested in
// tests/dismissed-audit.test.ts; the thin DB-bound endpoint lives in server.ts.

export interface ActionableSignal {
  // Short human-readable label shown as a badge in the audit modal.
  label: string;
  // Every regex must match for the signal to fire (AND-gate).
  all: RegExp[];
}

// Money/asset words shared by the funds-related gates.
const MONEY_TERMS =
  /\b(withdraw(?:al)?s?|deposit(?:ed|s)?|transfer(?:red|s)?|transactions?|txn?|money|funds?|balance|usdt|usdc|btc|eth|xrp|qdx|ngn|naira)\b/i;

export const ACTIONABLE_AUDIT_SIGNALS: ActionableSignal[] = [
  // A refund request is actionable on its own — this is the exact audit find.
  { label: "refund", all: [/\brefund(?:ed|s)?\b/i] },
  // Money that moved wrong: a money term PLUS a problem term, order-free.
  // Includes the Pidgin phrasings the classifier glossary already knows
  // ("money never enter", "dem chop my money").
  {
    label: "stuck funds",
    all: [
      MONEY_TERMS,
      /\b(stuck|pending|fail(?:ed|ing)?|delay(?:ed)?|missing|lost|gone|disappeared|reversed?|debited|deducted|chop(?:ped)?|never (?:enter(?:ed)?|came|arrived|received)|not (?:yet )?(?:received?|credit(?:ed)?|confirm(?:ed)?|enter(?:ed)?)|no dey enter|yet to (?:receive|enter|reflect))\b/i,
    ],
  },
  // Locked out of the account or a security step.
  {
    label: "account access",
    all: [
      /\b(accounts?|log ?in|password|2fa|otp|app)\b/i,
      /\b(block(?:ed)?|lock(?:ed)?|restrict(?:ed)?|suspend(?:ed)?|disabled?|banned|can'?t|cannot|unable|no fit)\b/i,
    ],
  },
  // First-person theft/compromise claims. The first-person gate keeps the
  // group's constant third-party anti-scam chatter ("beware of scammers")
  // from flooding the list.
  {
    label: "hacked/stolen",
    all: [
      /\b(hack(?:ed)?|stolen|stole|scam(?:med)?|fraud(?:ulent)?|unauthorized|compromis(?:ed)?)\b/i,
      /\b(my|me|i|i'm|i've|mine)\b/i,
    ],
  },
  // KYC / verification that appears to be going wrong (not a how-to question).
  {
    label: "kyc stuck",
    all: [
      /\b(kyc|verif(?:y|ied|ication)|bvn|nin)\b/i,
      /\b(stuck|pending|fail(?:ed|ing)?|reject(?:ed)?|delay(?:ed)?|still|days?|weeks?|since)\b/i,
    ],
  },
];

// Return the labels of every actionable signal the text carries (empty array
// for clean banter). Callers pass the USER side of the thread only
// (userThreadText) so an admin reply's wording never flags a ticket.
export function findActionableSignals(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return [];
  return ACTIONABLE_AUDIT_SIGNALS.filter((s) =>
    s.all.every((re) => re.test(text)),
  ).map((s) => s.label);
}

// Bounded preview of the user's text for the audit list UI.
export const AUDIT_SNIPPET_LEN = 140;
export function buildAuditSnippet(text: string): string {
  const trimmed = String(text || "").trim().replace(/\s+/g, " ");
  return trimmed.length <= AUDIT_SNIPPET_LEN
    ? trimmed
    : trimmed.slice(0, AUDIT_SNIPPET_LEN - 1) + "…";
}
