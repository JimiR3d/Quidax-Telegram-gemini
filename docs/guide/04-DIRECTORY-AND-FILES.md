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

**Why this pattern matters (say this):** the live Telegram connection can't run on a laptop safely while production is live, so the riskiest logic was deliberately made *not* depend on Telegram — pure inputs and outputs — so it could be unit-tested exhaustively offline. That's how decisions this sensitive were verified without touching production.

---

## 4.6 `eval.ts` and the benchmark

`eval.ts` is a small command-line program that runs the **benchmark**: it feeds a set of fixed, hand-labelled example messages (from `benchmark-cases.ts`) through the AI and reports how many it classified correctly. It's the project's "accuracy yardstick." The same gold cases power the in-dashboard Benchmark panel. Keeping the cases in a committed code file (not a loose data file) was a deliberate fix — an earlier version kept them in a git-ignored file that never reached the live server, so the benchmark showed blank in production. (Part 7.)

---

## 4.7 `tests/`

Fifteen automated test files (~1,600 lines) that check the pure modules behave correctly across every case — normal inputs, weird inputs, and edge cases. Running them (`npm test`) gives a fast, trustworthy "did I break anything?" signal. The current suite is **172 tests**. In an interview: *"the tests target the pure modules, which is where the subtle logic lives; that's a deliberate, high-value place to concentrate testing."*

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
