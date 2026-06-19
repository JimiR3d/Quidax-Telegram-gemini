# Part 5: Subsystems Deep Dive

Part 3 traced one message through the whole system at a high level. This part goes *inside* each major subsystem and explains how it really works, why it's built that way, and the subtle parts that make it reliable. These are the topics a technical interviewer will drill into. Each section ends with **"the point to make"** — the crisp takeaway to say out loud.

The subsystems:
1. Ingestion & idempotency
2. The live-listener problem and the `getChannelDifference` solution
3. Classification (Groq, prompts, PII, Pidgin, few-shot)
4. Suggested replies (Gemini, quota cooldown, circuit breakers)
5. The human training loop (corrections, /train, Verify)
6. Conversation grouping
7. The ticket status workflow & auto-resolution
8. KPIs and honest statistics
9. The outbound status bot (built, parked)
10. Reliability: the watchdog, deploys, and the single-instance rule

---

## 5.1 Ingestion & idempotency — getting messages in, exactly once

**The job:** every message in the Quidax group must reach the backend and be processed exactly once, no matter how it arrives.

**The challenge:** there are *four* different ways a message can enter the system, and they overlap on purpose for reliability:
1. **The live path** — a 15-second poll (`getChannelDifference`, see 5.2) that catches messages within seconds. This is the primary path.
2. **AutoFetch** — a slower sweep every 3 minutes that re-reads recent history as a safety net, in case the live path missed something.
3. **Backfill** — a manual tool to pull in older history on demand.
4. **Recovery of quoted parents** — when an admin replies to a user message the system never saw, it fetches and ingests that original first.

**Why overlap is safe — the single most important reliability idea in the project:** every one of those paths funnels into *one shared function*, and the very first thing that function does is check **"have I already processed this exact message?"** using the message's unique Telegram ID. If yes, it stops immediately. This makes the whole pipeline **idempotent** — running it twice (or four times) on the same message produces exactly one ticket.

Two layers of defense back this up:
- The **first-thing dedup check** in the shared function (the fast, primary guard).
- A **unique constraint in the database** on the message's Telegram ID (the last-resort guard that catches even a rare simultaneous-processing race the first check could miss).

**The ordering rule that must never change:** the dedup check sits *at the very top*, before any database write, any AI call, or any reply-handling branch. An earlier version of the project had this check *lower down*, after the reply-handling logic — which caused admin/user replies to be appended to tickets again on every sweep (one ticket showed a reply duplicated 23 times). Moving the check to the top fixed it permanently. (Full story in Part 7.)

> **The point to make:** "Four ingestion paths overlap for reliability, and that's only safe because processing is idempotent — a dedup check on the Telegram message ID runs first, backed by a unique database constraint. Re-processing is a no-op."

---

## 5.2 The live-listener problem and the `getChannelDifference` solution

This is the project's deepest technical story and a fantastic interview topic. Here's how the *working* system behaves; the full detective story is in Part 7.

**The naive expectation:** when you connect to Telegram as a user-client, you register a "new message" listener and Telegram pushes new messages to you live. That's how the library is supposed to work.

**The reality discovered:** for this large community group, in the library version used, Telegram **never pushed** the group's new-message events to the connected session — even though the account was a genuine member and could read history fine. Proven with on-the-server diagnostics: the session received the group's *control* updates (like read-receipts) and all the account's direct-message updates, but **zero** new-channel-message events for the group. The underlying cause: the library never tracks the group's message-sequence counter (its `pts`) and never asks Telegram to "catch up" on a channel — so Telegram withholds the live message stream.

**Why it mattered:** with live push dead, the only thing ingesting messages was the slow safety-net sweep — so messages took minutes to appear instead of seconds.

**The fix (the working system today):** instead of waiting for a push that never comes, the backend **actively pulls**. It tracks the group's sequence counter (`pts`) and, every 15 seconds, asks Telegram *"what's happened in this channel since counter X?"* using a mechanism called **`getChannelDifference`**. Telegram answers with the new messages; those flow into the same idempotent ingestion function; the counter advances. This brought lag down to roughly **14 seconds** (from minutes). AutoFetch (the 3-minute sweep) stays on as a safety net underneath.

