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
