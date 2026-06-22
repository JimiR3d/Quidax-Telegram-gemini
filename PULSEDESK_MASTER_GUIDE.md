# PulseDesk — The Complete Master Guide
### Part 0: Start Here

Welcome. This guide has one job: **to take you from knowing nothing about computer science to being able to explain the PulseDesk project as if you personally architected and built every part of it** — because, for the purposes of an interview or a pitch, you did. You made the product decisions, you directed the work, you verified the results, and you understand every trade-off. AI was your power tool; the judgment was yours. (More on how to talk about that honestly below.)

By the time you finish this guide you will be able to walk into a room and:

- Explain **what** PulseDesk is, **who** it's for, and **why** it exists — in one breath or in twenty minutes.
- Draw the **architecture** on a whiteboard from memory.
- Explain **every folder and file** in the project and why it's there.
- Tell the **story of every hard bug** you hit, how you found it, why you fixed it the way you did, and how you proved the fix was safe.
- Answer **"how do you know it's secure?"** with specifics.
- Run a **live demo** with a confident narrative.
- Know **which jobs to apply for** and how to position yourself.

---

## How this guide is organized

Read it in order the first time. Each part builds on the one before it.

| Part | File | What it gives you |
|------|------|-------------------|
| 0 | `00-START-HERE.md` | This page — how to use the guide, and how to talk about AI assistance |
| 1 | `01-COMPUTER-SCIENCE-FROM-ZERO.md` | Every computing concept you need, explained for a total beginner |
| 2 | `02-WHAT-IS-PULSEDESK.md` | The problem, the users, the product, the core philosophy |
| 3 | `03-ARCHITECTURE-AND-DATA-FLOW.md` | The tech stack and the "life of a message" end to end |
| 4 | `04-DIRECTORY-AND-FILES.md` | Every folder and file, and why the project is shaped this way |
| 5 | `05-SUBSYSTEMS-DEEP-DIVE.md` | How each major part actually works, in depth |
| 6 | `06-SECURITY-AND-SAFETY.md` | How the system protects data and money — your "is it safe?" answers |
| 7 | `07-THE-BUG-STORIES.md` | Every hard problem as a Situation → Problem → Fix → Proof story (interview gold) |
| 8 | `08-INTERVIEW-PREP.md` | Anticipated questions with model answers, at every difficulty level |
| 9 | `09-DEMO-SCRIPT.md` | Exactly what to show and say in a live demo |
| 10 | `10-ROLE-POSITIONING.md` | Which roles to target and how to pitch yourself |
| 11 | `11-GLOSSARY.md` | Every technical term in plain English |

There is also an assembled single file, **`PULSEDESK_MASTER_GUIDE.md`** (all parts concatenated, in the project root), and a **Word version** for printing or studying offline.

---

## Three ways to use this guide

**1. To learn (first time):** Read Parts 0 → 11 in order. Don't skip Part 1 even if it feels basic — the vocabulary there is what makes every later part click.

**2. Night-before-an-interview cram:** Re-read Part 2 (the pitch), Part 7 (the bug stories), and Part 8 (the Q&A). Skim Part 6 (security). These are where interviewers spend their time.

**3. Demo prep:** Read Part 9, then keep Part 5 open as your reference for any deep question that comes up mid-demo.

---

## How to talk about AI assistance (read this carefully)

You will likely be asked, directly or indirectly, "did you build this yourself?" Here is the honest, strong way to handle it — and it's genuinely how modern software is built in 2026.

**The truth, framed well:** *"I built PulseDesk as an AI-assisted project. I made every product and architecture decision, I directed the implementation, and I personally verified every fix in production — usually with live database queries and server logs, not just by trusting that it worked. AI was my pair programmer and accelerator. What I bring is the judgment: spotting the real problem behind a symptom, choosing a fix that's safe under concurrency, and proving it works."*

Why this is a **strength**, not an apology:

- **Every serious engineering team now uses AI tooling.** Knowing how to direct it well *is* a senior skill. Pretending you hand-typed 6,000 lines is both unnecessary and easy to catch.
- **You can prove depth.** This guide makes you able to explain *why* each decision was made and *how* each fix was verified. Someone who merely "used AI" can't do that. You can. That difference is the whole game.
- **Your real contributions are the hard parts:** noticing that a "blank page" bug only happened in one browser and reasoning that it had to be a rendering issue, not a code bug; deciding that a status-update bot must never message users twice; insisting that every fix be proven with evidence before being called done. That judgment is what they're hiring.

**What to emphasize when pressed:** the debugging stories (Part 7). Nothing demonstrates real understanding like calmly explaining how you diagnosed a problem that had three wrong hypotheses before the right one — *with the evidence you used to rule each one out.*

---

## A note on honesty in this project

One principle runs through the entire codebase and this guide: **evidence over assertion.** Nothing was ever called "fixed" because it looked fixed. It was proven — with a test, a live API call, a database query, or production logs. When something could only be verified in production (because it touches the live Telegram connection), the documentation says so plainly instead of pretending. Carry that principle into your interviews. Confidence backed by evidence reads as senior; confidence without it reads as junior.

---

## Build status of this guide

*(Updated as each part is written, so progress survives across work sessions.)*

- [x] Part 0 — Start Here
- [x] Part 1 — Computer Science From Zero
- [x] Part 2 — What Is PulseDesk
- [x] Part 3 — Architecture and Data Flow
- [x] Part 4 — Directory and Files
- [x] Part 5 — Subsystems Deep Dive
- [x] Part 6 — Security and Safety
- [x] Part 7 — The Bug Stories
- [x] Part 8 — Interview Prep
- [x] Part 9 — Demo Script
- [x] Part 10 — Role Positioning
- [x] Part 11 — Glossary
- [x] Assembled master markdown file (`PULSEDESK_MASTER_GUIDE.md` in the project root)
- [x] Word (.docx) export (`PULSEDESK_MASTER_GUIDE.docx` in the project root)

Now turn to **Part 1**.
# Part 1: Computer Science From Zero

This part assumes you know **nothing**. Every concept PulseDesk relies on is explained here in plain language, with an analogy, and with a note on *where it shows up in your project*. If you already know some of this, skim — but the vocabulary here is used everywhere later.

---

## 1.1 What is a program? What is code?

A **computer** only does exactly what it's told, very fast. A **program** is a list of instructions telling it what to do. **Code** is the written form of those instructions, in a language a human can read and a computer can be made to understand.

> **Analogy:** A recipe is code. "Chop the onions, heat the oil, add the onions" — precise steps, in order. The cook (computer) follows them literally. If the recipe says "add salt" but never says how much, you get a bad result — computers are even less forgiving than cooks.

**In PulseDesk:** every behavior — reading Telegram messages, deciding if a message is a real support issue, showing the dashboard — is a program made of code that you (with AI) wrote.

---

## 1.2 Programming languages: the words the code is written in

There are many programming languages. They trade off readability, speed, and what they're good at. PulseDesk uses two:

- **TypeScript** (and its cousin **JavaScript**) — the main language of the project. JavaScript is the language web browsers natively understand. TypeScript is JavaScript **with a safety layer added**: you label what kind of data each thing holds (a number, a piece of text, a list), and a checker catches mistakes *before* the program ever runs.
- **Python** — used only in a couple of small helper scripts, not the core app. You can mostly ignore it.

> **Analogy for TypeScript vs JavaScript:** JavaScript is writing a cheque and hoping the amount is right. TypeScript is a cheque with a built-in calculator that warns you "you wrote 'five dollars' in the number box but 'fifty' in words" before you hand it over. The warning happens at writing time, not after the money's gone.

**Two ways languages run:**
- **Compiled:** the whole program is translated into machine instructions ahead of time, then run. (Faster to run, slower to start changing.)
- **Interpreted:** the program is read and run line by line. (Easier to change quickly.)
  JavaScript/TypeScript is effectively interpreted (with clever speed-ups under the hood). TypeScript is first **compiled** into plain JavaScript, because browsers and servers only understand JavaScript, not the TypeScript safety labels.

