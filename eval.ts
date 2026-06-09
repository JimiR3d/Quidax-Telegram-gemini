/**
 * PulseDesk Classification Benchmark
 * Feature 6: 12-case evaluation suite
 *
 * Usage: npx tsx eval.ts
 * Requires: Server must be running at http://localhost:3000
 *           VITE_DASHBOARD_PASSWORD or DASHBOARD_PASSWORD set in .env
 */

import dotenv from "dotenv";
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

const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 1,
    description: "Critical withdrawal stuck",
    message: "I have been trying to withdraw ₦250,000 since Monday and it keeps saying 'processing'. This is 4 days now. I need this money urgently.",
    expectedCategory: "Withdrawal Issue",
    expectedUrgency: "Critical",
    expectedIsComplaint: true,
  },
  {
    id: 2,
    description: "KYC inquiry",
    message: "Hi, I submitted my NIN and selfie for Tier 2 KYC 3 days ago but my account still shows Tier 1. Can someone check?",
    expectedCategory: "KYC/Verification",
    expectedUrgency: "Medium",
    expectedIsComplaint: false,
  },
  {
    id: 3,
    description: "Deposit not credited",
    message: "I sent 500 USDT TRC20 2 hours ago. TronScan shows 40 confirmations but my balance is still 0. TX: abc123...",
    expectedCategory: "Deposit Issue",
    expectedUrgency: "High",
    expectedIsComplaint: true,
  },
  {
    id: 4,
    description: "Spam/chatter — should filter",
    message: "gm everyone hope we all have a great day 🌞",
    expectedCategory: "Spam/Irrelevant",
    expectedUrgency: "Low",
    expectedIsComplaint: false,
  },
  {
    id: 5,
    description: "Account locked — high urgency",
    message: "My account is locked after I tried to reset my password. I cannot log in and I have a trade open. Please unlock it immediately.",
    expectedCategory: "Account Access",
    expectedUrgency: "High",
    expectedIsComplaint: true,
  },
  {
    id: 6,
    description: "Positive praise",
    message: "Just got my QDX staking rewards! Great platform, keep up the good work team 🚀",
    expectedCategory: "Praise",
    expectedUrgency: "Low",
    expectedIsComplaint: false,
  },
  {
    id: 7,
    description: "App bug — crash",
    message: "The Quidax app crashes every time I tap on Portfolio. I'm on iPhone 15, iOS 17.4, app version 4.2.1. Started after the last update.",
    expectedCategory: "App Bug",
    expectedUrgency: "Medium",
    expectedIsComplaint: true,
  },
  {
    id: 8,
    description: "Fee complaint",
    message: "Why was I charged 1.5% on my BTC to USDT swap? The website says 0.5%. This is not what was advertised.",
    expectedCategory: "Fee Complaint",
    expectedUrgency: "Medium",
    expectedIsComplaint: true,
  },
  {
    id: 9,
    description: "Trading problem",
    message: "I placed a limit buy order for ETH at ₦85,000 but it never filled even though the price went below that. The order is stuck.",
    expectedCategory: "Trading Problem",
    expectedUrgency: "Medium",
    expectedIsComplaint: true,
  },
  {
    id: 10,
    description: "General question",
    message: "What are the withdrawal limits for Tier 1 users? How do I upgrade to Tier 2?",
    expectedCategory: "General Question",
    expectedUrgency: "Low",
    expectedIsComplaint: false,
  },
  {
    id: 11,
    description: "Hacked / security alert — critical",
    message: "HELP. Someone has logged into my account from a device I don't recognise and withdrew all my funds. I need this stopped NOW.",
    expectedCategory: "Account Access",
    expectedUrgency: "Critical",
    expectedIsComplaint: true,
  },
  {
    id: 12,
    description: "Network/downtime inquiry",
    message: "Is the platform down? I can't log in since this morning. My friends also can't access their accounts. What is happening?",
    expectedCategory: "Network/Downtime",
    expectedUrgency: "High",
    expectedIsComplaint: true,
  },
];

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
