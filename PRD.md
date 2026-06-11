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
*   **What Does Not:** Deep, nuanced categorization of Nigerian slang or highly specific crypto edge-cases; long-term session persistence for GramJS under load-balancer constraints; unquoted admin replies arriving more than 90 seconds after the ticket (or when several tickets land in the same 90s window) still cannot be matched reliably.
*   **What is Missing:** Robust human-in-the-loop training interfaces, automated Telegram thread replies, granular sub-categories, and an Avg Response Time metric (requires storing time of first admin reply).

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
*   **Milestone 1 (Foundation):** Lock in the Improved Category System (Feature 1) and establish the PR-Based Workflow (Feature 5).
*   **Milestone 2 (Automation):** Implement the Automated Status Update Bot (Feature 4).
*   **Milestone 3 (The Human Loop):** Build the Human Feedback interface (Feature 2) and Admin Reply Learning (Feature 3).

## 7. Definition of Done
Fully production-ready means the system can ingest 10,000 messages a day without crashing, categorizes with 90%+ accuracy (post-human-training), never exposes secrets, and allows agents to resolve tickets directly from a polished, bug-free dashboard.

## 8. Success Metrics
*   **Agent Time Saved:** 50% reduction in time spent manually reading general chatter.
*   **Time to Resolution:** High/Critical tickets are addressed 3x faster.
*   **AI Accuracy:** The ratio of manual corrections via the Training Loop decreases by 20% week-over-week.
