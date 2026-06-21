# Part 7: The Bug Stories

These are your crown jewels. Nothing convinces an interviewer of real understanding like calmly walking through a hard problem: what you saw, the hypotheses you tried *and ruled out*, the actual root cause, why you fixed it the way you did, and how you proved it. The wrong turns matter — they show how you actually think.

Each story uses the same shape:
**Situation → Why it mattered → Investigation (incl. dead ends) → Root cause → The fix → How it was proven → What it demonstrates.**

Pick 2–3 favourites to know cold. The **live-listener mystery** and the **Safari blank page** are the most impressive; the **dishonest KPIs** one shows product judgment; the **rolling-deploy burn** shows operational depth.

---

## 7.1 The live-listener mystery (the flagship story)

**Situation.** Messages from the Quidax group were showing up on the dashboard *minutes* late instead of seconds. The system had a live listener that was supposed to deliver messages instantly, plus a slower safety-net sweep. Clearly the live listener wasn't working — only the slow sweep was doing anything.

**Why it mattered.** This is a support tool for urgent financial issues. Minutes of delay on a "my withdrawal is stuck" message defeats the purpose.

**Investigation — and three dead ends.** This took several rounds, and the wrong turns are the best part:
- **Hypothesis 1: the watchdog is broken.** There was a reconnect watchdog that should notice a dead connection. It turned out it *was* partly broken (it counted unrelated direct messages as "the group is alive"), so that got fixed — but the live listener *still* delivered nothing. Ruled out as the root cause.
- **Hypothesis 2: the session wasn't "primed."** Research suggested a user-client must call a certain setup step (fetch your chat list) after connecting before Telegram will push group updates. That was added — and the logs confirmed it succeeded and that the account genuinely *was* a member of the group. But live messages *still* never arrived. Necessary-looking, but not the cause. Ruled out.
- **Hypothesis 3: the account is banned / not a member.** The priming step doubled as a membership check, and it clearly showed the group present and the account a member. So, ruled out — it wasn't a permissions problem for *reading*.

**The breakthrough — diagnosis with evidence.** Rather than keep guessing, a temporary diagnostic was added (behind an off-by-default switch, logging only metadata — never message contents) that recorded *every* raw update Telegram sent. It was turned on in production, the live stream was captured, and it was correlated against the database. The evidence was decisive: the session received the group's lightweight **control** updates (like read-receipts) *and* the account's direct messages — but **zero** new-message updates for the group. Two separate internal counters confirmed the channel's message stream simply wasn't being delivered.

**Root cause.** The Telegram library version in use never tracks the group's message-sequence counter (its `pts`) and never asks Telegram to "catch up" on a channel. Without that, Telegram **withholds** the channel's live message stream. It wasn't a connection problem, a membership problem, or a setup problem — Telegram was deliberately not sending the messages because the client never told it where it had left off.

**The fix — and why this one.** Stop waiting for a push that will never come; **actively pull instead.** The system now tracks the channel's sequence counter itself and, every 15 seconds, asks Telegram "what's new in this channel since counter X?" (`getChannelDifference`), feeding the answers into the same idempotent ingestion. This is additive — the safety-net sweep stays underneath. It was chosen because it attacks the actual root cause (the missing catch-up) rather than the symptoms, and because the idempotent pipeline made it safe to layer on without risking duplicates.

**How it was proven.** After deploying, a test message was posted and appeared in the database in **~14 seconds** (versus minutes before), with the success logged and exactly one database row (no duplicate). The earlier wrong fixes were each ruled out *with logs*, not assumptions.

**What it demonstrates.** Systematic debugging under uncertainty; the discipline to add a diagnostic and gather evidence instead of guessing forever; the maturity to record disproven hypotheses so nobody re-tries them; and a real understanding of how a messaging protocol delivers updates.

---

## 7.2 The Safari blank white page (the freshest story — own this one)

**Situation.** The dashboard loaded fine in some places but showed a **blank white page** on an iPhone — specifically in the Safari browser — while it worked when opened from inside the Telegram app and the Google app.

