# KPI Definitions — PulseDesk Dashboard

This document explains every visible number and chart on the PulseDesk dashboard, with the **exact formula** each uses and answers to the most likely questions from a critical reviewer. All calculations come directly from the `tickets_stats` PostgreSQL function (migration 020) and the rate math in `server.ts`.

---

## The six status buckets (what every status means)

Before the KPIs make sense, the status vocabulary must be clear:

| Status | What it means | In the rate? |
|--------|--------------|--------------|
| **Open** | New ticket, no admin response yet | Active (denominator) |
| **In Review** | Admin has replied at least once in the group | Active (denominator) |
| **Escalated** | Manually flagged for urgent human attention | Active (denominator) |
| **Awaiting User** | Admin responded; waiting for user to reply | Active (denominator) |
| **Resolved** | Explicitly closed by an agent | Numerator + denominator |
| **Assumed Resolved** | Auto-closed after 7 quiet days (admin-engaged, non-escalated) | Numerator + denominator |
| **Handed Off** | Admin redirected user off-platform (email / DM) — PulseDesk cannot observe what happens next | **Excluded from both** |
| **Dismissed** | Noise / spam / irrelevant chatter | **Excluded from both** |

---

## Active Issues

**What you see:** a count of open tickets that still need attention.

**Exact SQL:**
```sql
count(*) FILTER (
  WHERE status IN ('Open', 'In Review', 'Escalated', 'Awaiting User')
    AND (category NOT IN ('General Question', 'Praise', 'Spam/Irrelevant', 'Community Chat')
         OR urgency IN ('High', 'Critical'))
)
```

**Why noise categories are excluded:** General Question, Praise, Spam/Irrelevant, and Community Chat tickets can linger in an "active" status even after the classifier puts them there — they are ambient community chatter, not support backlog. Including them inflated the denominator and made the resolution rate read far too low. The decision was made on 2026-06-19 after reconciling all 786 tickets against live SQL; the Community Chat category was added to the noise set on 2026-07-02 (migration 022), when greetings/banter were split out of Spam/Irrelevant so scams and friendly chatter no longer share a bucket.

**Urgent is never noise (migration 023, 2026-07-03):** an active ticket the classifier itself rated High or Critical counts as demand even when its category is in the noise set. A live scam complaint ("scammed me of 100k") ended up as General Question / High after an admin-reply reclassification changed only the category — under the old rule it silently vanished from this count and from the Issues Only view. The same exception applies to the Issues Only filter and both auto-resolve sweeps.

**Admin-rooted tickets are excluded from every number** (migration 022, 2026-07-02): the stats function filters `is_admin_message = false` at the source, so a legacy ticket created from an admin's own message can never count as demand or as a resolution.

**What it does NOT include:** Assumed Resolved, Handed Off, Dismissed, or any active ticket in a noise category (unless that ticket is High/Critical urgency — see above).

---

## In Review (labelled "Admin Replied" in the dashboard)

**What you see:** how many tickets have received at least one admin response in the Telegram group.

**Exact SQL:**
```sql
count(*) FILTER (WHERE status = 'In Review')
```

**Important nuance:** a ticket moves to "In Review" the moment an admin sends *any* reply — even "we're looking into it." It does not mean the issue is resolved. Many "In Review" tickets are awaiting user responses or further admin action.

---

## Resolved

**What you see:** tickets explicitly closed by a human agent through the dashboard, OR auto-closed by the `reclassifyFromAdminReply` function when an admin's reply is clearly affirmative ("Yes, you can…", "Done, processed").

**Exact SQL:**
```sql
count(*) FILTER (WHERE status = 'Resolved')
```

`resolved_at` is stamped at the moment of closure. Legacy tickets closed before 2026-06-11 have `resolved_at = NULL` and do not appear in "Resolved Today."

---

## Assumed Resolved (labelled "Likely Resolved" in the dashboard)

**What you see:** tickets that the system conservatively moved out of the active queue because they look finished even though no one explicitly clicked "Resolved."

