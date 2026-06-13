# Product Requirements Document (PRD): PulseDesk

## 1. Problem Statement
Quidax (a leading Nigerian crypto exchange) manages highly active Telegram communities where users constantly post issues ranging from critical withdrawal failures to general crypto chatter. Support teams currently have to manually sift through thousands of messages to identify, prioritize, and resolve genuine support tickets. This manual triage leads to delayed response times for critical financial issues, high cognitive load on agents, and an unorganized support workflow.

## 2. Core Philosophy
**Classification is never purely AI.** The system combines AI classification with human oversight because AI will inevitably miss things, misread Nigerian slang, and make errors a human would catch. The human layer is not optional — it is a core feature and a key part of the pitch to Quidax.

## 3. Target Users
*   **Primary:** Quidax Support Agents and Team Leads (who will use the dashboard to triage and resolve issues).
*   **Secondary:** Admins/Operators during the pitch phase (demonstrating the tool's effectiveness).

## 4. Current State
*   **What Works:** Live Telegram listening, Groq-based LLaMA classification, Gemini suggested replies, Supabase storage, and the React dashboard polling system. As of 2026-06-11: message re-processing is idempotent (admin/user replies no longer duplicate); all KPI cards are verified honest — Resolution Rate = Resolved ÷ (Resolved + Active) with Dismissed spam excluded, real `resolved_at` timestamps, Lagos-timezone day boundaries; every dashboard filter (search/category/urgency/date/custom range) updates the KPI cards together with the table; unquoted admin replies attach to the right ticket via a 90-second window heuristic; Railway deployment config (`railway.toml`) is in place and the production bundle is verified to boot.
*   **What Does Not (full audit, 2026-06-12 evening — see KNOWN_ISSUES.md section 6):** live Telegram ingestion (the listener delivers nothing; the 15-min AutoFetch sweep is carrying the product, with silent message drops, reverse-order processing, and cross-chat edit/delete corruption), classification of anything the model fumbles ("General Question" fallback is auto-dismissed and invisible), the production benchmark (its test file never deploys), and Gemini suggested replies (failing since Jun 12 evening). **Fix phase in progress (2026-06-12 → 2026-06-13):** silent drops, cross-chat edit/delete corruption, reverse-order processing, the auto-dismiss policy, the lost-thread case where an admin reply quotes a never-ingested message (now retro-ingested from Telegram), and the dead live listener + blind watchdog (the root cause — the watchdog is now only kept awake by real group traffic and reconnects a silent listener, and group matching is by exact channel id) are all fixed and committed; remaining: redeploy the benchmark and fix Gemini reply failures. Also still weak: deep, nuanced categorization of Nigerian slang or highly specific crypto edge-cases; long-term session persistence for GramJS under load-balancer constraints; unquoted admin replies arriving more than 90 seconds after the ticket (or when several tickets land in the same 90s window) still cannot be matched reliably.
*   **What is Missing:** Granular sub-categories. (Automated Telegram thread replies are built as of 2026-06-12 but not yet enabled in production — see Milestone 5 below.) As of 2026-06-12 the resolution workflow has four active states (Open / In Review / Escalated / Awaiting User) and the dashboard shows an Avg Response Time KPI fed by the new `first_admin_reply_at` column (tracked for tickets from 2026-06-12 onward; legacy tickets are excluded rather than guessed).
*   **Milestone 3 shipped (2026-06-12) — The Human Loop:** a `corrections` table records every human fix or confirmation of an AI classification; admin replies in Telegram that contradict the assigned category silently fix the ticket and log a correction; every new classification is primed with the 5 most similar past corrections (few-shot learning, verified to flip a repeat misclassification after one correction); and a flashcard-style /train page lets admins review unreviewed tickets one at a time.
*   **Milestone 5 built (2026-06-12) — Automated Status Update Bot (Feature 4), NOT YET LIVE:** marking a ticket Resolved, Escalated, or Awaiting User in the dashboard now replies to the user's original Telegram message with a fixed empathetic template. Because this is the first feature that writes to the real community group, it shipped behind a kill switch (`BOT_REPLIES_ENABLED`, default off) and a dry-run mode (`BOT_REPLIES_DRY_RUN`, default on) with hard rails: never twice for the same ticket+status (database-enforced), rate limited (5s gap / 20 per hour), silent for tickets older than 7 days or authored by admins, locked to the configured group, and the bot never re-ingests its own replies as admin activity. Everything was proven locally in dry-run with Telegram disconnected (18/18 assertions). Rollout attempt (2026-06-12 evening): the production dry-run phase passed — a real status change produced a correctly targeted, correctly worded audit row — but the first live send was rejected by Telegram with `USER_BANNED_IN_CHANNEL`: the account the system logs in with is banned from sending messages in the community group (it can still read everything, so ticket ingestion is unaffected). No message reached the group. The feature is parked behind its kill switch until the account is unmuted or swapped for one with send rights; it remains a ready-to-demo capability for the Quidax pitch.
*   **Milestone 4 shipped (2026-06-12) — Hardening + Measurement:** Feature 2 is now fully complete — the "Verify" function re-runs the AI on human-reviewed tickets with and without the training data (leave-one-out, so it cannot cheat) and reports the accuracy gain in the dashboard's Benchmark panel; this is the weekly number for the "AI Accuracy" success metric below (verified live: 33% baseline → 100% trained on the seed set). KPI aggregation moved into the database, so the dashboard stays honest at any ticket volume (the old code silently stopped counting at 5,000). Suggested replies survive Gemini outages (retry with backoff + a 15-minute repair sweep). And the AI can no longer overwrite a ticket status that a human or an admin reply set while classification was still running. The Automated Status Update Bot (Feature 4) was deliberately NOT built this milestone — it posts to the real Telegram group and deserves its own careful milestone (now Milestone 5).

## 5. Core Features

### Feature 1: Improved Category System
*   **Description:** Refine category names to better reflect real, nuanced issue types aligned with Quidax's actual operational taxonomy.
*   **User Story:** As a support agent, I need to see the difference between a "Withdrawal Issue" (technical delay) and a "Transaction Dispute" (user contention) so I know exactly which internal team to escalate to.
*   **Acceptance Criteria:** 
    *   System prompt and Zod schema updated with 10+ granular categories.
    *   Fallback normalizer handles these new categories perfectly.
*   **Priority:** High

### Feature 2: Human Feedback and Training Loop
*   **Description:** A dedicated, flashcard-style training interface where admins review and correct AI classifications.
*   **User Story:** As an admin, I want to review recent tickets and correct the AI when it mislabels a message, so the system gets smarter over time.
*   **Acceptance Criteria:**
    *   Separate UI view for training.
    *   Corrections are stored in a dedicated reference DB table.
    *   A "Verify" function re-runs the AI on corrected tickets to measure accuracy improvements.
*   **Priority:** High

### Feature 3: Admin Reply Learning
*   **Description:** The system listens to admins replying in the Telegram group. If the admin's reply implies a different classification than the AI chose, it auto-corrects the ticket and learns from it.
*   **User Story:** As an agent, I want the system to learn from how I naturally reply to users in Telegram, without me having to open a separate training dashboard.
*   **Acceptance Criteria:**
    *   Backend detects admin IDs.
    *   LLM evaluates the admin's response to infer the true ticket category.
    *   Ticket is silently updated and logged as a training data point.
*   **Priority:** Medium

### Feature 4: Automated Status Update Bot
*   **Description:** Changing a ticket status in the dashboard (e.g., Open → Resolved) triggers an automatic, empathetic bot reply in the Telegram thread.
*   **User Story:** As a user, I want to be notified in the Telegram thread the moment Quidax resolves my issue.
*   **Acceptance Criteria:**
    *   Dashboard status change fires a webhook to the backend.
    *   GramJS posts a reply directly replying to the original user's message.
    *   Tone must match Quidax's professional and empathetic brand voice.
*   **Priority:** High

### Feature 5: PR-Based Development Workflow
*   **Description:** Strict adherence to Pull Request-based updates for future iterations.
*   **User Story:** As a stakeholder, I want to read clear, plain-English summaries of every proposed change before it merges to production.
*   **Acceptance Criteria:**
    *   One feature/fix per PR.
    *   PRs include updated documentation.
    *   Git commits and PR descriptions are written in non-developer English.
*   **Priority:** Critical

## 6. Implementation Phases
*   **Milestone 1 (Foundation):** Lock in the Improved Category System (Feature 1) and establish the PR-Based Workflow (Feature 5). — **DONE (2026-06-11)**
*   **Milestone 2 (Automation):** Four-state resolution workflow + Avg Response Time KPI. — **DONE (2026-06-12)**
*   **Milestone 3 (The Human Loop):** Build the Human Feedback interface (Feature 2) and Admin Reply Learning (Feature 3). — **DONE (2026-06-12)**, except Feature 2's "Verify" accuracy-measurement function (carried to Milestone 4).
*   **Milestone 4 (Hardening + Measurement):** the "Verify" accuracy function (completes Feature 2), DB-side KPI aggregation (the 5,000-row stats cap), Gemini suggested-reply retry/backoff + repair sweep, and the async classification race fix. — **DONE (2026-06-12)**. The Automated Status Update Bot was moved out to keep this milestone non-destructive (nothing in it posts to the live group).
*   **Milestone 5 (Outbound):** the Automated Status Update Bot (Feature 4) — dashboard status changes post an empathetic reply into the Telegram thread via GramJS, behind a kill switch, dry-run mode, per-status templates, rate limiting, dedup, and age/admin/group guards. — **BUILT; PARKED (2026-06-12):** production dry-run verified, but go-live is blocked because the Telegram account is banned from sending in the group (`USER_BANNED_IN_CHANNEL`). Revisit with an unmuted or different account.

*   **Milestone 6 (Post-Audit Hardening):** fix the critical/high findings from the 2026-06-12 full system audit (KNOWN_ISSUES §6), one commit per item. Done: silent message drops (Fix 1), cross-chat edit/delete corruption (Fix 2), AutoFetch ordering (Fix 3), auto-dismiss policy (Fix 4), quoted-parent retro-ingest (Fix 5), live-listener resurrection + watchdog (Fix 6), the **AI benchmark now ships to production** (Fix 7, `c8b2ea9`) — restoring the measurement tool behind the "AI Accuracy" success metric (§8), and **Gemini suggested-reply quota-aware backoff** (Fix 8, `7a09b15`) so the repair sweep no longer re-burns an exhausted free-tier quota. **All §6 items 1–8 addressed in code (2026-06-13).** Fix 9 (2026-06-13, commit `0354351`) closes the §3 Pidgin gap: Nigerian Pidgin English classification is now covered by a system-prompt glossary (`pidgin-glossary.ts`); benchmark extended to 18 cases (6 Pidgin); proven 100% Pidgin accuracy. Remaining live confirmation: Fix 6 awaits a `Live message received / matchedBy:channelId` log line; Fix 8 confirmed working (transient overload, not quota — breaker opened then closed in 2 min with successful repair). — **CODE COMPLETE; PENDING PRODUCTION OBSERVATION (2026-06-13)**

## 7. Definition of Done
Fully production-ready means the system can ingest 10,000 messages a day without crashing, categorizes with 90%+ accuracy (post-human-training), never exposes secrets, and allows agents to resolve tickets directly from a polished, bug-free dashboard.

## 8. Success Metrics
*   **Agent Time Saved:** 50% reduction in time spent manually reading general chatter.
*   **Time to Resolution:** High/Critical tickets are addressed 3x faster.
*   **AI Accuracy:** The ratio of manual corrections via the Training Loop decreases by 20% week-over-week.