**Why it mattered.** If agents (or a prospective Quidax stakeholder) open the link in Safari and see nothing, the product looks broken before it's even tried.

**Investigation — and the reasoning that cracked it.**
- The original guess (written in the docs) was a "modern code/CSS compatibility problem." This was challenged with a key insight: **on iPhones, every browser — Safari, the Telegram in-app browser, the Google app — uses the same underlying engine (WebKit).** So a true compatibility bug would fail *everywhere* equally. It didn't. So it could not be a code-compatibility issue. *(This single piece of reasoning redirected the whole investigation.)*
- Next hypothesis: a setting (like "Block All Cookies") was making the app crash on startup. The user checked — that setting was off. Ruled out.
- Next: a stale cached version. The server's cache headers were checked directly — they allow revalidation, making a pure stale-cache less likely (though not impossible).
- **The decisive evidence:** the user installed an on-device inspector and captured two things while the page was blank-then-loading: (1) the **Network tab showed all files loading successfully** (status 200 — nothing failed to download), and (2) the page actually *did* render the moment something forced a redraw — rotating the phone, tapping, or opening the inspector all made it appear. A red error banner that showed up was traced to the *inspector extension itself*, not the app.

**Root cause.** A **rendering (compositing) bug in WebKit**, not a code or download problem. The login/dashboard screens stacked very large decorative blur "glow" effects (huge blur radii) plus a frosted-glass card. iPhone Safari sometimes fails to *draw* those heavy blur layers on the first paint, leaving the screen white until something forces it to redraw. Everything downloaded, the app ran, the page existed — it just wasn't being *painted*.

**The fix — and why this one.** Two small, safe CSS changes: (1) reduce the size of the oversized blur effects, and (2) tell the browser to render those blurred layers on the graphics card up front so they paint immediately. No logic touched, no visual change on other devices. This targets the actual cause (a first-paint compositing failure) rather than, say, removing the design.

