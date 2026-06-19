# Part 8: Interview Prep — Questions and Model Answers

This is a bank of questions you're likely to get, grouped by type, each with a model answer in *your* voice. Don't memorize them word-for-word — understand them, then say them naturally. The earlier parts give you the depth; this part gives you the delivery.

A universal rule: **answer in layers.** Give a crisp one- or two-sentence answer first, then offer to go deeper ("I can walk through exactly how that works if useful"). That lets the interviewer steer, and it sounds confident rather than rambling.

---

## 8.1 Opening / "tell me about your project"

**Q: Tell me about something you've built.**
> "I built PulseDesk, an AI-assisted support triage tool for Quidax, a Nigerian crypto exchange. They run huge, busy Telegram communities, and their support team has to manually scroll through thousands of messages to find real issues — which means urgent financial problems get slow responses. PulseDesk reads every message automatically, uses AI to pick out and prioritize the genuine support issues, drafts suggested replies, and shows it all on a dashboard — with a human always in control. It's deployed and live, reading their actual community. I can go as deep as you like on any part — the architecture, the AI pipeline, or some of the harder bugs I solved."

**Q: Why does it exist / what problem does it solve?**
> "Three problems: real support issues get lost in general chatter; there's no prioritization, so a critical 'I can't withdraw my money' sits in the same undifferentiated stream as 'good morning'; and there's no structure or memory of what's open, resolved, or recurring. PulseDesk fixes all three — it surfaces real issues, ranks them by urgency, and organizes them into a trackable workflow."

**Q: What's the single most important idea in it?**
> "That classification is never purely AI. The human-in-the-loop is a designed-in feature, not a gap. AI does the tireless first pass; humans correct it; and those corrections feed back to make it smarter. For a company handling people's money, that human oversight is exactly the right posture — you're not asking them to trust a black box."

---

## 8.2 The AI-assistance question (handle with total confidence)

**Q: Did you build this yourself, or did AI build it?**
> "I built it as an AI-assisted project — which is how serious software is built now. I made every product and architecture decision, I directed the implementation, and I personally verified every fix in production, usually with live database queries and server logs rather than just trusting it worked. The value I bring is the judgment: spotting the real problem behind a symptom, choosing a fix that's safe under concurrency, and proving it works. Happy to prove that depth — ask me about any bug and I'll walk you through how I diagnosed it."

Then *invite* a deep question, because that's where you shine. The worst thing you can do is sound defensive. The best thing is to treat it as an invitation to demonstrate understanding.

**Q (follow-up): Okay, prove it — explain a bug you debugged.**
> Go to the live-listener story or the Safari story (Part 7) and use the symptom → stakes → insight → cause → fix+proof cadence. The disproven hypotheses are what sell it.

---

## 8.3 Architecture questions

**Q: Walk me through the architecture.**
> "Three layers. A backend on Railway that's the only thing touching Telegram, the AIs, and the database — it ingests messages, runs classification and reply-drafting, and exposes a REST API. A Postgres database (via Supabase) in the middle as the source of truth. And a React dashboard that just polls that API every 10 seconds and lets agents triage. The key principle is that the frontend is untrusted — all authority and all secrets live on the backend."

**Q: Trace a message through the system.**
> Use the "life of a message" narration from Part 3.3: ingest → dedup → noise filter → PII redaction → classify (Groq) → draft reply (Gemini) → store → dashboard shows it → human acts → system learns.

**Q: Why two different AI providers?**
> "Different jobs, different needs. Classification runs on every message and has to be fast and cheap, so I used Groq, which is built for speed. Reply-drafting is lower-volume but needs nuance and empathy, so it's worth a higher-quality model — Gemini. Using one expensive model for everything would be slow and costly; one cheap model would give weak replies. Matching the tool to the task."

**Q: Why polling instead of real-time WebSockets?**
> "Deliberate simplicity. A 10-second poll is stateless, robust, and trivial to reason about — it just re-asks for the latest data. WebSockets would be more efficient but add connection-state complexity I didn't need for an internal dashboard. I optimized for reliability and maintainability over efficiency I wouldn't notice."

