# Part 3: Architecture and Data Flow

This part lets you draw the system on a whiteboard and trace a single message from "someone typed it in Telegram" to "an agent resolved it on the dashboard." If you can do that fluently, you sound like the person who built it — because that mental model *is* the system.

---

## 3.1 The tech stack, and why each piece was chosen

A "stack" is just the set of technologies a project is built from. Here's PulseDesk's, with the *why* for each — interviewers love the "why," because it shows you made decisions rather than copying a tutorial.

| Layer | Technology | What it is | Why this choice |
|------|-----------|-----------|-----------------|
| Backend language | **TypeScript on Node.js** | JavaScript-with-safety, run on a server | One language across front and back; the type safety catches bugs before runtime |
| Backend framework | **Express** | A toolkit for building API endpoints | Simple, battle-tested, huge ecosystem |
| Frontend | **React 19 + Vite + Tailwind CSS** | UI library + fast build tool + styling system | React for component UI; Vite for fast builds; Tailwind for quick consistent styling |
| Database | **Supabase (PostgreSQL)** | A hosted Postgres database with extras | Trusted relational DB; Supabase gives a managed Postgres with a simple access library |
| Classification AI | **Groq (running LLaMA)** | Very fast LLM provider | Classification must be cheap and fast across thousands of messages; Groq is built for speed |
| Reply-writing AI | **Google Gemini** | A high-quality LLM | Suggested replies need nuance and empathy; worth a stronger model |
| Telegram access | **GramJS (MTProto user-client)** | Connects as a real user account | A bot can't read all group messages; a user-client can (see Part 1.14) |
| Hosting | **Railway** | Cloud container hosting | Runs a persistent, always-on container — required for the live Telegram connection |

**The "separation of AI models" decision** is worth calling out on its own: cheap-and-fast (Groq) for the high-volume classification job, quality (Gemini) for the lower-volume reply-writing job. Using one expensive model for everything would be slow and costly; using one cheap model for everything would give weak replies. Matching the tool to the task is the kind of trade-off senior engineers are expected to make.

---

## 3.2 The big picture (the whiteboard diagram)

```
                          ┌──────────────────────────┐
                          │   Telegram community      │
                          │  (Quidax group, MTProto)  │
                          └────────────┬─────────────┘
                                       │ messages
                                       ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                       BACKEND  (server.ts on Railway)           │
   │                                                                 │
   │   Ingestion  →  Dedup  →  Noise filter  →  PII redaction        │
   │       │                                          │              │
   │       │                                          ▼              │
   │       │                               Groq (classify) ──┐       │
   │       │                                                 ▼       │
   │       │                               Gemini (suggest reply)    │
   │       │                                          │              │
   │       ▼                                          ▼              │
   │   ┌─────────────────────  Supabase (Postgres)  ─────────────┐  │
   │   │  tickets · messages · corrections · bot_replies · ...    │  │
   │   └──────────────────────────┬──────────────────────────────┘  │
   │                              ▲ │ REST API (/api/...)             │
   └──────────────────────────────┼─┼───────────────────────────────┘
                                  │ │  GET tickets / POST status / train …
                                  │ ▼
                          ┌──────────────────────────┐
                          │  FRONTEND (React dashboard)│
                          │  polls every 10 seconds    │
                          │  agents triage & correct   │
                          └──────────────────────────┘
```

Three things to notice and be able to explain:

1. **The backend is the only thing that touches Telegram, the AIs, and the database.** The frontend never does. This is the trust boundary from Part 1.3 — the kitchen does the real work and holds the secrets.
2. **The database sits in the middle** as the shared source of truth. The ingestion side writes to it; the dashboard side reads from it. They never talk to each other directly.
3. **The frontend just polls a REST API.** No magic. Every 10 seconds it asks "what are the latest tickets and stats?" and re-draws.

---

## 3.3 The life of a message (the end-to-end story)

This is the single most valuable thing to be able to narrate. Walk it slowly.

**A user types in the Quidax group:** *"abeg my withdrawal never enter since morning, wetin dey happen"* (Pidgin: "please my withdrawal hasn't arrived since morning, what's going on").

