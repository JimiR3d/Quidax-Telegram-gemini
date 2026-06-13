/**
 * PulseDesk classification benchmark — the 12 gold test cases.
 *
 * Single source of truth for the AI-accuracy benchmark, used by the
 * `/api/eval` endpoint (server.ts) and the `eval.ts` CLI. Lives as a committed
 * TypeScript module (not a JSON file) on purpose: a `.ts` module is bundled
 * straight into `dist/server.mjs`, so it always ships to Railway. The old
 * `benchmark_cases.json` is gitignored and therefore never deployed, which is
 * exactly why the production benchmark modal was returning total:0 (KNOWN_ISSUES
 * §6 item 6, Fix 7).
 *
 * NOTE: these cases are Quidax-representative but contain NO Nigerian Pidgin
 * (e.g. "e don do", "dem block my account"). Pidgin classification coverage is
 * a known gap (KNOWN_ISSUES §3) and is deliberately out of scope here — this
 * fix only makes the existing English benchmark deploy and render correctly.
 *
 * Every `expectedCategory` must stay within VALID_CATEGORIES and every
 * `expectedUrgency` within VALID_URGENCIES in server.ts; tests/benchmark-cases.test.ts
 * guards that.
 */

export interface BenchmarkCase {
  id: number;
  description: string;
  message: string;
  expectedCategory: string;
  expectedUrgency: string;
  expectedIsComplaint: boolean;
}

export const BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 1,
    description: "Critical withdrawal stuck",
    message:
      "I have been trying to withdraw NGN250,000 since Monday and it keeps saying 'processing'. This is 4 days now. I need this money urgently.",
    expectedCategory: "Withdrawal Issue",
    expectedUrgency: "Critical",
    expectedIsComplaint: true,
  },
  {
    id: 2,
    description: "KYC inquiry",
    message:
      "Hi, I submitted my NIN and selfie for Tier 2 KYC 3 days ago but my account still shows Tier 1. Can someone check?",
    expectedCategory: "KYC/Verification",
    expectedUrgency: "Medium",
    expectedIsComplaint: false,
  },
  {
    id: 3,
    description: "Deposit not credited",
    message:
      "I sent 500 USDT TRC20 2 hours ago. TronScan shows 40 confirmations but my balance is still 0. TX: abc123...",
    expectedCategory: "Deposit Issue",
    expectedUrgency: "High",
    expectedIsComplaint: true,
  },
  {
    id: 4,
    description: "Spam/chatter - should filter",
    message: "gm everyone hope we all have a great day ☀️",
    expectedCategory: "Spam/Irrelevant",
    expectedUrgency: "Low",
    expectedIsComplaint: false,
  },
  {
    id: 5,
    description: "Account locked - high urgency",
    message:
      "My account is locked after I tried to reset my password. I cannot log in and I have a trade open. Please unlock it immediately.",
    expectedCategory: "Account Access",
    expectedUrgency: "High",
    expectedIsComplaint: true,
  },
  {
    id: 6,
    description: "Positive praise",
    message:
      "Just got my QDX staking rewards! Great platform, keep up the good work team 🚀",
    expectedCategory: "Praise",
    expectedUrgency: "Low",
    expectedIsComplaint: false,
  },
  {
    id: 7,
    description: "App bug - crash",
    message:
      "The Quidax app crashes every time I tap on Portfolio. I'm on iPhone 15, iOS 17.4, app version 4.2.1. Started after the last update.",
    expectedCategory: "App Bug",
    expectedUrgency: "Medium",
    expectedIsComplaint: true,
  },
  {
    id: 8,
    description: "Fee complaint",
    message:
      "Why was I charged 1.5% on my BTC to USDT swap? The website says 0.5%. This is not what was advertised.",
    expectedCategory: "Fee Complaint",
    expectedUrgency: "Medium",
    expectedIsComplaint: true,
  },
  {
    id: 9,
    description: "Trading problem",
    message:
      "I placed a limit buy order for ETH at NGN85,000 but it never filled even though the price went below that. The order is stuck.",
    expectedCategory: "Trading Problem",
    expectedUrgency: "Medium",
    expectedIsComplaint: true,
  },
  {
    id: 10,
    description: "General question",
    message:
      "What are the withdrawal limits for Tier 1 users? How do I upgrade to Tier 2?",
    expectedCategory: "General Question",
    expectedUrgency: "Low",
    expectedIsComplaint: false,
  },
  {
    id: 11,
    description: "Hacked / security alert - critical",
    message:
      "HELP. Someone has logged into my account from a device I don't recognise and withdrew all my funds. I need this stopped NOW.",
    expectedCategory: "Account Access",
    expectedUrgency: "Critical",
    expectedIsComplaint: true,
  },
  {
    id: 12,
    description: "Network/downtime inquiry",
    message:
      "Is the platform down? I can't log in since this morning. My friends also can't access their accounts. What is happening?",
    expectedCategory: "Network/Downtime",
    expectedUrgency: "High",
    expectedIsComplaint: true,
  },
];