**Q: Why is it one big backend file? Would you change that?**
> "It grew as one cohesive service because everything shares one long-lived process and in-memory state — the Telegram connection, the pipeline, the API. To keep it maintainable I pulled the trickiest logic into small, separately-tested modules, so the big file is mostly orchestration. If I were extending it, the next refactor would be splitting it into route files and a service layer. I know the trade-off I made and why."

---

## 8.4 Technical deep-dive questions

**Q: How do you avoid processing the same message twice?**
> "Every ingestion path funnels into one shared function whose very first step is a duplicate check on the message's unique Telegram ID — so re-processing is a no-op. That's backed by a unique constraint in the database as a last-resort guard against a rare simultaneous-processing race. The pipeline is idempotent by design, which is what lets multiple ingestion paths safely overlap."

**Q: How does the live message ingestion actually work?**
> The live-listener story (Part 7.1), short version: "The expected live-push didn't work for this group in this library version — I proved it with on-server diagnostics showing the channel's message updates were never delivered. So instead of waiting for a push, I actively poll Telegram every 15 seconds for what's changed in the channel since a counter I track myself. That got ingestion to about 14 seconds, with a slower sweep as a safety net."

**Q: How do you keep the AI from returning garbage?**
> "Strict instructions that list the exact allowed values and demand JSON; temperature zero for consistency; then I clean, parse, normalize common mislabels, and validate the output against the allowed shape. If it's malformed, I retry a couple of times and then fall back safely — I still create the ticket flagged as degraded rather than crashing or inventing a wrong label. The user's message is never lost because the AI had a bad moment."

**Q: How does it handle the AI service being down or rate-limited?**
> "Every external call has a timeout and a circuit breaker, and retries only the genuinely temporary errors with backoff. A specific lesson: a daily-quota error looks retryable but isn't — retrying just burns the dead quota faster — so I detect a real quota-exhausted error and back off for an hour instead. And a background sweep backfills any replies that were missed during an outage."

**Q: How do you prevent the AI from overwriting a human's decision?**
> "Race protection. The background classifier finishes a few seconds after a message arrives. If a human changed the ticket's status in those seconds, the classifier's final write is conditional — 'set status only if it's still what I started with, otherwise just save the labels and leave status alone.' Same conditional-update pattern guards the auto-resolve-from-admin-reply feature."

**Q: How is it tested?**
> "The trickiest decisions are extracted into pure modules — same inputs, same outputs, no database or network — and each has a test file covering normal, weird, and edge inputs. That's 172 tests. I concentrated testing where the subtle logic lives. The parts that touch the live Telegram connection can't run safely on a laptop while production is live, so I was honest that their first real exercise is production — and I verified those with production logs and live database queries."

---

## 8.5 Security questions

**Q: How do you know it's secure?**
> Layer it: "Four angles. User privacy — personal data like phones, emails, and crypto keys is redacted before any message goes to an external AI. Secrets — the powerful database key lives only on the backend, never in the frontend, and when a key once leaked into git history I rotated it, disabled the old one, and verified it's dead. Abuse — the API is rate-limited, with a tighter cap on expensive AI operations. And data integrity — idempotent ingestion with a unique constraint, conditional writes that won't clobber human changes, and a single-instance rule so two processes never corrupt each other."

**Q: A secret leaked into your git history — what did you do?**
> "Treated it as permanently compromised, because you can't truly scrub something from a public history. So I rotated to a new key, disabled the old one entirely, verified it now returns unauthorized, and recorded a standing rule never to re-enable the legacy keys, because that would resurrect the leaked one. The right response to a leak isn't to hide it — it's to rotate, disable, verify, and prevent re-enabling."

**Q: How do you protect users' personal data?**
> "Redaction before any external AI call — phones, emails, card numbers, crypto keys, national IDs are stripped and replaced with placeholders, at every AI call site. The AI gets enough to classify the issue but never the user's actual private details."

---

## 8.6 Product & judgment questions

