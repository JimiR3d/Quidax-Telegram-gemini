// urgency-correction.ts
//
// Phase 2 (2026-07-02): manual urgency correction. Humans can now fix a
// ticket's urgency from the dashboard (a per-row dropdown → the dedicated
// `human_urgency` correction source) or from /train (the `human_ui` row gains
// `original_urgency` / `correct_urgency`). This module owns the pure pieces —
// the "was urgency human-set?" guard, the grouped-reclassify update payload,
// and the few-shot merge/formatting — so they are unit-testable with plain
// values, mirroring classification-policy.ts / admin-reply-resolution.ts.
//
// Semantics that must not drift:
// - NULL urgency columns mean "urgency not reviewed" (all pre-021 rows, and
//   human_skip rows — a skip is no judgment).
// - A human_ui row stamps correct_urgency = (chosen ?? current) for training
//   data, so a PASSIVE confirm (reviewer never touched the dropdown) has
//   original === correct. That is NOT a human-set urgency — it must never
//   freeze urgency against legitimate reclassification when an urgent
//   follow-up folds in. Only an ACTIVE change (original !== correct) or a
//   dashboard human_urgency row (always deliberate) counts.
// - human_urgency rows carry NO category judgment (original_category is
//   stamped = correct_category only because the columns are NOT NULL), so
//   few-shot must never present them as a human-confirmed category.

export interface UrgencyCorrectionRow {
  message_text: string;
  original_category: string;
  correct_category: string;
  correction_source: string;
  original_urgency: string | null;
  correct_urgency: string | null;
}

// One few-shot teaching example after merging all corrections rows that share
// a message_text. `category: null` = only urgency was ever reviewed for this
// message; `urgency: null` = only category was (or the rows predate 021).
export interface MergedCorrection {
  message_text: string;
  category: { original: string; correct: string } | null;
  urgency: { original: string | null; correct: string } | null;
}

// True when any corrections row proves a human DELIBERATELY set this ticket's
// urgency: a dashboard human_urgency row, or a /train human_ui row where the
// reviewer actively changed the value. admin_reply rows never carry urgency
// judgment; human_skip rows never carry any judgment.
export function shouldPreserveHumanUrgency(
  rows: Pick<
    UrgencyCorrectionRow,
    "correction_source" | "original_urgency" | "correct_urgency"
  >[],
): boolean {
  for (const r of rows) {
    if (r.correct_urgency == null) continue;
    if (r.correction_source === "human_urgency") return true;
    if (
      r.correction_source === "human_ui" &&
      r.original_urgency != null &&
      r.correct_urgency !== r.original_urgency
    )
      return true;
  }
  return false;
}

export interface GroupedReclassifyFields {
  summary: string;
  category: string;
  urgency: string;
  product_area: string;
  sentiment: string;
  is_complaint: boolean;
  suggested_action: string;
  suggested_reply: string | null;
}

// The tickets.update payload for reclassifyGroupedTicket. When a human set the
// urgency, the `urgency` KEY is omitted entirely (not set to the old value) so
// the write can never race a concurrent human change. updated_at is always
// stamped — there is no DB trigger.
export function buildGroupedUpdatePayload(
  fields: GroupedReclassifyFields,
  preserveUrgency: boolean,
  nowISO: string,
): Record<string, unknown> {
  const { urgency, ...rest } = fields;
  const payload: Record<string, unknown> = { ...rest, updated_at: nowISO };
  if (!preserveUrgency) payload.urgency = urgency;
  return payload;
}

// Newest-first merge-dedupe by message_text for few-shot injection.
//
// Before Phase 2 the dedupe was "newest row wins the message". That would now
// let a later urgency-only (human_urgency) row SHADOW an earlier category
// correction for the same message — silently dropping the core category
// teaching signal. Instead, per message: the category verdict comes from the
// newest row that carries one (any source except human_urgency), and the
// urgency verdict from the newest row with a non-null correct_urgency. With
// only pre-021 rows this reproduces the old newest-wins behaviour exactly.
// human_skip rows are skipped defensively (callers already filter them in SQL).
export function dedupeAndMergeCorrections(
  rowsNewestFirst: UrgencyCorrectionRow[],
): MergedCorrection[] {
  const byMessage = new Map<string, MergedCorrection>();
  for (const r of rowsNewestFirst) {
    if (r.correction_source === "human_skip") continue;
    let merged = byMessage.get(r.message_text);
    if (!merged) {
      merged = { message_text: r.message_text, category: null, urgency: null };
      byMessage.set(r.message_text, merged);
    }
    if (merged.category === null && r.correction_source !== "human_urgency") {
      merged.category = {
        original: r.original_category,
        correct: r.correct_category,
      };
    }
    if (merged.urgency === null && r.correct_urgency != null) {
      merged.urgency = {
        original: r.original_urgency ?? null,
        correct: r.correct_urgency,
      };
    }
  }
  // Map preserves insertion order = first-seen (newest) order, matching the
  // old dedupe's ordering.
  return Array.from(byMessage.values());
}

// One few-shot example line. The two category-only variants are byte-identical
// to the pre-Phase-2 strings (regression-guarded in tests) so the injected
// prompt only changes where urgency information actually exists. A row with no
// category judgment (dashboard urgency change only) makes NO category claim.
export function correctionFewShotLine(
  row: MergedCorrection,
  sanitizedMsg: string,
): string {
  const parts = [`Message: "${sanitizedMsg}"`];
  if (row.category) {
    parts.push(
      row.category.original === row.category.correct
        ? `Correct category (human-confirmed): ${row.category.correct}`
        : `Correct category: ${row.category.correct} (the AI previously chose "${row.category.original}" and a human corrected it)`,
    );
  }
  if (row.urgency) {
    parts.push(
      row.urgency.original === null ||
        row.urgency.original === row.urgency.correct
        ? `Correct urgency (human-confirmed): ${row.urgency.correct}`
        : `Correct urgency: ${row.urgency.correct} (the AI previously chose "${row.urgency.original}" and a human corrected it)`,
    );
  }
  return parts.join("\n");
}
