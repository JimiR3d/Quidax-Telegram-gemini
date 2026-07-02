import { describe, it, expect } from "vitest";
import {
  shouldPreserveHumanUrgency,
  buildGroupedUpdatePayload,
  dedupeAndMergeCorrections,
  correctionFewShotLine,
  type UrgencyCorrectionRow,
  type GroupedReclassifyFields,
} from "../urgency-correction";

function row(over: Partial<UrgencyCorrectionRow>): UrgencyCorrectionRow {
  return {
    message_text: "my withdrawal is stuck",
    original_category: "Withdrawal Issue",
    correct_category: "Withdrawal Issue",
    correction_source: "human_ui",
    original_urgency: null,
    correct_urgency: null,
    ...over,
  };
}

describe("shouldPreserveHumanUrgency", () => {
  it("returns false with no corrections", () => {
    expect(shouldPreserveHumanUrgency([])).toBe(false);
  });

  it("preserves for a dashboard human_urgency row (always deliberate)", () => {
    expect(
      shouldPreserveHumanUrgency([
        row({
          correction_source: "human_urgency",
          original_urgency: "Medium",
          correct_urgency: "Critical",
        }),
      ]),
    ).toBe(true);
  });

  it("preserves for a /train review that actively changed urgency", () => {
    expect(
      shouldPreserveHumanUrgency([
        row({ original_urgency: "Medium", correct_urgency: "High" }),
      ]),
    ).toBe(true);
  });

  it("does NOT preserve for a passive /train confirm (dropdown untouched)", () => {
    expect(
      shouldPreserveHumanUrgency([
        row({ original_urgency: "Medium", correct_urgency: "Medium" }),
      ]),
    ).toBe(false);
  });

  it("does NOT preserve for pre-021 rows (null urgency columns)", () => {
    expect(shouldPreserveHumanUrgency([row({})])).toBe(false);
  });

  it("does NOT preserve for admin_reply rows (no urgency judgment)", () => {
    expect(
      shouldPreserveHumanUrgency([
        row({
          correction_source: "admin_reply",
          original_urgency: "Medium",
          correct_urgency: "High",
        }),
      ]),
    ).toBe(false);
  });

  it("one deliberate row among passive ones is enough", () => {
    expect(
      shouldPreserveHumanUrgency([
        row({ original_urgency: "Low", correct_urgency: "Low" }),
        row({
          correction_source: "human_urgency",
          original_urgency: "Low",
          correct_urgency: "High",
        }),
      ]),
    ).toBe(true);
  });
});

describe("buildGroupedUpdatePayload", () => {
  const fields: GroupedReclassifyFields = {
    summary: "User cannot withdraw",
    category: "Withdrawal Issue",
    urgency: "High",
    product_area: "Wallet",
    sentiment: "Frustrated",
    is_complaint: true,
    suggested_action: "Check withdrawal queue",
    suggested_reply: "We are on it",
  };
  const now = "2026-07-02T10:00:00.000Z";

  it("includes urgency when not preserving", () => {
    const p = buildGroupedUpdatePayload(fields, false, now);
    expect(p.urgency).toBe("High");
    expect(p.updated_at).toBe(now);
  });

  it("omits the urgency KEY entirely when preserving", () => {
    const p = buildGroupedUpdatePayload(fields, true, now);
    expect("urgency" in p).toBe(false);
    // every other field still updates
    expect(p.summary).toBe("User cannot withdraw");
    expect(p.category).toBe("Withdrawal Issue");
    expect(p.product_area).toBe("Wallet");
    expect(p.sentiment).toBe("Frustrated");
    expect(p.is_complaint).toBe(true);
    expect(p.suggested_action).toBe("Check withdrawal queue");
    expect(p.suggested_reply).toBe("We are on it");
    expect(p.updated_at).toBe(now);
  });

  it("never mutates its input", () => {
    buildGroupedUpdatePayload(fields, true, now);
    expect(fields.urgency).toBe("High");
  });
});