**Two paths to Assumed Resolved:**

**1. 7-day quiet sweep** (`assumed-resolved.ts`): checks hourly for tickets that are admin-engaged (an `[ADMIN_REPLY]` block exists or `first_admin_reply_at` is set), in an eligible status (Open / In Review / Awaiting User — never Escalated), and have had no new message for 7 days (`coalesce(last_message_at, created_at)`).

**2. Conversation-aware inference** (`conversation-resolution.ts`): checks hourly for admin-engaged tickets quiet ≥ 24 hours. Reads the whole thread and asks Groq "did support resolve this?" Strict — only `resolved: true` flips the status; every error or ambiguous answer leaves the ticket untouched.

Both sweeps use a **guarded conditional update** (`.in("status", ["Open", "In Review", "Awaiting User"])`) so a concurrent human change is never overwritten.

**Why it counts in the rate:** these are tickets where the user stopped responding after an admin engaged — the practical signal of a resolved issue in a Telegram support context, where users rarely send a formal "thank you, fixed." Counting them separately (not merged with Resolved) keeps them auditable.

**A new user message reopens** Assumed Resolved → In Review, clearing `resolved_at`.

---

## Handed Off

**What you see:** tickets where the admin redirected the user off-platform — typically "send an email to support@quidax.com" or "please DM me."

**How it is detected:** `handoff-detect.ts` checks the admin's reply text against `EMAIL_HANDOFF_PATTERNS` (email address + contextual phrase) and `DM_HANDOFF_PATTERNS` ("dm me", "drop a dm", "message me"). Set in `reclassifyFromAdminReply` before the auto-resolve check, guarded to Open / In Review only (never touches Escalated / Awaiting User).

**Why it is excluded from the rate:** PulseDesk cannot observe what happens in email or DMs. The resolution may have happened; it just did not happen in the channel. Including Handed Off in the active denominator would penalize the team for resolutions the system structurally cannot see. Excluding them from both numerator and denominator makes the rate honest about what is actually observable.

`resolved_at` is deliberately NOT stamped — a hand-off is not a confirmed closure.

**A new in-channel user message reopens** Handed Off → In Review.

---

## Resolution Rate

**What you see:** the percentage of observable tickets that have been resolved.

**Exact formula (server.ts):**
```
totalResolved = resolvedCount + assumedResolvedCount
resolutionRate = round( totalResolved / (totalResolved + activeCount) × 100 )
```

**Excluded from BOTH numerator and denominator:**
- Dismissed (spam, chatter, noise — never a resolution)
- Handed Off (off-platform — unobservable outcome)
- Any active ticket in a noise category (General Question / Praise / Spam/Irrelevant / Community Chat — not support backlog)

**Excluded from numerator only (stays in denominator):**
- Open, In Review, Escalated, Awaiting User (non-noise) — they are the "not yet resolved" side of the equation

**Why the rate is intentionally conservative:**
- We do not count spam as resolutions (earlier version inflated this to 80%; real number was 53%).
- We do not claim credit for off-platform closes we did not witness.
- Noise-category tickets do not make the team look worse for unresolved chatter.

**Current live rate: ~46%** (2026-06-22, after Phase 3 "Handed Off" backfill).

---

## Median Response Time

**What you see:** how quickly the team is getting back to users, in minutes or hours.

**Exact SQL:**
```sql
round(
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM (first_admin_reply_at - created_at)) * 1000
  )
)
```
Computed only over tickets where `first_admin_reply_at IS NOT NULL AND first_admin_reply_at >= created_at`.

**Why median, not mean:** a single outlier ticket (one legacy ticket had an 18-day gap between creation and first admin reply, caused by a mis-attach in an old version) dragged the mean from ~6.5 minutes to ~8.4 hours. The median is the number the support team actually experiences — the 50th-percentile ticket. About 41% of tickets receive a first response within 5 minutes.

**`first_admin_reply_at` is stamped once** (never overwritten) with the reply message's own Telegram timestamp — so backfills and post-hoc corrections stay accurate rather than recording today's time for a reply that happened days ago.