**In PulseDesk:** "the build" (you've seen `npm run build`) is the step that compiles TypeScript into plain JavaScript the server and browser can actually run. The checker is called `tsc` (TypeScript Compiler); "tsc clean" means "no type mistakes found."

---

## 1.3 Frontend vs backend; client vs server

Almost every web app has two halves.

- **Frontend (a.k.a. client):** what you see and click — the buttons, the charts, the login box. It runs **on your device**, inside your web browser.
- **Backend (a.k.a. server):** the engine you *don't* see. It runs **on a computer somewhere else** (in "the cloud"). It does the heavy work, talks to the database, keeps the secrets, and enforces the rules.

> **Analogy:** A restaurant. The **frontend** is the dining room — menus, tables, the waiter taking your order. The **backend** is the kitchen — where the food is actually made, where the recipes and the expensive ingredients are kept, and where customers aren't allowed to wander. The waiter (frontend) carries requests to the kitchen (backend) and brings back results.

**Why split them?** Trust and safety. You can never trust the frontend, because it's on the user's device and a clever user can tamper with it. The backend is where you enforce "only logged-in people can do this" and where you keep secrets the user must never see.

**In PulseDesk:**
- The **frontend** is the dashboard (a React app, file `src/App.tsx`) — the screens the support agent uses.
- The **backend** is `server.ts` — it listens to Telegram, runs the AI, talks to the database, and answers the dashboard's requests.

---

## 1.4 The internet, in just enough detail: requests and responses

When your browser needs something from a server, it sends a **request** over the internet. The server sends back a **response**. The rules for this conversation are called **HTTP** (HyperText Transfer Protocol). HTTPS is the same thing but encrypted (the "S" is for Secure) so nobody in between can read it.

A request has:
- a **method** — the *kind* of action. The two you'll meet most:
  - **GET** = "give me something" (read). E.g. "give me the list of tickets."
  - **POST** = "here's something, do an action" (create/change). E.g. "mark this ticket Resolved."
- a **URL** — the address of what you want, e.g. `https://…railway.app/api/tickets`.
- optional **headers** — extra info, like "here's my login token."
- an optional **body** — data you're sending (used with POST).

A response has:
- a **status code** — a 3-digit number summarizing what happened:
  - **200** = OK, success.
  - **400** = you (the requester) sent something wrong.
  - **401** = you're not authenticated (not logged in / wrong key).
  - **404** = not found.
  - **429** = too many requests, slow down.
  - **500** = the server itself broke.
- a **body** — the actual data sent back (often JSON — see next).

> **Analogy:** Ordering by mail. You send a letter (request) with an action and an address. You get a reply (response) that starts with a stamp telling you how it went — "Delivered ✓" (200), "Wrong address" (404), "Who are you?" (401), "You've sent us 500 letters today, stop" (429).

**In PulseDesk:** the dashboard constantly sends GET requests to `/api/tickets` to fetch the latest tickets, and POST requests to `/api/tickets/:id/status` to change a ticket's status. You saw these exact requests and status codes during the bot test — including the `400` when Telegram refused a message, and the `200`s confirming the dashboard's assets loaded.

---

## 1.5 APIs and endpoints

An **API** (Application Programming Interface) is the menu of things a server lets you ask for. Each item on that menu is an **endpoint** — a specific URL that does a specific job.

> **Analogy:** A vending machine's API is its buttons. Button A1 gives a cola, B3 gives crisps. You don't need to know how the machine works inside; you just need to know which button does what. An endpoint is one button.

**REST** is just a popular *style* of designing these menus, using the HTTP methods sensibly (GET to read, POST to create, etc.). PulseDesk's backend is a REST-style API.

**In PulseDesk**, some endpoints you'll mention:
- `GET /api/tickets` — fetch tickets + the dashboard statistics.
- `POST /api/tickets/:id/status` — change one ticket's status. (The `:id` is a placeholder for which ticket.)
- `GET /api/health` — "are you alive and connected?" Used to check the server is up.
- `POST /api/train/correct` — record a human's correction of the AI.
- `GET /api/eval` — run the AI accuracy benchmark.

---

## 1.6 JSON: how programs exchange data

**JSON** (JavaScript Object Notation) is a simple text format for structured data. It's how the frontend and backend send information to each other, and how the AI returns its answers. It looks like this:

```json
{
  "category": "Withdrawal Issue",
  "urgency": "High",
  "summary": "User says their withdrawal has been pending for hours",
  "resolved": false
}
```

The pieces are **keys** (the labels like `"category"`) and **values** (the data like `"Withdrawal Issue"`). Values can be text, numbers, true/false, lists, or nested objects.

> **Analogy:** A filled-in form. Each field has a label (key) and what you wrote in it (value). JSON is a form that one program fills in and hands to another.

**In PulseDesk:** when the AI classifies a message, it must answer in **exactly this JSON shape**. A huge amount of the project's reliability work was about forcing the AI to return clean, correctly-labelled JSON every time (more in Part 7).

---

## 1.7 Databases: where the information lives

A **database** is an organized store of information that survives even when the program stops. Without it, every restart would forget everything.

The most common kind is a **relational database**, which stores data in **tables** — like spreadsheets:

- A **table** = a sheet for one kind of thing (e.g. a `tickets` table).
- A **row** = one record (one ticket).
- A **column** = one field every record has (e.g. `category`, `status`, `created_at`).
- A **primary key** = a unique ID for each row, so you can refer to exactly one record.
- A **foreign key** = a column in one table that points to a row in another (e.g. a reply pointing to its ticket). This is how tables relate to each other.

You read and change a database using a language called **SQL** (Structured Query Language). Example: *"give me all tickets where status is Open"* is written roughly as `SELECT * FROM tickets WHERE status = 'Open'`.

> **Analogy:** A filing cabinet. Each drawer is a table; each folder in the drawer is a row; every folder has the same labelled tabs (columns); each folder has a unique number (primary key).

**In PulseDesk:** the database is **Postgres** (a powerful, trusted relational database), hosted by a service called **Supabase**. The main tables are `tickets` (the support issues), `messages` (every Telegram message seen, used to avoid duplicates), `corrections` (human fixes that teach the AI), and `bot_replies` (a record of outbound bot messages).

A few important database facts you'll cite:
- **Money and timestamps are stored carefully** — times are kept in a universal timezone (UTC) and only converted to Nigeria time (Lagos) when shown.
- A **unique constraint** on a message's Telegram ID is the database's own guarantee that the same message can never be stored twice — the last line of defense against duplicates.

---

## 1.8 Node.js, npm, and packages

The frontend runs in the browser, which naturally understands JavaScript. But the **backend** needs to run JavaScript *outside* a browser, on a server. The thing that makes that possible is **Node.js** — it's a JavaScript engine that runs on a plain computer/server.

Nobody writes everything from scratch. **Packages** (also called libraries or dependencies) are bundles of code other people wrote that you reuse. **npm** (Node Package Manager) is the tool that downloads and manages them.

- **`package.json`** is the project's "ingredients list and instructions": it names the project, lists every package it depends on, and defines shortcut commands (called "scripts") like `npm run build`.
- **`node_modules`** is the (huge) folder where all those downloaded packages physically live. It's never edited by hand and never shared in the code repository — anyone can re-create it from `package.json`.

> **Analogy:** Building a car. You don't forge your own bolts or mould your own tyres — you order them from suppliers. `package.json` is your parts order form; `node_modules` is the warehouse of delivered parts; npm is the procurement department.

**In PulseDesk**, key packages include **Express** (a tool for building the backend's API endpoints), **GramJS** (for talking to Telegram), and the **React** family (for the dashboard).

---

## 1.9 React: how the dashboard is built

**React** is a popular tool (a "library/framework") for building user interfaces out of reusable pieces called **components**.

- A **component** is a self-contained chunk of UI — a button, a card, a whole page. You build big screens by combining small components.
- **State** is data a component remembers that can change over time — e.g. "is the user logged in?", "which tickets are we showing?". When state changes, React automatically re-draws the affected part of the screen.
- **Props** are inputs passed *into* a component from its parent — like settings handed down.
- The **DOM** (Document Object Model) is the browser's live model of the page. React efficiently updates the DOM for you so you don't manually fiddle with the page.

> **Analogy:** A dashboard car instrument cluster. The speedometer is a component; its needle position is its **state**; the fact that it's set to show km/h (not mph) is a **prop** passed in. When speed changes (state changes), only the needle moves — you don't rebuild the whole dashboard.

**In PulseDesk:** the entire agent dashboard is one big React app in `src/App.tsx`. It keeps state like the list of tickets and whether you're logged in, and it **polls** (see next) the backend every 10 seconds to stay fresh.

**Two more terms you'll use:**
- **Polling** = asking the server "anything new?" on a repeating timer (every 10s here). Simple and robust. The alternative (a live always-open connection called a *WebSocket*) is more efficient but more complex; PulseDesk deliberately chose polling for simplicity.
- **Error boundary** = a safety net component that catches a crash in one section of the UI so the *whole* screen doesn't go blank. (This becomes important in the Safari bug story.)

---

## 1.10 Git and GitHub: saving and sharing code safely

**Git** is a system that tracks every change to your code over time, like an infinite undo history with labels.

- A **commit** is one saved snapshot of your code, with a message describing what changed. ("Fix blank white page on iOS Safari.")
- A **branch** is a parallel line of work. `main` is the primary branch — what gets deployed.
- **Push** = upload your commits to a shared server. **Pull** = download others' commits.
- A **`.gitignore`** file lists things that should *not* be saved into the repository — like the giant `node_modules` folder, or secret files, or throwaway test scripts.

**GitHub** is the website that hosts the shared copy of the repository (and triggers deployments).

> **Analogy:** Git is the "track changes + version history" of a document, but for a whole project, and far more powerful. A commit is a named save point you can always return to. GitHub is the shared cloud drive where the team's copy lives.

**In PulseDesk:** every fix is its own commit with a plain-English message a non-developer could read. Pushing to `main` on GitHub automatically triggers a new deployment (next section). You've watched this happen — e.g. commit `1e90ff4` was the Safari fix.

---

## 1.11 Hosting, deployment, and containers

Your backend has to run on a computer that's always on and reachable from the internet. You rent that from a **cloud hosting** provider. **Deploying** means putting your latest code onto that server and starting it.

- A **container** is a sealed, portable box that holds your app *and everything it needs to run* (the right Node.js version, all packages, settings). It runs the same way on any machine. This avoids the classic "but it works on my computer!" problem.
- **Railway** is the hosting service PulseDesk uses. When you push to `main`, Railway automatically builds a fresh container and starts it.

> **Analogy:** A container is a food truck. Everything needed to cook the dish travels inside the truck, so it works identically whether parked downtown or at a festival. Deploying is driving a new, fully-stocked truck to the spot and opening the window — and (in a "rolling deploy") only driving the old truck away once the new one is serving.

**In PulseDesk:** Railway runs exactly one copy of the backend (one container). "Exactly one" matters enormously — running two at once would make two simultaneous Telegram connections, which corrupts data and even permanently breaks the Telegram login. (That's a whole bug story in Part 7.)

---

## 1.12 Environment variables and secrets

Some values must change between your laptop and the live server, and some must be kept secret. You don't write these into the code — you store them as **environment variables**: named settings the program reads when it starts.

- A **secret** is a sensitive environment variable — a password, an API key, a login token. If a secret leaks, an attacker can impersonate you or run up huge bills.
- A golden rule: **secrets live only on the backend, never in the frontend.** Anything sent to the browser can be read by anyone. (PulseDesk enforces this strictly.)

> **Analogy:** Environment variables are the dials on the back of an appliance set during installation — voltage, language, region. Secrets are the keys to the safe. You'd never tape the safe key to the front of the appliance where customers can see it.

**In PulseDesk:** the database master key, the AI service keys, the Telegram session, and the dashboard password are all environment variables set in Railway. None of them are ever sent to the browser. A real past incident — a secret key once leaked into the public code history — was fully resolved by rotating (replacing) the key and disabling the old one. (Part 6.)

---

## 1.13 What an LLM is (the "AI" part)

An **LLM** (Large Language Model) is an AI trained on vast amounts of text that, given some input text, predicts useful output text. Two different jobs PulseDesk uses LLMs for:

- **Classification:** read a message and label it — *what category? how urgent?* This needs to be fast and cheap. PulseDesk uses **Groq** (a very fast provider) running a **LLaMA** model for this.
- **Generation:** write a helpful, empathetic suggested reply. This benefits from a higher-quality model. PulseDesk uses **Google's Gemini** for this.

Key vocabulary:
- **Prompt:** the instruction you give the model. PulseDesk's "system prompt" tells the model exactly what categories exist and to answer only in a specific JSON shape.
- **Temperature:** a dial from 0 to 1 for randomness. **0 = deterministic/consistent** (same input → same output). PulseDesk uses temperature 0 for classification, because you want consistent, repeatable labels, not creativity.
- **Token:** roughly a word-piece; models read and bill by tokens. Free tiers limit tokens per day, which is why PulseDesk carefully spaces out its AI calls and backs off when a quota is exhausted.
- **Hallucination:** when a model confidently makes something up — e.g. inventing a category that doesn't exist. A lot of PulseDesk's reliability work is about catching and correcting hallucinations.

> **Analogy:** An LLM is an extremely well-read intern who answers instantly but sometimes makes things up with total confidence. You get great results by giving very precise instructions (the prompt), asking for answers in a strict format (JSON), and double-checking the output (validation). PulseDesk does all three.

**The core philosophy you'll repeat in interviews:** *Classification is never purely AI.* The AI does the first pass; humans review and correct it; those corrections feed back to make it smarter. The human-in-the-loop is a deliberate feature, not a missing piece.

---

## 1.14 Telegram for developers: two very different ways in

Telegram (the messaging app) offers developers **two** completely different ways to connect, and the difference is central to PulseDesk:

- **Bot API:** the official, easy way to make a "bot" account. **Limitation:** a bot generally can't read *all* messages in a group unless it's made an admin with privacy turned off. For listening to a whole busy community, this is too restrictive.
- **MTProto / user-client:** you connect as a **real user account** (not a bot), using Telegram's lower-level protocol called MTProto. This *can* read everything a normal member can read. The popular tool for doing this in JavaScript is **GramJS**.

PulseDesk uses **GramJS as a user-client** so it can read every message in the Quidax community group. Important consequences you'll cite:
- It logs in with a **session string** — a long saved credential that lets it reconnect without re-entering a code each time. This is sensitive (it *is* the login) and is stored as a secret.
- A user-client must hold a **persistent, always-on connection** — which is exactly why the app must run as a long-lived container on Railway and can't use "serverless" hosting that sleeps.
- Reading is allowed, but **sending** messages to the group is controlled by the group's settings. The Quidax group is broadcast-only (only admins can post), which is why the automated reply feature is built but can't go live — not a bug, a permission. (Part 5 / Part 7.)

> **Analogy:** The Bot API is a name-badged contractor allowed only in certain rooms. The MTProto user-client is logging in as an actual employee with a normal staff pass — you can walk the floor and read the noticeboards, but the broadcast intercom is still admin-only.

---

## 1.15 A few cross-cutting ideas you'll sound senior for knowing

These appear again and again in PulseDesk. Learn them once here.

- **Idempotent:** an operation you can safely repeat and get the same result, with no extra side effects. Processing the same Telegram message twice must create *one* ticket, not two. PulseDesk's ingestion is idempotent — a cornerstone of its reliability.
- **Race condition:** a bug where two things happen at almost the same time and step on each other — e.g. the AI finishes labelling a ticket a half-second after a human already changed its status, and overwrites the human's change. PulseDesk has specific guards against several races.
- **Circuit breaker:** a safety switch that "trips" after repeated failures of an external service (say, the AI provider is down), stopping further calls for a short while so you don't hammer a dead service. PulseDesk wraps its external calls in circuit breakers.
- **Rate limiting:** capping how many requests are allowed in a window, to prevent abuse or runaway costs. PulseDesk rate-limits its API (and once had to *raise* a limit because the dashboard's own polling tripped it — a great small story).
- **Timeout:** giving up on a call that takes too long, so one slow dependency can't freeze everything.
- **Graceful degradation:** when something fails, fail *softly* — still create the ticket even if the AI was down, just flag it. The user's message is never lost because a dependency hiccupped.
- **Source of truth:** the one place that holds the authoritative answer for some fact, so different parts of the system never disagree. (E.g. a ticket's `resolved_at` timestamp is the source of truth for *when* it was closed.)
- **Pure module / pure function:** a piece of logic that, given the same inputs, always returns the same output and touches nothing else (no database, no network). These are easy to test in isolation. PulseDesk deliberately extracts its trickiest decisions into small pure modules (you'll see file names like `listener-health.ts`, `conversation-grouping.ts`) so they can be tested thoroughly without a live Telegram connection. This is one of the project's best engineering decisions and a great thing to point at.

---

### You now have the vocabulary.

Everything from here on uses these words freely. If a later part ever loses you, the term is almost certainly defined above or in **Part 11 (Glossary)**. Next: **Part 2 — what PulseDesk actually is, and why it exists.**
# Part 2: What Is PulseDesk (and Why It Exists)

This is the part you'll use most in a pitch or the opening of an interview. By the end you can explain — at any length from 15 seconds to 15 minutes — what the product is, who it's for, the problem it solves, and the one philosophy that makes it special.

---

## 2.1 The one-sentence pitch

> **PulseDesk is an AI-assisted support triage tool that watches a busy Telegram community, automatically turns real support issues into prioritized tickets on a dashboard, suggests replies, and gets smarter as human agents correct it.**

Memorize a version of that. Everything else is detail.

---

## 2.2 The 30-second pitch (for a pitch meeting)

> "Quidax is a Nigerian crypto exchange with huge, extremely active Telegram communities. Thousands of messages a day pour in — everything from 'my withdrawal is stuck' to general crypto chatter. Right now their support team has to manually scroll through all of it to find the genuine problems. That means slow responses to urgent financial issues and burnt-out agents. PulseDesk reads every message automatically, uses AI to pick out the real support issues, classifies and prioritizes them, drafts suggested replies, and presents them on a clean dashboard — while keeping a human in control of every decision. The result: agents stop drowning in chatter and urgent issues get caught fast."

---

## 2.3 Who Quidax is and why the context matters

**Quidax** is a leading **Nigerian cryptocurrency exchange** — a platform where people buy, sell, and store crypto. Two facts about this context shape the entire product:

1. **The issues are financial and time-sensitive.** A stuck withdrawal or a blocked account is not a minor annoyance — it's someone's money. A slow response is a trust problem and potentially a money problem. So *prioritization of urgent issues* is the whole point, not a nice-to-have.

2. **The community is Nigerian and writes in Nigerian English and Pidgin.** Real messages include phrases like *"money never enter"* (a deposit hasn't arrived), *"dem block my account"* (account access problem), *"e don do"* (it's done/enough), *"abeg help me"* (please help me). An AI trained mostly on standard English will mislabel these. **Handling Nigerian Pidgin correctly is a real, distinguishing feature of PulseDesk** — and a great thing to mention, because it shows you designed for the actual users, not a generic demo.

---

## 2.4 The problem, stated precisely

Support teams managing a high-volume Telegram community face three concrete problems:

1. **Signal lost in noise.** Genuine support issues are buried under general chatter, price talk, greetings, and spam. Finding them is manual and exhausting.
2. **No prioritization.** A critical "I can't withdraw ₦500,000" sits in the same undifferentiated stream as "gm everyone." Urgency isn't visible.
3. **No memory or structure.** There's no organized record of what's open, what's resolved, how fast the team responds, or where the recurring problems are.

The cost of all this: **delayed responses to critical financial issues, high cognitive load on agents, and an unmanaged workflow.**

---

## 2.5 Who the users are

- **Primary users — Quidax support agents and team leads.** They live in the dashboard: triaging, reading suggested replies, marking issues resolved, watching the urgent queue.
- **Secondary users — admins/operators during the pitch phase.** They use it to *demonstrate* the tool's value to Quidax decision-makers.

Knowing your users lets you answer "who is this for?" instantly — and explains design choices like the simple polling dashboard (agents need reliability and clarity, not flashy real-time wizardry).

---

## 2.6 What PulseDesk actually does (the capability list)

Walk through these as "the feature set":

1. **Listens to the whole group, live.** It connects to Telegram as a real user account (not a limited bot) so it can read every message in the community. Ingestion runs on multiple overlapping paths for reliability — a 15-second live pull, a 3-minute safety-net sweep, manual backfill, and a self-healing reconciliation sweep — all funnelling into one idempotent function. (Covered in Part 3 and Part 5.)

2. **Filters out noise before spending money on AI.** Obvious spam, greetings, and chatter are dropped by cheap rule checks *before* any AI is called, so the dashboard only fills with potential real issues and AI costs stay low.

3. **Redacts sensitive data before sending anything to an AI.** Phone numbers, emails, card numbers, crypto keys and similar are stripped out before a message is ever sent to an external AI service. (Security, Part 6.)

4. **Classifies each real issue with AI.** A fast model (Groq/LLaMA) labels each message: a **category** (Withdrawal Issue, Deposit Issue, Account Access, Trading Problem, General Question, and others), an **urgency** (Critical / High / Medium / Low), a short **summary**, and more — returned in a strict, validated format.

5. **Drafts an empathetic suggested reply** with a higher-quality model (Google Gemini), so an agent can respond with one edit-and-send instead of writing from scratch. The human always reviews before anything is sent.

6. **Stores everything as tickets** in a database, with status, timestamps, and the full conversation thread.

7. **Shows a live dashboard** with the ticket feed, filters (by category, urgency, date, search), and honest KPIs — Resolution Rate, Median Response Time (median, not mean, to exclude outliers), volume over time, and breakdowns by status. The dashboard uses purpose-built status labels: "Admin Replied" instead of "In Review", "Likely Resolved" instead of "Assumed Resolved", and a **"Handed Off" badge** when the admin redirected the user off-platform (email / DMs) — so those tickets are excluded from the active queue and from the resolution rate, rather than dragging it down for work that happened where the system cannot see it.

8. **Learns from humans (the training loop).** When an agent corrects a label — or even just confirms it — that correction is stored and fed into future classifications, so the AI improves on the kinds of messages this community actually sends. There's a dedicated flashcard-style training screen for this.

9. **Learns from how admins reply.** If an admin answers a user in the group in a way that implies a different category — or clearly resolves the issue — the system quietly updates the ticket and records what it learned, without anyone opening a separate screen.

10. **Self-heals when messages are orphaned.** A background sweep periodically finds `messages` rows that have no corresponding ticket — caused by a crash or transient error mid-build — and replays them automatically through the normal pipeline. This means a transient error can never permanently hide a user's issue. A dry-run preview runs before any writes, and the full suite of noise filters runs inside the sweep, so bot templates and chatter are never resurrected as fake tickets.

11. **(Built, currently parked) Notifies users automatically.** Marking a ticket Resolved/Escalated/Awaiting-User can post an empathetic reply to the user in Telegram. This is fully built behind safety switches but can't go live because the Quidax group only allows admins to post (see Part 5 / Part 7) — a permission limitation, not a code problem.

---

## 2.7 The core philosophy — the single most important idea

> **Classification is never purely AI. The human-in-the-loop is a core feature, not a missing piece.**

This is the heart of the product, and you should be able to defend it passionately:

- AI *will* make mistakes — it will misread Nigerian slang, misjudge urgency, and occasionally invent nonsense. Pretending otherwise is how you lose user trust on day one.
- So PulseDesk is built as a **partnership**: AI does the tireless first pass across thousands of messages; humans catch and correct what it gets wrong; and **those corrections flow back to make the next pass better.**
- This is also the right *pitch* posture for a financial company: you are not asking Quidax to trust a black box with customers' money problems. You're giving their expert agents a powerful assistant that they remain in control of.

When an interviewer asks "what makes this more than just calling an AI API?" — *this* is the answer: the closed feedback loop and the deliberate, designed-in human oversight.

---

## 2.8 The strategic purpose (don't skip this in a pitch)

PulseDesk has a second job beyond being useful: it's a **high-value demonstration asset** — concrete, deployed, working proof of value built specifically for Quidax. It's not a slide deck describing what *could* be built; it's a live system reading their actual community right now. That's a far stronger position to pitch from.

---

## 2.9 What PulseDesk is NOT (managing expectations honestly)

Being clear about boundaries reads as senior and honest:

- It is **not a fully autonomous bot** that answers users on its own. Humans approve replies. (And right now it can't post to the group at all.)
- It is **not a replacement** for support agents — it's a force-multiplier for them.
- It does **not** make financial decisions or move money. It triages conversations.
- It is **not** finished in the "10,000-messages-a-day, 90%+ accuracy, fully polished" sense defined as the ultimate goal — it's a strong, production-deployed system with known, documented limitations (Part 5 and Part 7 are honest about these).

---

## 2.10 How success is measured

If asked "how would you know it's working?", cite the intended success metrics:

- **Agent time saved** — a large reduction in time spent reading general chatter.
- **Faster time-to-resolution** for High/Critical issues.
- **Improving AI accuracy** — the rate of human corrections should fall over time as the training loop does its job. (The system can actually *measure* its own accuracy gain from training — the "Verify" feature, covered in Part 5.)

---

### In one breath, in summary

PulseDesk turns a chaotic, money-sensitive Telegram support stream into an organized, prioritized, AI-assisted-but-human-controlled workflow — built specifically for the way Quidax's community really communicates. Next, **Part 3** shows how all the pieces fit together and traces a single message through the whole system.
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
The backend is connected to Telegram as a user-client. It learns about the new message through its primary live path (a 15-second poll using a Telegram mechanism called `getChannelDifference`), with a slower 3-minute "AutoFetch" sweep running in parallel as a safety net. (*Why two paths? A long saga — the short version: the obvious "live push" method silently doesn't work for this kind of group in the library version used, so the system actively pulls instead. Full story in Part 7.*) There are also paths for manual backfill, recovery of quoted parent messages, and a **background reconciliation sweep** that finds any `messages` rows that ended up without a ticket (due to a mid-build crash) and replays them — a self-healing mechanism that means a transient error can never permanently hide a user's issue. Either way, every path funnels into one shared processing function.

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

- **Self-healing orphan recovery.** The pipeline writes the `messages` row before the ticket. Any crash between those two steps permanently hides the message from all future dedup scans — unless a background sweep looks for `messages` rows with no matching ticket and replays them. This is the reconciliation sweep: a structural answer to a structural data-ordering problem, not a manual cleanup. (Full story in Part 5.11 and Part 7.)

- **Evidence-based verification as a practice.** Every fix was proven with a test, a live request, a database query, or production logs — and when something could only be verified in production, that was stated honestly rather than hidden. This isn't a "technology" choice, but it's an engineering-culture choice worth naming.

---

### Where we are

You can now sketch the architecture and narrate a message's journey. Next, **Part 4** opens the project folder and explains every file and folder — what it is, and *why the project is organized this way*.
# Part 4: The Directory and Every File

If an interviewer says "open the project, walk me through it," this part is your map. The goal: explain what every meaningful file and folder is, and — just as importantly — *why the project is organized this way.*

---

## 4.1 First, don't panic at the clutter

If you open the project folder you'll see a *lot* of files — including many like `test-api.mjs`, `check_db.mjs`, `reconstruct.cjs`, `server.ts.recovered`. **Most of that is throwaway clutter, not the real application.** Here's the honest framing to give:

> "The project follows a convention where one-off diagnostic and test scripts use specific extensions (`.mjs`, `.cjs`) and are git-ignored — they exist in my working folder for debugging but aren't part of the committed application. The actual app is a focused, well-organized set of files: the backend, the frontend, a set of small tested logic modules, the database migrations, and the tests."

So mentally, ignore the `*.mjs` / `*.cjs` / `*.recovered` / `*.txt` noise. What follows is what actually matters.

---

## 4.2 The shape of the real project

```
Quidax Telegram/
├── server.ts                  ← THE BACKEND (everything server-side)
├── src/                       ← THE FRONTEND (the React dashboard)
│   ├── App.tsx                  the entire dashboard + /train screen
│   ├── main.tsx                 the tiny entry point that starts React
│   └── index.css                global styles (Tailwind)
├── index.html                 the single HTML page the app loads into
│
├── (pure logic modules, in the root)   ← small, tested decision-makers
│   ├── listener-health.ts
│   ├── conversation-grouping.ts
│   ├── channel-difference.ts
│   ├── admin-message-policy.ts
│   ├── admin-reply-resolution.ts
│   ├── classification-policy.ts
│   ├── quoted-parent.ts
│   ├── telegram-guards.ts
│   ├── dialog-priming.ts
│   ├── autofetch-dedup.ts
│   ├── gemini-quota.ts
│   ├── deploy-overlap.ts
│   ├── pidgin-glossary.ts
│   └── benchmark-cases.ts
│
├── eval.ts                    a command-line tool to run the AI benchmark
│
├── tests/                     automated tests (15 files) for the modules above
│
├── supabase/
│   └── migrations/            the database's change history (numbered SQL files)
│
├── dist/                      the BUILT app (generated, not hand-written)
├── scripts/                   real utility scripts (e.g. the session generator)
├── node_modules/              all downloaded packages (generated, never edited)
│
├── package.json               project metadata, dependencies, commands
├── tsconfig.json              TypeScript settings
├── vite.config.ts             frontend build settings
├── railway.toml               how Railway builds and runs the app
│
└── (documentation, *.md)      PRD, handoff, known issues, and THIS guide
```

---

## 4.3 The backend: `server.ts`

This one file (~4,300 lines) is the entire server-side application. It's large, and that's a fair thing for an interviewer to poke at ("why one big file?"). Your honest answer:

> "It grew as a single cohesive service because everything is tightly related to one runtime — the live Telegram connection, the ingestion pipeline, the AI calls, and the API all share the same long-lived process and in-memory state. To keep it maintainable, the *trickiest and riskiest logic* was extracted out into small, separately-tested pure modules, so the big file is mostly orchestration. If I were extending it, splitting it into route files and a service layer would be the next refactor."

What lives inside `server.ts`, in plain terms:
- **Startup checks** — it refuses to start if a required secret/setting is missing (fail loud, never run with a missing secret).
- **Security middleware** — protective HTTP headers, request size limits, restricted cross-origin access, rate limiting, and the login/authentication check.
- **The Telegram connection** — connecting as a user-client, the live ingestion paths, the safety-net sweep, and a "watchdog" that reconnects if the connection goes quiet.
- **The ingestion pipeline** — the one shared function every message flows through (dedup → filter → redact → classify → reply → store).
- **The AI calls** — talking to Groq (classify) and Gemini (reply), wrapped in timeouts, retries, and circuit breakers.
- **The API endpoints** — everything the dashboard calls: tickets, stats, status changes, training, benchmark, health.
- **Serving the frontend** — in production it also hands the built dashboard files to the browser.

---

## 4.4 The frontend: `src/`

- **`src/App.tsx`** (~1,900 lines) — the entire dashboard. It contains the login screen, the main ticket dashboard (feed, filters, KPI cards, charts), and the separate `/train` flashcard screen, plus the logic to poll the backend every 10 seconds and the small helpers that attach your login token to each request. It also contains the **error boundaries** (safety nets so one broken section can't blank the whole screen).
- **`src/main.tsx`** — a tiny 10-line file whose only job is to start the React app and drop it into the page. (This file is actually central to the Safari bug story in Part 7 — the app was being started here *without* a top-level safety net.)
- **`src/index.css`** — global styling via Tailwind.
- **`index.html`** (in the root) — the single bare HTML page the whole React app loads into. It also contains a small built-in error display that shows a red banner if something crashes early (you saw this exact banner during the Safari debugging).

---

## 4.5 The "pure modules" — the project's signature pattern

These small files in the root each own **one tricky decision**, written as pure logic (same inputs → same outputs, no database or network). This is the pattern to praise in an interview. Each has a matching test file in `tests/`.

| File | The one decision it owns |
|------|--------------------------|
| `listener-health.ts` | Is this message actually in our target group? Should the watchdog reconnect? |
| `conversation-grouping.ts` | Should this new message be folded into the user's recent ticket as a follow-up? |
| `channel-difference.ts` | Interpreting Telegram's "what's new since I last checked" responses (the primary live ingestion path) |
| `admin-message-policy.ts` | What to do with an admin's message that doesn't attach to any ticket (drop it, don't make a ticket) |
| `admin-reply-resolution.ts` | Does an admin's reply mean the issue is resolved? (and is it safe to auto-resolve?) |
| `classification-policy.ts` | Rules around how/when classification results are applied |
| `quoted-parent.ts` | When an admin quotes a user message we never saw, recover and ingest that original first |
| `telegram-guards.ts` | Safety checks/descriptions for raw Telegram updates |
| `dialog-priming.ts` | The startup step that makes Telegram willing to deliver group updates; also a membership check |
| `autofetch-dedup.ts` | Skip already-seen messages efficiently during the safety-net sweep |
| `gemini-quota.ts` | Detect a real "daily quota exhausted" error and back off for an hour instead of hammering it |
| `deploy-overlap.ts` | The startup delay that prevents two instances overlapping during a deploy |
| `pidgin-glossary.ts` | The Nigerian Pidgin knowledge injected into the AI's instructions |
| `benchmark-cases.ts` | The fixed, hand-labelled gold test cases for measuring AI accuracy |
| `message-reconciliation.ts` | Deciding which orphaned `messages` rows are genuine user issues worth replaying (vs. bot/system noise) |
| `handoff-detect.ts` | Detecting when an admin directed a user to DMs or email — so those tickets show a "Handed Off" badge instead of sitting forever as unresolved |

**Why this pattern matters (say this):** the live Telegram connection can't run on a laptop safely while production is live, so the riskiest logic was deliberately made *not* depend on Telegram — pure inputs and outputs — so it could be unit-tested exhaustively offline. That's how decisions this sensitive were verified without touching production.

---

## 4.6 `eval.ts` and the benchmark

`eval.ts` is a small command-line program that runs the **benchmark**: it feeds a set of fixed, hand-labelled example messages (from `benchmark-cases.ts`) through the AI and reports how many it classified correctly. It's the project's "accuracy yardstick." The same gold cases power the in-dashboard Benchmark panel. Keeping the cases in a committed code file (not a loose data file) was a deliberate fix — an earlier version kept them in a git-ignored file that never reached the live server, so the benchmark showed blank in production. (Part 7.)

---

## 4.7 `tests/`

Twenty-one automated test files that check the pure modules behave correctly across every case — normal inputs, weird inputs, and edge cases. Running them (`npm test`) gives a fast, trustworthy "did I break anything?" signal. The current suite is **273 tests**. In an interview: *"the tests target the pure modules, which is where the subtle logic lives; that's a deliberate, high-value place to concentrate testing."*

---

## 4.8 `supabase/migrations/` — the database's history

A **migration** is a single, numbered change to the database's structure, written as SQL, saved as a file. Reading the migration folder is like reading the database's diary: `001_initial` (the first tables), then `009_four_state_workflow` (adding the In-Review/Escalated/Awaiting-User statuses), `010_corrections_table` (the training-loop table), `013_bot_replies`, `014_conversation_grouping`, `015_corrections_human_skip`, and so on. Each has an `up` file (apply the change) and usually a `down` file (undo it).

**An honest, senior caveat to mention:** the migration files don't perfectly match the live database (some were reconstructed after the fact), so the real practice is to verify the actual database structure before trusting a migration file. Knowing that nuance — and that you *check reality rather than assume* — reads as experienced.

---

## 4.9 The generated folders (never hand-edited)

- **`dist/`** — the **built** version of the app: TypeScript compiled to JavaScript, the frontend bundled and minified into compact files with content-hashed names. This is what actually runs in production. It's generated by `npm run build` and is *not* saved into the code repository (Railway rebuilds it on each deploy). *(This folder is central to one bug story: the local server prefers serving a stale `dist/` if one exists, which can hide frontend changes until you rebuild.)*
- **`node_modules/`** — every downloaded package. Huge, generated from `package.json`, never edited, never committed.

---

## 4.10 The configuration files

- **`package.json`** — the project's identity card: its name, the list of every package it depends on, and the shortcut commands (`npm run build`, `npm test`, etc.). Also declares the project as a modern "module" type — a small detail that matters for why throwaway scripts need specific extensions.
- **`tsconfig.json`** — TypeScript's settings (how strict to be, which files to include). Strict type-checking is on.
- **`vite.config.ts`** — settings for the frontend build tool (Vite), including the React and Tailwind plugins.
- **`railway.toml`** — tells the host (Railway) exactly how to build and run the app: build with `npm run build`, start by running the compiled server, check `/api/health` to confirm it's alive, and run **exactly one** instance. (That "exactly one" is load-bearing — see Part 7.)

---

## 4.11 The documentation set

The project is unusually well-documented (a strength to mention — it shows you can communicate, not just code):

- **`PRD.md`** — the Product Requirements Document: the problem, the features, the milestones.
- **`PULSEDESK_HANDOFF.md`** — the detailed engineering handoff: every bug fixed, every feature, every decision.
- **`KNOWN_ISSUES.md`** — a brutally honest log of bugs, limitations, and pending work.
- **`CLAUDE.md`** — the project's accumulated "lessons learned," written so the next person (or AI) doesn't repeat mistakes.
- **`README.md`**, the `SYSTEM_ARCHITECTURE_*.md` files, and the older `docs/` guides — additional and historical documentation.
- **`docs/guide/`** — *this guide.*

---

### Where we are

You can now open the folder and explain any part of it with confidence, and — more importantly — explain *why it's shaped this way.* Next, **Part 5** goes inside each major subsystem and explains how it actually works, in depth.
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

**The challenge:** there are *five* different ways a message can enter the system, and they overlap on purpose for reliability:
1. **The live path** — a 15-second poll (`getChannelDifference`, see 5.2) that catches messages within seconds. This is the primary path.
2. **AutoFetch** — a slower sweep every 3 minutes that re-reads recent history as a safety net, in case the live path missed something.
3. **Backfill** — a manual tool to pull in older history on demand.
4. **Recovery of quoted parents** — when an admin replies to a user message the system never saw, it fetches and ingests that original first.
5. **Reconciliation sweep** — a background job that periodically finds messages in the `messages` table that have no corresponding ticket (because a crash or transient error orphaned them mid-build) and replays them through the normal pipeline. (See 5.11.)

**Why overlap is safe — the single most important reliability idea in the project:** every one of those paths funnels into *one shared function*, and the very first thing that function does is check **"have I already processed this exact message?"** using the message's unique Telegram ID. If yes, it stops immediately. This makes the whole pipeline **idempotent** — running it twice (or four times) on the same message produces exactly one ticket.

Two layers of defense back this up:
- The **first-thing dedup check** in the shared function (the fast, primary guard).
- A **unique constraint in the database** on the message's Telegram ID (the last-resort guard that catches even a rare simultaneous-processing race the first check could miss).

**The ordering rule that must never change:** the dedup check sits *at the very top*, before any database write, any AI call, or any reply-handling branch. An earlier version of the project had this check *lower down*, after the reply-handling logic — which caused admin/user replies to be appended to tickets again on every sweep (one ticket showed a reply duplicated 23 times). Moving the check to the top fixed it permanently. (Full story in Part 7.)

> **The point to make:** "Five ingestion paths overlap for reliability, and that's only safe because processing is idempotent — a dedup check on the Telegram message ID runs first, backed by a unique database constraint. Re-processing is a no-op."

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

**Noise gating happens first:** cheap rules drop spam/greetings/chatter *before* the AI is called, so money isn't spent classifying "gm." Praise and irrelevant messages don't become tickets. There is also a set of pattern-based pre-filters (`noise-prefilter.ts`) that route specific noise shapes straight to Dismissed without an AI call: bare price-bot commands like `/p BTC` or `/chart SOL` (pattern 1a), and long pasted news or promotional text (pattern 1b). Pattern 1d (added alongside the reconciliation work) extends this to automated token price-snapshot dumps — the multi-line "Price: $X USD / Fully Diluted Market Cap / View on CoinMarketCap" blasts that certain group bots post. All of these correctly route to Dismissed (reversible in `/train`); the `messages` row is always kept.

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

**Measuring the improvement — the "Verify" feature.** This is how you answer "how do you know the training actually helps?" Verify re-runs the AI over **genuinely human-reviewed messages** twice each — once with no training examples (a baseline) and once with the training examples (leave-one-out so it can't cheat) — and reports the accuracy difference. A measured run shows a real positive lift (e.g. baseline ~33% → with-training ~50% on a recent sample). The honest framing: the lift is *measured, not claimed*, and it **grows as the team reviews more real tickets** — it's a tool that gets more meaningful with use, not a headline number to oversell on day one.

> **The point to make:** "Every human correction or confirmation is stored, fed back into future classifications as similar examples, and the system measures its own accuracy gain from that training using a leave-one-out method so it can't cheat. The measured lift is real and grows as more tickets are reviewed."

### Benchmark vs. Verification — what each proves (know this cold)

These are **two different tools** that share one modal, and confusing them is the fastest way to undersell your accuracy story. The distinction:

| | **Benchmark** (`/api/eval`) | **Verification** (`/api/verify`) |
|---|---|---|
| Tests against | 20 **fixed, hand-labelled gold cases** baked into the code | The team's real `/train` reviews from the database |
| Question it answers | "How accurate *is* the classifier?" | "Does human training *improve* it?" |
| Sample | Curated, stable, the same every run | Grows over time as agents review |
| Use it for | **The pitch / "how accurate is it?"** | Internal QA / tracking the training loop |

**The benchmark is your trustworthy accuracy number, and here's *why* it's trustworthy** — this is the exact answer to a skeptic:
- It's a **fixed, hand-curated test set** (12 standard-English Quidax cases, 6 Nigerian Pidgin, 2 capability questions), each labelled by a human with the correct category *and* urgency. Anyone can open `benchmark-cases.ts` and read all 20 cases and the predictions side by side — it's transparent, not a black box.
- It runs at **temperature 0** (deterministic — the same input always produces the same output) as a **raw-model baseline** with *no* few-shot examples injected. That's deliberate: it means the number is a clean, comparable measure of the base classifier, not something flattered by training data, and it's reproducible run to run.
- It scores **category and urgency separately**, so you can see exactly where it's strong. Historically ~94% overall, **100% on the Pidgin cases** — and Pidgin is the real differentiator for this community.

**Why Verification is *not* your pitch number (and why honesty here is a strength):** Verification grades the AI against whatever the team has reviewed. Early on that pool is small, and it must only be graded against *genuine human reviews* — an earlier version mistakenly graded against AI-inferred labels on context-free conversation fragments (a bare transaction id like "2388200980" labelled "Deposit Issue"), which no classifier could reproduce from the text alone, so it scored near 0% and looked broken when it was really measuring nothing. The fix was to grade only against real human `/train` reviews and to stop counting transient rate-limit errors as wrong answers. The lesson worth stating out loud: *"I trust the fixed gold benchmark for the accuracy claim; the verification tool is for tracking the training loop internally, and I made it grade only against genuine human reviews so the number means something."*

> **The point to make:** "My accuracy claim comes from a fixed, transparent, hand-labelled benchmark run at temperature zero as a raw-model baseline — ~94% overall and 100% on Pidgin — so it's reproducible and comparable over time. The separate verification tool tracks whether human training is improving things, and I deliberately grade it only against real human reviews so it isn't measuring noise."

---

## 5.6 Conversation grouping — seeing the whole issue

**The problem it solves:** people don't say everything in one message. A user might send "my withdrawal is stuck" then, ten seconds later, "since this morning" then "transaction id is ABC123." Treated as three separate messages, you'd get three fragmented tickets and the AI would classify each fragment poorly.

**The solution:** when a user sends several un-quoted messages in a short rolling window (default 5 minutes), the follow-ups are **folded into the same ticket** as additional blocks, and the ticket is **re-classified on the whole thread** rather than a single fragment. So the classifier and the human reviewer both see the complete issue.

**Careful boundaries (why it's safe):** grouping only happens for a fresh, un-quoted, non-admin message from the same sender within the window; it groups into that sender's most-recently-active ticket; and the re-classification updates the labels and summary **but never the status** — because a human (or an admin's reply) owns the status, and an automatic process shouldn't override that. The window-tracking timestamp is updated on every message in the thread so the "is this within the window?" decision stays accurate across back-and-forth. (Pure module `conversation-grouping.ts`.)

**The quoted-reply fallback (and why it has a time limit):** when a user sends a message that quotes another, the system tries to find that quoted parent as an active ticket to attach the reply to. If no active ticket is found, a fallback looks up the sender's most-recently-active ticket. An earlier version of this fallback had no age limit — so a user quoting anything could end up attaching their message to a ticket created weeks ago. The fallback is now bounded to tickets whose last activity was within 48 hours (`QUOTED_FALLBACK_MAX_AGE_MS`), most-recently-active first. Past that window, the message falls through to the normal grouping or new-ticket path instead.

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

## 5.11 The reconciliation sweep — recovering orphaned messages

**The problem it solves:** the ingestion pipeline always writes the `messages` row *first*, then builds the ticket. The deduplication key sits on that `messages` row, so a crash or transient error mid-build (after the row lands but before the ticket is created) **permanently orphans the message** — every later re-scan sees it as already-processed and skips it, so no ticket is ever created. The user's issue simply vanishes. This is especially painful when a burst of related messages arrives: the first one gets a ticket, a later crash silently kills the others, and the user's follow-ups or admin replies have nowhere to attach.

**Why it went undetected:** from the outside the pipeline looks healthy — the message is in the database, and no error appears for it on any future pass. The only sign is a `messages` row with no matching ticket.

**The fix — a self-healing sweep (`reconcileOrphanMessages`):**
A background job runs at startup (after 5 minutes) and then hourly. It queries for `messages` rows that have no matching ticket, filters out noise (system bot templates, chatter, price commands), and replays each one through the *same* `processAndIngestMessage` function the live pipeline uses — with a 3-line bypass that reuses the existing `messages.id` and preserves the sender hash (so a multi-message conversation re-groups correctly rather than creating disconnected tickets). The top-of-function dedup is still the authoritative idempotency guard; the sweep just unlocks messages that were previously unreachable.

**The tricky guard — no `checkIsAdmin` in the sweep.** The live pipeline identifies admins by their Telegram `senderId`. But the `messages` table only stores a hashed sender ID, not the raw Telegram one. Dropped admin messages (unattached admin replies, correctly discarded by `admin-message-policy.ts`) are never turned into tickets, so their hashes are absent from any admin reference set. The result: welcome messages and ban-notification bots would look like ordinary users to the sweep and come back as genuine support tickets. Fix: a content-pattern recognizer `isSystemBotMessage()` catches unmistakable system message templates (welcome, ban notices), and the same `shouldProcessMessage` / `isBanterNoise` noise gate that protects the live pipeline runs here too — so only messages that would have passed the original filter can be resurrected.

**The dry-run preview** is what caught this class of false-orphan before a single row was written. A read-only preview script queried for orphan candidates and returned the exact set that would be replayed — system bot messages and all. That preview is what proved the `isSystemBotMessage` guard was necessary.

**Gating (ships safely off by default):** `INGEST_RECONCILE_ENABLED` (default OFF) and `INGEST_RECONCILE_DRY_RUN` (default ON) mirror the bot-reply rails. The live system enables both (`ENABLED=true`, `DRY_RUN=false`) on Railway. Re-running the sweep converges to 0 orphans because the dedup ensures each message is only ever built into a ticket once.

**Phase 0 — the dashboard side of the story.** Before the reconciliation engine, the *display* layer also needed updates so recovered tickets would look right and agents would understand what they were seeing. Phase 0 added:
- **"Admin Replied" / "Likely Resolved" / "Handed Off" labels** — display-only status relabels that make the ticket state legible without changing any stored value. A new pure module `handoff-detect.ts` detects DM/email redirect language in the raw thread and drives the "Handed Off" badge.
- **Rendered `[USER_FOLLOWUP]` blocks** — recovered conversations show their full thread, not just the first message.
- **Fixed the resolution pie** — the previous version had a mystery gray slice from floating-point rounding; replaced with 3 explicit cells and a correct legend.
- **iOS scroll-shake fix** — an overflow layout and blob blur stacking on `min-h-screen` containers caused mobile scroll jitter; fixed with `min-h-[100dvh]`, `transform-gpu`, and `absolute` positioning for the decorative layers.

> **The point to make:** "The root cause of lost messages wasn't the ingestion pipeline failing loudly — it was a structural ordering: the `messages` row is written before the ticket, and the dedup key lives on that row. Any crash between the two permanently hides the message. The fix is a background sweep that finds those gaps and replays them through the same idempotent function, with a careful guard to avoid resurrecting bot messages that were correctly discarded."

---

### Where we are

You now understand how every major part works and can defend the design of each. **Part 6** focuses entirely on security and safety — the "how do you know it's safe?" answers — and **Part 7** tells the bug stories that make the best interview material.
# Part 6: Security and Safety

This is one of the most important parts for both a pitch (you're handling a financial company's users) and an interview ("how do you know it's secure?"). Security here means several different things — protecting users' private data, protecting the company's secrets, protecting the system from abuse, and protecting the data from corruption. This part covers all of them, with the *reasoning* and *how each was verified*.

The golden rule running through everything: **never trust the frontend, and never let a secret near it.**

---

## 6.1 The trust boundary — why the backend holds all the power

The frontend runs on the user's device, where a determined person can inspect or tamper with it. Therefore:

- The frontend is treated as **untrusted**. It can *ask* for things, but every rule is enforced on the **backend**.
- The frontend never talks directly to the database, the AI services, or Telegram. It only calls the backend's API. The backend is the single gatekeeper.

> **The point to make:** "Anything on the user's device is untrusted by definition, so all authority lives on the backend. The frontend can only make requests; the server enforces every rule and holds every secret."

---

## 6.2 Database access — service-role key only, never the public key

Supabase databases come with two kinds of keys:
- A **public ("anon") key** — meant for limited, restricted, frontend-style access governed by row-level security rules.
- A **service-role key** — a master key that bypasses those restrictions and has full authority.

PulseDesk's backend uses the **service-role key exclusively**, and *only* on the backend. Why:
- The backend *is* the trusted authority (per 6.1), so it needs full access to do its job.
- The service-role key is a powerful secret — so it lives only as a server environment variable and is **never** sent to the frontend.

An early bug actually had the backend trying to use the *public* key, which failed because the database's security rules blocked it. Switching strictly to the service-role key (on the backend only) was the fix. The rule now: **never use the public key for backend operations, and never expose the service-role key to the frontend.**

> **The point to make:** "The backend uses the service-role key — and only the backend ever has it. The public key is never used server-side, and the master key never reaches the browser."

---

## 6.3 Protecting users' private data — PII redaction

**PII** = Personally Identifiable Information: phone numbers, emails, card numbers, bank details, crypto wallet keys, government IDs (in Nigeria, things like NIN/BVN).

Because messages are sent to *external* AI services (Groq, Gemini), there's a real risk of leaking users' private details to a third party. So **before any message is sent to any external AI, PII is stripped out** and replaced with placeholders. The AI gets enough to classify the issue ("user can't withdraw") but never the user's actual phone number or wallet key.

This redaction is applied at *every* AI call site, not just the main one — a deliberate rule, so adding a new AI feature in future must use the same protective wrapper.

> **The point to make:** "Users' private data — phones, emails, card numbers, crypto keys, national IDs — is redacted out of every message before it's ever sent to an external AI, so we get classification without leaking personal data to a third party."

---

## 6.4 Authentication — who's allowed in

The dashboard is protected by a password (the "Access Key" screen you've seen). When you log in:
- The backend checks your password and, if correct, issues you a temporary **token** (a time-limited pass).
- Every subsequent request carries that token; the backend checks it before doing anything. No valid token → the request is refused with a `401` (unauthorized).

The password itself is a server-side secret (set as an environment variable), checked with a comparison method designed not to leak timing information. Sensitive endpoints all sit behind this authentication check.

> **The point to make:** "The dashboard requires a password; a correct login mints a time-limited token that's checked on every request. The password lives only on the server, and protected endpoints refuse anything without a valid token."

---

## 6.5 Keeping secrets out of the frontend bundle

A classic, dangerous mistake is letting a secret slip into the frontend, because **everything shipped to the browser is readable by anyone** — including values that *look* hidden in build settings. PulseDesk's rule: no secret ever goes into a frontend variable or build-time setting. All sensitive operations (database, AI) happen on the backend. After build changes, it's cheap to scan the built frontend files for tell-tale key patterns to confirm nothing leaked.

> **The point to make:** "No secret ever enters the frontend bundle — anything shipped to the browser is readable, so all secret-using work stays on the backend, and the built files can be scanned to confirm no keys leaked."

---

## 6.6 The secret-leak incident and key rotation (handle this one well)

This is a real incident and answering it confidently shows maturity.

**What happened:** at some point a Supabase key ended up in the project's public git history (the saved record of code changes). Once a secret is in public history, it must be considered compromised forever — you can't truly delete it from everywhere it may have been copied.

**The correct response (what was done):**
- **Rotate** the key — generate a brand-new one and switch the system to it.
- **Disable the old key** entirely, and verify it's truly dead (confirmed it now returns "unauthorized").
- A standing rule was recorded: **never re-enable the old (legacy) keys**, because doing so would resurrect the leaked one.

The new key is a modern-format key used only on the backend. The takeaway you can state: *"the right reaction to a leaked secret isn't to hide it — it's to rotate it, disable the old one, verify it's dead, and make sure nobody turns it back on."*

> **The point to make:** "A key once leaked into public git history. The fix was to rotate to a new key, disable the old one, verify it returns unauthorized, and document that the legacy keys must never be re-enabled. You treat a leaked secret as permanently compromised and replace it."

---

## 6.7 Rate limiting — preventing abuse and runaway cost

The API limits how many requests any single source can make in a time window, to prevent both abuse and accidental overload. There's a stricter limit on the *expensive* operations (running the benchmark, the accuracy verification, backfills) because each of those costs real AI calls.

A neat, honest story here: the dashboard polls every few seconds, and an early limit was set so low that a single open dashboard tab would *trip its own limit* after about 17 minutes — and then everything started failing with `429 Too Many Requests` (blank KPIs, "Loading communities…"). The data was never lost; it was purely the rate limiter blocking the dashboard from itself. The fix raised the general limit, raised the expensive-operation limit, and slowed the dashboard's polling — and it was verified by firing a burst of requests and confirming none were wrongly blocked. *Lesson: a rate limit has to account for your own app's normal behavior, not just hypothetical attackers.*

> **The point to make:** "The API is rate-limited, with a tighter cap on expensive AI operations. I also learned to size limits against the app's own polling — an early limit was so low the dashboard tripped it on itself, which I fixed and verified with a request burst."

---

## 6.8 Hardening the API surface

Several standard protections are in place on the backend:
- **Security headers** (via a tool called Helmet) that instruct browsers to behave safely.
- **A request size limit** (1 MB) so nobody can send a giant payload to exhaust memory.
- **Restricted cross-origin access (CORS)** so only the intended frontend can call the API from a browser.
- **Strict input validation:** request data is validated against an explicit allowed shape (using a validation library called Zod), and the code **never blindly trusts incoming fields** — it only accepts the specific fields it expects. For example, a status update is checked against the exact list of allowed statuses; free-text is never written into a constrained field.
- **Fail-loud on missing configuration:** the server refuses to start if a required secret is missing, rather than starting in a broken or insecure state. There are no "if the secret is missing, use this default" fallbacks — a fallback secret would be a hidden backdoor.

> **The point to make:** "Standard hardening is all there — security headers, a body-size limit, restricted cross-origin access, strict input validation that only accepts expected fields, and a refuse-to-start rule if any required secret is missing, with no fallback defaults that could act as backdoors."

---

## 6.9 Safe error handling — don't leak internals

When something goes wrong, the user gets a **generic** message ("an internal error occurred"), while the **full** detail (including the technical stack trace) goes only to the server logs. This prevents leaking internal workings to an attacker. And a strict rule: **logs never contain secrets, tokens, or raw personal data.** (One debugging improvement was specifically about logging *more* useful error detail — the kind of detail that's safe — so failures could be diagnosed; it was careful to log the error's type and status, never message contents or PII.)

> **The point to make:** "Users see a generic error; the real details go only to server logs — and the logs never contain secrets or personal data."

---

## 6.10 Protecting the data itself from corruption

Security also means the data can't be silently corrupted. The relevant guards (covered in Part 5, summarized here as safety):
- **Idempotent ingestion + a unique database constraint** so the same message can never create duplicate tickets.
- **Conditional "only update if unchanged" writes** so a background process can't overwrite a human's deliberate change (race protection).
- **The single-instance rule and deploy-overlap guard** so two copies never run at once and corrupt data or burn the Telegram login.
- **Row-level security enabled** on database tables (with the backend's service-role key correctly bypassing it as the trusted authority).

> **The point to make:** "Data integrity is part of security too: idempotent ingestion with a unique constraint, conditional writes that won't clobber human changes, and a strict single-instance rule so two processes never corrupt each other."

---

## 6.11 The honest limitations (state these proactively — it builds trust)

A senior engineer names the gaps before being asked:
- The Telegram **session string is effectively a login** — it's a powerful secret, stored as a server environment variable; if it leaked, it would need rotating like any credential.
- Behavior under **extreme load** (thousands of messages a minute) is untested — the design handles moderate load well, but a true spike hasn't been load-tested.
- The system depends on **third-party AI free tiers**, which impose quotas; the quota-handling is careful, but heavy production use would mean moving to paid tiers.

Naming these shows you understand the system's real risk profile, not just its happy path.

---

### Where we are

You can now answer "is it secure?" across data privacy, secrets, abuse, and integrity — with specifics and the reasoning behind each. Next, **Part 7** turns the hardest problems into story form: the bug stories that are the single best interview material you have.
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
# Part 8: Interview Prep — Questions and Model Answers

> **The narrative before all else.** In any Quidax conversation, everything connects back to one sentence: "I applied for your graduate trainee programme in January, didn't get in, and built two production tools on your live data instead — unprompted. That is how I work." See [INTERVIEW_PREP.md](../../INTERVIEW_PREP.md) for the full self-pitch with STAR stories and a complete question bank.


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
> "The trickiest decisions are extracted into pure modules — same inputs, same outputs, no database or network — and each has a test file covering normal, weird, and edge inputs. That's 273 tests across 21 files. I concentrated testing where the subtle logic lives. The parts that touch the live Telegram connection can't run safely on a laptop while production is live, so I was honest that their first real exercise is production — and I verified those with production logs and live database queries."

**Q: How is your AI accuracy benchmark calculated?**
> "It runs a fixed set of 20 hand-labelled gold cases — 12 standard English, 6 Nigerian Pidgin, and 2 capability questions — through the classifier and compares the prediction to the known correct answer for both category and urgency. It runs at temperature zero, so it's deterministic and reproducible, and it's a raw-model baseline with no training examples injected — that keeps the number clean and comparable over time rather than flattered by training data. The cases live in a committed code file anyone can read, so it's fully transparent. Historically about 94% overall and 100% on the Pidgin cases, which is the part that matters most for this community."

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
> "Agent time saved on reading chatter, faster resolution of high-urgency issues, and — the one I'm proudest of — a measurable drop in how often humans need to correct the AI over time. The system can actually measure its own accuracy gain from training, using a leave-one-out method so a message never sees its own answer. It shows a real positive lift, and — being honest — that signal gets stronger as the team reviews more real tickets; I'd rather state a measured, growing number than a flashy one I can't stand behind."

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

**Q: You say the AI is ~94% accurate — what is that tested against, and why should I trust it?**
> "It's a fixed benchmark, not a vibe. Twenty cases I hand-labelled with the correct category and urgency — standard English, Nigerian Pidgin, and capability questions — that the classifier runs against at temperature zero, so it's deterministic and reproducible. It's a raw-model baseline with no training examples mixed in, which keeps the score clean and comparable over time. And it's transparent: the cases sit in a committed code file, so you can read all twenty and the predictions side by side rather than taking my word for it. The Pidgin coverage is the part I'd point at — 100% on those cases, because that's where a generic model fails this community."

**Q: How do you know the human training actually improves the AI — not just in theory?**
> "There's a separate verification tool that re-runs the AI over messages the team has actually reviewed, twice each — once with no training examples and once with them — using a leave-one-out method so a message never sees its own answer. The gap between the two scores is the measured training lift. I'll be straight with you: that number is most meaningful once enough real tickets have been reviewed, so I treat the fixed benchmark as the accuracy claim and the verification tool as an internal tracker of the training loop. I also deliberately made it grade only against genuine human reviews — an earlier version was grading against AI-guessed labels on context-free message fragments, which made the score meaningless, and I fixed that. Knowing the difference between a number you can stand behind and one you can't is the point."

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
# Part 10: Which Roles to Target, and How to Position Yourself

You asked an important question earlier: *what role should I even apply for?* This part answers it. PulseDesk demonstrates a specific, marketable bundle of skills — let's name them, map them to real job titles, and give you the framing for each.

A caveat in the project's own honest spirit: one strong project doesn't automatically make you a "senior" anything in the eyes of every employer. But it *does* give you concrete, demonstrable evidence for a real range of roles, and it lets you speak credibly above your formal experience. Aim for roles where a working, deployed, well-understood project is your strongest card.

---

## 10.1 What this project actually proves about you

Be clear-eyed about the skills on display — these are your selling points:

| Skill demonstrated | Evidence from PulseDesk |
|---|---|
| **Full-stack development** | A real backend (Node/TypeScript/Express) *and* frontend (React) working together |
| **AI / LLM application engineering** | Two LLM providers, strict output validation, PII redaction, few-shot learning, a measurable training loop, quota handling |
| **System design & architecture** | A clean trust boundary, a sensible data flow, deliberate trade-offs you can defend |
| **Debugging hard, ambiguous problems** | The live-listener mystery, the Safari rendering bug — diagnosed with evidence, not guesses |
| **Production operations / reliability** | Deployment, watchdogs, deploy-overlap protection, circuit breakers, rate limiting |
| **Security awareness** | Secret rotation after a leak, PII protection, backend-only authority, input validation |
| **Product judgment** | Honest metrics, the human-in-the-loop philosophy, designing for the actual (Pidgin-speaking) users |
| **Communication** | Thorough documentation, plain-English commits, *this guide* |

That combination — *builds end-to-end, integrates AI thoughtfully, debugs hard problems with evidence, and ships/operates it* — is exactly what a lot of modern teams want.

---

## 10.2 The roles that fit (best matches first)

**1. AI / LLM Application Engineer (strongest match).**
This is the hottest version of your profile: someone who builds real products *around* LLMs — not training models, but wiring them into reliable software. PulseDesk is almost a perfect portfolio piece for this: prompt design, output validation, multi-model architecture, a feedback/training loop, cost and quota handling, and honest accuracy measurement.
> *Pitch:* "I build production software around LLMs — handling the unglamorous but critical parts: forcing reliable structured output, redacting PII before external calls, measuring accuracy with a feedback loop, and degrading gracefully when the model fails or hits quota."

**2. Full-Stack Engineer / Software Engineer (broadest match).**
The classic role. You have a genuine front-and-back project that's deployed and running. Most generalist engineering roles will take this seriously.
> *Pitch:* "I build complete features end to end — database, backend API, and React frontend — and I take them all the way to deployed and verified in production."

**3. Backend / Platform Engineer.**
If you enjoyed the ingestion pipeline, idempotency, reliability, and the Telegram-protocol debugging more than the UI, lean here. The backend is where PulseDesk's hardest engineering lives.
> *Pitch:* "I'm strongest on the server side — reliable data pipelines, idempotency, handling flaky external services with timeouts and circuit breakers, and the operational side of keeping a long-running service alive."

**4. Founding Engineer / Early-Stage Startup Engineer.**
Startups want someone who can build the *whole thing* and make pragmatic trade-offs without a big team. You did exactly that — and you used AI tooling to move fast, which startups love.
> *Pitch:* "I can take a vague problem to a deployed product solo — make the architecture calls, integrate the AI, ship it, and operate it — and I move fast by directing AI tooling well."

**5. Solutions Engineer / Forward-Deployed Engineer / Developer Advocate.**
These roles blend building with communicating and demoing to customers. Your documentation, your demo readiness, and your ability to explain technical decisions in plain English are real assets here.
> *Pitch:* "I build real integrations *and* I can explain and demo them to non-technical stakeholders — I built PulseDesk as both a working tool and a pitch asset, with documentation a non-developer can follow."

**6. Technical Product Manager (a stretch, but real).**
You showed product judgment (honest metrics, the human-in-the-loop philosophy, designing for real users) and you can speak the engineering language. If you find you prefer deciding *what* to build and *why* over writing the code, this is a credible direction.
> *Pitch:* "I think in terms of the user's real problem and honest success metrics, and I'm technical enough to work shoulder-to-shoulder with engineers on feasibility and trade-offs."

---

## 10.3 How to choose between them

Ask yourself which part of building PulseDesk you'd happily do all day:
- **The AI pipeline and making it reliable?** → AI/LLM Application Engineer.
- **The whole thing, a bit of everything?** → Full-Stack Engineer.
- **The data flow, reliability, and protocol debugging?** → Backend Engineer.
- **Owning a product end-to-end at a small company?** → Founding Engineer.
- **Building *and* explaining/demoing to customers?** → Solutions Engineer / Forward-Deployed.
- **Deciding what to build and why, more than coding it?** → Technical PM.

My honest recommendation: **lead with AI/LLM Application Engineer or Full-Stack Engineer**, because PulseDesk is the strongest possible evidence for both, and both are in high demand. Keep Founding Engineer and Solutions Engineer as strong secondary targets.

---

## 10.4 How to put it on a CV / LinkedIn

Use outcome-focused bullets, in plain English, that invite a question:

- *Built and deployed PulseDesk, an AI-assisted support-triage tool that reads a live Telegram community, classifies and prioritizes real support issues, and drafts replies — with a human-in-the-loop training loop that measurably improves accuracy over time.*
- *Designed a reliable ingestion pipeline (idempotent, multiple overlapping sources) and diagnosed a deep messaging-protocol bug, cutting message latency from minutes to ~14 seconds.*
- *Integrated two LLM providers with strict output validation, PII redaction before external calls, quota-aware backoff, and circuit breakers for graceful degradation.*
- *Hardened the system: secret rotation after a leak, backend-only authority, rate limiting, and protection against a deployment race that could corrupt the live connection.*

Each bullet is a door an interviewer can open — and behind every door is a story you now know cold (Part 7).

---

## 10.5 The mindset to walk in with

You are not "someone who used AI to make an app." You are **someone who took a real, money-sensitive problem and shipped a working, deployed system that solves it — making the architecture decisions, integrating AI thoughtfully, debugging hard problems with evidence, and operating it reliably — and who can explain every part of it.** That's a builder. Walk in as the builder.

---

### Where we are

You know what to apply for and how to frame yourself. The final part, **Part 11**, is a plain-English glossary of every term in this guide — your quick-reference cheat sheet.
# Part 11: Glossary

Every technical term used in this guide, in plain English, alphabetical. Use it as a quick reference or a night-before flashcard deck. Where useful, the "in PulseDesk" angle is noted.

---

**AI / LLM (Large Language Model).** A program trained on huge amounts of text that produces useful text from an input. *PulseDesk uses Groq/LLaMA to classify messages and Gemini to draft replies.*

**API (Application Programming Interface).** The menu of things a server lets other programs ask for. Each menu item is an **endpoint**.

**AutoFetch.** PulseDesk's safety-net ingestion sweep that re-reads recent messages every 3 minutes, in case the faster live path missed something.

**Backend.** The server-side part of an app that you don't see — it does the heavy work, holds the secrets, talks to the database, and enforces the rules. *PulseDesk's backend is `server.ts`.*

**Backfill.** Pulling in older history on demand (vs. processing new messages as they arrive).

**Build.** The step that turns human-written source code into the compact, runnable version that actually ships. *Triggered by `npm run build`; output goes to the `dist/` folder.*

**Circuit breaker.** A safety switch that stops calling an external service after repeated failures, so you don't keep hammering something that's down. Recovers after a short cooldown.

**Classification.** Reading a message and labelling it (category, urgency, etc.). The fast, cheap AI job. *Done by Groq.*

**Client.** Another word for the frontend — the part running on the user's device. (Contrast: server.)

**Compositing.** The browser's step of drawing layered visual elements onto the screen. *A failure here — not a code error — caused the iPhone Safari blank-page bug.*

**Container.** A sealed, portable box holding an app and everything it needs to run, so it behaves the same anywhere. *Railway runs PulseDesk as one container.*

**CORS (Cross-Origin Resource Sharing).** Browser rules about which websites may call an API. *Restricted so only the intended frontend can call PulseDesk's API.*

**Database.** An organized store of information that survives restarts. *PulseDesk uses Postgres via Supabase.*

**Dedup (deduplication).** Detecting and skipping something already processed. *PulseDesk dedups on the Telegram message ID, as the first step of ingestion.*

**Deploy / Deployment.** Putting the latest code onto the live server and starting it. *Pushing to `main` on GitHub triggers a Railway deploy.*

**`dist/`.** The folder holding the built (compiled, bundled) app that actually runs in production. Generated, not hand-edited, not saved in the code repository.

**DOM (Document Object Model).** The browser's live, in-memory model of the web page. React updates it for you.

**Dry-run.** A mode that runs an entire process but skips the final real-world action (records "what it *would* do"). *Used by the outbound bot to rehearse safely. Note: it can't catch errors that only happen on a real send.*

**Endpoint.** One specific URL that does one specific job in an API. *E.g. `GET /api/tickets`.*

**Environment variable.** A named setting a program reads at startup; used for things that differ between machines or must be kept secret.

**Error boundary.** A React safety net that catches a crash in one UI section so the whole screen doesn't go blank.

**Express.** A popular toolkit for building a backend's API endpoints in Node.js.

**Few-shot learning.** Improving an AI's answer by showing it a few relevant worked examples in the prompt. *PulseDesk shows the AI similar past human corrections before each classification.*

**Frontend.** The part of the app you see and click, running in your browser. *PulseDesk's frontend is `src/App.tsx`.*

**Gemini.** Google's higher-quality LLM. *PulseDesk uses it to draft empathetic suggested replies.*

**`getChannelDifference`.** A Telegram mechanism for asking "what's changed in this channel since I last checked?" *PulseDesk polls this every 15 seconds as its primary live ingestion path.*

**Git.** A system that tracks every change to code over time. A **commit** is one saved snapshot; a **branch** is a parallel line of work; **`main`** is the primary branch that gets deployed.

**GitHub.** The website hosting the shared copy of the code repository; pushing to it can trigger deployments.

**`.gitignore`.** A list of files Git should *not* save into the repository (e.g. secrets, the huge packages folder, throwaway scripts).

**GramJS.** A JavaScript library for connecting to Telegram as a real *user* account (via MTProto), so it can read all group messages. *How PulseDesk listens to the Quidax group.*

**`handoff-detect.ts`.** A pure module that reads the raw text of a ticket's thread and returns whether an admin directed the user to DMs or email — the "Handed Off" display badge is driven by this. It has no side effects, so it can be tested without a live session.

**Graceful degradation.** Failing softly — e.g. still creating a ticket (flagged) even if the AI was down — so a user's message is never lost to a dependency hiccup.

**Groq.** A very fast LLM provider. *PulseDesk uses it (running LLaMA) for classification.*

**Hallucination.** When an AI confidently makes something up — e.g. inventing a category that doesn't exist. PulseDesk validates output to catch this.

**Helmet.** A tool that sets protective HTTP headers to make browsers behave more safely.

**HTTP / HTTPS.** The rules for how a browser and server talk. HTTPS is the encrypted (secure) version.

**Idempotent.** Safe to repeat — doing it twice gives the same result as doing it once, with no extra side effects. *PulseDesk's ingestion is idempotent, which lets overlapping ingestion paths be safe.*

**Ingestion.** The process of getting messages from Telegram into the system.

**JSON.** A simple text format of labelled fields (keys and values) used to exchange structured data between programs. *The AI must return its answers as JSON.*

**KPI (Key Performance Indicator).** A headline metric. *PulseDesk's include Resolution Rate, Average Response Time, and ticket volume.*

**Lagos time.** Nigeria's timezone. *PulseDesk computes all "today"/date boundaries in Lagos time, not the server's universal time.*

**LLaMA.** The family of AI models PulseDesk runs (via Groq) for classification.

**Migration.** A single, numbered, saved change to the database's structure, written in SQL. *PulseDesk's are in `supabase/migrations/`.*

**`message-reconciliation.ts`.** A pure module that decides which orphaned `messages` rows are genuine user issues (worth replaying as tickets) vs. system bot templates (welcome messages, ban notices) that should stay silent. The key guard that keeps the reconciliation sweep safe.

**MTProto.** Telegram's lower-level protocol that a real *user* account uses (as opposed to the limited Bot API). *PulseDesk connects via MTProto using GramJS.*

**Node.js.** The thing that lets JavaScript run on a server (outside a browser). *PulseDesk's backend runs on Node.*

**Noise gating.** Dropping spam, greetings, and chatter with cheap rules *before* spending money on an AI call.

**npm (Node Package Manager).** The tool that downloads and manages reusable code packages.

**Orphan message.** A `messages` row that has no corresponding ticket — created when the ingestion pipeline writes the message row first, then crashes before it can create the ticket. The dedup key sits on the `messages` row, so every future re-scan skips it as "already seen." The reconciliation sweep finds and replays these.

**`package.json`.** The project's identity-and-dependencies file, listing packages and shortcut commands.

**PII (Personally Identifiable Information).** Private personal data — phone numbers, emails, card numbers, crypto keys, national IDs. *PulseDesk redacts these before any external AI call.*

**Pidgin (Nigerian Pidgin English).** A widely-spoken form of English in Nigeria. *PulseDesk has a built-in glossary so the AI understands phrases like "money never enter."*

**Polling.** Repeatedly asking the server "anything new?" on a timer. *PulseDesk's dashboard polls every 10 seconds.*

**Postgres (PostgreSQL).** A powerful, trusted relational database. *PulseDesk's database, hosted by Supabase.*

**Prompt.** The instructions given to an AI. *PulseDesk's system prompt defines the exact categories and demands JSON output.*

**`pts`.** Telegram's internal counter tracking a channel's message sequence. *PulseDesk tracks this itself to poll for new messages — the core of the live-listener fix.*

**Pure module / pure function.** Logic that, given the same inputs, always returns the same output and touches nothing else (no database, no network) — making it easy to test in isolation. *PulseDesk's signature pattern; e.g. `conversation-grouping.ts`.*

**Quoted-reply fallback.** When a user sends a message quoting another, and the system finds no active ticket for that quoted parent, it falls back to attaching the reply to the sender's most-recently-active ticket. The fallback is bounded to tickets with activity within the last 48 hours (`QUOTED_FALLBACK_MAX_AGE_MS`) — without this limit, a fresh message could accidentally attach to a month-old ticket.

**Race condition.** A bug where two things happen at almost the same time and interfere — e.g. the AI overwriting a status a human just set. *PulseDesk guards against these with conditional "only update if unchanged" writes.*

**Railway.** The cloud hosting service running PulseDesk's backend as a single always-on container.

**Rate limiting.** Capping how many requests are allowed in a time window, to prevent abuse or runaway cost.

**React.** A library for building user interfaces from reusable **components**. *PulseDesk's dashboard is a React app.*

**Redaction.** Removing sensitive data and replacing it with placeholders. *Applied to messages before any external AI call.*

**Reconciliation sweep.** The background job (`reconcileOrphanMessages`) that finds orphaned `messages` rows (no ticket) and replays them through the normal ingestion pipeline. Runs hourly. Idempotent — re-running it converges to 0 orphans. Gated behind `INGEST_RECONCILE_ENABLED` / `INGEST_RECONCILE_DRY_RUN` flags so it can be previewed before any writes. The `message-reconciliation.ts` module handles the candidate-filtering logic.

**REST.** A common style for designing APIs using HTTP methods sensibly (GET to read, POST to act).

**Resolution Rate.** PulseDesk's headline metric: Resolved ÷ (Resolved + Active), with spam (Dismissed) deliberately excluded.

**Rolling deploy.** A deployment that starts the new version before stopping the old one (so there's no downtime) — which created the overlap that once burned the Telegram login.

**Service-role key.** The database master key with full authority. *Used only on PulseDesk's backend, never the frontend.*

**Server.** A computer (usually in the cloud) that runs the backend and answers requests. Also used loosely to mean "the backend."

**Session string.** A saved Telegram login credential that lets the user-client reconnect without re-entering a code. A powerful secret. *Stored as a backend environment variable; has been rotated a few times.*

**Source of truth.** The one authoritative place for a fact, so different parts of the system never disagree. *E.g. a ticket's resolved-timestamp is the source of truth for when it closed.*

**SQL (Structured Query Language).** The language for reading and changing a relational database.

**Status code.** A 3-digit number summarizing an HTTP response: 200 OK, 400 bad request, 401 unauthorized, 404 not found, 429 too many requests, 500 server error.

**Supabase.** The service that hosts PulseDesk's Postgres database (plus access tooling).

**Tailwind CSS.** A styling system used to give the dashboard a consistent look quickly.

**Temperature.** An AI randomness dial from 0 to 1. *PulseDesk uses 0 for classification — consistent, repeatable labels.*

**Timeout.** Giving up on a call that takes too long, so one slow dependency can't freeze everything.

**Token (two meanings).** (1) In AI: a word-piece; models read and are billed by tokens. (2) In auth: a temporary pass issued after login and checked on each request.

**TypeScript.** JavaScript with an added safety layer (type labels) that catches mistakes before the program runs. *PulseDesk's main language.* Compiled to plain **JavaScript** to run.

**UTC (Coordinated Universal Time).** The universal time standard servers run on. *PulseDesk converts to Lagos time for anything users see.*

**Vite.** The fast build tool for PulseDesk's frontend.

**Watchdog.** A background check that notices when the Telegram connection has gone silently dead and forces a reconnect. *Fixed to only trust real target-group traffic as a sign of life.*

**WebKit.** The browser engine that powers Safari — and, on iPhones, *every* browser (including in-app browsers). *This fact was the key insight in the Safari bug: a true compatibility bug would fail in all of them equally.*

**WebSocket.** An always-open live connection between browser and server. *PulseDesk deliberately chose simpler polling instead.*

**Zod.** A validation library used to check that incoming data matches an exact expected shape before it's trusted.

---

### The end of the guide

You've reached the end. If you've read Parts 0–11, you can explain PulseDesk from first principles to deep internals, tell its hardest debugging stories with evidence, defend its security and design decisions, run a live demo, and position yourself for the right roles. Go own it.

*(Reminder: the code-commenting phase — adding explanatory comments throughout the actual source files so they're readable if an interviewer asks you to open them — is the planned next phase, separate from this guide.)*