describe("dedupeAndMergeCorrections", () => {
  it("reproduces the legacy newest-wins dedupe for pre-021 rows", () => {
    const merged = dedupeAndMergeCorrections([
      row({ correct_category: "Deposit Issue" }), // newest
      row({ correct_category: "Trading Problem" }), // older, same message
      row({ message_text: "app crashes", original_category: "App Bug" }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].message_text).toBe("my withdrawal is stuck");
    expect(merged[0].category).toEqual({
      original: "Withdrawal Issue",
      correct: "Deposit Issue",
    });
    expect(merged[0].urgency).toBeNull();
    expect(merged[1].message_text).toBe("app crashes");
  });

  it("a newer urgency-only row no longer shadows an older category correction", () => {
    const merged = dedupeAndMergeCorrections([
      row({
        correction_source: "human_urgency",
        original_urgency: "Low",
        correct_urgency: "Critical",
      }), // newest: dashboard urgency change, category is a placeholder
      row({ original_category: "General Question" }), // older: real category verdict
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].category).toEqual({
      original: "General Question",
      correct: "Withdrawal Issue",
    });
    expect(merged[0].urgency).toEqual({ original: "Low", correct: "Critical" });
  });

  it("an urgency-only message carries no category claim", () => {
    const merged = dedupeAndMergeCorrections([
      row({
        correction_source: "human_urgency",
        original_urgency: "Medium",
        correct_urgency: "High",
      }),
    ]);
    expect(merged[0].category).toBeNull();
    expect(merged[0].urgency).toEqual({ original: "Medium", correct: "High" });
  });

  it("newest wins per signal when both rows carry both signals", () => {
    const merged = dedupeAndMergeCorrections([
      row({
        correct_category: "Deposit Issue",
        original_urgency: "Low",
        correct_urgency: "High",
      }),
      row({
        correct_category: "Trading Problem",
        original_urgency: "Low",
        correct_urgency: "Medium",
      }),
    ]);
    expect(merged[0].category?.correct).toBe("Deposit Issue");
    expect(merged[0].urgency?.correct).toBe("High");
  });

  it("defensively skips human_skip rows even if a caller forgets the SQL filter", () => {
    const merged = dedupeAndMergeCorrections([
      row({ correction_source: "human_skip" }),
    ]);
    expect(merged).toHaveLength(0);
  });
});

describe("correctionFewShotLine", () => {
  const msg = "my withdrawal is stuck";

  it("is byte-identical to the legacy human-confirmed category line", () => {
    const line = correctionFewShotLine(
      {
        message_text: msg,
        category: { original: "Withdrawal Issue", correct: "Withdrawal Issue" },
        urgency: null,
      },
      msg,
    );
    expect(line).toBe(
      `Message: "my withdrawal is stuck"\nCorrect category (human-confirmed): Withdrawal Issue`,
    );
  });

  it("is byte-identical to the legacy corrected-category line", () => {
    const line = correctionFewShotLine(
      {
        message_text: msg,
        category: { original: "General Question", correct: "Withdrawal Issue" },
        urgency: null,
      },
      msg,
    );
    expect(line).toBe(
      `Message: "my withdrawal is stuck"\nCorrect category: Withdrawal Issue (the AI previously chose "General Question" and a human corrected it)`,
    );
  });

  it("appends a confirmed-urgency line when original === correct", () => {
    const line = correctionFewShotLine(
      {
        message_text: msg,
        category: { original: "Withdrawal Issue", correct: "Withdrawal Issue" },
        urgency: { original: "High", correct: "High" },
      },
      msg,
    );
    expect(line.endsWith("\nCorrect urgency (human-confirmed): High")).toBe(
      true,
    );
  });

  it("appends a corrected-urgency line when the human changed it", () => {
    const line = correctionFewShotLine(
      {
        message_text: msg,
        category: { original: "General Question", correct: "Withdrawal Issue" },
        urgency: { original: "Low", correct: "Critical" },
      },
      msg,
    );
    expect(line).toBe(
      `Message: "my withdrawal is stuck"\nCorrect category: Withdrawal Issue (the AI previously chose "General Question" and a human corrected it)\nCorrect urgency: Critical (the AI previously chose "Low" and a human corrected it)`,
    );
  });

  it("makes no category claim for an urgency-only row", () => {
    const line = correctionFewShotLine(
      {
        message_text: msg,
        category: null,
        urgency: { original: "Medium", correct: "High" },
      },
      msg,
    );
    expect(line).toBe(
      `Message: "my withdrawal is stuck"\nCorrect urgency: High (the AI previously chose "Medium" and a human corrected it)`,
    );
    expect(line.toLowerCase()).not.toContain("category");
  });

  it("treats a null original urgency as human-confirmed (defensive)", () => {
    const line = correctionFewShotLine(
      {
        message_text: msg,
        category: null,
        urgency: { original: null, correct: "High" },
      },
      msg,
    );
    expect(line).toBe(
      `Message: "my withdrawal is stuck"\nCorrect urgency (human-confirmed): High`,
    );
  });
});
