# Quidax Telegram AI Support Desk

This project is an AI-powered customer support dashboard designed to intercept and classify messages from a Telegram community group in real-time. It uses **Groq** for rapid message classification and **Gemini 3.1 Pro** to generate professional suggested replies for your human agents.

## Local Development (Demo Mode)

To run the project locally without needing a live Telegram connection, you can use the built-in Demo Mode.

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env.local` file in the root directory:
   ```env
   # SECURITY
   VITE_DASHBOARD_PASSWORD=your_secure_password

   # SUPABASE
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

   # AI MODELS
   GROQ_API_KEY=gsk_your_key
   GEMINI_API_KEY=AIza_your_key

   # DEMO MODE
   DEMO_MODE=true
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

## Production Deployment (Railway)

This application acts as both a Telegram listener (persistent WebSocket connection) and an API/Frontend server. Therefore, **it cannot be deployed on Serverless platforms like Vercel.**

We recommend deploying on **Railway**. The `railway.toml` file is already configured.

### Required Environment Variables for Railway:
- `VITE_DASHBOARD_PASSWORD`: Password for dashboard access
- `SUPABASE_URL`: Supabase Project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Service Role Key (NOT anon public)
- `GROQ_API_KEY`: Groq API Key
- `GEMINI_API_KEY`: Gemini API Key
- `TELEGRAM_API_ID`: From my.telegram.org
- `TELEGRAM_API_HASH`: From my.telegram.org
- `TELEGRAM_SESSION_STRING`: Your generated GramJS string session
- `TELEGRAM_GROUP_USERNAME`: Target group (e.g., `QuidaxGlobal`)
- `DEMO_MODE`: Set to `false` in production

1. Connect your GitHub repository to Railway.
2. Add the environment variables listed above.
3. Railway will automatically build and start the server using the configuration in `railway.toml`.
