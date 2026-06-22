# Interview Prep — Jimi Aboderin

This is your complete pitch and interview preparation document. Read it before any conversation with a Quidax contact.

---

## The core narrative (the thing every answer should circle back to)

> "I applied for your graduate trainee programme in January 2026. I didn't get in. So instead of reapplying with a CV, I spent the next few months teaching myself your stack and building two production tools on your real data — unprompted. That is how I would work if I were on your team."

This is not a cover letter — it is a behavioral claim you can prove. **Every interview answer should eventually connect to this narrative.**

---

## Your two projects

### Project 1 — Quidax B2B Market Intelligence Dashboard
- **Repo:** github.com/JimiR3d/Quidax-Dashboard
- **Live:** quidax-b2b-dashboard.vercel.app
- **Stack:** Next.js 16 / React 19 / TypeScript / Tailwind / Recharts / SWR / Vercel
- **What it does:** A competitive-intelligence dashboard pulling real-time data from Quidax's public API to make the case that Quidax's next growth lever is B2B infrastructure (institutional APIs, settlement services, fiat corridors). Shows market sizing, a competitive matrix vs Yellow Card / Busha / Luno / Roqqu, live market data refreshing every 15 seconds, and an interactive opportunity model projecting **$1.2M–$1.9M B2B revenue**. Live ticker data has a 5-second timeout with automatic fallback to cached data.
- **Why it exists:** You saw that Quidax talks a lot about retail; you built the argument that the B2B opportunity is underexploited — using their own data.
- **Warm signal:** Abiodun Oni (Head of API Sales) saw it on LinkedIn and replied "Well done mahn 👏"

### Project 2 — PulseDesk (this repo)
- **What it does:** AI-assisted support triage tool reading Quidax's real Telegram community live. Every message is classified, prioritized, and surfaced as a ticket on a dashboard with a suggested reply. A human is always in control.
- **Why it exists:** After the dashboard, you wanted to show you understand their *operational* pain, not just their strategic opportunity. You picked the support problem because it's real and daily and measurable.
- **Live now:** Reading the actual OfficialQuidaxCommunity, ~14-second ingest lag, 46% resolution rate, 332 automated tests.

---

## STAR stories — the ones that sell your judgment

### STAR 1: Live-listener resilience via `getChannelDifference`

**Situation:** PulseDesk went live with a "live push" Telegram listener. Everything looked healthy — `/api/health` showed a recent timestamp, circuits were closed, Telegram said connected. But DB audit showed every message arrived in batches, spaced exactly 15 minutes apart. The live listener was doing nothing.

**Task:** Diagnose why a healthy-looking system was silently broken, without taking the production connection offline.

**Action:** Shipped an opt-in diagnostic flag (`LISTENER_DEBUG`) that logged the metadata (never content) of every Telegram update arriving over the socket. Armed it on production. Captured and analyzed the stream. Found channel CONTROL updates arriving (proving the account was a valid member) but zero `UpdateNewChannelMessage`. Checked the GramJS source (`node_modules/telegram/client/updates.js`): `catchUp()` is a no-op stub. The library never calls `getChannelDifference`. Telegram withholds supergroup message updates from clients that do not demonstrate sync. Three wrong hypotheses were ruled out — the ban branch, the `connect()` vs `start()` branch, the `getDialogs()` priming branch — each with concrete evidence. Built `channel-difference.ts`: seed the channel `pts` counter, poll `GetChannelDifference` every 15 seconds, feed results into the existing idempotent pipeline. Verified in production: 14-second ingest lag.

**Result:** Live ingestion went from 0 group messages to sub-15-second delivery. AutoFetch (3-minute sweep) became the safety net rather than the primary path. The diagnostic methodology — shipping observable logs, forming falsifiable hypotheses, ruling them out one by one — became a pattern used throughout the project.

**How to tell it:** "I was staring at a system that looked healthy on every monitoring surface, but was silently not doing its job. I stopped guessing and added observability. Then I worked through the hypotheses systematically — three were ruled out before I found the one that was real. The fix required understanding not just my code but the underlying library's source code."

---

### STAR 2: Honest KPI design

**Situation:** The resolution rate card showed 80%. That felt too high. You ran a direct SQL query against the database.

**Task:** Audit every KPI number and make it faithfully represent reality.

