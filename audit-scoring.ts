// audit-scoring.ts
//
// The trustworthy CORE of the real-traffic agreement audit (2026-06-21).
//
// Why this exists: the 20 self-authored gold cases (benchmark-cases.ts) fail the
// "you wrote the test AND the answer key" test, and the /api/verify panel is
// selection-biased (it only ever sees the AI's hardest, human-corrected cases).
// The credible number instead comes from REAL recent messages, classified by the
// production model, then judged by a HUMAN rater who is BLIND to the AI's answer.
// This module turns the joined (ai-label, human-label) rows into the reported
// numbers. It is the one piece that must be reproducible and not gameable, so it
// lives as a committed, unit-tested PURE module (same convention as
// assumed-resolved.ts / topic-shift.ts) — no DB, no LLM, no I/O, fully
// deterministic. The sampler/scorer scripts are operational glue around it.
//
// Grading rules (chosen so the number is FAIR, not flattering):
//   - Category: exact agreement, plus a confusion matrix + per-category breakdown
//     so failure modes are visible instead of hidden behind one percentage.
//   - Urgency: report exact-match AND "within one level". Severity is subjective
//     (one rater's High is another's Critical), so exact-match alone under-sells a
//     usable classifier; within-one is the fair read.
//   - Critical/High recall: of the messages the HUMAN marked Critical or High,
//     what fraction did the AI also flag Critical/High. This is the business
//     metric — catching the urgent ones — and a miss here is the real harm.
//
// A human cell left blank or holding an unrecognised label is treated as UNRATED
// and excluded from every denominator (reported separately), mirroring the
// verify endpoint's "transient errors never count as a wrong answer" honesty.

// Severity rank, low → high. within-one compares positions on this scale.
export const URGENCY_ORDER = ["Low", "Medium", "High", "Critical"] as const;

// The urgency levels the business cares about catching.
export const HIGH_SEVERITY = new Set(["High", "Critical"]);

export interface RatedRow {
  rowId: string | number;
  aiCategory: string;
  aiUrgency: string;
  humanCategory: string;
  humanUrgency: string;
}

// Trim + case-insensitive canonicalisation. The blind worksheet uses
// data-validation dropdowns so values should already be canonical, but a rater
// may hand-type, so we normalise defensively rather than scoring a typo as a miss.
function norm(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}
function eqLabel(a: unknown, b: unknown): boolean {
  const na = norm(a);
  const nb = norm(b);
  return na !== "" && na.toLowerCase() === nb.toLowerCase();
}

// Position on URGENCY_ORDER (case-insensitive), or -1 if not a known level.
export function urgencyRank(u: unknown): number {
  const n = norm(u).toLowerCase();
  return URGENCY_ORDER.findIndex((x) => x.toLowerCase() === n);
}

// True when both urgencies are valid AND no more than one level apart.
export function urgencyWithinOne(a: unknown, b: unknown): boolean {
  const ra = urgencyRank(a);
  const rb = urgencyRank(b);
  if (ra < 0 || rb < 0) return false;
  return Math.abs(ra - rb) <= 1;
}

// A row is scorable only when the human supplied BOTH a category and a valid
// urgency. Category just needs to be non-empty (free of a fixed enum here so the
// scorer never silently drops a category the prompt later adds); urgency must map
// onto URGENCY_ORDER so the ordinal comparison is meaningful.
function isRated(r: RatedRow): boolean {
  return norm(r.humanCategory) !== "" && urgencyRank(r.humanUrgency) >= 0;
}

export interface CategoryGrade {
  n: number; // scored rows
  agree: number;
  agreementPct: number | null;
  // perCategory keyed by the HUMAN label (ground truth): how many the human
  // assigned and how many the AI agreed on.
  perCategory: Record<string, { humanTotal: number; agree: number; pct: number | null }>;
  // confusion[humanLabel][aiLabel] = count. Reads as "when the human said X, the
  // AI said Y this many times" — the diagonal is agreement.
  confusion: Record<string, Record<string, number>>;
}

