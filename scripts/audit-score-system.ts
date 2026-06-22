/**
 * audit-score-system.ts — System-level trust audits, step 2 (scorer).
 *
 * Reads the rater's filled system worksheets and rolls the human verdicts into:
 *   - auto-resolve PRECISION  (of system-resolved tickets, how many were truly
 *     resolved) — split by mechanism: D2 conversation-inference vs the 7-day
 *     quiet sweep vs a human-Resolved control. The "did we abandon a user?" rate.
 *   - noise FALSE-NEGATIVE rate (of Dismissed tickets, how many were actually a
 *     real issue) — split by lane: the 6 actionable-category Dismissed audited
 *     100% vs the random banter sample. The "did the filter bury a real issue?" rate.
 *   - grouping OVER-MERGE rate (folds that mashed two issues) and OVER-SPLIT rate
 *     (same-sender clusters that should have been one ticket).
 *
 * "Can't tell" / "Borderline" / blank verdicts are abstentions — excluded from
 * every denominator (reported separately), the same honesty rule as the
 * agreement scorer. Merges NUMBERS ONLY (no message text) into audit-results.json.
 *
 * Inputs (gitignored audit/, produced by converting the filled system_blind.xlsx):
 *   audit/autoresolve_filled.csv   columns incl. mechanism, Verdict
 *   audit/noise_filled.csv         columns incl. lane, Verdict
 *   audit/folds_filled.csv         columns incl. Verdict
 *   audit/splits_filled.csv        columns incl. Verdict
 *
 * Run:  npx tsx scripts/audit-score-system.ts
 */
import fs from "fs";
import path from "path";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function readRows(file: string): Record<string, string>[] {
  const grid = parseCsv(fs.readFileSync(file, "utf-8"));
  const header = (grid[0] || []).map((h) => h.trim());
  return grid.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
}
function col(row: Record<string, string>, name: string): string {
  const k = Object.keys(row).find((x) => x.toLowerCase() === name.toLowerCase());
  return k ? row[k] : "";
}
const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 100) : null);
const has = (s: string, ...subs: string[]) => subs.some((x) => s.toLowerCase().includes(x));

const AUDIT = path.resolve("audit");
const out: any = {};

// ── auto-resolve precision ────────────────────────────────────────────────
const arFile = path.join(AUDIT, "autoresolve_filled.csv");
if (fs.existsSync(arFile)) {
  const buckets: Record<string, { yes: number; no: number; abstain: number }> = {};
  let yes = 0, no = 0, abstain = 0;
  for (const r of readRows(arFile)) {
    const v = col(r, "Verdict");
    const mech = col(r, "mechanism") || "unknown";
    buckets[mech] ??= { yes: 0, no: 0, abstain: 0 };
    if (has(v, "truly")) { yes++; buckets[mech].yes++; }
    else if (has(v, "not resolved", "not-resolved")) { no++; buckets[mech].no++; }
    else { abstain++; buckets[mech].abstain++; }
  }
  out.autoResolvePrecision = {
    n: yes + no, abstain, truly: yes, notResolved: no,
    precisionPct: pct(yes, yes + no),
    byMechanism: Object.fromEntries(Object.entries(buckets).map(([m, b]) => [m, { precisionPct: pct(b.yes, b.yes + b.no), truly: b.yes, notResolved: b.no, abstain: b.abstain }])),
  };
}

