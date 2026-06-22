# Part 9: The Live Demo Script

> **For the full video script + outreach DMs**, see [DEMO_SCRIPT.md](../../DEMO_SCRIPT.md). This guide section covers the general demo technique; the standalone file has the word-for-word scripts for each Quidax contact.


This is your exact playbook for showing PulseDesk on screen — in a pitch to Quidax or a "show me what you built" moment in an interview. The goals: tell a clear story, never get caught by a surprise, and always have something to say while a screen loads.

**The golden rule of demos:** narrate *what* you're showing and *why it matters* before you click, so even if something is slow or breaks, your words carry the story. A demo is a presentation with visuals, not a gamble on live software.

---

## 9.1 Before you start (the 2-minute checklist)

- **Confirm the system is up.** Open the health endpoint (`/api/health`) — it should say "ok" and show the Telegram connection as healthy. If it's not up, you demo the *understanding* (the architecture and stories), not the live screen. That's a perfectly strong fallback.
- **Have the login password ready.** The dashboard is behind an Access Key screen.
- **Open on a device you trust to render it.** (After the recent fix it works in iPhone Safari too, but for a presentation use a normal desktop browser.)
- **Decide your time budget.** Have a 3-minute version and a 10-minute version ready.
- **Know what NOT to do:** do **not** attempt to trigger a real message to the Telegram group. The account can't post (broadcast-only group), and you don't want a `USER_BANNED_IN_CHANNEL` error on screen. The auto-reply feature is something you *describe*, not *fire live*.

---

## 9.2 The 60-second version (an interviewer says "quickly show me")

1. **Open the dashboard.** "This is the agent's view — live tickets from the Quidax Telegram community, automatically classified and prioritized."
2. **Point at a High/Critical ticket.** "Each real issue becomes a ticket with a category, an urgency, a short AI summary, and a suggested reply the agent can edit and send."
3. **Point at the KPI cards.** "Honest metrics up top — resolution rate excluding spam, average response time, volume over time."
4. **One sentence on the loop.** "And it learns: agents correct the AI, and those corrections make future classification better — I can show that if you'd like."

Stop there and let them ask for more.

---

## 9.3 The full demo (the narrated walkthrough)

**Step 1 — Set the scene (before you even share the screen).**
> "Quidax runs a massive Telegram community. Support agents drown in chatter trying to find real issues. PulseDesk reads everything, surfaces the genuine support issues, prioritizes them, and keeps a human in control. Let me show you."

**Step 2 — The login screen.**
> "The dashboard is password-protected — it's an internal tool for the support team. Nothing sensitive lives in the browser; all the authority is on the backend."
Log in.

**Step 3 — The ticket feed (the heart of it).**
> "Here's the live feed. Every card is a real support issue the AI pulled out of the noise. Notice the urgency tags — this is the prioritization that means a stuck withdrawal doesn't get buried under 'good morning' messages."
Open one ticket.
> "Inside a ticket: the original message, the AI's category and urgency, a short summary, and a suggested reply the agent can tweak and send. The agent stays in control — nothing is sent automatically."
Point at the status labels:
> "Notice how the statuses are labelled for humans, not machines. 'Admin Replied' rather than 'In Review.' 'Likely Resolved' for the ones a time-based sweep auto-moved after 7 quiet days. And 'Handed Off' — that badge appears when the conversation shows the admin directed the user to email or DMs. Those tickets are excluded from both the active queue AND the resolution rate — because PulseDesk structurally cannot observe a resolution that happened in a private email thread."

**Step 4 — Show the Nigerian Pidgin handling (a standout).**
If you can find or describe a Pidgin example:
> "This matters for Quidax specifically — the community writes in Nigerian English and Pidgin. A phrase like 'money never enter' means a deposit problem, not general chatter. I built a Pidgin glossary into the AI so it understands the community's actual language — that took Pidgin accuracy from about 67% to 100% in my benchmark."

