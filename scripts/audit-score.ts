/**
 * audit-score.ts — Real-traffic agreement audit, step 2 (scorer).
 *
 * Joins the rater's BLIND-filled worksheet with the hidden AI key and runs the
 * committed, unit-tested scoring core (../audit-scoring.ts). Committed + run via
 * tsx (same pattern as eval.ts) so the credibility-critical half of the
 * methodology lives in the repo and is reproducible: a re-run on the same inputs
 * prints the same numbers.
 *
 * Inputs (gitignored audit/ dir):
 *   audit/agreement_filled.csv  the rater's worksheet with Category/Urgency filled
 *   audit/agreement_key.json    rowId -> {aiCategory, aiUrgency}  (from audit-sample.mjs)
 * Output:
 *   prints the full report (incl. confusion + disagreements) to the console
 *   merges the aggregate NUMBERS (no message text / PII) into audit-results.json
 *
 * Run:  npx tsx scripts/audit-score.ts
 */
import fs from "fs";
import path from "path";
import { scoreAgreement, type RatedRow } from "../audit-scoring";

// Minimal RFC-4180 CSV parser (quoted fields, embedded commas/newlines, "" escapes).
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* swallow, \n handles the break */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function colIndex(header: string[], name: string): number {
  return header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
}

const AUDIT_DIR = path.resolve("audit");
const filledPath = path.join(AUDIT_DIR, "agreement_filled.csv");
const keyPath = path.join(AUDIT_DIR, "agreement_key.json");

if (!fs.existsSync(filledPath)) {
  console.error(`[FATAL] ${filledPath} not found — fill the blind worksheet first.`);
  process.exit(1);
}
if (!fs.existsSync(keyPath)) {
  console.error(`[FATAL] ${keyPath} not found — run audit-sample.mjs first.`);
  process.exit(1);
}

const key = JSON.parse(fs.readFileSync(keyPath, "utf-8")) as Record<
  string,
  { aiCategory: string; aiUrgency: string }
>;

const grid = parseCsv(fs.readFileSync(filledPath, "utf-8"));
const header = grid[0] || [];
const iRow = colIndex(header, "rowId");
const iCat = colIndex(header, "Category");
const iUrg = colIndex(header, "Urgency");
if (iRow < 0 || iCat < 0 || iUrg < 0) {
  console.error("[FATAL] filled CSV must have rowId, Category, Urgency columns.");
  process.exit(1);
}

const rows: RatedRow[] = [];
for (const r of grid.slice(1)) {
  const rowId = (r[iRow] || "").trim();
  if (!rowId) continue;
  const k = key[rowId];
  if (!k) {
    console.warn(`  [warn] rowId ${rowId} not in key — skipped`);
    continue;
  }
  rows.push({
    rowId,
    aiCategory: k.aiCategory,
    aiUrgency: k.aiUrgency,
    humanCategory: (r[iCat] || "").trim(),
    humanUrgency: (r[iUrg] || "").trim(),
  });
}

const rep = scoreAgreement(rows);

const line = "=".repeat(64);
console.log(`\n${line}\n  REAL-TRAFFIC AGREEMENT AUDIT\n${line}`);
console.log(`  Rows handed in:        ${rep.total}`);
console.log(`  Rated (denominator):   ${rep.rated}`);
console.log(`  Unrated (excluded):    ${rep.unrated}`);
console.log(`\n  Category agreement:    ${rep.category.agreementPct}%  (${rep.category.agree}/${rep.category.n})`);
console.log(`  Urgency exact match:   ${rep.urgency.exactPct}%  (${rep.urgency.exact}/${rep.urgency.n})`);
console.log(`  Urgency within-one:    ${rep.urgency.withinOnePct}%  (${rep.urgency.withinOne}/${rep.urgency.n})`);
console.log(`  Critical/High recall:  ${rep.highSeverityRecall.recallPct}%  (${rep.highSeverityRecall.caught}/${rep.highSeverityRecall.n} urgent caught)`);

console.log(`\n  Per-category agreement (human label = ground truth):`);
for (const [cat, v] of Object.entries(rep.category.perCategory).sort((a, b) => b[1].humanTotal - a[1].humanTotal)) {
  console.log(`    ${cat.padEnd(20)} ${String(v.pct).padStart(3)}%  (${v.agree}/${v.humanTotal})`);
}

console.log(`\n  Disagreements (${rep.disagreements.length}) — for qualitative review:`);
for (const d of rep.disagreements) {
  console.log(`    #${d.rowId}: human=${d.humanCategory}/${d.humanUrgency}  ai=${d.aiCategory}/${d.aiUrgency}`);
}

// Merge aggregate numbers (NO message text) into audit-results.json.
const resultsPath = path.resolve("audit-results.json");
const existing = fs.existsSync(resultsPath)
  ? JSON.parse(fs.readFileSync(resultsPath, "utf-8"))
  : {};
existing.generatedAt = new Date().toISOString();
existing.agreement = {
  n: rep.rated,
  unrated: rep.unrated,
  categoryAgreementPct: rep.category.agreementPct,
  urgencyExactPct: rep.urgency.exactPct,
  urgencyWithinOnePct: rep.urgency.withinOnePct,
  criticalHighRecallPct: rep.highSeverityRecall.recallPct,
  criticalHighN: rep.highSeverityRecall.n,
  perCategory: rep.category.perCategory,
};
fs.writeFileSync(resultsPath, JSON.stringify(existing, null, 2));
console.log(`\n  → wrote aggregate numbers to audit-results.json (no PII)\n${line}`);