**How it was proven.** Locally: the login screen rendered identically with no errors, and the built files were confirmed to contain the change. In production: the served files were confirmed updated. And the real proof — **the user reloaded on the same iPhone across multiple attempts and it loaded cleanly every time.** Because this bug only appears on a real iOS device (not on a desktop or the project's screenshot tool), the user's device was, honestly, the only authoritative test — and that was stated plainly.

**What it demonstrates.** Reasoning from a key fact (same engine everywhere ⇒ not a compat bug) to redirect an investigation; using real on-device evidence instead of guessing; distinguishing "didn't download" from "downloaded but didn't paint"; and honesty about where verification truly comes from.

---

## 7.3 The rolling-deploy that kept burning the Telegram login

**Situation.** After certain deploys, Telegram ingestion died completely, with an error meaning "duplicate login" (`AUTH_KEY_DUPLICATED`). Worse, it was **permanent** — the login credential was destroyed and had to be regenerated by hand. Retrying later didn't help.

**Why it mattered.** A burned credential means no message ingestion at all until a manual, careful re-login — and regenerating it is a sensitive operation.

**Investigation.** The pattern pointed at deploys. Modern hosts do a "rolling" deploy: start the **new** copy, confirm it's healthy, *then* stop the **old** copy — so users see no downtime. But the health check passes the instant the web server is up, which is *before* the new copy connects to Telegram. So for a window of time, **both** copies were alive, and when the new one connected to Telegram while the old one was still connected, Telegram saw two simultaneous logins on one account and permanently invalidated the credential.

**Root cause.** Two instances overlapping during a rolling deploy, both connecting to Telegram at once.

**The fix — and why both halves are needed.** Two complementary guards:
1. **Graceful disconnect on shutdown:** when the host signals the old copy to stop, it cleanly disconnects from Telegram *before* exiting — releasing the login.
2. **A 60-second connect delay on startup:** the new copy waits a minute before connecting, by which time the old copy has shut down.
Why both? The delay alone fails if the old copy is slow to shut down; the graceful-disconnect alone fails if the host kills it abruptly without a clean signal. Together they close the gap. (Plus the standing rule: never run more than one instance.)

**How it was proven.** After the fix, deploy logs showed the new copy waiting its 60 seconds, then connecting successfully on the first try with **zero** duplicate-login errors, and ingestion resuming normally.

**What it demonstrates.** Understanding how cloud deployments actually work (and their sharp edges), reasoning about timing/overlap windows, and designing defense-in-depth where two guards each cover the other's failure mode.

---

## 7.4 The dishonest KPIs (product judgment, not just code)

**Situation.** The dashboard proudly showed an **80% resolution rate**. The real number was about **53%**.

**Why it mattered.** A support tool that lies about its own performance is worse than useless — and for a pitch, getting caught with vanity numbers is fatal.

**Investigation.** Comparing the displayed numbers against direct database counts revealed three separate problems:
1. **Spam was counted as resolutions.** Hundreds of "Dismissed" spam/chatter tickets were being included in the resolved total, inflating the rate.
2. **"Resolved Today" read a meaningless field.** It used a column that no code actually kept up to date, while the proper "when was this resolved" field was empty.
3. **"Today" used the wrong timezone.** The server runs on universal time (UTC), so "today" didn't match a Lagos-based agent's actual day.

**Root cause.** A mix of a wrong definition (counting spam) and infrastructure gaps (an unmaintained timestamp, server-vs-local time).

**The fix — and the product decision in it.** A deliberate definition was chosen: **Resolution Rate = Resolved ÷ (Resolved + Active), with Dismissed spam excluded everywhere.** Every code path that closes a ticket now records a real resolved-timestamp, and all "today"/date math is computed in Lagos time. Legacy tickets that predate the proper timestamp are shown as unknown rather than given a fabricated time — *no invented data.*

**How it was proven.** The live numbers moved to match ground truth (rate 80% → 53%), and a resolve-then-reopen test correctly ticked "Resolved Today" up and back down. Verified against a server deliberately run in UTC to simulate production's timezone.

**What it demonstrates.** Product judgment (what *should* a metric mean?), intellectual honesty (refusing vanity numbers and refusing to fabricate timestamps), and rigorous verification against ground truth.

---

## 7.5 Admin replies appearing up to 23 times

**Situation.** Some tickets showed the same admin reply repeated 2–3 times — one ticket had it **23 times.**

**Why it mattered.** It made the conversation history unreadable and signalled a deeper data-integrity problem.

**Investigation & root cause.** The shared ingestion function had its "have I seen this message before?" check positioned *after* the reply-handling logic. So every time the safety-net sweep re-read recent history (every few minutes), it re-ran the reply-handling and appended the reply again — before ever reaching the duplicate check. The dedup existed; it was just in the wrong place.

**The fix — and why.** Move the duplicate check to the **very top** of the function, before any branch that writes anything. This makes the entire function idempotent — re-processing any message becomes a no-op. (This is now an ironclad rule in the project: the dedup check must always be first.)

**How it was proven.** The existing duplicates were cleaned up with a previewed-then-applied script (446 duplicate blocks removed across 82 tickets), and a re-scan confirmed zero remained. New re-processing produced no duplicates.

**What it demonstrates.** That *ordering of operations* is a real correctness concern, the value of idempotency, and careful data cleanup (preview before applying a destructive script).

---

## 7.6 Gemini suggested replies burning an exhausted quota

**Situation.** Suggested replies stopped working entirely, and a background repair job kept making it worse on every cycle.

**Why it mattered.** Agents lost the draft-reply assist, and the system was wastefully hammering a dead service.

**Investigation & root cause.** Gemini's free tier hit its **daily quota**. The problem: the code treated a "quota exhausted" error the same as a "temporarily overloaded" error — both looked "retryable" — so it retried three times per ticket, burning the (already gone) quota faster and tripping the circuit breaker every cycle. The breaker recovered after 30 seconds, so the next cycle re-burned it again. Also, the error log only showed a short message, so the *kind* of failure had to be guessed.

**The fix — and why.** (1) Log the *full* error detail (type, status) — safely, never contents — so the failure mode is known, not guessed. (2) Distinguish a real **quota-exhausted** error from a transient overload: on a genuine quota error, arm a **60-minute cooldown** and stop calling Gemini entirely until it passes, instead of retrying. A transient overload still gets a normal quick retry. This stops the system digging the hole deeper.

**How it was proven.** Type-checks and the test suite passed, the new logic was confirmed bundled into the build, and the behavior was reasoned through against the logged error detail. (Some of this was honestly noted as "confirm on the next real occurrence in production," because you can't force a real daily-quota error on demand.)

**What it demonstrates.** Operational maturity (treating different error classes differently), cost-awareness, and the lesson that *good logging is a prerequisite for good debugging.*

---

## 7.7 The dashboard rate-limiting itself (a quick, relatable one)

**Situation.** After a while, an open dashboard tab would suddenly show blank stats and "too many requests" errors.

**Root cause.** The dashboard polls every few seconds. The API's request limit was set *lower* than the dashboard's own normal polling rate, so a single tab tripped the limit on *itself* after about 17 minutes — then every request failed.

**The fix & proof.** Raise the general limit, keep a tighter limit only on the genuinely expensive AI operations, and slow the polling a little. Verified by firing a burst of requests and confirming none were wrongly blocked. Crucially, a direct database check during the incident proved **no data was lost** — it was purely the limiter blocking reads.

**What it demonstrates.** The lesson that protective limits must be sized against your *own* app's real behavior, and the calm to first confirm "is data actually lost, or is this just a display problem?" before panicking.

---

## 7.8 The benchmark that never reached production

**Situation.** The "AI accuracy" benchmark panel showed nothing useful in production — a blank score, an empty table.

**Root cause.** The benchmark's test cases lived in a data file that was **git-ignored** (by a convention meant for throwaway files), so it was never deployed to the server. The server looked for it, didn't find it, and returned nothing.

**The fix & proof.** Move the test cases into a committed code file that's bundled into the deployed build, so they always ship. After deploying, the production benchmark returned real numbers and a full results table.

**What it demonstrates.** Understanding the difference between "works on my machine" and "actually deployed," and that *what runs in production must actually be shipped*, not sitting in an ignored file.

---

## 7.9 Nigerian Pidgin misclassification (designing for the real users)

**Situation.** Real community phrases in Nigerian Pidgin — "money never enter," "dem block my account," "una too much" — were mislabelled (dumped into "General Question" or given the wrong urgency).

**Root cause.** The AI's instructions assumed standard English and had no knowledge of Pidgin meaning.

**The fix & proof.** A **Pidgin glossary** (phrases → meaning → correct category, plus worked examples) was built into the AI's base instructions — deliberately in the *base* instructions rather than as stored corrections, so it improves both the live system and the accuracy benchmark consistently. The benchmark was extended with Pidgin test cases; measured Pidgin accuracy went from ~67% to **100%**.

**What it demonstrates.** Designing for the *actual* users rather than a generic demo, and choosing the right mechanism (base instructions vs. learned corrections) for the kind of improvement needed.

---

## 7.10 Messages that arrived before their ticket existed (the orphan problem)

**Situation.** Users were reporting that entire conversations — sometimes the most important ones of the day — were completely missing from the dashboard. The support team's morning session had produced nothing visible: no ticket, no thread, no trace. Yet the agents had definitely been active in the group.

**Why it mattered.** The tool's job is to surface every real issue. "Sometimes conversations disappear entirely" is a trust-destroying failure, and even more so when the missing conversation turns out to be an urgent account-access case with the admin actively engaged.

**Investigation — finding where the message actually was.**
The key move was to check the `messages` table directly, rather than starting from the tickets side. The messages *were* there — every one of them, with normal timestamps and no error flags. But there were no corresponding tickets. That asymmetry gave the real question: *why does a `messages` row exist without a ticket?*

**Root cause — the ordering trap.**
The ingestion pipeline writes the `messages` row first, then builds the ticket. The deduplication check keys on that `messages` row. So if anything throws between those two steps — a database timeout, a transient network error, even a classification hiccup — the message row lands, but the ticket is never created. Every future re-scan (live path, AutoFetch, backfill) hits the dedup check, sees the message as "already processed," and skips it immediately. **The message is permanently orphaned.** Not lost — it's in the database — but made permanently invisible to all ingestion paths.

This structural ordering existed from the beginning. It was only visible as a bug when the rate of mid-build errors was high enough to accumulate orphans at a rate users noticed.

**A second problem discovered in the same investigation.** Unrelated to the crash case: the non-admin quoted-reply branch had a silent `return null` for quotes that matched no active ticket. A user's real issue arriving as a reply to a welcome or old message would create no ticket at all, and admin replies to it would be dropped as "unattached admin" — the entire live conversation was invisible. Fix: remove the `return null` and fall through to the normal grouping/new-ticket logic. The top-of-function dedup still prevents any duplicates from the multiple re-scans.

**The fix — a self-healing reconciliation sweep.**
A background job (`reconcileOrphanMessages`) runs at startup and hourly. It finds `messages` rows with no matching ticket and replays each one through the *same* shared `processAndIngestMessage` function — bypassing only the `messages` insert step (the row already exists) via a 3-line `reconcileOpts` object. This preserves the sender hash (so a multi-message conversation re-groups into one ticket instead of creating orphan singletons) and keeps the dedup as the authoritative idempotency guard.

**A guard discovered during the dry-run preview.**
Before enabling the sweep for real, a read-only preview queried for orphan candidates. It surfaced welcome-message templates and ban-notification bot messages in the set. The live pipeline can identify admins and system accounts by their Telegram `senderId` — but the `messages` table stores only a hashed sender ID, so `checkIsAdmin` can't run inside the sweep. Without a guard, those system messages would have been resurrected as genuine tickets. Fix: a content-pattern recognizer (`isSystemBotMessage`) catches unmistakable system templates, and the same `shouldProcessMessage` / `isBanterNoise` gate that protects the live pipeline runs in the sweep too.

*This is exactly why the dry-run mode exists: to make the real consequence of the sweep visible before anything is written.*

**How it was proven — the morning conversation recovery.**
The sweep was run against the live database with `INGEST_RECONCILE_ENABLED=true` and `DRY_RUN=false`. The three orphaned user messages from the morning account-access conversation (Telegram IDs 140062/063/064) folded into a single ticket `c4ba87be` (Account Access / High). The two admin replies (140065/140066) that had previously been dropped as "unattached admin" were re-attached to that ticket by sourcing their text from the stored `messages` rows — a recovered 3-user + 2-admin thread, now fully visible on the dashboard. A second run found **0 orphans remaining** — the sweep is idempotent. Deploy was healthy: no `AUTH_KEY_DUPLICATED`, all circuit breakers closed.

**What it demonstrates.** Debugging by looking at the *structure* of the data (a `messages` row with no ticket) rather than the error logs; understanding that a correct-looking dedup is also what hides a structural ordering bug; the discipline of a dry-run preview before any write; and that recovering a specific live conversation from stored data — rather than re-fetching from Telegram (which would risk burning the session) — is the right, safe approach.

---

## 7.11 How to tell any of these in an interview (the formula)

When asked "tell me about a hard bug," use this 60-second structure:

1. **The symptom** (one sentence): "The dashboard was blank white on iPhone Safari but worked everywhere else."
2. **Why it mattered** (one sentence): "If a stakeholder opens it in Safari and sees nothing, the product looks broken."
3. **The key insight / how you narrowed it** (the heart): "All iOS browsers use the same engine, so it couldn't be a code-compatibility bug — which redirected me to look at rendering, and on-device evidence showed everything downloaded but the page only painted after a redraw."
4. **The root cause** (one sentence): "A WebKit compositing failure on heavy blur effects."
5. **The fix and the proof** (one sentence): "I lightened the blur and forced GPU rendering of those layers, then verified it on the actual device across multiple reloads."

Symptom → stakes → insight → cause → fix+proof. That cadence sounds senior every time.

---

### Where we are

You now have a stable of real war stories with evidence. **Part 8** turns these and everything else into a ready bank of interview questions and model answers.
