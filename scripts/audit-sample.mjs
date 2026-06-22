/**
 * audit-sample.mjs — Real-traffic agreement audit, step 1 (sampler).
 *
 * Builds the BLIND rating worksheet for the credibility audit (2026-06-21).
 * Read-only: it SELECTs recent real tickets from the live DB for a stratified
 * sample, then classifies each original user message via the DEPLOYED /api/eval
 * endpoint — the exact production raw prompt (GROQ_SYSTEM_PROMPT + the Pidgin
 * glossary, llama-3.1-8b-instant, temp 0, no few-shot). /api/eval performs NO
 * DB writes, so this never mutates production.
 *
 * Why the deployed endpoint and not a local server: the no-telegram launcher
 * boots the live sweeps (reconcile / assumed-resolve / D2) against the same DB,
 * and re-implementing the prompt in this script would let it drift from prod.
 * Hitting /api/eval is the most honest "the classifier the pitch relies on".
 *
 * Outputs (gitignored audit/ dir — real message text, kept off git):
 *   audit/agreement_rows.json  full rows incl. AI answer + stored label (for me)
 *   audit/agreement_key.json   rowId -> {aiCategory, aiUrgency}  (NEVER shown to rater)
 *   audit/agreement_blind.csv  rowId, message, context, blank Category/Urgency, notes
 *
 * The human rater (Jimi for v1; a Quidax agent ideally) fills Category/Urgency
 * BLIND to the AI answer, then audit-score.mjs joins blind+key and scores.
 *
 * Run:  node -r dotenv/config scripts/audit-sample.mjs
 * Env:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DASHBOARD_PASSWORD,
 *       AUDIT_BASE_URL (default = prod Railway URL)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  "https://quidax-telegram-gemini-production.up.railway.app";
const PASSWORD =
  process.env.DASHBOARD_PASSWORD || process.env.VITE_DASHBOARD_PASSWORD || "";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("[FATAL] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env");
  process.exit(1);
}
if (!PASSWORD) {
  console.error("[FATAL] DASHBOARD_PASSWORD missing in .env (needed to auth /api/eval)");
  process.exit(1);
}

// Stratified targets. A purely random sample of recent traffic would be ~60%
// General Question / Spam banter (see the 30-day category distribution) and
// barely exercise the classifier on the cases that matter. So oversample the
// actionable categories and cap the noise — while still INCLUDING noise so the
// audit also measures that the model recognises banter. The script takes the
// most-recent N per category that exist; small categories just contribute fewer.
const STRATA = {
  "Withdrawal Issue": 15,
  "Deposit Issue": 15,
  "Account Access": 13,
  "Trading Problem": 13,
  "App Bug": 10,
  "KYC/Verification": 6,
  "Fee Complaint": 4,
  "Network/Downtime": 4,
  "General Question": 25,
  "Spam/Irrelevant": 8,
  Praise: 8,
};

const LOOKBACK_DAYS = 60; // wide enough that the actionable strata fill

// The original user message = the text before any appended reply block. The
// full raw_text is still handed to the rater as thread context.
function extractOriginal(rawText) {
  let t = String(rawText || "").replace(/^\s*\[NEEDS REVIEW\]\s*/i, "");
  const markers = ["[ADMIN_REPLY]", "[USER_REPLY]", "[USER_FOLLOWUP]"];
  let cut = t.length;
  for (const m of markers) {
    const i = t.indexOf(m);
    if (i >= 0 && i < cut) cut = i;
  }
  return t.slice(0, cut).trim();
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`auth failed ${res.status} — check DASHBOARD_PASSWORD`);
  }
  return (await res.json()).token;
}

// Classify a batch of message texts via the deployed /api/eval. Returns the
// predicted category/urgency in input order. expected* are dummies — we only
// read the predictions.
async function classifyBatch(token, texts) {
  const body = {
    messages: texts.map((t) => ({
      text: t,
      expectedCategory: "",
      expectedUrgency: "",
    })),
  };
  const res = await fetch(`${BASE_URL}/api/eval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    throw new Error(`/api/eval ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  const data = await res.json();
  return (data.results || []).map((r) => ({
    aiCategory: r.predictedCategory,
    aiUrgency: r.predictedUrgency,
  }));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const sinceIso = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // 1. Stratified pull (read-only).
  const picked = [];
  for (const [category, limit] of Object.entries(STRATA)) {
    const { data, error } = await supabase
      .from("tickets")
      .select("id, telegram_message_id, category, urgency, raw_text, created_at")
      .eq("category", category)
      .eq("is_admin_message", false)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(limit * 3); // over-pull, then drop empties below
    if (error) throw new Error(`query ${category}: ${error.message}`);
    let kept = 0;
    for (const row of data || []) {
      const original = extractOriginal(row.raw_text);
      if (original.length < 2) continue; // skip empty/fragment-only
      picked.push({
        ticketId: row.id,
        storedCategory: row.category,
        storedUrgency: row.urgency,
        message: original,
        context: String(row.raw_text || "").slice(0, 4000),
      });
      if (++kept >= limit) break;
    }
    console.log(`  ${category.padEnd(18)} ${kept}`);
  }

  // 2. Classify via the deployed production prompt, in batches.
  const token = await login();
  const BATCH = 10;
  for (let i = 0; i < picked.length; i += BATCH) {
    const slice = picked.slice(i, i + BATCH);
    process.stdout.write(`  classifying ${i + 1}-${i + slice.length} / ${picked.length}... `);
    const preds = await classifyBatch(token, slice.map((p) => p.message));
    slice.forEach((p, k) => {
      p.aiCategory = preds[k]?.aiCategory ?? "ERROR";
      p.aiUrgency = preds[k]?.aiUrgency ?? "ERROR";
    });
    console.log("ok");
  }

  // 3. Assign stable rowIds, shuffle so the blind sheet isn't grouped by category.
  shuffle(picked);
  picked.forEach((p, idx) => (p.rowId = idx + 1));

  // 4. Write artifacts.
  const outDir = path.resolve("audit");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "agreement_rows.json"),
    JSON.stringify(picked, null, 2),
  );

  const key = {};
  for (const p of picked) key[p.rowId] = { aiCategory: p.aiCategory, aiUrgency: p.aiUrgency };
  fs.writeFileSync(path.join(outDir, "agreement_key.json"), JSON.stringify(key, null, 2));

  const header = ["rowId", "message", "thread_context", "Category", "Urgency", "Notes"];
  const lines = [header.join(",")];
  for (const p of picked.sort((a, b) => a.rowId - b.rowId)) {
    lines.push([p.rowId, p.message, p.context, "", "", ""].map(csvCell).join(","));
  }
  fs.writeFileSync(path.join(outDir, "agreement_blind.csv"), lines.join("\r\n"));

  const classified = picked.filter((p) => p.aiCategory !== "ERROR").length;
  console.log(`\nDone. ${picked.length} rows (${classified} classified ok) → audit/`);
  console.log("Next: build the xlsx, send to the rater, then audit-score.mjs.");
}

main().catch((e) => {
  console.error("[FATAL]", e.message);
  process.exit(1);
});
