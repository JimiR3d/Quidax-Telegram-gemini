/**
 * audit-sample.mjs — Real-traffic agreement audit, step 1 (sampler).
 *
 * Builds the BLIND rating worksheet for the credibility audit (2026-06-21;
 * refreshed 2026-07-03 for the background-job /api/eval, the 12-category
 * taxonomy incl. Community Chat, and a ~60-row target).
 * Read-only: it SELECTs recent real tickets from the live DB for a stratified
 * sample, then classifies each original user message via the DEPLOYED /api/eval
 * endpoint — the exact production raw prompt (GROQ_SYSTEM_PROMPT + the Pidgin
 * glossary, the deployed GROQ_MODEL, temp 0, no few-shot). /api/eval performs
 * NO DB writes, so this never mutates production.
 *
 * /api/eval is a BACKGROUND JOB (Phase 4): one POST starts the run and returns
 * {success,total} immediately; predictions are read from GET /api/eval/progress
 * once it finishes. The server processes messages sequentially in input order
 * and spaces Groq calls 15s apart, so a 60-row run takes ~15 minutes.
 *
 * Why the deployed endpoint and not a local server: the no-telegram launcher
 * boots the live sweeps (reconcile / assumed-resolve / D2) against the same DB,
 * and re-implementing the prompt in this script would let it drift from prod.
 * Hitting /api/eval is the most honest "the classifier the pitch relies on".
 *
 * Outputs (gitignored audit/ dir — real message text, kept off git):
 *   audit/agreement_rows.json  full rows incl. AI answer + stored label (internal)
 *   audit/agreement_key.json   rowId -> {aiCategory, aiUrgency}  (NEVER shown to rater)
 *   audit/agreement_blind.csv  rowId, message, context, blank Category/Urgency, notes
 *
 * The human rater (an independent Quidax agent) fills Category/Urgency BLIND
 * to the AI answer, then scripts/audit-score.ts joins blind+key and scores.
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
  "Withdrawal Issue": 8,
  "Deposit Issue": 8,
  "Account Access": 6,
  "Trading Problem": 6,
  "App Bug": 5,
  "KYC/Verification": 4,
  "Fee Complaint": 2,
  "Network/Downtime": 2,
  "General Question": 8,
  "Community Chat": 4, // exists only on post-2026-07-03 tickets — may under-fill
  "Spam/Irrelevant": 4,
  Praise: 3,
}; // ~60 total — the Jun-21 117-row sheet proved too heavy to rate in one sitting

const LOOKBACK_DAYS = 60; // wide enough that the actionable strata fill

// Judgeability gate: context-free fragments ("USDT too", a bare transaction id)
// are unjudgeable even for an expert rater — they stalled the Jun-21 rating.
// Excluding them is confidence-gating, not cherry-picking: the rater can still
// leave ANY row blank, and blanks are excluded from every denominator.
const MIN_WORDS = Math.max(1, parseInt(process.env.AUDIT_MIN_WORDS || "4", 10) || 4);

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

async function getProgress(token) {
  const res = await fetch(`${BASE_URL}/api/eval/progress`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`/api/eval/progress ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  return res.json();
}

// Classify ALL sampled messages in ONE /api/eval background run. The server
// pushes results[] sequentially in input order and truncates each result's
// text to 60 chars, so INDEX is the only correct join back to our rows. One
// POST also stays inside heavyLimiter (5 requests / 15 min) — the old
// 10-per-batch loop would be rate-limited. expected* are dummies; the run's
// accuracy fields are meaningless here and ignored.
async function classifyAll(token, texts) {
  const before = await getProgress(token);
  if (before.running) {
    throw new Error(
      `a benchmark run is already in progress (${before.done}/${before.total}) — retry when it finishes`,
    );
  }
  const res = await fetch(`${BASE_URL}/api/eval`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages: texts.map((t) => ({
        text: t,
        expectedCategory: "",
        expectedUrgency: "",
      })),
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`/api/eval ${res.status}: ${(await res.text()).slice(0, 120)}`);
  }
  const started = await res.json();
  console.log(
    `  eval run started: ${started.total} messages (~${Math.ceil((started.total * 15) / 60)} min at 15s Groq spacing)`,
  );

  const deadline = Date.now() + texts.length * 15000 * 1.5 + 60000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 15000));
    const p = await getProgress(token);
    if (p.error) throw new Error(`eval run crashed server-side: ${p.error}`);
    process.stdout.write(`\r  progress ${p.done}/${p.total}   `);
    if (!p.running && p.finishedAt) {
      console.log("");
      if ((p.results || []).length !== texts.length) {
        throw new Error(
          `finished run has ${(p.results || []).length} results but we sent ${texts.length} — a different run may have replaced ours; re-run the sampler`,
        );
      }
      return p.results.map((r) => ({
        aiCategory: r.predictedCategory,
        aiUrgency: r.predictedUrgency,
      }));
    }
    if (Date.now() > deadline) {
      throw new Error("timed out waiting for the eval run to finish");
    }
  }
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
      // Judgeability gate (see MIN_WORDS above).
      if (original.split(/\s+/).filter(Boolean).length < MIN_WORDS) continue;
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

  // 2. Classify via the deployed production prompt — one background eval run.
  const token = await login();
  const preds = await classifyAll(token, picked.map((p) => p.message));
  picked.forEach((p, i) => {
    p.aiCategory = preds[i]?.aiCategory ?? "ERROR";
    p.aiUrgency = preds[i]?.aiUrgency ?? "ERROR";
  });

  // The eval loop has no 429 retry — a transient Groq failure comes back as
  // "ERROR". Drop those rows entirely so the worksheet and key stay aligned.
  const errored = picked.length;
  const rows = picked.filter((p) => p.aiCategory !== "ERROR");
  if (rows.length < errored) {
    console.log(`  dropped ${errored - rows.length} row(s) with transient classification errors`);
  }

  // 3. Assign stable rowIds, shuffle so the blind sheet isn't grouped by category.
  shuffle(rows);
  rows.forEach((p, idx) => (p.rowId = idx + 1));

  // 4. Write artifacts.
  const outDir = path.resolve("audit");
  fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(
    path.join(outDir, "agreement_rows.json"),
    JSON.stringify(rows, null, 2),
  );

  const key = {};
  for (const p of rows) key[p.rowId] = { aiCategory: p.aiCategory, aiUrgency: p.aiUrgency };
  fs.writeFileSync(path.join(outDir, "agreement_key.json"), JSON.stringify(key, null, 2));

  const header = ["rowId", "message", "thread_context", "Category", "Urgency", "Notes"];
  const lines = [header.join(",")];
  for (const p of rows.sort((a, b) => a.rowId - b.rowId)) {
    lines.push([p.rowId, p.message, p.context, "", "", ""].map(csvCell).join(","));
  }
  fs.writeFileSync(path.join(outDir, "agreement_blind.csv"), lines.join("\r\n"));

  console.log(`\nDone. ${rows.length} rows → audit/`);
  console.log("Next: build the xlsx, send to the rater, then scripts/audit-score.ts.");
}

main().catch((e) => {
  console.error("[FATAL]", e.message);
  process.exit(1);
});