A subtlety handled carefully: one of Telegram's possible answers ("too much has happened, here's the latest state, not the gap") must **not** be bulk-ingested — doing so would ingest wrong/duplicate data. In that case the system just re-syncs its counter and lets the safety-net sweep fill the gap. This kind of careful handling of each response shape is exactly why that logic was extracted into a tested pure module (`channel-difference.ts`).

> **The point to make:** "The expected live-push didn't work for this group in this library version — I proved it with on-server diagnostics showing the channel's message updates were never delivered. The cure was to actively poll Telegram's `getChannelDifference` every 15 seconds and track the channel's sequence counter myself, which got live ingestion to ~14 seconds, with the older sweep kept as a safety net."

---

## 5.3 Classification — turning a message into a labelled ticket

**The job:** read a message and return a clean, structured label — category, urgency, a short summary, and a few related fields — fast and cheaply, across thousands of messages.

**How it works:**
- The message (after PII redaction) is sent to **Groq running a LLaMA model** with a carefully written **system prompt**. The prompt lists the *exact* allowed categories and urgency levels and demands the answer come back as JSON in a specific shape.
- **Temperature is 0** — consistency over creativity. The same message should always get the same label.
- The user's text goes in as *user input*, never glued into the instructions — a clean separation that's also a small security good-practice (it reduces the chance of a message manipulating the instructions).

**Making the AI's output trustworthy (this is where most of the effort went):**
- The raw output is cleaned (stripping any stray formatting), parsed as JSON, common mislabels are normalized (e.g. if the model says `priority` instead of `urgency`), and then validated against the allowed shape.
- If the model returns something malformed, the system retries a couple of times and then **falls back safely** — it still creates the ticket, flagged as degraded, rather than crashing or silently inventing a wrong label. *The user's message is never lost because the AI had a bad moment.* (Graceful degradation, Part 1.15.)

**Noise gating happens first:** cheap rules drop spam/greetings/chatter *before* the AI is called, so money isn't spent classifying "gm." Praise and irrelevant messages don't become tickets.

**Nigerian Pidgin coverage (a standout feature):** the AI's instructions include a **Pidgin glossary** — common phrases mapped to their real meaning and the right category, plus worked examples. So *"money never enter"* is understood as a deposit problem, not filed under "General Question," and *"una too much"* is recognized as praise, not a complaint. This is built into the base instructions (so it improves both the live system and the accuracy benchmark equally), rather than relying on stored corrections. The measured result: Pidgin classification accuracy went from ~67% to 100% on the Pidgin test cases.

**Few-shot learning (the connection to the training loop):** before each classification, the system finds the most *similar* past human corrections and includes a handful of them in the prompt as worked examples ("a message like this should be labelled like that"). This is how the system gets better at *this community's* particular phrasings over time. (Details in 5.5.)

> **The point to make:** "Classification is a fast, temperature-0 Groq call that must return strict validated JSON; the reliability work was all in forcing clean output, handling failures gracefully, and teaching it the community's real language — including a built-in Nigerian Pidgin glossary that took Pidgin accuracy from about 67% to 100%."

---

## 5.4 Suggested replies — Gemini, with cost and failure discipline

**The job:** draft an empathetic reply an agent can edit and send, so they're not writing from a blank box.

**How it works:** the ticket's context goes to **Google Gemini**, which writes a calm, on-brand suggested reply. This is a *draft for a human* — never auto-sent.

