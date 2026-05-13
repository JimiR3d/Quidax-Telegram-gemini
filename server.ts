import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini
  let ai: GoogleGenAI;
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key || key === 'MY_GEMINI_API_KEY') {
      console.warn("⚠️ Warning: GEMINI_API_KEY is missing or invalid. Check AI Studio Secrets panel.");
      throw new Error("GEMINI_API_KEY missing or invalid");
    }
    ai = new GoogleGenAI({ apiKey: key });
  } catch (err) {
    console.error("Gemini init error:", err);
  }

  // Initialize Supabase lazily
  function getSupabase() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      throw new Error("SUPABASE_URL or SUPABASE_ANON_KEY is missing from environment variables.");
    }
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  }

  // Define schema for Gemini
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      category: {
        type: Type.STRING,
        description: "The primary issue type. Must be exactly one of: 'Withdrawal Issue', 'Deposit Issue', 'KYC/Verification', 'Trading Problem', 'App Bug', 'Fee Complaint', 'Account Access', 'Network/Downtime', 'General Question', 'Praise', 'Spam/Irrelevant'.",
      },
      urgency: {
        type: Type.STRING,
        description: "Urgency level: 'Critical', 'High', 'Medium', 'Low'. Based on keywords, financial stakes, and user tone.",
      },
      product_area: {
        type: Type.STRING,
        description: "The affected product area: 'Wallet', 'Exchange', 'Mobile App', 'Web Platform', 'Identity/KYC', 'Customer Support', 'Other'.",
      },
      sentiment: {
        type: Type.STRING,
        description: "User sentiment: 'Frustrated', 'Neutral', 'Positive', 'Confused'.",
      },
      is_complaint: {
        type: Type.BOOLEAN,
        description: "True if the message is a complaint or problem report. False if it is a question, praise, or off-topic.",
      },
      suggested_action: {
        type: Type.STRING,
        description: "A brief one-line recommendation: e.g. 'Escalate to on-call engineering'.",
      },
      summary: {
        type: Type.STRING,
        description: "A one-sentence plain-English summary of the issue suitable for a support ticket title.",
      }
    },
    required: ["category", "urgency", "product_area", "sentiment", "is_complaint", "suggested_action", "summary"]
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

  async function processAndIngestMessage(text: string, telegramId: number, groupId: string) {
    if (!text || text.length < 5) {
       throw new Error("Message too short or empty");
    }
    const supabase = getSupabase();
    
    const systemInstruction = `You are a support triage analyst for a fintech/crypto company. Follow these instructions exactly. Classify the user's message.`;
    
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: text,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema
      }
    });

    const jsonStr = response.text?.trim() || "{}";
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
              await processAndIngestMessage(text, message.id || Math.floor(Math.random() * 10000000), targetGroup);
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

  app.post("/api/backfill", async (req, res) => {
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
          const ticket = await processAndIngestMessage(text, id, targetGroup);
          if (ticket) {
            processedCount++;
          } else {
            skippedCount++;
          }
        } catch (e: any) {
          console.error(`[Backfill] Error on msg ${msg.id}:`, e.message || e);
          skippedCount++;
          if (e.message && e.message.includes("API key not valid")) {
            return res.status(400).json({ error: "Invalid Gemini API Key. Please check your AI Studio Secrets panel." });
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
  app.post("/api/ingest", async (req, res) => {
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
