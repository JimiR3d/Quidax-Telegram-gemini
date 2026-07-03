# PulseDesk — Accuracy & Trust: Audit Methodology

> The honest answer to "how accurate is it, what is it tested against, and why should
> I trust it." This document is the *protocol*, written so a skeptical evaluator — or
> Quidax's own agents — can reproduce every number themselves.

## The principle

The only question that matters for an accuracy claim is: **who decides the right answer,
and can they game it?**

PulseDesk is a **human-in-the-loop triage assistant**, not an autonomous decision-maker.
So the honest claim is *measured error rates plus a correction loop* — not a perfection
score. Every number below is built so its ground truth is set by a **human**, judging
**real traffic**, **blind** to the AI's answer. That is what makes it survive "you wrote
the test and the answer key."

## The credibility stack

| Layer | What it proves | Why it can't be dismissed |
|---|---|---|
| **Real-traffic agreement audit** | The headline accuracy number | Inputs are real messages; a human judges them blind to the AI |
| **System-level trust metrics** | The scary failures are bounded | Auto-resolve precision, noise false-negative rate, grouping correctness — human-checked on real tickets |
| **Internal regression suite** | No prompt regressions | 24 hand-written cases (incl. Pidgin), honestly labelled an engineering guard — *not* the accuracy claim |
| **Live Sandbox** | Interactive proof | The evaluator types their own message and watches it classify, live |
| **Training-loop panel** | The correction loop works | Leads with the improvement on the AI's hardest cases — explicitly not "accuracy" |

---

## 1. Real-traffic agreement audit (the defensible number)

### Sampling
A purely random sample of recent traffic is ~60% banter (General Question / Spam), which
barely exercises the classifier on the cases that matter. So the sample is **stratified**:
oversample the actionable categories, cap the noise (but still include it, so the model's
banter-recognition is measured too). Representative target **~60 messages** across all
12 categories (incl. Community Chat), drawn from the live `tickets` table over a ~60-day
window, taking the original user message (the text before any appended reply block) plus
the full thread as context for the rater.

