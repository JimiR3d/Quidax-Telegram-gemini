/**
 * PulseDesk Classification Benchmark
 * Feature 6: 12-case evaluation suite
 *
 * Usage: npx tsx eval.ts
 * Requires: Server must be running at http://localhost:3000
 *           VITE_DASHBOARD_PASSWORD or DASHBOARD_PASSWORD set in .env
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
dotenv.config();

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:3000";
const PASSWORD = process.env.DASHBOARD_PASSWORD || process.env.VITE_DASHBOARD_PASSWORD || "";

interface BenchmarkCase {
  id: number;
  description: string;
  message: string;
  expectedCategory: string;
  expectedUrgency: string;
  expectedIsComplaint: boolean;
}

const casesFile = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(process.cwd(), "benchmark_cases.json");
const BENCHMARK_CASES: BenchmarkCase[] = JSON.parse(fs.readFileSync(casesFile, "utf-8"));

interface EvalResult {
  id: number;
  description: string;
  message: string;
  expectedCategory: string;
  expectedUrgency: string;
  expectedIsComplaint: boolean;
  actualCategory: string;
  actualUrgency: string;
  actualIsComplaint: boolean;
  categoryPass: boolean;
  urgencyPass: boolean;
  complaintPass: boolean;
  allPass: boolean;
  error?: string;
  latencyMs: number;
}

async function runEval(): Promise<void> {
  console.log("=".repeat(70));
  console.log("  PULSEDESK CLASSIFICATION BENCHMARK");
  console.log(`  ${BENCHMARK_CASES.length} test cases — ${new Date().toISOString()}`);
  console.log("=".repeat(70));

  // 1. Get auth token
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });

  if (!loginRes.ok) {
    console.error(`[FATAL] Auth failed: ${loginRes.status}. Set DASHBOARD_PASSWORD in .env.`);
    process.exit(1);
  }

  const { token } = await loginRes.json();
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };

  const results: EvalResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const tc of BENCHMARK_CASES) {
    const start = Date.now();
    let result: EvalResult = {
      id: tc.id,
      description: tc.description,
      message: tc.message,
      expectedCategory: tc.expectedCategory,
      expectedUrgency: tc.expectedUrgency,
      expectedIsComplaint: tc.expectedIsComplaint,
      actualCategory: "ERROR",
      actualUrgency: "ERROR",
      actualIsComplaint: false,
      categoryPass: false,
      urgencyPass: false,
      complaintPass: false,
      allPass: false,
      latencyMs: 0,
    };

    try {
      // Ingest the message
      const ingestRes = await fetch(`${BASE_URL}/api/ingest`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text: tc.message, telegramId: Math.floor(Math.random() * 999_999) }),
      });

      if (!ingestRes.ok) {
        const errText = await ingestRes.text();
        result.error = `Ingest ${ingestRes.status}: ${errText.substring(0, 80)}`;
        failed++;
        results.push(result);
        continue;
      }

      const { ticket } = await ingestRes.json();
      if (!ticket) {
        result.error = "Ingest returned null ticket (message may have been filtered)";
        failed++;
        results.push(result);
        continue;
      }

      const ticketId = ticket.id;

      // Wait for background classification (up to 30s)
      let classified = false;
      let attempts = 0;
      let classifiedTicket = ticket;

      while (!classified && attempts < 30) {
        await new Promise(r => setTimeout(r, 1000));
        const fetchRes = await fetch(`${BASE_URL}/api/tickets?page=0&pageSize=50`, { headers });
        if (fetchRes.ok) {
          const data = await fetchRes.json();
          const tickets = Array.isArray(data) ? data : (data.tickets ?? []);
          const found = tickets.find((t: any) => t.id === ticketId);
          if (found && found.status !== "Classifying") {
            classifiedTicket = found;
            classified = true;
          }
        }
        attempts++;
      }

      result.latencyMs = Date.now() - start;
      result.actualCategory    = classifiedTicket.category    ?? "Unknown";
      result.actualUrgency     = classifiedTicket.urgency     ?? "Unknown";
      result.actualIsComplaint = classifiedTicket.is_complaint ?? false;
      result.categoryPass      = result.actualCategory === tc.expectedCategory;
      result.urgencyPass       = result.actualUrgency  === tc.expectedUrgency;
      result.complaintPass     = result.actualIsComplaint === tc.expectedIsComplaint;
      result.allPass           = result.categoryPass && result.urgencyPass && result.complaintPass;

      if (result.allPass) passed++;
      else failed++;

    } catch (e: any) {
      result.error = e.message;
      result.latencyMs = Date.now() - start;
      failed++;
    }

    results.push(result);

    const icon = result.allPass ? "✅" : result.error ? "💥" : "❌";
    console.log(`\n${icon}  Case ${String(tc.id).padStart(2, "0")}: ${tc.description}`);
    if (!result.error) {
      console.log(`   Category:    Expected=${tc.expectedCategory.padEnd(20)} Got=${result.actualCategory} ${result.categoryPass ? "✓" : "✗"}`);
      console.log(`   Urgency:     Expected=${tc.expectedUrgency.padEnd(20)} Got=${result.actualUrgency} ${result.urgencyPass ? "✓" : "✗"}`);
      console.log(`   IsComplaint: Expected=${String(tc.expectedIsComplaint).padEnd(20)} Got=${result.actualIsComplaint} ${result.complaintPass ? "✓" : "✗"}`);
      console.log(`   Latency:     ${result.latencyMs}ms`);
    } else {
      console.log(`   Error: ${result.error}`);
    }
  }

  // Summary table
  const total        = BENCHMARK_CASES.length;
  const accuracy     = Math.round((passed / total) * 100);
  const catAccuracy  = Math.round((results.filter(r => r.categoryPass).length / total) * 100);
  const urgAccuracy  = Math.round((results.filter(r => r.urgencyPass).length / total) * 100);
  const avgLatency   = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);

  console.log("\n" + "=".repeat(70));
  console.log("  SUMMARY");
  console.log("=".repeat(70));
  console.log(`  Total Cases:          ${total}`);
  console.log(`  Overall Pass:         ${passed}/${total} (${accuracy}%)`);
  console.log(`  Category Accuracy:    ${catAccuracy}%`);
  console.log(`  Urgency Accuracy:     ${urgAccuracy}%`);
  console.log(`  Avg Latency:          ${avgLatency}ms`);
  console.log(`  Status:               ${accuracy >= 80 ? "✅ PASS (≥80%)" : "❌ FAIL (<80%)"}`);
  console.log("=".repeat(70));

  // Failures detail
  const failures = results.filter(r => !r.allPass && !r.error);
  if (failures.length > 0) {
    console.log("\n  MISCLASSIFICATIONS:");
    for (const r of failures) {
      console.log(`  - Case ${r.id} (${r.description}):`);
      if (!r.categoryPass) console.log(`      Category: expected "${r.expectedCategory}", got "${r.actualCategory}"`);
      if (!r.urgencyPass)  console.log(`      Urgency:  expected "${r.expectedUrgency}", got "${r.actualUrgency}"`);
    }
  }

  process.exit(accuracy >= 80 ? 0 : 1);
}

runEval().catch((e) => {
  console.error("[FATAL]", e.message);
  process.exit(1);
});