**Step 5 — Filters and KPIs.**
> "Agents can filter by category, urgency, date, or search — and the metrics up top update together with the list, so the numbers always describe exactly what you're looking at."
Point at the cards.
> "These are deliberately honest. Resolution rate excludes spam — an earlier version inflated it by counting spam as resolutions, and I fixed that. 'Today' is computed in Lagos time, not the server's clock. I care a lot about metrics telling the truth."

**Step 6 — The training loop (the philosophy made visible).**
Open the `/train` screen.
> "This is the core idea — the human-in-the-loop. Agents review the AI's labels one at a time: Correct, Wrong, or Skip. Every correction is stored and fed back so the AI gets better at this community's messages over time."
Then mention Verify (describe it — don't make it your live accuracy proof):
> "And I can actually *measure* whether that training is working — there's a verification function that re-runs the AI with and without the training data, using a method that prevents it from cheating, and reports the lift. It's an internal tracking tool; it gets more meaningful as the team reviews more tickets."

**⚠️ Demo note:** do **not** click "Run Verification" live as your accuracy proof. It's an internal QA tool whose score depends on how much the team has reviewed, and it takes a minute of live AI calls. Your accuracy number is the **benchmark** (next step). If asked to show training working, describe the leave-one-out method rather than running it on stage.

**Step 7 — The benchmark (this is your accuracy number).**
> "For accuracy, the number I'd point to is a fixed benchmark — 20 hand-labelled gold cases, including Nigerian Pidgin ones, that I run the AI against as a stable yardstick. It's deterministic and it's a raw-model baseline, so the number is reproducible and comparable over time, not flattered by training data. You can read all 20 cases in the code — it's transparent. About 94% overall and 100% on the Pidgin cases, which is the part that matters most here."

**Step 8 — The auto-reply feature (describe, don't fire).**
> "There's one more capability, fully built but currently switched off: when an agent resolves a ticket, the system can automatically post an empathetic update to the user in Telegram. It's behind a kill switch, a dry-run mode, send-once protection, and rate limits. It's parked only because the Quidax group is broadcast-only — admins-only posting — so it needs Quidax to grant posting rights. The moment they do, it's a one-setting change to go live."

**Step 9 — Close with reliability (shows operational depth).**
> "Behind all this is the boring-but-critical reliability work — it ingests messages within seconds even though the obvious live method silently didn't work for this group, it survives AI outages and quota limits gracefully, and it's hardened against the deployment race that can otherwise break the Telegram connection. There's also a self-healing sweep that finds messages that landed in the database but never got a ticket — a class of silent data loss that's structurally invisible to the normal pipeline — and replays them automatically. I'm happy to go deep on any of that."

---

## 9.4 Handling demo mishaps gracefully

- **The dashboard is slow to load:** keep talking — narrate what's *about* to appear and why it matters. Slowness becomes invisible if your words are moving.
- **Something looks broken / empty:** "Let me show you the architecture while that settles" — pivot to the whiteboard story (Part 3) or a bug story (Part 7). You never run out of material.
- **An error appears on screen:** stay calm, name it plainly ("that's the rate limiter / that's a stale cache — here's what's happening"), and move on. Composure under a glitch reads as *more* senior than a flawless demo.
- **They ask something you're unsure of:** "I'd want to check the exact detail rather than guess — but here's how that part works at a high level…" Never fabricate. The whole project's principle is evidence over assertion; live it.

---

## 9.5 What to leave them with

End every demo with the one-sentence value statement and the strategic point:
> "So: PulseDesk turns a chaotic, money-sensitive support stream into an organized, prioritized, AI-assisted-but-human-controlled workflow — built specifically for how the Quidax community really communicates. And it's not a mock-up; it's deployed and reading the live community right now."

---

### Where we are

You can run the demo on autopilot and recover from anything. Next, **Part 10** helps you decide which roles to apply for and how to position yourself.