**The reliability and cost story (great for showing operational maturity):**
- Every AI call has a **timeout** (so one slow call can't freeze things) and is wrapped in a **circuit breaker** (if the provider fails repeatedly, stop calling it for a short while instead of hammering a dead service).
- **Retries** are used for genuinely temporary failures (server overload), with increasing backoff — *but not for the wrong kinds of errors.*
- **The quota lesson:** Gemini's free tier has a daily limit. When that limit is hit, the error *looks* retryable, so the naive behavior was to retry 3 times per ticket — which burned through the (already-exhausted) quota even faster and tripped the circuit breaker on every cycle. The fix distinguishes a **"quota exhausted — retry much later"** error from a **"temporarily overloaded — retry in a moment"** error. On a real quota error, the system arms a **60-minute cooldown** and stops calling Gemini entirely until it passes — so it stops digging the hole deeper. (Pure module `gemini-quota.ts`; full story in Part 7.)
- **The repair sweep:** every so often, a background job finds recent active tickets that *should* have a suggested reply but don't (because Gemini was briefly down when they came in) and fills them in — but only if still empty, so it never overwrites an agent's edit.

> **The point to make:** "Replies use Gemini behind timeouts, retries, and a circuit breaker. The key insight was that a daily-quota error must be treated as 'back off for an hour,' not 'retry immediately' — otherwise you burn the quota faster and trip the breaker every cycle. A background sweep also backfills replies that were missed during an outage."

---

## 5.5 The human training loop — how the system gets smarter

This is the embodiment of the core philosophy (Part 2.7). Three connected pieces:

**1. The corrections record.** Every time a human touches an AI label, it's stored in a `corrections` table: the original message, what the AI said, what the human said it should be, who did it, and where it came from (a dashboard correction vs. learned from an admin's Telegram reply). A subtle but clever design: a correction where "what the AI said" equals "what the human said" means a human **confirmed** the AI was right — so the same table records both fixes *and* confirmations, and a ticket with any correction row counts as "reviewed."

**2. Few-shot injection (using those corrections).** Before classifying a new message, the system pulls the most *similar* recent corrections and shows them to the AI as examples. So once a human teaches it that "money never enter" means a deposit problem, similar future messages get labelled correctly. Importantly, this is done with a **leave-one-out** rule when *measuring* accuracy, so a message can never "cheat" by seeing its own stored answer.

