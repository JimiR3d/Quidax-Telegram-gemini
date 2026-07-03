// classification-policy.ts
//
// Status policy for freshly classified tickets (approved in the 2026-06-12
// audit). The previous policy auto-dismissed "General Question" and "Other" —
// but "General Question" is also what every failed or fumbled classification
// defaults to, so any message the model couldn't read was silently hidden
// from the dashboard. The rules now are:
//
//   - Only pre-filtered chatter, Spam/Irrelevant, Praise, and Community Chat
//     are dismissed (Community Chat = benign greetings/banter, split out of
//     Spam/Irrelevant by the Phase-3 taxonomy rework so scams and friendly
//     noise stop sharing a bucket).
//   - "General Question" stays visible as Open with Low urgency (the Issues
//     Only view already excludes the category from triage).
//   - A failed/fallback classification is NEVER dismissible and never
//     escalates: it is flagged [NEEDS REVIEW] in the summary and kept Open
//     for a human.
//   - A fresh Critical stays "Open" with an [ESCALATED] summary prefix. It
//     used to land as "In Review", which the dashboard renders as "Admin
//     Replied" — dishonest for a ticket no admin has touched (Phase 3).

export const AUTO_DISMISS_CATEGORIES = [
  "Praise",
  "Spam/Irrelevant",
  "Community Chat",
];

// Urgent-is-never-noise guard (2026-07-03). A High/Critical verdict on a
// noise-category ticket is either a real issue mis-bucketed (live ticket
// 25f6281d: a 100k scam complaint reclassified to General Question by an
// admin-reply correction, urgency untouched) or the classifier contradicting
// itself — both deserve human eyes. Fresh classifications can't create the
// combo (decideClassificationOutcome forces Low for General Question /
// Community Chat), but side paths that never re-derive urgency can:
// admin-reply reclassify, /train category fixes, dashboard urgency bumps,
// and historical rows. So the guard lives at the READ layer, where it
// catches every path, past and future.
export const ALWAYS_VISIBLE_URGENCIES = ["High", "Critical"];

const quoteCategoryList = (categories: string[]) =>
  categories.map((c) => `"${c}"`).join(",");

// PostgREST .or() disjuncts for the Issues Only lane: still-classifying
// placeholders, real-category non-Low tickets, and the urgent-never-noise
// guard. Dismissed stays out of the lane — the Dismissed Audit surface
// carries the urgency contradiction there instead.
export function issuesOnlyOrClause(
  nonEssentialCategories: string[],
): string {
  return (
    `summary.eq."Processing message...",` +
    `and(category.not.in.(${quoteCategoryList(nonEssentialCategories)}),urgency.neq.Low),` +
    `and(urgency.in.(${ALWAYS_VISIBLE_URGENCIES.join(",")}),status.neq.Dismissed)`
  );
}

// PostgREST .or() for the auto-resolve sweeps' category eligibility: a noise
// category no longer excludes a ticket the classifier itself rated
// High/Critical — once such a ticket is visible in the lane it must also be
// closeable by the sweeps, or it sits active forever.
export function sweepCategoryOrClause(
  nonEssentialCategories: string[],
): string {
  return (
    `category.not.in.(${quoteCategoryList(nonEssentialCategories)}),` +
    `urgency.in.(${ALWAYS_VISIBLE_URGENCIES.join(",")})`
  );
}

// True when a parsed "General Question" was never actually said by the model:
// the category field was missing/invalid (Zod .catch default) or an unknown
// label that normalizeCategory defaulted. A genuine "General Question" (or
// "general enquiry" etc.) is NOT a fallback.
export function isCategoryFallback(
  parsedCategory: string,
  rawCategory: unknown,
): boolean {
  if (parsedCategory !== "General Question") return false;
  return !(
    typeof rawCategory === "string" && /general|question/i.test(rawCategory)
  );
}

export interface ClassificationOutcome {
  status: string;
  summary: string;
  urgency: string;
}

export function decideClassificationOutcome(
  ticketData: {
    // Zod .catch() defaults make these optional in the inferred type; they
    // always exist at runtime, but default defensively just in case.
    category?: string;
    urgency?: string;
    summary?: string;
    classification_failed?: boolean;
  },
  flags: {
    isAdminSender: boolean;
    isResolution: boolean;
    isPreFiltered: boolean;
  },
): ClassificationOutcome {
  const failed = !!ticketData.classification_failed;
  const category = ticketData.category ?? "General Question";
  const summary = ticketData.summary ?? "User inquiry";
  const urgency =
    !failed &&
    (category === "General Question" || category === "Community Chat")
      ? "Low"
      : ticketData.urgency ?? "Medium";
  const needsEscalation = !failed && urgency === "Critical";
  const isAutoDismiss = !failed && AUTO_DISMISS_CATEGORIES.includes(category);
  const status = flags.isAdminSender
    ? "Resolved"
    : flags.isResolution
      ? "Resolved"
      : flags.isPreFiltered || isAutoDismiss
        ? "Dismissed"
        : "Open";
  const finalSummary = failed
    ? `[NEEDS REVIEW] ${summary}`
    : needsEscalation
      ? `[ESCALATED] ${summary}`
      : summary;
  return { status, summary: finalSummary, urgency };
}
