# PulseDesk Agent Rules

## Stack
Node.js + Express + TypeScript (server.ts), React 19 + Vite + Tailwind v4 (src/App.tsx), Supabase service role key only, Groq for classification, Gemini for replies, GramJS for Telegram.

## Before every task
Read PULSEDESK_HANDOFF.md and PRD.md first. Restate the task, list which files will change, identify risks. Wait for approval before acting on anything non-trivial.

## Rules
- Smallest change only — never touch unrelated files
- Never use SUPABASE_ANON_KEY for backend operations
- Never expose API keys to the frontend
- Never change DB schema without explicit confirmation
- Never regenerate the GramJS session string without explicit instruction
- One task at a time — complete and confirm before moving to the next
- All Git and PR descriptions in plain English a non-developer can understand

## End of every session
Update PULSEDESK_HANDOFF.md, KNOWN_ISSUES.md, and PRD.md. Summarize what was done and what is pending.