**3. The `/train` screen.** A simple flashcard interface where an agent reviews one unreviewed ticket at a time and clicks **Correct**, **Wrong** (and picks the right category), or **Skip** (for messages that aren't a clear support issue — recorded as a no-op so the ticket leaves the queue without becoming misleading training data). It shows the full conversation for context and a link to the original Telegram message.

**Measuring the improvement — the "Verify" feature.** This is how you answer "how do you know the training actually helps?" Verify re-runs the AI over human-reviewed messages **twice each** — once with no training examples (a baseline) and once with the training examples (leave-one-out so it can't cheat) — and reports the accuracy difference. On the seed data it measured a jump from ~33% (baseline) to ~100% (with training). That's a *measured* improvement, not a claim.

> **The point to make:** "Every human correction or confirmation is stored, fed back into future classifications as similar examples, and the system can measure its own accuracy gain from that training using a leave-one-out method so it can't cheat — about 33% to 100% on the seed set."

---

## 5.6 Conversation grouping — seeing the whole issue

**The problem it solves:** people don't say everything in one message. A user might send "my withdrawal is stuck" then, ten seconds later, "since this morning" then "transaction id is ABC123." Treated as three separate messages, you'd get three fragmented tickets and the AI would classify each fragment poorly.

**The solution:** when a user sends several un-quoted messages in a short rolling window (default 5 minutes), the follow-ups are **folded into the same ticket** as additional blocks, and the ticket is **re-classified on the whole thread** rather than a single fragment. So the classifier and the human reviewer both see the complete issue.

**Careful boundaries (why it's safe):** grouping only happens for a fresh, un-quoted, non-admin message from the same sender within the window; it groups into that sender's most-recently-active ticket; and the re-classification updates the labels and summary **but never the status** — because a human (or an admin's reply) owns the status, and an automatic process shouldn't override that. The window-tracking timestamp is updated on every message in the thread so the "is this within the window?" decision stays accurate across back-and-forth. (Pure module `conversation-grouping.ts`.)

> **The point to make:** "Users send issues across several quick messages, so consecutive messages from the same person within a 5-minute window are folded into one ticket and the AI re-reads the whole thread — but grouping never changes status, because humans own status."

---

## 5.7 The ticket status workflow & auto-resolution

**The statuses:** a ticket is either in one of four **active** states — **Open**, **In Review**, **Escalated**, **Awaiting User** — or finished as **Resolved** or **Dismissed** (Dismissed = spam/chatter, never counted as a real resolution).

**The transition rules (the logic that keeps the board honest):**
- An admin replying moves an Open ticket to **In Review**, but **never** un-escalates a ticket a human deliberately set to Escalated or Awaiting User. (An automatic process must not undo a human's deliberate action.)
- A user replying to an **Awaiting User** ticket flips it back to **In Review** (the ball's back in the team's court).
- All four active states accept replies and count as "active" for the resolution-rate math.

**Auto-resolution from an admin's reply:** if an admin's Telegram reply is a clear, affirmative answer ("Yes, you can do that" / "Done, it's been processed"), the system can mark the ticket **Resolved** automatically. This is done very carefully:
- It only applies to tickets currently Open or In Review (never un-parks an Escalated/Awaiting-User ticket, never re-touches a Resolved/Dismissed one).
- It's written as a **conditional update** ("only change the status if it's still what I expect") so it can't accidentally clobber a change a human made a half-second earlier (a race-condition guard).
- A missing or ambiguous answer never triggers it — only a clearly definitive one.

**The race-condition guard, generally:** the background AI classifier finishes a few seconds after a message arrives. If a human changed the ticket's status in those few seconds, the classifier must not overwrite it. So the classifier's final write is conditional: "set the status only if it's still the value I started with; otherwise just save the labels and leave status alone." This appears in several places and is one of the more senior aspects of the system.

> **The point to make:** "Four active states plus Resolved/Dismissed, with transition rules designed so automatic processes never override a human's deliberate state — including conditional 'only update if unchanged' writes to avoid clobbering a human's change in a race."

---

## 5.8 KPIs and honest statistics

**The job:** show agents trustworthy numbers — Resolution Rate, Average Response Time, ticket volume over time, and breakdowns by status, category, and urgency — all respecting whatever filters are applied.

**The decisions that make the numbers honest (a recurring theme):**
- **Resolution Rate = Resolved ÷ (Resolved + Active).** Dismissed spam is *never* counted as a resolution. (An earlier version counted Dismissed tickets and showed an inflated 80% when the truth was 53%.)
- **"Today" means Lagos (Nigeria) time, not the server's clock.** The server runs in universal time (UTC); all day boundaries are converted to Lagos calendar days so "resolved today" means what a Lagos-based agent expects.
- **Timestamps are real, not guessed.** When a ticket was resolved is recorded explicitly; legacy tickets that predate this tracking are shown as unknown rather than given a fabricated time.
- **The math runs in the database, at any scale.** The statistics are computed by the database over the *full* filtered set. An earlier version pulled rows into the app and counted them in code — which silently stopped counting past 5,000 rows. Moving the aggregation into the database keeps it correct no matter how many tickets exist.
- **Filters reach both the table and the stats.** If you search or filter, the KPI cards update *together with* the ticket list, so the numbers always describe what you're looking at.

> **The point to make:** "The KPIs are deliberately honest: resolution rate excludes spam, 'today' is Lagos time, timestamps are real not guessed, and the math runs in the database so it stays correct at any volume — an earlier in-app version silently stopped counting past 5,000 rows."

---

## 5.9 The outbound status bot — built, rails-tested, parked

**What it would do:** when an agent marks a ticket Resolved / Escalated / Awaiting-User on the dashboard, the system posts an empathetic reply to the user's original message in the Telegram group ("Good news — this has been resolved…"). Only those three statuses notify; Open/In-Review/Dismissed never do. This is the one feature that would *write* to the real community.

**Because it writes to the real group, it was built with heavy safety rails:**
- A **kill switch** (off by default) — the feature is fully silent unless explicitly enabled.
- A **dry-run mode** (on by default) — runs the entire pipeline and records what it *would* send, without actually calling Telegram. A safe rehearsal.
- **Send-once-ever per ticket+status**, enforced by a database constraint — resolving, reopening, and resolving again will never spam the user.
- **Rate limiting** (a minimum gap and a per-hour cap).
- **Skips** tickets older than 7 days, admin-authored tickets, and any group other than the configured one.
- A **self-ingestion guard** so the bot never treats its *own* outgoing message as a new admin reply (which would corrupt the response-time metric).

**Why it's parked (and this is a permission story, not a bug):** the Quidax community group is **broadcast-only** — only admins can post. The account the system logs in with is a normal member, so its first real send attempt was rejected by Telegram with `USER_BANNED_IN_CHANNEL`. This was confirmed twice, on two different accounts, and the user themselves cannot post to the group manually either. So no code change can fix it: the feature needs the account granted posting rights by Quidax. It stays built and ready — a strong thing to *show* in a pitch ("this is ready the moment you give us posting access") — but switched off.

A subtle truth worth stating: **dry-run mode can never catch this kind of failure**, because dry-run skips the actual Telegram call. Permission errors only surface on a real send. Knowing the limits of your own safety mechanisms is a senior insight.

> **The point to make:** "The auto-reply feature is fully built behind a kill switch, dry-run mode, send-once enforcement, and rate limits — but it's parked because the group is broadcast-only, so the account can't post. It's a permissions limitation, ready to enable the moment Quidax grants posting rights."

---

## 5.10 Reliability: the watchdog, deploys, and the single-instance rule

A handful of operational features keep the system alive and uncorrupted. These show you think about running software, not just writing it.

**The watchdog.** The Telegram connection can die *silently* — no error, no crash, it just goes quiet. So a watchdog checks: "have we genuinely heard from the target group recently?" If it's been silent too long (30 minutes), it forces a reconnect. A subtle bug once made this watchdog useless: it was counting *any* Telegram activity (including unrelated direct messages) as "the group is alive," so a dead group connection looked healthy. The fix was to only count messages *actually in the target group* as signs of life.

**The single-instance rule.** Only **one** copy of the backend may run at a time. Two copies would each open their own Telegram connection and double-process everything — and worse, two simultaneous logins can make Telegram **permanently invalidate the login credential**. So the host is pinned to exactly one instance.

**The rolling-deploy trap (a great reliability story).** When deploying a new version, the host starts the new instance *before* stopping the old one (a "rolling" deploy, so there's no downtime). But for a brief moment, both are alive — and if the new instance connects to Telegram while the old one is still connected, Telegram sees two simultaneous logins and **permanently burns the login credential** (`AUTH_KEY_DUPLICATED`). This actually happened and required regenerating the credential. The fix is two complementary guards: (1) when the host tells the old instance to shut down, it *cleanly disconnects from Telegram first*; and (2) the new instance *waits 60 seconds before connecting*, by which time the old one is gone. Either guard alone has a failure mode; together they close the gap. (Pure module `deploy-overlap.ts`; full story in Part 7.)

**Session rotation.** The Telegram login credential ("session string") has had to be regenerated a few times (once when it was externally revoked, once after the rolling-deploy burn). This is a known, documented operational procedure — done only with explicit instruction, since it's effectively re-doing the login.

> **The point to make:** "Running it reliably meant: a watchdog that only trusts real group traffic as a sign of life; pinning to a single instance; and specifically preventing two instances from overlapping during a deploy, because two simultaneous Telegram logins permanently burn the credential — solved with a graceful disconnect on shutdown plus a 60-second connect delay on startup."

---

### Where we are

You now understand how every major part works and can defend the design of each. **Part 6** focuses entirely on security and safety — the "how do you know it's safe?" answers — and **Part 7** tells the bug stories that make the best interview material.