// ── noise false-negative rate ─────────────────────────────────────────────
const nFile = path.join(AUDIT, "noise_filled.csv");
if (fs.existsSync(nFile)) {
  const lanes: Record<string, { fn: number; ok: number; abstain: number }> = {};
  let fn = 0, ok = 0, abstain = 0;
  for (const r of readRows(nFile)) {
    const v = col(r, "Verdict");
    const lane = col(r, "lane") || "unknown";
    lanes[lane] ??= { fn: 0, ok: 0, abstain: 0 };
    if (has(v, "real issue", "wrongly")) { fn++; lanes[lane].fn++; }
    else if (has(v, "correctly")) { ok++; lanes[lane].ok++; }
    else { abstain++; lanes[lane].abstain++; }
  }
  out.noiseFalseNegative = {
    n: fn + ok, abstain, realIssues: fn, correctlyDismissed: ok,
    falseNegativePct: pct(fn, fn + ok),
    byLane: Object.fromEntries(Object.entries(lanes).map(([l, b]) => [l, { falseNegativePct: pct(b.fn, b.fn + b.ok), realIssues: b.fn, correctlyDismissed: b.ok, abstain: b.abstain }])),
  };
}

// ── grouping correctness ──────────────────────────────────────────────────
function groupingRate(file: string, badKeywords: string[], goodKeywords: string[]) {
  if (!fs.existsSync(file)) return null;
  let bad = 0, good = 0, abstain = 0;
  for (const r of readRows(file)) {
    const v = col(r, "Verdict");
    if (has(v, ...badKeywords)) bad++;
    else if (has(v, ...goodKeywords)) good++;
    else abstain++;
  }
  return { n: bad + good, abstain, bad, good, badPct: pct(bad, bad + good) };
}
const folds = groupingRate(path.join(AUDIT, "folds_filled.csv"), ["over-merged", "merged"], ["correctly"]);
const splits = groupingRate(path.join(AUDIT, "splits_filled.csv"), ["over-split", "should be one"], ["correctly", "separate"]);
if (folds || splits) {
  out.grouping = {
    overMerge: folds ? { judged: folds.n, overMerged: folds.bad, overMergePct: folds.badPct, abstain: folds.abstain } : null,
    overSplit: splits ? { judged: splits.n, overSplit: splits.bad, overSplitPct: splits.badPct, abstain: splits.abstain } : null,
  };
}

// ── report + merge into audit-results.json ────────────────────────────────
const line = "=".repeat(64);
console.log(`\n${line}\n  SYSTEM-LEVEL TRUST METRICS\n${line}`);
if (out.autoResolvePrecision) {
  const a = out.autoResolvePrecision;
  console.log(`  Auto-resolve precision:  ${a.precisionPct}%  (${a.truly}/${a.n} truly resolved, ${a.abstain} abstain)`);
  for (const [m, b] of Object.entries<any>(a.byMechanism)) console.log(`     ${m.padEnd(30)} ${b.precisionPct}%  (${b.truly}/${b.truly + b.notResolved})`);
}
if (out.noiseFalseNegative) {
  const nn = out.noiseFalseNegative;
  console.log(`  Noise false-negative:    ${nn.falseNegativePct}%  (${nn.realIssues}/${nn.n} were real issues, ${nn.abstain} abstain)`);
  for (const [l, b] of Object.entries<any>(nn.byLane)) console.log(`     ${l.padEnd(30)} ${b.falseNegativePct}%  (${b.realIssues}/${b.realIssues + b.correctlyDismissed})`);
}
if (out.grouping) {
  if (out.grouping.overMerge) console.log(`  Grouping over-merge:     ${out.grouping.overMerge.overMergePct}%  (${out.grouping.overMerge.overMerged}/${out.grouping.overMerge.judged} folds)`);
  if (out.grouping.overSplit) console.log(`  Grouping over-split:     ${out.grouping.overSplit.overSplitPct}%  (${out.grouping.overSplit.overSplit}/${out.grouping.overSplit.judged} clusters)`);
}

const resultsPath = path.resolve("audit-results.json");
const existing = fs.existsSync(resultsPath) ? JSON.parse(fs.readFileSync(resultsPath, "utf-8")) : {};
Object.assign(existing, out);
existing.generatedAt = new Date().toISOString();
fs.writeFileSync(resultsPath, JSON.stringify(existing, null, 2));
console.log(`\n  → merged system metrics into audit-results.json (no PII)\n${line}`);
