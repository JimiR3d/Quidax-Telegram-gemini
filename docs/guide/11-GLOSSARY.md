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

**MTProto.** Telegram's lower-level protocol that a real *user* account uses (as opposed to the limited Bot API). *PulseDesk connects via MTProto using GramJS.*

**Node.js.** The thing that lets JavaScript run on a server (outside a browser). *PulseDesk's backend runs on Node.*

**Noise gating.** Dropping spam, greetings, and chatter with cheap rules *before* spending money on an AI call.

**npm (Node Package Manager).** The tool that downloads and manages reusable code packages.

**`package.json`.** The project's identity-and-dependencies file, listing packages and shortcut commands.

**PII (Personally Identifiable Information).** Private personal data — phone numbers, emails, card numbers, crypto keys, national IDs. *PulseDesk redacts these before any external AI call.*

**Pidgin (Nigerian Pidgin English).** A widely-spoken form of English in Nigeria. *PulseDesk has a built-in glossary so the AI understands phrases like "money never enter."*

**Polling.** Repeatedly asking the server "anything new?" on a timer. *PulseDesk's dashboard polls every 10 seconds.*

**Postgres (PostgreSQL).** A powerful, trusted relational database. *PulseDesk's database, hosted by Supabase.*

**Prompt.** The instructions given to an AI. *PulseDesk's system prompt defines the exact categories and demands JSON output.*

**`pts`.** Telegram's internal counter tracking a channel's message sequence. *PulseDesk tracks this itself to poll for new messages — the core of the live-listener fix.*

**Pure module / pure function.** Logic that, given the same inputs, always returns the same output and touches nothing else (no database, no network) — making it easy to test in isolation. *PulseDesk's signature pattern; e.g. `conversation-grouping.ts`.*

**Race condition.** A bug where two things happen at almost the same time and interfere — e.g. the AI overwriting a status a human just set. *PulseDesk guards against these with conditional "only update if unchanged" writes.*

**Railway.** The cloud hosting service running PulseDesk's backend as a single always-on container.

**Rate limiting.** Capping how many requests are allowed in a time window, to prevent abuse or runaway cost.

**React.** A library for building user interfaces from reusable **components**. *PulseDesk's dashboard is a React app.*

**Redaction.** Removing sensitive data and replacing it with placeholders. *Applied to messages before any external AI call.*

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
