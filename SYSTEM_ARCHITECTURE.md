# PulseDesk: System Architecture

## Full Data Flow Architecture

```text
+-----------------------+
|  Telegram Community   | (Users send messages, questions, complaints)
+-----------+-----------+
            |
            v
+-----------------------+
|   GramJS Listener     | (Persistent TCP connection. Listens to specific group)
+-----------+-----------+
            |
            v
+-----------------------+
|      Pre-Filter       | (shouldProcessMessage: drops short text, bots, spam)
+-----------+-----------+
            |
            v
+-----------------------+
|     PII Redaction     | (Strips emails, phones to protect user privacy)
+-----------+-----------+
            |
            v
+-----------------------+
| Prompt Sanitize/Inject| (Defends against prompt injection attacks)
+-----------+-----------+
            |
            v
+-----------------------+
|       Groq API        | (LLaMA model. Classifies into JSON schema: urgency, category, etc.)
+-----------+-----------+
            |
            v
+-----------------------+
|      Zod Schema       | (Validates JSON shape. normalizeCategory fallback handles LLM hallucinations)
+-----------+-----------+
            |
            v
+-----------------------+
|      Gemini API       | (Gemini 3.1-Pro generates context-aware, empathetic suggested replies)
+-----------+-----------+
            |
            v
+-----------------------+
|   Supabase Storage    | (Backend uses SERVICE_ROLE_KEY to bypass RLS. Absolute server authority)
+-----------+-----------+
            |
            v
+-----------------------+
|    React Dashboard    | (Support agents view tickets. Polls API every 5 seconds for live updates)
+-----------------------+
```

## Background Jobs
*   **Auto-Fetch Cron:** Runs every 15 minutes. Sweeps the Telegram group history to recover any payloads/messages missed if the live listener temporarily disconnected.
*   **Keyword Learning System:** Monitors repeated misclassifications and specific trigger words to dynamically adjust the prompt context and improve future classification accuracy over time.

## Security Layers
*   **Circuit Breakers:** Prevents the backend from continuously hammering external APIs (Groq/Gemini/Supabase) if they go down, ensuring the Node.js server doesn't crash from pending promises.
*   **Rate Limiting:** Express rate limiting prevents API abuse and endpoint brute-forcing from unauthorized clients.
*   **Helmet:** Enforces strict HTTP security headers, including CSP (in production) to prevent XSS.
*   **Token Auth / Role Isolation:** Frontend clients are gated. Administrative backend operations are isolated and protected via `SUPPORT_API_KEY`.
*   **Audit Logs:** Critical state changes (e.g., ticket resolution) are logged with timestamps and identifiers to maintain a strict operational audit trail.