**Legacy tickets** (before 2026-06-12) have `first_admin_reply_at = NULL` and are excluded from the calculation. This is intentional — no fabricated timestamps.

---

## Critical / High / Medium / Low counts

**What you see:** active issues grouped by urgency level, as an at-a-glance triage aid.

**Exact SQL (per level, e.g. High):**
```sql
count(*) FILTER (
  WHERE urgency = 'High'
    AND status IS DISTINCT FROM 'Resolved'
    AND status IS DISTINCT FROM 'Dismissed'
)
```

Note: unlike `activeCount`, urgency counts include Assumed Resolved, Awaiting User, and Escalated — they are "issues at this urgency level that are not yet closed or dismissed." This gives the team a sense of the severity mix across the entire open backlog.

Urgency is assigned by Groq at classification time and is revised only by a human correction in `/train` (admin-reply re-classification corrects category only, not urgency, by design).

---

## Volume Chart

**What you see:** a bar chart of how many tickets were created per day.

**Exact SQL:**
```sql
to_char(created_at AT TIME ZONE 'Africa/Lagos', 'YYYY-MM-DD') AS day,
count(*) AS n
```

**Lagos timezone:** the server runs in UTC (Railway); "today" and daily buckets are always computed in Africa/Lagos (UTC+1 in standard time, UTC+2 in summer time). A ticket created at 00:30 UTC is a "yesterday" ticket in Lagos.

All active dashboard filters (category, urgency, date range, search) affect this chart via the same `filtered` CTE — the chart always describes exactly what the table below it describes.

---

## Resolved Today

**What you see:** how many tickets were closed today in Lagos time.

**Exact SQL:**
```sql
count(*) FILTER (
  WHERE status = 'Resolved'
    AND resolved_at IS NOT NULL
    AND p_today_start IS NOT NULL
    AND resolved_at >= p_today_start
    AND resolved_at <= p_today_end
)
```

Only human-Resolved tickets count here (not Assumed Resolved). `p_today_start` / `p_today_end` are the Lagos-day boundaries passed from the server.

---

## What the pie chart shows

The pie chart shows three slices:
- **Resolved** (human-closed + auto-resolved-from-admin-reply)
- **Assumed Resolved** (7-day sweep + conversation inference)
- **Active** (non-noise open tickets)

This is the `resolutionData` array computed in `server.ts`. Dismissed and Handed Off are intentionally absent — they are neither resolved nor active in the meaningful sense.

---

## Numbers a critical reviewer will likely ask about

**"Why is 46% the right resolution rate, not 80%?"**
An earlier version counted Dismissed spam as resolutions. 80% was the inflated number; 46% is what you get when only genuine support tickets that the system actually observed closing count.

**"What's in 'Active Issues' — why not just count all open tickets?"**
Active Issues is a denominator, not a simple open count. General Question / Praise / Spam/Irrelevant / Community Chat tickets can reach an active status before being dismissed by a sweep — they are community chatter, not support backlog, and including them made the rate falsely low. The filter is a product decision made on the basis of a full reconciliation against live SQL. One exception (2026-07-03): a ticket the classifier itself rated High or Critical urgency counts even in a noise category — an urgent verdict is never treated as noise, so a mis-bucketed scam complaint can't disappear from the numbers.

**"What's an 'Assumed Resolved' ticket — is the AI just guessing?"**
Two conditions must both be true: (a) an admin must have replied (the issue was addressed), and (b) the user must have gone quiet for at least 7 days. Both conditions are factual DB checks, not AI inference. The AI inference path additionally asks whether the thread content supports resolution — and only flips the status if the answer is clearly yes. Every such ticket is auditable and reversible.

**"Why is Median Response Time in minutes if I'd expect hours?"**
Because most responses are fast. The median is the 50th-percentile ticket. About 41% of tickets get a first response within 5 minutes. The old mean was 8.4 hours because of a single outlier from a mis-attached ticket — the median is the honest number.
