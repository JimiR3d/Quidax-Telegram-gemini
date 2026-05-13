import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import dotenv from "dotenv";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;
  
  // Trust the reverse proxy (Cloud Run / AI Studio) to correctly pass the client's IP
  app.set("trust proxy", 1);

  // --- Security Middleware ---
  app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP because it can conflict with Vite HMR/dev
  app.use(express.json({ limit: "50kb" })); // Defend against payload injection

  // Rate Limiting to prevent brute-forcing and API abuse
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 200, 
    message: { error: "Too many requests from this IP, please try again later." },
    validate: { 
      trustProxy: false, // We already explicitly trust proxy, this suppresses the warning if it still gets triggered unexpectedly
      xForwardedForHeader: false // express doesn't natively support Forwarded header, suppress warning
    } 
  });
  app.use("/api/", limiter);

  // Simple Auth Middleware
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Basic shared secret for MVP Dashboard protection
    const incomingKey = req.headers['x-admin-key'];
    const validKey = process.env.VITE_DASHBOARD_PASSWORD || 'quidax2026';
    if (incomingKey !== validKey) {
      return res.status(401).json({ error: "Unauthorized. Invalid Admin Key." });
    }
    next();
  };

  // Initialize OpenAI for Groq
  let openai: OpenAI;
  try {
    const key = process.env.GROQ_API_KEY;
    if (!key || key === 'MY_GROQ_API_KEY') {
      console.warn("⚠️ Warning: GROQ_API_KEY is missing or invalid. Check AI Studio Settings -> Secrets panel.");
    } else {
      openai = new OpenAI({
        apiKey: key,
        baseURL: "https://api.groq.com/openai/v1",
      });
    }
  } catch (err) {
    console.error("OpenAI init error:", err);
  }

  // Initialize Supabase lazily
  function getSupabase() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is missing from environment variables.");
    }
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  }

  // Define schema for structured JSON output
  const responseSchema = {
    type: "json_schema",
    json_schema: {
      name: "ticket_classification",
      schema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "The primary issue type. Must be exactly one of: 'Withdrawal Issue', 'Deposit Issue', 'KYC/Verification', 'Trading Problem', 'App Bug', 'Fee Complaint', 'Account Access', 'Network/Downtime', 'General Question', 'Praise', 'Spam/Irrelevant'.",
          },
          urgency: {
            type: "string",
            description: "Urgency level: 'Critical', 'High', 'Medium', 'Low'. Based on keywords, financial stakes, and user tone.",
          },
          product_area: {
            type: "string",
            description: "The affected product area: 'Wallet', 'Exchange', 'Mobile App', 'Web Platform', 'Identity/KYC', 'Customer Support', 'Other'.",
          },
          sentiment: {
            type: "string",
            description: "User sentiment: 'Frustrated', 'Neutral', 'Positive', 'Confused'.",
          },
          is_complaint: {
            type: "boolean",
            description: "True if the message is a complaint or problem report. False if it is a question, praise, or off-topic.",
          },
          suggested_action: {
            type: "string",
            description: "A brief one-line recommendation: e.g. 'Escalate to on-call engineering'.",
          },
          summary: {
            type: "string",
            description: "A one-sentence plain-English summary of the issue suitable for a support ticket title.",
          }
        },
        required: ["category", "urgency", "product_area", "sentiment", "is_complaint", "suggested_action", "summary"],
        additionalProperties: false
      }
    }
  };

  // API constraints checker to validate schema enums
  const validateTicketSchema = (ticketStr: string) => {
    try {
      const ticket = JSON.parse(ticketStr);
      const validCategories = ['Withdrawal Issue', 'Deposit Issue', 'KYC/Verification', 'Trading Problem', 'App Bug', 'Fee Complaint', 'Account Access', 'Network/Downtime', 'General Question', 'Praise', 'Spam/Irrelevant'];
      const validUrgencies = ['Critical', 'High', 'Medium', 'Low'];
      const validProductAreas = ['Wallet', 'Exchange', 'Mobile App', 'Web Platform', 'Identity/KYC', 'Customer Support', 'Other'];
      const validSentiments = ['Frustrated', 'Neutral', 'Positive', 'Confused'];

      if (!validCategories.includes(ticket.category)) ticket.category = 'General Question';
      if (!validUrgencies.includes(ticket.urgency)) ticket.urgency = 'Medium';
      if (!validProductAreas.includes(ticket.product_area)) ticket.product_area = 'Other';
      if (!validSentiments.includes(ticket.sentiment)) ticket.sentiment = 'Confused';

      return ticket;
    } catch (e) {
      return null;
    }
  }

  async function processAndIngestMessage(text: string, telegramId: number, groupId: string, replyToMsgId?: number) {
    if (!text || text.length < 5) {
       throw new Error("Message too short or empty");
    }
    const supabase = getSupabase();

    if (replyToMsgId) {
      try {
        const { data: parentMsg } = await supabase.from('messages').select('id').eq('telegram_message_id', String(replyToMsgId)).single();
        if (parentMsg) {
          const { data: parentTicket } = await supabase.from('tickets').select('*').eq('message_id', parentMsg.id).single();
          if (parentTicket) {
             const newRawText = parentTicket.raw_text + `\n\n[ADMIN_REPLY]\n${text}\n[/ADMIN_REPLY]`;
             await supabase.from('tickets').update({
                raw_text: newRawText,
                status: 'In Review'
             }).eq('id', parentTicket.id);
             console.log(`[Admin Reply] Attached reply to ticket ${parentTicket.id}`);
             return parentTicket;
          }
        }
      } catch (err) {
        console.error("Error looking up parent ticket for reply:", err);
      }
    }

    if (!openai) {
      throw new Error("GROQ_API_KEY is missing. Please add it to Secrets.");
    }
    
    const systemInstruction = `You are a support triage analyst for a fintech/crypto company. Follow these instructions exactly. Classify the user's message. You must reply with a valid JSON payload matching the target schema.`;
    
    // Call Groq API
    const response = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile", // Fast and capable Groq model
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: `Please classify this message: "${text}"\n\nEnsure your response strictly follows this JSON schema structure:\n${JSON.stringify(responseSchema.json_schema.schema)}` }
      ],
      response_format: { type: "json_object" }
    });

    const jsonStr = response.choices[0]?.message?.content?.trim() || "{}";
    const ticketData = validateTicketSchema(jsonStr);

    if (!ticketData) {
      throw new Error("Failed to parse classification output");
    }

    const senderHash = crypto.createHash('sha256').update(telegramId.toString()).digest('hex');

    // 1. Insert the raw message into the messages table
    const { data: dbMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        telegram_message_id: telegramId,
        group_id: groupId,
        sender_hash: senderHash,
        raw_text: text,
        message_timestamp: new Date().toISOString()
      })
      .select('id')
      .single();
      
    if (msgError) {
      // If it's a conflict, we might have already processed it. Ignore.
      if (msgError.code === '23505') {
        console.log(`Message ${telegramId} already processed.`);
        return null;
      }
      throw new Error(`DB Error inserting message: ${msgError.message}`);
    }

    // 2. Insert the classified ticket
    const { data: dbTicket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        message_id: dbMessage.id,
        group_id: groupId,
        summary: ticketData.summary,
        category: ticketData.category,
        urgency: ticketData.urgency,
        product_area: ticketData.product_area,
        sentiment: ticketData.sentiment,
        is_complaint: ticketData.is_complaint,
        suggested_action: ticketData.suggested_action,
        status: 'Open',
        raw_text: text
      })
      .select('*')
      .single();

    if (ticketError) {
      throw new Error(`DB Error inserting ticket: ${ticketError.message}`);
    }

    return dbTicket;
  }

  // --- START TELEGRAM LISTENER ---
  const tlApiId = process.env.TELEGRAM_API_ID ? Number(process.env.TELEGRAM_API_ID) : 0;
  const tlApiHash = process.env.TELEGRAM_API_HASH || "";
  const tlSessionStr = process.env.TELEGRAM_SESSION_STRING || "";
  const targetGroup = process.env.TELEGRAM_GROUP_USERNAME || "OfficialQuidaxCommunity";
  
  let tlClient: any = null;

  if (tlApiId && tlApiHash && tlSessionStr) {
    // Dynamic import to avoid blowing up if 'telegram' package isn't present
    import("telegram").then(async (TelegramModule) => {
      const { TelegramClient } = TelegramModule;
      const { StringSession } = await import("telegram/sessions");
      const { NewMessage } = await import("telegram/events");

      const stringSession = new StringSession(tlSessionStr);
      const client = new TelegramClient(stringSession, tlApiId, tlApiHash, {
        connectionRetries: 5,
      });
      
      tlClient = client;

      try {
        await client.connect();
        console.log("✅ Connected to Telegram using session string!");
        
        client.addEventHandler(async (event: any) => {
          const message = event.message;
          if (!message || !message.text) return;
          
          const text = message.text;
          const words = text.trim().split(/\s+/);
          if (words.length < 5) return; // Skip very short messages as per MVP spec
          
          try {
            const chat = await message.getChat();
            if (chat && (chat.username === targetGroup || chat.title?.includes(targetGroup))) {
              console.log(`[Telegram Listener] Received message in ${targetGroup}: ${text.substring(0, 50)}...`);
              const replyToMsgId = message.replyTo?.replyToMsgId || message.replyToMsgId;
              await processAndIngestMessage(text, message.id || Math.floor(Math.random() * 10000000), targetGroup, replyToMsgId);
            }
          } catch (e) {
            console.error("[Telegram Listener] Error processing live message:", e);
          }
        }, new NewMessage({}));
      } catch (err) {
        console.error("❌ Failed to connect Telegram Client:", err);
      }
    }).catch(e => {
      console.error("GramJS (telegram) package is not installed or failed to load.", e);
    });
  } else {
    console.log("⚠️ Telegram listener not started. Missing TELEGRAM_API_ID, TELEGRAM_API_HASH, or TELEGRAM_SESSION_STRING in environment.");
  }
  // --- END TELEGRAM LISTENER ---

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Simple Auth check endpoint
  app.get("/api/auth/verify", requireAuth, (req, res) => {
    res.json({ success: true });
  });

  // REST endpoints for the frontend
  app.get("/api/communities", requireAuth, async (req, res) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.from('communities').select('*');
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/tickets", requireAuth, async (req, res) => {
    try {
      const supabase = getSupabase();
      const groupId = req.query.group_id as string;
      
      let query = supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(200);
      if (groupId) {
        query = query.eq('group_id', groupId);
      }
      const { data, error } = await query;
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/tickets/:id/status", requireAuth, async (req, res) => {
    try {
      const supabase = getSupabase();
      const ticketId = req.params.id;
      const { status } = req.body;
      
      const { error } = await supabase.from('tickets').update({ status }).eq('id', ticketId);
      if (error) throw error;
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post("/api/backfill", requireAuth, async (req, res) => {
    try {
      const limit = Number(req.body.limit) || 20;
      const targetGroup = process.env.TELEGRAM_GROUP_USERNAME || "OfficialQuidaxCommunity";

      if (!tlClient) {
        return res.status(400).json({ error: "Telegram client not connected. Wait for connection or check credentials." });
      }

      console.log(`[Backfill] Fetching up to ${limit} messages from ${targetGroup}...`);
      const messages = await tlClient.getMessages(targetGroup, { limit });
      
      let processedCount = 0;
      let skippedCount = 0;

      for (const msg of messages) {
        if (!msg || !msg.text) {
          skippedCount++;
          continue;
        }

        const text = String(msg.text).trim();
        const words = text.split(/\s+/);
        if (words.length < 5) {
          skippedCount++;
          continue;
        }

        try {
          // Process sequentially to be safe
          const id = msg.id || Math.floor(Math.random() * 10000000);
          const replyToMsgId = msg.replyTo?.replyToMsgId || msg.replyToMsgId;
          const ticket = await processAndIngestMessage(text, id, targetGroup, replyToMsgId);
          if (ticket) {
            processedCount++;
          } else {
            skippedCount++;
          }
        } catch (e: any) {
          console.error(`[Backfill] Error on msg ${msg.id}:`, e.message || e);
          skippedCount++;
          if (e.message && (e.message.includes("API key not valid") || e.message.includes("401"))) {
            return res.status(400).json({ error: "Invalid Groq API Key. Please check your AI Studio Secrets panel." });
          }
        }
      }

      res.status(200).json({ success: true, processed: processedCount, skipped: skippedCount, totalFetched: messages.length });
    } catch (e: any) {
      console.error("[Backfill] error:", e);
      res.status(500).json({ error: e.message || "Internal server error" });
    }
  });

  // Endpoint to simulate a webhook for ingesting a new telegram message
  app.post("/api/ingest", requireAuth, async (req, res) => {
    try {
      const { text, telegramId } = req.body;
      const tId = telegramId || Math.floor(Math.random() * 10000000);
      const groupId = "OfficialQuidaxCommunity";
      
      const dbTicket = await processAndIngestMessage(text, tId, groupId);
      res.status(200).json({ success: true, message: "Ingested", ticket: dbTicket });
    } catch (e: any) {
      console.error(e);
      res.status(500).json({ error: e.message || "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