**Action:** Found three dishonest calculations in one pass: (1) Dismissed spam tickets (chatter about prices, greetings) were being counted as resolutions — inflating 53% to 80%. (2) "Resolved Today" was reading `updated_at`, a column no code ever maintained; 797 of 822 tickets shared a single bulk-import date. (3) "Today" used the server's UTC clock, not Lagos time — Quidax's users and business are in Lagos. Fixed all three: Resolution Rate = (Resolved + Assumed Resolved) ÷ (those + Active), Dismissed excluded; `resolved_at` stamped on every close path; date boundaries computed as Lagos calendar days. Then added a full new layer: "Handed Off" tickets (where the admin redirected the user to email or DMs) excluded from both numerator and denominator, because PulseDesk cannot observe an off-platform resolution. Current rate: ~46%.

**Result:** The rate dropped from 80% to 53% (and settled at ~46% after further refinements). That looks worse — but it's true. You shipped the lower number on purpose.

**How to tell it:** "I built a metric, ran a sanity check, and found I'd been lying. The right response was to fix it and ship the lower number, not to explain it away. A KPI that tells the truth about a hard situation is worth more than a flattering one that erodes trust the moment someone checks."

---

### STAR 3: Human-in-the-loop `/train` (building for trust)

**Situation:** The AI classifies messages with ~94% benchmark accuracy. But "accuracy on a benchmark" and "trust from a real support team" are different things. An AI that learns only from its own initial classifications will learn the wrong things.

**Task:** Design a feedback mechanism that captures real human judgment and feeds it back into future classifications in a way a skeptical reviewer could trust.

**Action:** Built a `/train` screen where agents review AI classifications one at a time — Correct, Wrong (with correction), or Skip. Corrections stored in a `corrections` table. Every new classification is primed with the 5 most similar past human corrections (few-shot injection via keyword overlap). The "Verify" function re-runs the AI over reviewed tickets using **leave-one-out** — a message never sees its own stored correction — so the accuracy gain is measured honestly. Also: admin replies in the Telegram group are automatically monitored — if an admin's reply implies a different category, the ticket is quietly corrected and that becomes a training signal without anyone opening a separate dashboard. The "Skip" button records `human_skip` corrections excluded from few-shot and from accuracy verification — so a human confirming the AI was right does not pollute the training signal, and the accuracy measure reflects genuine corrections only.

**Result:** The system can improve over time from human behavior, both explicit (/train) and implicit (Telegram admin replies), and it can measure its own improvement in a way that can't be gamed.

**How to tell it:** "The hardest part of the human loop wasn't the code — it was making it trustworthy. Leave-one-out prevents the system from cheating on its own test. The distinction between a human confirming the AI and a human correcting the AI matters for the accuracy number. Small decisions like these are what make a claimed accuracy number mean something."

---

### STAR 4: Reply-to ground-truth attribution

**Situation:** User screenshots showed admin replies landing on the wrong tickets. A withdrawal issue had 4 admin replies attached — but they were replies to completely different users. The real withdrawal issue showed zero admin engagement.

**Task:** Diagnose the root cause and fix it without disrupting live ingestion.

**Action:** Traced the issue to a single missing data point: `messages` never stored Telegram's `reply_to_msg_id` (the ID of the message being replied to). Without that, the system fell back to time-window heuristics — attaching an admin reply to whatever the most recent active ticket was. Proved the scope: ~25 admin messages double-attached across tickets. Designed a fix: (1) persist `reply_to_msg_id` on every message insert; (2) add `ticket_id` to `messages`, stamped at every attach site via a `linkMessageToTicket` helper; (3) both quoted branches now load the quoted message's `ticket_id` and use `selectReplyToTarget()` — attachment goes to the right ticket by ground truth before any fallback. Also cleaned up the two proven mis-attributed clusters (withdrawal + login) by sourcing the correct thread text from the `messages` table (never hand-typed — provably genuine). Tested e2e on the no-telegram launcher against the live DB; all 5 test messages cleaned up afterward.

**Result:** Going forward, every quoted reply attaches to the ticket that owns the quoted message. Historical reply-to is unrecoverable (Telegram never sends it for old messages) — you stated that honestly in the handoff rather than inventing it. Resolution rate jumped from 38.9% to 43.7% just from the attribution cleanup.