**Judgeability gate:** context-free fragments (a bare "USDT too" or a lone transaction id)
are unjudgeable even for an expert — the v1 rating stalled on them. Messages under a
minimum word count (default 4, `AUDIT_MIN_WORDS`) are excluded up front. This is
confidence-gating, not cherry-picking: the rater can still leave any row blank, and blanks
are excluded from every denominator. (Assembling context around such fragments is the
grouping system's job, measured separately below.)

Tooling: `scripts/audit-sample.mjs` (read-only — SELECT only, no DB writes).

### Labelling (the AI column)
Each sampled message is classified by the **deployed** `/api/eval` endpoint — the exact
production prompt (`GROQ_SYSTEM_PROMPT` + the Pidgin glossary, the deployed `GROQ_MODEL`
— `openai/gpt-oss-20b` as of 2026-07-03 — temperature 0, no few-shot). This guarantees
the audited classifier *is* the one in production; it is not a re-implementation that
could drift. `/api/eval` performs no DB writes and runs as a background job: the sampler
starts one run and polls `GET /api/eval/progress` until it finishes (~15s per message).

### Judging (the ground truth)
The sampler emits a **blind worksheet** (`agreement_blind.xlsx`, dropdown-validated) and a
**hidden key** (`agreement_key.json`, never shown to the rater). The rater is an
**independent Quidax support agent**, whose expertise *is* the ground truth — they fill
Category and Urgency for every row without seeing the AI's answer. Unjudgeable rows are
left blank and excluded. Author-rated worksheets are deliberately **not** used for the
published numbers: the audit card stays "pending" until an independent rating lands.

### Grading (chosen to be fair, not flattering)
Run by `scripts/audit-score.ts` over the committed, unit-tested core `audit-scoring.ts`:

- **Category** — exact agreement %, plus a **confusion matrix** and per-category agreement
  so failure modes are visible, not hidden behind one number.
- **Urgency** — reported two ways: exact match **and** "within one level"
  (Low < Medium < High < Critical, |Δ| ≤ 1). Severity is subjective; exact-match alone
  under-sells a usable classifier.
- **Critical/High recall** — of the messages the *human* marked Critical or High, what
  fraction did the AI also flag Critical/High. **This is the business metric**: catching
  the urgent ones. A miss here is the real harm.

Blank or unrecognised human cells are abstentions, excluded from every denominator (a rater
typo can never fake the number, and abstentions are never counted as a wrong answer).

---

## 2. System-level trust metrics

Classification % isn't the scary failure. The dangerous failures are in the resolution and
grouping logic we added — a user wrongly marked resolved, a real issue silently dismissed,
one conversation split into many tickets. Same blind/triage pattern; the human verdict is
the measurement. Tooling: `scripts/audit-system.mjs` (read-only) → blind worksheets →
`scripts/audit-score-system.ts`.

- **Auto-resolve precision** — *every* system-resolved ticket is audited (not sampled):
  all Assumed-Resolved tickets, split by mechanism (the conversation-inference "D2" sweep
  vs the 7-day quiet sweep), plus a human-Resolved control. A human reads the whole thread
  and judges *truly resolved / not resolved / can't tell*. Precision = truly ÷ (truly + not).
  The "did we abandon a user?" rate.
- **Noise false-negative rate** — the false-negative is the harm (a real issue dropped as
  noise). **Every Dismissed ticket carrying an actionable category is audited 100%** (the
  highest-risk subset), plus a random sample of the banter lane. Verdict:
  *real issue wrongly dismissed / correctly dismissed / borderline*. FN rate = real ÷
  (real + correct). And every Dismissed message stays reversible in /train.
  This point-in-time audit is complemented by an **ongoing operational net**: the
  dashboard's Dismissed Audit (`GET /api/dismissed-audit`) continuously scans recent
  Dismissed tickets with precision-biased signals (refund, stuck funds, account access,
  hacked/stolen, KYC stuck) and offers one-click reopen — so a dismissed real issue does
  not have to wait for the next audit to be caught.
- **Grouping correctness** — the most recent folds (tickets that merged several user
  messages; capped for rating load) are checked for **over-merge** (two different issues
  mashed together), and the most recent same-sender clusters of separate tickets are
  checked for **over-split** (should have been one ticket).

"Can't tell" / "Borderline" / blank verdicts are abstentions, excluded from the denominators.

---

## 3. The other three layers

- **Internal regression suite** — the 24 hand-written cases in `benchmark-cases.ts`
  (12 English + 6 Nigerian Pidgin + 2 capability questions + 4 added in the 2026-07-03
  taxonomy/urgency re-baseline), run by `/api/eval` (a background job with live progress)
  with exact-match grading. It is honestly framed in the UI as a *prompt-regression
  guard* — it proves a prompt change didn't break a known case; it is **not** the
  accuracy claim.
- **Live Sandbox** (`/api/test-message`) — type any message, watch the live classifier
  label it instantly. The interactive, can't-be-faked proof.
- **Training-loop panel** (`/api/verify`) — re-runs the AI on messages a human corrected in
  /train, once raw and once learning from past corrections (each message's own correction
  hidden). It leads with the **improvement** as a correction-loop proof. Its two percentages
  are measured *only on the AI's hardest, human-corrected cases* — a pool enriched for what
  looked wrong — and are explicitly **not** overall accuracy.

---

## Reproducibility & where the numbers live

- The trustworthy scoring core (`audit-scoring.ts`) is committed and unit-tested
  (`tests/audit-scoring.test.ts`) — a re-run on the same inputs yields the same numbers.
- The rolled-up numbers (no message text / PII) are committed in `audit-results.json` and
  rendered by the dashboard's "Real-Traffic Accuracy Audit" card. The card is built from
  that file, so **rebuild after updating it**.
- Working files with real message text live in the gitignored `audit/` directory and are
  never committed.
- **To reproduce with your own agents:** run `audit-sample.mjs`, hand the blind worksheet to
  your agents, run `audit-score.ts`. The instrument is the same; only the judge changes.

## Honest limitations

- The published numbers wait for an **independent Quidax-agent rating** (the card shows
  "pending" until then). A single rater still carries inter-rater noise; a 2-rater
  overlap on a subset would quantify the human-human ceiling.
- Sample sizes are modest (≈60 for agreement; full-population for auto-resolve and for
  actionable-category Dismissed; grouping lists capped to the most recent) — the numbers
  are estimates with real confidence intervals, presented as such, not as precise
  guarantees.
- Context-free fragments are excluded from the agreement sheet as unjudgeable (see the
  judgeability gate above) — the classifier's behaviour on fragments is bounded instead
  by the grouping metrics and the fragment-specific urgency cap in the prompt.
- The agreement audit measures the classifier on real text decoupled from any later
  reclassification; it is the classifier's accuracy, not a claim about every downstream
  status transition (those are covered separately by the system-level metrics).
