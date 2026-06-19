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
