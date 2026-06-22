/**
 * audit-system.mjs — System-level trust audits, step 1 (sampler).
 *
 * Classification % isn't the scary failure. The dangerous failures live in the
 * async-resolve / Assumed-Resolved / D2 / grouping / noise-filter logic:
 *   - did we mark a ticket resolved that wasn't (user left hanging)?
 *   - did the noise filter bury a REAL issue in the Dismissed lane?
 *   - did grouping split one conversation into many tickets, or merge two issues?
 *
 * Read-only: SELECTs only. Builds blind worksheets a human judges; the human
 * verdict IS the measurement (the SYSTEM's decision is the population itself, so
 * there's no separate AI key to hide). audit-score-system.ts rolls the verdicts
 * into precision / false-negative / grouping rates.
 *
 * Outputs (gitignored audit/ dir):
 *   audit/system_autoresolve.json   34 Assumed Resolved + 15 human-Resolved control
 *   audit/system_noise.json         6 actionable-category Dismissed + 114 banter sample
 *   audit/system_folds.json         all tickets carrying a [USER_FOLLOWUP] block
 *   audit/system_splits.json        all same-sender clusters (>=2 active tickets <6h apart)
 *
 * Run:  node -r dotenv/config scripts/audit-system.mjs
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[FATAL] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const ACTIONABLE = new Set([
  "Withdrawal Issue", "Deposit Issue", "KYC/Verification", "Trading Problem",
  "App Bug", "Fee Complaint", "Account Access", "Network/Downtime",
]);
const DAY = 24 * 60 * 60 * 1000;

function extractOriginal(rawText) {
  let t = String(rawText || "").replace(/^\s*\[NEEDS REVIEW\]\s*/i, "");
  const markers = ["[ADMIN_REPLY]", "[USER_REPLY]", "[USER_FOLLOWUP]"];
  let cut = t.length;
  for (const m of markers) { const i = t.indexOf(m); if (i >= 0 && i < cut) cut = i; }
  return t.slice(0, cut).trim();
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const outDir = path.resolve("audit");
fs.mkdirSync(outDir, { recursive: true });
const write = (name, data) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(data, null, 2));

async function autoResolve() {
  const { data: assumed, error: e1 } = await supabase
    .from("tickets")
    .select("id, category, urgency, status, raw_text, resolved_at, last_message_at, created_at")
    .eq("status", "Assumed Resolved")
    .order("resolved_at", { ascending: false });
  if (e1) throw new Error("assumed: " + e1.message);
  const { data: human, error: e2 } = await supabase
    .from("tickets")
    .select("id, category, urgency, status, raw_text, resolved_at, last_message_at, created_at")
    .eq("status", "Resolved")
    .order("resolved_at", { ascending: false, nullsFirst: false })
    .limit(15);
  if (e2) throw new Error("resolved: " + e2.message);

  const rows = [];
  for (const t of assumed || []) {
    const rj = t.resolved_at ? Date.parse(t.resolved_at) : null;
    const lm = t.last_message_at ? Date.parse(t.last_message_at) : null;
    let mechanism = "Time-sweep (7-day quiet)";
    if (rj && lm && rj - lm < 7 * DAY) mechanism = "D2 (conversation-inferred)";
    rows.push({ ticketId: t.id, mechanism, category: t.category, urgency: t.urgency,
      thread: String(t.raw_text || "").slice(0, 6000) });
  }
  for (const t of human || []) {
    rows.push({ ticketId: t.id, mechanism: "Human resolved (control)", category: t.category,
      urgency: t.urgency, thread: String(t.raw_text || "").slice(0, 6000) });
  }
  write("system_autoresolve.json", rows);
  console.log(`  auto-resolve: ${rows.length} (${(assumed||[]).length} assumed + ${(human||[]).length} human control)`);
}

async function noise() {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, category, raw_text, created_at")
    .eq("status", "Dismissed");
  if (error) throw new Error("dismissed: " + error.message);
  const risk = [], bank = [];
  for (const t of data || []) {
    const msg = extractOriginal(t.raw_text);
    if (!msg) continue;
    (ACTIONABLE.has(t.category) ? risk : bank).push({ ticketId: t.id, category: t.category, message: msg.slice(0, 1200) });
  }
  const sample = shuffle(bank).slice(0, 114);
  const rows = shuffle([
    ...risk.map((r) => ({ ...r, lane: "actionable-category (FN risk)" })),
    ...sample.map((r) => ({ ...r, lane: "banter lane (random sample)" })),
  ]);
  rows.forEach((r, i) => (r.rowId = i + 1));
  write("system_noise.json", rows);
  console.log(`  noise: ${rows.length} (${risk.length} actionable-risk audited 100% + ${sample.length} banter sample of ${bank.length})`);
}

async function folds() {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, category, raw_text, last_message_at")
    .like("raw_text", "%[USER_FOLLOWUP]%")
    .order("last_message_at", { ascending: false });
  if (error) throw new Error("folds: " + error.message);
  const rows = (data || []).map((t) => ({ ticketId: t.id, category: t.category, thread: String(t.raw_text || "").slice(0, 6000) }));
  write("system_folds.json", rows);
  console.log(`  grouping folds: ${rows.length}`);
}

async function splits() {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, category, raw_text, created_at, sender_hash, status")
    .in("status", ["Open", "In Review", "Escalated", "Awaiting User"])
    .not("sender_hash", "is", null);
  if (error) throw new Error("splits: " + error.message);
  // Group by sender, find runs of tickets created <6h from the previous sibling.
  const bySender = {};
  for (const t of data || []) (bySender[t.sender_hash] ??= []).push(t);
  const clusters = [];
  for (const [hash, list] of Object.entries(bySender)) {
    if (list.length < 2) continue;
    list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let run = [list[0]];
    const flush = () => {
      if (run.length >= 2) clusters.push({ hash, tickets: run.slice() });
    };
    for (let i = 1; i < list.length; i++) {
      if (Date.parse(list[i].created_at) - Date.parse(run[run.length - 1].created_at) < 6 * 60 * 60 * 1000) run.push(list[i]);
      else { flush(); run = [list[i]]; }
    }
    flush();
  }
  const rows = clusters.map((c, i) => ({
    clusterId: i + 1,
    senderShort: c.hash.slice(0, 8),
    ticketIds: c.tickets.map((t) => t.id),
    blob: c.tickets
      .map((t, k) => `--- ticket ${k + 1} [${t.category} | ${t.status}] ${new Date(t.created_at).toISOString()} ---\n${extractOriginal(t.raw_text).slice(0, 1500)}`)
      .join("\n\n"),
  }));
  write("system_splits.json", rows);
  console.log(`  grouping split-clusters: ${rows.length}`);
}

async function main() {
  await autoResolve();
  await noise();
  await folds();
  await splits();
  console.log("\nDone → audit/. Next: build system_blind.xlsx, rate, then audit-score-system.ts.");
}
main().catch((e) => { console.error("[FATAL]", e.message); process.exit(1); });
