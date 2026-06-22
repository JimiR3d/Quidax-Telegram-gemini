import { describe, it, expect } from "vitest";
import {
  URGENCY_ORDER,
  HIGH_SEVERITY,
  urgencyRank,
  urgencyWithinOne,
  gradeCategory,
  gradeUrgency,
  criticalHighRecall,
  listDisagreements,
  scoreAgreement,
  type RatedRow,
} from "../audit-scoring";

// Helper to build a row with sensible defaults.
function row(p: Partial<RatedRow>): RatedRow {
  return {
    rowId: p.rowId ?? 1,
    aiCategory: p.aiCategory ?? "General Question",
    aiUrgency: p.aiUrgency ?? "Low",
    humanCategory: p.humanCategory ?? "General Question",
    humanUrgency: p.humanUrgency ?? "Low",
  };
}

describe("urgency scale", () => {
  it("orders low → high", () => {
    expect(URGENCY_ORDER).toEqual(["Low", "Medium", "High", "Critical"]);
    expect([...HIGH_SEVERITY].sort()).toEqual(["Critical", "High"]);
  });

  it("ranks known levels and rejects junk", () => {
    expect(urgencyRank("Low")).toBe(0);
    expect(urgencyRank("critical")).toBe(3); // case-insensitive
    expect(urgencyRank(" High ")).toBe(2); // trimmed
    expect(urgencyRank("Urgent")).toBe(-1);
    expect(urgencyRank("")).toBe(-1);
    expect(urgencyRank(null)).toBe(-1);
  });

  it("within-one is true for adjacent or equal, false for 2+ apart or invalid", () => {
    expect(urgencyWithinOne("High", "Critical")).toBe(true);
    expect(urgencyWithinOne("Medium", "Medium")).toBe(true);
    expect(urgencyWithinOne("Low", "High")).toBe(false); // 2 apart
    expect(urgencyWithinOne("Low", "Critical")).toBe(false); // 3 apart
    expect(urgencyWithinOne("High", "bogus")).toBe(false); // invalid
  });
});

describe("gradeCategory", () => {
  it("computes agreement, per-category, and a confusion matrix", () => {
    const rows: RatedRow[] = [
      row({ humanCategory: "Deposit Issue", aiCategory: "Deposit Issue" }),
      row({ humanCategory: "Deposit Issue", aiCategory: "Withdrawal Issue" }),
      row({ humanCategory: "Praise", aiCategory: "Praise" }),
    ];
    const g = gradeCategory(rows);
    expect(g.n).toBe(3);
    expect(g.agree).toBe(2);
    expect(g.agreementPct).toBe(67);
    expect(g.perCategory["Deposit Issue"]).toEqual({ humanTotal: 2, agree: 1, pct: 50 });
    expect(g.perCategory["Praise"]).toEqual({ humanTotal: 1, agree: 1, pct: 100 });
    // confusion: human Deposit Issue → 1 Deposit Issue (diagonal) + 1 Withdrawal
    expect(g.confusion["Deposit Issue"]).toEqual({
      "Deposit Issue": 1,
      "Withdrawal Issue": 1,
    });
  });

  it("matches case-insensitively (rater typed a lowercase label)", () => {
    const g = gradeCategory([
      row({ humanCategory: "deposit issue", aiCategory: "Deposit Issue" }),
    ]);
    expect(g.agree).toBe(1);
  });
});

describe("gradeUrgency", () => {
  it("reports exact and within-one separately", () => {
    const rows: RatedRow[] = [
      row({ humanUrgency: "High", aiUrgency: "High" }), // exact + within
      row({ humanUrgency: "High", aiUrgency: "Critical" }), // within only
      row({ humanUrgency: "Low", aiUrgency: "High" }), // neither
    ];
    const g = gradeUrgency(rows);
    expect(g.n).toBe(3);
    expect(g.exact).toBe(1);
    expect(g.exactPct).toBe(33);
    expect(g.withinOne).toBe(2);
    expect(g.withinOnePct).toBe(67);
  });
});

describe("criticalHighRecall", () => {
  it("uses the human High/Critical subset as the denominator", () => {
    const rows: RatedRow[] = [
      row({ humanUrgency: "Critical", aiUrgency: "High" }), // caught (both high-sev)
      row({ humanUrgency: "High", aiUrgency: "Medium" }), // missed
      row({ humanUrgency: "High", aiUrgency: "Critical" }), // caught
      row({ humanUrgency: "Low", aiUrgency: "Critical" }), // not in subset
    ];
    const r = criticalHighRecall(rows);
    expect(r.n).toBe(3); // 3 human High/Critical rows
    expect(r.caught).toBe(2);
    expect(r.recallPct).toBe(67);
  });

  it("returns null recall when there are no urgent rows", () => {
    const r = criticalHighRecall([row({ humanUrgency: "Low", aiUrgency: "Low" })]);
    expect(r.n).toBe(0);
    expect(r.recallPct).toBe(null);
  });
});

describe("unrated rows are excluded from every denominator", () => {
  it("drops blank or unrecognised human cells", () => {
    const rows: RatedRow[] = [
      row({ humanCategory: "Deposit Issue", humanUrgency: "High", aiCategory: "Deposit Issue", aiUrgency: "High" }),
      row({ humanCategory: "", humanUrgency: "High" }), // blank category → unrated
      row({ humanCategory: "Deposit Issue", humanUrgency: "" }), // blank urgency → unrated
      row({ humanCategory: "Deposit Issue", humanUrgency: "Urgent" }), // bad urgency → unrated
    ];
    const rep = scoreAgreement(rows);
    expect(rep.total).toBe(4);
    expect(rep.rated).toBe(1);
    expect(rep.unrated).toBe(3);
    expect(rep.category.n).toBe(1);
    expect(rep.urgency.n).toBe(1);
  });
});

describe("listDisagreements", () => {
  it("flags category mismatch OR urgency >1 level apart", () => {
    const rows: RatedRow[] = [
      row({ humanCategory: "Deposit Issue", aiCategory: "Deposit Issue", humanUrgency: "High", aiUrgency: "Critical" }), // agree (within one)
      row({ humanCategory: "Deposit Issue", aiCategory: "Withdrawal Issue", humanUrgency: "High", aiUrgency: "High" }), // cat mismatch
      row({ humanCategory: "Praise", aiCategory: "Praise", humanUrgency: "Low", aiUrgency: "Critical" }), // urgency far apart
    ];
    const d = listDisagreements(rows);
    expect(d.length).toBe(2);
    expect(d.map((r) => r.aiCategory)).toEqual(["Withdrawal Issue", "Praise"]);
  });
});

describe("scoreAgreement (bundle)", () => {
  it("returns null rates on an empty input rather than NaN", () => {
    const rep = scoreAgreement([]);
    expect(rep.total).toBe(0);
    expect(rep.rated).toBe(0);
    expect(rep.category.agreementPct).toBe(null);
    expect(rep.urgency.exactPct).toBe(null);
    expect(rep.highSeverityRecall.recallPct).toBe(null);
    expect(rep.disagreements).toEqual([]);
  });

  it("is deterministic across repeated calls", () => {
    const rows: RatedRow[] = [
      row({ humanCategory: "Deposit Issue", aiCategory: "Deposit Issue", humanUrgency: "High", aiUrgency: "High" }),
      row({ humanCategory: "Praise", aiCategory: "Spam/Irrelevant", humanUrgency: "Low", aiUrgency: "Low" }),
    ];
    expect(scoreAgreement(rows)).toEqual(scoreAgreement(rows));
  });
});
