// pidgin-glossary.ts
//
// Addresses KNOWN_ISSUES §3 (Nigerian Pidgin English classification gap).
//
// The Quidax community heavily uses Nigerian Pidgin English (NPE). The base
// LLM sees Pidgin phrases as opaque and defaults to "General Question" or
// misassigns urgency. This module exports a prompt section that is appended
// to GROQ_SYSTEM_PROMPT so the classifier understands the most common Pidgin
// phrases in a crypto-support context — flowing automatically to the main
// pipeline, the Gemini fallback, and /api/test-message.
//
// /api/eval stays a raw-model baseline (no few-shot injection) — the Pidgin
// cases in benchmark-cases.ts (ids 13-18) measure generalisation of this
// glossary, NOT memorisation: the worked examples below intentionally use
// different wording from every benchmark case.

export interface PidginTerm {
  phrase: string;
  meaning: string;
  hint: string;
}

// Structured data (used by tests to verify coverage of key phrases).
export const PIDGIN_TERMS: PidginTerm[] = [
  {
    phrase: "e never enter / money never enter / e no show",
    meaning: "funds have not arrived / not credited",
    hint: "Deposit Issue or Withdrawal Issue",
  },
  {
    phrase: "e dey pending / e hang / e no process / e still processing",
    meaning: "transaction is stuck or still processing",
    hint: "Withdrawal Issue or Deposit Issue depending on context",
  },
  {
    phrase: "dem block my account / dem block am / account don lock",
    meaning: "account has been blocked or locked",
    hint: "Account Access",
  },
  {
    phrase: "I no fit login / I no fit enter / I no fit access",
    meaning: "user cannot log in",
    hint: "Account Access",
  },
  {
    phrase: "dem chop my money / my money don disappear / balance don go",
    meaning: "funds are missing or stolen",
    hint: "Account Access or Withdrawal Issue — Critical only when a specific transaction/amount is described, otherwise High",
  },
  {
    phrase: "abeg / abeg help me / abeg o",
    meaning: "please / please help me",
    hint: "signals frustration or urgency — not its own category; look at surrounding context",
  },
  {
    phrase: "e don do",
    meaning: "context-dependent: 'the app e don do' = it is broken; as a standalone exclamation = surprise/done",
    hint: "App Bug when attached to a feature; otherwise not a support issue",
  },
  {
    phrase: "sharp sharp / quick quick",
    meaning: "quickly / instantly",
    hint: "often appears in Praise messages when something worked fast",
  },
  {
    phrase: "una / una too much",
    meaning: "you (plural) / you are great",
    hint: "Praise",
  },
  {
    phrase: "wahala / no wahala",
    meaning: "problem / no problem",
    hint: "wahala alone signals a complaint; 'no wahala' is positive",
  },
];

// Compiled prompt section appended to GROQ_SYSTEM_PROMPT in server.ts.
// Worked examples deliberately differ from benchmark-cases.ts ids 13-18 so
// /api/eval measures generalisation, not memorisation.
export const PIDGIN_GLOSSARY_PROMPT = `

=== NIGERIAN PIDGIN ENGLISH ===
Many Quidax users write in Nigerian Pidgin English. Classify their messages by meaning, not by grammatical correctness. Key phrases:
- "e never enter" / "money never enter" / "e no show" → funds not credited → Deposit Issue or Withdrawal Issue
- "e dey pending" / "e hang" / "e no process" → transaction stuck → Withdrawal Issue or Deposit Issue
- "dem block my account" / "I no fit enter" / "account don lock" → locked out → Account Access (High — not Critical unless 3+ days or funds confirmed missing)
- "my money dey inside" → funds ARE in the account but inaccessible → account locked with funds at risk → High (NOT Critical; money is present, not lost or stolen)
- "dem chop my money" / "my money don disappear" / "balance don go" → funds missing or stolen → Account Access or Withdrawal Issue (Critical only when a specific transaction/amount is described; a vague claim with no details is High)
- "abeg" → please (signals frustration or urgency — not a separate category on its own)
- "e don do" → context-dependent: "app e don do" = feature is broken (App Bug); standalone exclamation = not a support issue
- "[transaction] enter" / "enter sharp sharp" / "enter quick quick" → transaction completed successfully (POSITIVE — money arrived as expected)
- "na correct [app/exchange/platform]" / "una too much" / "sharp sharp" → compliment / praise → Praise (no financial problem being reported)

=== PIDGIN CLASSIFICATION EXAMPLES ===
"I send ETH two days ago e never enter my Quidax wallet at all" → Deposit Issue, High
"My login dey block, I no fit enter my account since yesterday, make una help me" → Account Access, High
"I try send money go bank since this morning, e just dey show pending, abeg check am" → Withdrawal Issue, High
"App just dey go off anytime I wan check my portfolio, e don do like three times today" → App Bug, Medium
"Na correct app! My deposit enter sharp sharp, una too much, big thanks!" → Praise, Low`;
