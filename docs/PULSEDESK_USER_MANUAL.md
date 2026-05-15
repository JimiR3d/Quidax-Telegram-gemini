# 🚀 PulseDesk: The Step-by-Step User Manual

Welcome to PulseDesk! This guide explains exactly what this application does, how all the features work together, and providing a complete step-by-step tutorial on triggering its core functions.

---

## 📖 1. What Exactly Does PulseDesk Do?

PulseDesk is an **AI-powered Triage & Ticketing System**.
Its primary purpose is to solve the chaos of high-volume customer support chat rooms (specifically Telegram groups). 

If a company has a Telegram group with 10,000 users, hundreds of messages are sent daily. Many are spam, some are greetings, but some are **critical bugs** or **billing issues**. Human agents cannot read everything fast enough.

**PulseDesk automatically:**
1.  **Listens** to every single message in the connected Telegram Group in real-time.
2.  **Reads & Analyzes** the message using Groq's super-fast Meta LLaMA 3.3 Artificial Intelligence.
3.  **Automatically Categories** the text (e.g., Is this urgent? Is it a bug? Is the user angry?).
4.  **Creates a Ticket** and saves it securely to a Database (Supabase).
5.  **Displays** this data beautifully inside a secure Web Dashboard for human support agents to resolve.

---

## ⚙️ 2. How to Run the App (Developer Startup)

If you are running the application from scratch in your terminal or AI Studio setup:

### Step 1: Install Dependencies
Ensure you have all the necessary libraries by running:
```bash
npm install
```

### Step 2: Ensure Environment Variables are Ready
Your `.env` file must contain your secrets (Supabase connection URLs, Groq API Keys, and Telegram Auth details). 
> *Note: In AI Studio, your `.env` is typically pre-loaded with these.*

### Step 3: Run the Development Server
```bash
npm run dev
```
This executes `tsx server.ts`. The Express backend will start on Port `3000`. It will automatically spin up the Telegram listener in the background, connect to Supabase, and use Vite Middleware to serve the beautiful React frontend simultaneously!

---

## 🎟️ 3. How to Make/Ingest Tickets

Because PulseDesk is automated, human workers actually **don't** manually type out new tickets! Tickets are generated 1 of 2 ways:

### Method 1: Organic Telegram Messages (Automated)
This is how it works under normal operation:
1.  A user in the `OfficialQuidaxCommunity` Telegram group types: *"URGENT! My crypto wallet withdrawal has been stuck for 5 hours and I am losing money! Fix this now!"*
2.  The Node.js GramJS listener inside `server.ts` instantly intercepts this message.
3.  It asks the Groq AI: *"What is this?"*
4.  Groq replies with JSON:
    *   `category: "wallet_issue"`
    *   `urgency: "High"`
    *   `sentiment: "Frustrated"`
5.  The system saves it to the `tickets` database table. The exact second you refresh or wait on your dashboard, the new ticket appears!

### Method 2: The Manual Ingestion Override (Simulated API)
To test the system without actually spamming a real Telegram group, we engineered a secure backdoor endpoint.
1. Send a POST request to `/api/ingest`.
2. Provide the `x-admin-key: quidax2026` security header.
3. Pass a JSON body like: `{"text": "Is the mobile app down for anyone else?"}`.
4. The system will artificially route this text through the exact same AI brain and database as a real Telegram message.

*(You can see this simulated routing occur locally if you utilize `curl` or create a quick Node script!)*

---

## 🖥️ 4. A Rundown of All App Features

Once tickets are flowing into the system, human agents log into the Frontend web interface. Here is everything you can do:

### Feature 1: Role-Based Secure Login
When you visit the site, you are presented with a lock screen. You must enter an access key.
*   The API verifies who you are.
*   If you are a `support` agent assigned to Tenant A, you will *only* be allowed to ever see Tenant A's data.
*   If you enter an invalid key, the system permanently locks you out preventing unauthorized data snooping.

### Feature 2: The Telemetry Dashboard (Analytics)
At the very top of the screen, you will see real-time, colorful UI readouts highlighting:
*   **Total Open Tickets:** How busy the queue is.
*   **Average AI Sentiment:** A dynamic score letting the CEO know if the community is currently "Happy" or "Angry".
*   **Resolution Rate:** Are workers closing tickets as fast as they open?
*   *Built using Recharts to present this as an active graphic chart.*

### Feature 3: The Threat Matrix (Pulsing Urgent Tickets)
Tickets are rendered in easy-to-read cards. 
*   If the AI classifies a ticket as **"High Urgency"**, the card physically **pulses red** via Tailwind animation on the screen, forcing the support agent's eyes toward the most critical issue (like a security breach or large money failure).

### Feature 4: Live Search & Smart Filtering
To manage hundreds of tickets, workers can:
*   Click specific toggles (e.g., Click "Show Only Wallet Issues").
*   Type into a search bar to instantly find any user name or keyword across the active queue.

### Feature 5: Resolving & The Audit Log
When a human worker finally solves the Telegram user's problem:
*   They click **"Mark Resolved"** on the ticket card.
*   The ticket turns green and drops to the bottom of the priority queue.
*   Behind the scenes, the system triggers the **Audit Logger**. It secretly records the exact IP address, timestamp, and Actor ID of the person who clicked resolve. Total accountability!

---

## 🎯 5. Conclusion
PulseDesk turns unstructured human complaining into perfectly categorized, trackable, and secure datasets. By combining Telegram listening, real-time AI understanding, and role-based frontend dashboards, you can scale a customer service team 100x without missing a single angry message!