**Q: How would you measure success?**
> "Agent time saved on reading chatter, faster resolution of high-urgency issues, and — the one I'm proudest of — a measurable drop in how often humans need to correct the AI over time. The system can actually measure its own accuracy gain from training, using a leave-one-out method so it can't cheat — about 33% to 100% on the seed data."

**Q: Tell me about a trade-off you made.**
> Pick one: polling over WebSockets (simplicity over efficiency), two AI models (cost/quality matched to task), or one big backend file (cohesion now, with a known refactor path). Each shows deliberate decision-making.

**Q: What would you do next / what are the limitations?**
> "Honestly: it's not load-tested for extreme spikes; it leans on free AI tiers with quotas; and the auto-reply feature is built but parked because the group is broadcast-only. Next steps would be enabling the auto-reply once Quidax grants posting rights, moving the AIs to paid tiers for scale, load-testing the ingestion, and adding more granular sub-categories. I keep an honest known-issues log precisely so the gaps are visible, not hidden."

---

## 8.7 The "gotcha" / skeptic questions

**Q: Isn't this just calling an AI API? What's actually hard here?**
> "The AI call is the easy 10%. The hard 90% is everything around it: getting messages in reliably when the live-push silently didn't work; making processing idempotent so overlapping ingestion paths don't duplicate data; forcing the AI to return clean validated output and failing gracefully when it doesn't; the human feedback loop that actually measures its own improvement; keeping the metrics honest; and the operational reliability — watchdogs, deploy-overlap protection, quota backoff. The intelligence is rented; the engineering is mine."

**Q: What happens when the AI gets it wrong?**
> "Two safety nets. A human can correct it on the training screen, and that correction teaches future classifications. And it never silently does damage — a malformed AI response falls back to a flagged ticket rather than a confident wrong label, and automatic processes are guarded so they can't override what a human set."

**Q: How do I know your '14-second latency' or '53% resolution rate' numbers are real?**
> "Because I measured them against ground truth, not the dashboard's own claims. The latency was a timed test message landing in the database; the resolution rate was reconciled against direct database counts — which is actually how I *caught* an earlier version inflating it to 80% by counting spam as resolutions. I don't trust a number until I've checked it against the source data."

**Q: This is a personal Telegram account reading a community — is that allowed / ethical?**
> "It reads as a normal member would — it doesn't access anything a member can't see, and private data is redacted before any external processing. It's a triage assistant for the support team, not a surveillance tool, and it can't post to the group at all. For a real production deployment with Quidax, the proper path is an official, sanctioned account with the right permissions — which is also what would unlock the auto-reply feature."

---

## 8.8 Behavioral questions (using this project)

**Q: Tell me about a time you were stuck.**
> The live-listener mystery: three wrong hypotheses, each ruled out *with evidence*, before adding a diagnostic that revealed the real cause. Emphasize: "I stopped guessing and gathered evidence."

**Q: Tell me about a time you found a mistake in your own work.**
> The dishonest KPIs, or the rate-limit-self bug. Emphasize honesty: "I'd rather find my own inflated metric than have a stakeholder catch it — so I check numbers against ground truth."

**Q: Tell me about working with constraints.**
> Free AI tiers (quota backoff), one-instance hosting limit (deploy-overlap protection), or a broadcast-only group (the parked feature). Show you engineer *within* real-world limits.

**Q: How do you make sure something actually works?**
> "Evidence over assertion — it's a principle I ran through the whole project. I never call something fixed because it looks fixed; I prove it with a test, a live request, a database query, or production logs. And when something can only be verified in production, I say so plainly instead of pretending."

---

## 8.9 Questions to ask *them* (always have a few)

Asking good questions signals seniority:
- "How does your team currently balance AI automation with human review in production?"
- "When something breaks in production here, what does the debugging and verification process look like?"
- "How do you handle secrets and key rotation across environments?"
- "What does 'done' mean on this team — what's your bar for verifying a change is safe to ship?"

---

### Where we are

You're ready for the conversation. Next, **Part 9** is the live demo script — exactly what to open and say if you're showing it on screen.