**Step 1 — Ingestion (the message reaches the backend).**
The backend is connected to Telegram as a user-client. It learns about the new message through its primary live path (a 15-second poll using a Telegram mechanism called `getChannelDifference`), with a slower 3-minute "AutoFetch" sweep running in parallel as a safety net. (*Why two paths? A long saga — the short version: the obvious "live push" method silently doesn't work for this kind of group in the library version used, so the system actively pulls instead. Full story in Part 7.*) Either way, every new message lands in one shared processing function.

**Step 2 — Deduplication (idempotency).**
The very first thing that function does is check: *have I already processed this exact message?* Every message has a unique Telegram ID; if it's been seen, the function stops immediately. This is what makes it safe for two ingestion paths (and re-runs) to overlap without ever creating duplicate tickets. (Part 1.15: idempotent.) This check is *first*, before anything is written or any AI is called — a deliberate and important ordering.

**Step 3 — Noise gating (don't spend money on chatter).**
Cheap rule checks ask: is this spam, a greeting, irrelevant chatter, or too short to be a real issue? If so, it's dropped and never becomes a ticket. This happens *before* any paid AI call. Our example message is clearly a real issue, so it continues.

**Step 4 — PII redaction (protect the user before involving outside AI).**
Before the message text is sent to any external AI, sensitive data — phone numbers, emails, card numbers, crypto keys — is stripped out and replaced with placeholders. The AI gets enough to classify the issue, but never the user's private details. (Security, Part 6.)

**Step 5 — Classification (Groq/LLaMA).**
The cleaned text is sent to the fast AI with a strict instruction: read this and return JSON with a category, urgency, summary, and a few other fields — using only these exact allowed values. For our example it might return:
```json
{ "category": "Withdrawal Issue", "urgency": "High",
  "summary": "User reports withdrawal not received since morning" }
```
Crucially, the system understands the Pidgin here (because the Pidgin knowledge is built into the AI's instructions) and labels it correctly rather than dumping it into "General Question." The output is validated against the allowed shape; if the AI returns something malformed, the system repairs or safely falls back rather than crashing.

**Step 6 — Suggested reply (Gemini).**
A higher-quality model drafts an empathetic reply the agent could send, e.g. a calm message acknowledging the delay and asking for the transaction reference. This is a *draft for a human*, never auto-sent.

**Step 7 — Storage (Supabase).**
A ticket is created in the database with the category, urgency, summary, suggested reply, a starting status of **Open**, and timestamps. The original message is also recorded (which is what powered the dedup check in Step 2).

**Step 8 — The dashboard shows it.**
Within 10 seconds, the agent's dashboard polls `/api/tickets`, gets the new ticket, and displays it in the feed — flagged High urgency, sorted so it's visible. The KPI cards update too.

**Step 9 — The human acts.**
The agent reads it, maybe tweaks the suggested reply, handles the issue, and sets the status (e.g. **In Review**, then **Resolved**). Status changes are validated and timestamped.

**Step 10 — The system learns (two ways).**
- If the AI mislabeled it and the agent corrects it on the training screen, that correction is stored and will nudge future classifications of similar messages.
- If an admin simply *replies in Telegram* in a way that resolves the issue ("Done, your withdrawal has been processed"), the system can detect that, mark the ticket Resolved, and record what it learned — all without anyone opening the dashboard.

That's the whole loop: **message → ingest → dedup → filter → redact → classify → draft → store → display → human acts → system learns.** Tell it like a story and you've demonstrated complete understanding.

---

## 3.4 Key architectural decisions and the reasoning (interview ammunition)

Be ready to defend each of these:

- **GramJS user-client over the Telegram Bot API + webhooks.** A bot can't reliably read every message in a group; a user-client can. The cost is needing a persistent connection (hence Railway, not serverless). *Trade-off chosen deliberately.*

- **Two AI providers, matched to the job.** Groq (fast/cheap) for classification, Gemini (quality) for replies. (See 3.1.)

- **Backend-only authority; the service role key is used exclusively on the server.** The frontend never writes to the database directly and never holds a powerful key. The backend is the single enforcement point for all rules. (Part 6.)

- **Polling over WebSockets on the frontend.** A 10-second poll is simple, robust, and stateless — easy to reason about and resilient to dropped connections. A live WebSocket would be more efficient but adds complexity that wasn't worth it for this dashboard. *Simplicity chosen on purpose.*

- **Database-side aggregation for KPIs.** The dashboard's statistics are computed by the database itself, not by pulling thousands of rows into the app and counting them. An earlier version silently stopped counting past 5,000 rows; moving the math into the database fixed that and keeps the numbers honest at any volume.

- **"Pure modules" for the trickiest logic.** The hardest decisions (is this message in our group? should this ticket auto-resolve? how do we group a user's follow-up messages?) are pulled out into small, self-contained files that take inputs and return outputs with no side effects. This makes them **testable in isolation** without a live Telegram connection — which is exactly how they were verified. This pattern is one of the project's best decisions and recurs throughout. (More in Part 4 and Part 5.)

- **Exactly one running backend instance.** Two instances would open two Telegram connections and double-process everything — and worse, can permanently break the Telegram login. The system is pinned to a single instance for this reason. (The dramatic version is a bug story in Part 7.)

- **Evidence-based verification as a practice.** Every fix was proven with a test, a live request, a database query, or production logs — and when something could only be verified in production, that was stated honestly rather than hidden. This isn't a "technology" choice, but it's an engineering-culture choice worth naming.

---

### Where we are

You can now sketch the architecture and narrate a message's journey. Next, **Part 4** opens the project folder and explains every file and folder — what it is, and *why the project is organized this way*.