export interface UrgencyGrade {
  n: number;
  exact: number;
  exactPct: number | null;
  withinOne: number;
  withinOnePct: number | null;
}

export interface RecallGrade {
  n: number; // size of the human High/Critical subset
  caught: number; // of those, how many the AI also marked High/Critical
  recallPct: number | null;
}

export interface AgreementReport {
  total: number; // all rows handed in
  rated: number; // rows with a usable human judgment (the denominator)
  unrated: number; // blank / unrecognised human cells, excluded from every rate
  category: CategoryGrade;
  urgency: UrgencyGrade;
  highSeverityRecall: RecallGrade;
  disagreements: RatedRow[];
}

function pct(n: number, d: number): number | null {
  return d > 0 ? Math.round((n / d) * 100) : null;
}

export function gradeCategory(rows: RatedRow[]): CategoryGrade {
  const scored = rows.filter(isRated);
  const perCategory: CategoryGrade["perCategory"] = {};
  const confusion: CategoryGrade["confusion"] = {};
  let agree = 0;
  for (const r of scored) {
    const human = norm(r.humanCategory);
    const ai = norm(r.aiCategory) || "(none)";
    const hit = eqLabel(r.humanCategory, r.aiCategory);
    if (hit) agree++;
    perCategory[human] ??= { humanTotal: 0, agree: 0, pct: null };
    perCategory[human].humanTotal++;
    if (hit) perCategory[human].agree++;
    confusion[human] ??= {};
    confusion[human][ai] = (confusion[human][ai] || 0) + 1;
  }
  for (const k of Object.keys(perCategory)) {
    perCategory[k].pct = pct(perCategory[k].agree, perCategory[k].humanTotal);
  }
  return {
    n: scored.length,
    agree,
    agreementPct: pct(agree, scored.length),
    perCategory,
    confusion,
  };
}

export function gradeUrgency(rows: RatedRow[]): UrgencyGrade {
  const scored = rows.filter(isRated);
  let exact = 0;
  let within = 0;
  for (const r of scored) {
    if (eqLabel(r.humanUrgency, r.aiUrgency)) exact++;
    if (urgencyWithinOne(r.humanUrgency, r.aiUrgency)) within++;
  }
  return {
    n: scored.length,
    exact,
    exactPct: pct(exact, scored.length),
    withinOne: within,
    withinOnePct: pct(within, scored.length),
  };
}

// Recall on the urgent classes: of the rows the HUMAN marked High/Critical, how
// many did the AI also put in High/Critical. The denominator is the human subset
// (ground truth), so this answers "did we catch the urgent ones?".
export function criticalHighRecall(rows: RatedRow[]): RecallGrade {
  const scored = rows.filter(isRated);
  const subset = scored.filter((r) => HIGH_SEVERITY.has(norm(r.humanUrgency)));
  const caught = subset.filter((r) => HIGH_SEVERITY.has(norm(r.aiUrgency))).length;
  return { n: subset.length, caught, recallPct: pct(caught, subset.length) };
}

// Rows where the AI and human disagree on category OR are more than one urgency
// level apart — the qualitative review list for the pitch ("here's exactly where
// it disagreed, and why each is defensible").
export function listDisagreements(rows: RatedRow[]): RatedRow[] {
  return rows
    .filter(isRated)
    .filter(
      (r) =>
        !eqLabel(r.humanCategory, r.aiCategory) ||
        !urgencyWithinOne(r.humanUrgency, r.aiUrgency),
    );
}

export function scoreAgreement(rows: RatedRow[]): AgreementReport {
  const rated = rows.filter(isRated);
  return {
    total: rows.length,
    rated: rated.length,
    unrated: rows.length - rated.length,
    category: gradeCategory(rows),
    urgency: gradeUrgency(rows),
    highSeverityRecall: criticalHighRecall(rows),
    disagreements: listDisagreements(rows),
  };
}
