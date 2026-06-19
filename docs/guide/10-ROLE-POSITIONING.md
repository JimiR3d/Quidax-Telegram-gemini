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