**How to tell it:** "The symptom was a wrong number on a dashboard. The root cause was a missing column that had been absent since day one. I proved the scope before changing anything, wrote the fix with a pure module so it was testable in isolation, ran e2e tests against the live database, and stated the historical limitation honestly — you can't fix data that was never stored."

---

## Answers to the five hardest questions

### "Where do you see yourself in 5 years?"

"Growing from building features to owning a product surface. In 5 years I want to be the person who looks at a messy operational problem — like a support team drowning in a Telegram community — and turns it into a measured, structured, AI-assisted system that actually improves month over month. I want to be the one who designed it, not just implemented it.

Quidax specifically: I'd want to be on a team that takes something like PulseDesk — which right now is a proof of concept running in production — and turns it into a real internal product with uptime SLAs, a proper accuracy program, and the outbound-reply feature live once you have posting rights. That's the kind of 0-to-1 → 1-to-10 arc I want to own."

---

### "Why Quidax?"

"Because I built an entire production system for your community before you ever paid me. That's not something you do for a company you have a lukewarm opinion of. Two reasons underneath that:

First, the problem space. You are a fintech in a market where trust is everything and the users are writing in a dialect most AI systems don't handle — Nigerian English and Pidgin. That makes the technical problem genuinely interesting, not just a CRUD app.

Second, I think Quidax is at an inflection point. The B2B dashboard I built argues that the next revenue lever is institutional infrastructure — APIs, settlement, fiat corridors. That's a different kind of company than a retail exchange, and it's the kind of company I want to grow with."

---

### "What would you do differently / what would you improve?"

"Three things honestly:

First, enable the outbound bot. It's fully built and verified — it just needs Quidax to grant the account posting rights in the group. The moment that happens, it's a one-setting change to go live.

Second, move from a self-graded benchmark to a real-traffic agreement audit — where the classifier runs on a sample of real messages and Quidax's own agents judge them. Their experts are the ground truth, not me. I've already designed the methodology.

Third, better attribution upstream. The reply-to fix I shipped goes forward; historical messages before it are permanently missing their attribution. The right answer is to have had that column from day one — which means instrumenting the data model before the business logic, not after."

---

### "What is your biggest weakness?"

"I build things before they're asked for — which is a strength in this context but can be a liability in a team setting if not coordinated. PulseDesk exists because I moved fast on a problem I found compelling. In a team context, that energy needs to be channeled through prioritization conversations and visibility — otherwise you end up with well-built things that weren't the most important thing to build.

I'm aware of this. My defense is documentation and written handoffs — every decision in this project has a reason written down so the next person doesn't have to reverse-engineer my choices."

---

### "This is just calling an AI API, isn't it?"

"The AI call is maybe 10% of what's here. The rest is: getting messages reliably when the obvious live-push method silently didn't work; making processing idempotent so 4 overlapping ingestion paths never create a duplicate; forcing the AI to return valid output and failing safely when it doesn't; a human feedback loop that can actually measure its own improvement; keeping KPI numbers honest; a deploy-overlap protection that prevents the Telegram session from being permanently burned on every Railway deployment; a watchdog, quota-aware backoff, circuit breakers. The intelligence is rented. The engineering is mine."

---

## Who you are (for the self-introduction)

Jimi Aboderin. CS graduate, Covenant University, August 2024 (Second Class Upper). Completed NYSC March 2026. Starting MSc Technology & Management at CODE University Berlin, September 2026. Based in Lagos.

Most relevant prior experience: Data Analyst Intern at Qucoon — automated Basel III regulatory reporting with Python, SQL, and Power BI. That is where you learned that turning messy operational data into reliable, audited numbers is actual engineering work.

The throughline: you have been solving measurement and classification problems — is this transaction compliant, is this Telegram message a real support issue — and building the tooling around those problems so humans can act on them confidently.

---

## Questions to ask them (shows senior thinking)

- "How does the support team currently handle the Telegram community? Is the triage manual, or is there tooling?"
- "If PulseDesk were to become an internal tool, who would own it — product, support ops, or engineering?"
- "How do you think about AI accuracy in a context where the consequences of a wrong label are a frustrated customer? What's the acceptable error rate?"
- "The B2B API dashboard I built argues that institutional services are the next revenue lever. Where is the team's head on that?"
- "What does onboarding look like for a graduate trainee — how quickly do you get to own something?"
