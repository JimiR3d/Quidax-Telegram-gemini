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
  if (process.env.NODE_ENV === "production") {
    app.use(helmet()); // Strict CSP for production
  } else {
    app.use(helmet({ contentSecurityPolicy: false })); // Disabled CSP for Vite HMR in dev
  }
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

  const heavyLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many requests to this endpoint. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Map api keys to roles and tenants (simulating a database/JWT for now without breaking frontend purely)
  const adminKey = process.env.VITE_DASHBOARD_PASSWORD;
  if (!adminKey) throw new Error('VITE_DASHBOARD_PASSWORD env variable is not set');

  const getAuthContext = (req: express.Request) => {
    const key = req.headers['x-admin-key'] as string;
    
    // Explicit roles mapping without fallback hardcoded passwords
    if (key === adminKey) return { role: 'super_admin', tenantId: null, userId: 'sys_admin' };
    if (key === process.env.SUPPORT_API_KEY) return { role: 'support', tenantId: 'OfficialQuidaxCommunity', userId: 'support_user_1' };
    
    return null;
  };

  // Robust Auth Middleware with RBAC concepts
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authContext = getAuthContext(req);
    if (!authContext) {
      return res.status(401).json({ error: "Unauthorized. Invalid access token/key." });
    }
    // Stash user context in request
    (req as any).user = authContext;
    next();
  };

  // Audit Log helper
  async function logAuditAction(supabase: any, actorId: string, action: string, target: string, oldState: any, newState: any, ip: string) {
    try {
      await supabase.from('audit_logs').insert({
        actor_id: actorId,
        action,
        target_resource: target,
        previous_state: oldState,
        new_state: newState,
        ip_address: ip
      });
      console.log(`[AUDIT] Action: ${action} by ${actorId} on ${target}`);
    } catch (e: any) {
      console.warn("[AUDIT] Failed to write audit log. Ensure migration 002 is run.", e.message);
    }
  }

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

  // Feature flags example / Bootup checks
  const isBeta = process.env.ENABLE_BETA_FEATURES === 'true';
  console.log(`[SYS] Booting in ${process.env.NODE_ENV || 'production'} environment. Beta features: ${isBeta}`);

  // Initialize Supabase lazily
  function getSupabase() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.");
    }
    // SECURITY FIX: Using service role key instead of anon key to enforce backend authority
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
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

      // Case-insensitive matching logic
      const normalize = (val: any, list: string[], fallback: string) => {
        if (!val || typeof val !== 'string') return fallback;
        const matched = list.find(l => l.toLowerCase() === val.trim().toLowerCase());
        return matched || fallback;
      };

      // Also support map for 'priority' key if LLM messed up the key name
      const incomingUrgency = ticket.urgency || ticket.priority || 'Medium';

      ticket.category = normalize(ticket.category, validCategories, 'General Question');
      ticket.urgency = normalize(incomingUrgency, validUrgencies, 'Medium');
      ticket.product_area = normalize(ticket.product_area, validProductAreas, 'Other');
      ticket.sentiment = normalize(ticket.sentiment, validSentiments, 'Confused');
      
      // Ensure summary exists
      if (!ticket.summary || typeof ticket.summary !== 'string') {
        ticket.summary = 'User inquiry regarding ' + ticket.category;
      }
      
      // Ensure is_complaint exists
      if (typeof ticket.is_complaint !== 'boolean') {
        ticket.is_complaint = ticket.category !== 'Praise' && ticket.category !== 'General Question';
      }
      
      // Ensure suggested_action exists
      if (!ticket.suggested_action || typeof ticket.suggested_action !== 'string') {
        ticket.suggested_action = 'Follow up with user';
      }

      return ticket;
    } catch (e) {
      return null;
    }
  }

  let cachedAdmins = new Set<string>();
  let lastAdminFetch = 0;

  async function checkIsAdmin(groupId: string, senderId?: any): Promise<boolean> {
    if (!senderId || !tlClient) return false;
    if (Date.now() - lastAdminFetch > 1000 * 60 * 60) {
       try {
         const { Api } = await import("telegram");
         const participants = await tlClient.invoke(
           new Api.channels.GetParticipants({
             channel: groupId,
             filter: new Api.ChannelParticipantsAdmins() as any,
             offset: 0,
             limit: 100,
             hash: 0 as any,
           })
         );
         cachedAdmins = new Set(participants.participants.map((p: any) => p.userId.toString()));
         lastAdminFetch = Date.now();
       } catch (e) {
         console.error("Failed to fetch admins:", e);
       }
    }
    return cachedAdmins.has(senderId.toString());
  }

  async function processAndIngestMessage(text: string, telegramId: number, groupId: string, replyToMsgId?: number, msgDate?: number, isAdmin?: boolean) {
    console.log("processAndIngestMessage START", "telegramId:", telegramId, "msgDate:", msgDate);
    if (!text || text.length < 5) {
       throw new Error("Message too short or empty");
    }
    const supabase = getSupabase();

    if (replyToMsgId) {
      if (isAdmin) {
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
      } else {
        console.log(`[User Reply] Ignoring user reply to message ${replyToMsgId}`);
        return null; // Skip processing non-admin replies as new tickets
      }
    }

    if (!openai) {
      throw new Error("GROQ_API_KEY is missing. Please add it to Secrets.");
    }

    // SECURITY FIX: Sanitize input to prevent prompt injection attacks
    function sanitizeForPrompt(input: string): string {
      if (typeof input !== 'string') return '';
      const truncated = input.slice(0, 2000);
      const injectionPatterns = [
        /ignore (all |previous |above )?instructions/gi,
        /you are now/gi,
        /system prompt/gi,
        /disregard/gi,
      ];
      let sanitized = truncated;
      for (const pattern of injectionPatterns) {
        sanitized = sanitized.replace(pattern, '[REDACTED]');
      }
      return sanitized;
    }
    
    // Call Groq API with an alternative model with higher limits!
    const response = await openai.chat.completions.create({
      model: "llama-3.1-8b-instant", 
      messages: [
        { role: "system", content: `You are a ticket classifier. Respond ONLY with a raw JSON object matching this schema. Never put markdown ticks around the JSON. Never output conversational text. Schema: ${JSON.stringify(responseSchema.json_schema.schema, null, 2)}` },
        { role: "user", content: sanitizeForPrompt(text) }
      ],
      response_format: { type: "json_object" }
    });

    const jsonStr = response.choices[0]?.message?.content?.trim() || "{}";
    const ticketData = validateTicketSchema(jsonStr);

    if (!ticketData) {
      throw new Error("Failed to parse classification output");
    }

    const senderHash = crypto.createHash('sha256').update(telegramId.toString()).digest('hex');
    const msgDateISO = msgDate ? new Date(msgDate * 1000).toISOString() : new Date().toISOString();

    // 1. Insert the raw message into the messages table
    const { data: dbMessage, error: msgError } = await supabase
      .from('messages')
      .insert({
        telegram_message_id: telegramId,
        group_id: groupId,
        sender_hash: senderHash,
        raw_text: text,
        message_timestamp: msgDateISO
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

    // Auto-escalation state
    const needsEscalation = ticketData.urgency === 'Critical' || ticketData.urgency === 'High';
    const initialStatus = needsEscalation ? 'In Review' : 'Open';
    const initialSummary = needsEscalation ? `[ESCALATED] ${ticketData.summary}` : ticketData.summary;

    // 2. Insert the classified ticket
    const { data: dbTicket, error: ticketError } = await supabase
      .from('tickets')
      .insert({
        message_id: dbMessage.id,
        group_id: groupId,
        summary: initialSummary,
        category: ticketData.category,
        urgency: ticketData.urgency,
        product_area: ticketData.product_area,
        sentiment: ticketData.sentiment,
        is_complaint: ticketData.is_complaint,
        suggested_action: ticketData.suggested_action,
        status: initialStatus,
        raw_text: text,
        created_at: msgDateISO
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
        
        // --- AUTO-FETCH (CRON) FOR MISSED MESSAGES ---
        // Fetch recent messages every 15 minutes to ensure nothing is missed
        // in case the live listener drops or disconnects.
        const runAutoFetch = async () => {
          try {
            console.log(`[Auto-Fetch] Running periodic check for missed messages in ${targetGroup}...`);
            const messages = await client.getMessages(targetGroup, { limit: 20 });
            
            // Only process valid messages from the last 1-2 hours
            const cutoffDate = Math.floor(Date.now() / 1000) - (2 * 60 * 60); 
            
            for (const msg of messages) {
              if (!msg || !msg.text) continue;
              if (msg.date < cutoffDate) continue;
              
              const text = String(msg.text);
              const words = text.trim().split(/\s+/);
              if (words.length < 5) continue;
              
              try {
                const id = msg.id || Math.floor(Math.random() * 10000000);
                const replyToMsgId = msg.replyTo?.replyToMsgId || msg.replyToMsgId;
                const senderId = msg.senderId;
                const isAdmin = await checkIsAdmin(targetGroup, senderId);
                
                // processAndIngestMessage ignores duplicates already in the database
                await processAndIngestMessage(text, id, targetGroup, replyToMsgId, msg.date, isAdmin);
              } catch(e: any) {
                // Ignore errors from already processed messages or duplicates
              }
              // Delay for rate limiting (30 RPM = 2s)
              await new Promise(r => setTimeout(r, 2100));
            }
          } catch (autoErr) {
            console.error("[Auto-Fetch] Error during periodic check:", autoErr);
          }
        };

        // Run immediately on boot to catch missed messages while server was updating/restarting
        runAutoFetch();
        setInterval(runAutoFetch, 15 * 60 * 1000); // Every 15 minutes

        client.addEventHandler(async (event: any) => {
          const message = event.message;
          if (!message || !message.text) return;
          
          const text = message.text;
          const words = text.trim().split(/\s+/);
          if (words.length < 5) return; // Skip very short messages as per MVP spec
          
          try {
            const chat = await message.getChat();
            if (chat && (chat.username === targetGroup || chat.title?.includes(targetGroup) || chat.title?.toLowerCase().includes("quidax"))) {
              console.log(`[Telegram Listener] Received message in ${targetGroup}: ${text.substring(0, 50)}...`);
              const replyToMsgId = message.replyTo?.replyToMsgId || message.replyToMsgId;
              const senderId = message.senderId;
              const isAdmin = await checkIsAdmin(targetGroup, senderId);
              await processAndIngestMessage(text, message.id || Math.floor(Math.random() * 10000000), targetGroup, replyToMsgId, message.date, isAdmin);
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
      console.error('[ERROR]', req.path, e);
      return res.status(500).json({ error: 'An internal error occurred. Please try again.' });
    }
  });

  app.get("/api/tickets", requireAuth, async (req, res) => {
    // Prevent caching to guarantee fresh data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    try {
      const supabase = getSupabase();
      const user = (req as any).user;
      const groupId = req.query.group_id as string;
      
      let query = supabase.from('tickets').select('*').order('created_at', { ascending: false }).limit(200);
      
      // Tenant Isolation Enforcement at API layer
      if (user.role === 'support') {
        // Force the query to only look at their assigned tenant
        query = query.eq('group_id', user.tenantId);
      } else if (groupId) {
        query = query.eq('group_id', groupId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      res.json(data);
    } catch (e: any) {
      console.error('[ERROR]', req.path, e);
      return res.status(500).json({ error: 'An internal error occurred. Please try again.' });
    }
  });

  app.post("/api/tickets/:id/status", requireAuth, async (req, res) => {
    try {
      const supabase = getSupabase();
      const user = (req as any).user;
      const ticketId = req.params.id;
      const { status } = req.body;
      
      const VALID_STATUSES = ['Open', 'In Review', 'Resolved', 'Dismissed'];
      if (!status || !VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      
      // Fetch previous state for audit log and tenant check
      const { data: oldTicket, error: lookupError } = await supabase.from('tickets').select('*').eq('id', ticketId).single();
      if (lookupError) throw lookupError;
      
      // Enforce Tenant Boundaries for writes
      if (user.role !== 'super_admin' && oldTicket.group_id !== user.tenantId) {
        return res.status(403).json({ error: "Forbidden. Ticket belongs to another tenant." });
      }

      const { error: updateError } = await supabase.from('tickets').update({ status }).eq('id', ticketId);
      if (updateError) throw updateError;
      
      // Write audit log asynchronously
      logAuditAction(supabase, user.userId, 'UPDATE_TICKET_STATUS', `ticket:${ticketId}`, { status: oldTicket.status }, { status }, req.ip || 'unknown');

      res.json({ success: true });
    } catch (e: any) {
      console.error('[ERROR]', req.path, e);
      return res.status(500).json({ error: 'An internal error occurred. Please try again.' });
    }
  });

  app.post("/api/backfill", heavyLimiter, requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      }
      let limit = Number(req.body.limit) || 20;
      if (limit > 500) limit = 500; // Cap backfill limit to prevent resource exhaustion
      const days = Number(req.body.days) || 0; // if 0, ignore date filter
      const targetGroup = process.env.TELEGRAM_GROUP_USERNAME || "OfficialQuidaxCommunity";

      if (!tlClient) {
        return res.status(400).json({ error: "Telegram client not connected. Wait for connection or check credentials." });
      }

      console.log(`[Backfill] Fetching up to ${limit} messages from ${targetGroup}${days ? ` for the last ${days} days` : ''}...`);
      const messages = await tlClient.getMessages(targetGroup, { limit });
      
      const cutoffDate = days ? Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60) : 0;

      // Filter valid messages
      const validMessages = messages.filter((msg: any) => {
        if (!msg || !msg.text) return false;
        if (cutoffDate && msg.date < cutoffDate) return false;
         const words = String(msg.text).trim().split(/\s+/);
         if (words.length < 5) return false;
         return true;
      });

      // Respond immediately
      res.status(200).json({ 
        success: true, 
        message: `Backfill started in background... Processing up to ${validMessages.length} target messages out of ${messages.length} fetched.`,
        processed: validMessages.length, 
        skipped: messages.length - validMessages.length, 
        totalFetched: messages.length 
      });

      // Process in the background sequentially to respect APIs strict RPM limits
      (async () => {
         for (const msg of validMessages) {
            try {
               const id = msg.id || Math.floor(Math.random() * 10000000);
               const replyToMsgId = msg.replyTo?.replyToMsgId || msg.replyToMsgId;
               const senderId = msg.senderId;
               const isAdmin = await checkIsAdmin(targetGroup, senderId);
               const dbTicket = await processAndIngestMessage(String(msg.text).trim(), id, targetGroup, replyToMsgId, msg.date, isAdmin);
               
               // Optional filtering during Backfill
               if (dbTicket && req.body.minUrgency && req.body.minUrgency !== 'All') {
                  const urgencies = ['Low', 'Medium', 'High', 'Critical'];
                  const ticketUrgencyIdx = urgencies.indexOf(dbTicket.urgency);
                  const minUrgencyIdx = urgencies.indexOf(req.body.minUrgency);
                  if (ticketUrgencyIdx > -1 && ticketUrgencyIdx < minUrgencyIdx) {
                      const supabase = getSupabase();
                      await supabase.from('tickets').delete().eq('id', dbTicket.id);
                      console.log(`[Backfill] Dropped ticket ${dbTicket.id} because urgency ${dbTicket.urgency} < ${req.body.minUrgency}`);
                  }
               }
            } catch(e: any) {
               console.error(`[Backfill Background] Error on msg ${msg.id}:`, e.message || e);
            }
            // Delay between requests to stay under 30 Requests Per Minute (1 every 2s)
            await new Promise(r => setTimeout(r, 2100));
         }
         console.log(`[Backfill] Background processing of ${validMessages.length} messages finished.`);
      })();

    } catch (e: any) {
      console.error('[ERROR]', req.path, e);
      return res.status(500).json({ error: 'An internal error occurred. Please try again.' });
    }
  });

  // Endpoint to simulate a webhook for ingesting a new telegram message
  app.post("/api/ingest", (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(404).json({ error: 'Not found' });
    }
    next();
  }, heavyLimiter, requireAuth, async (req, res) => {
    try {
      const user = (req as any).user;
      if (user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: insufficient permissions' });
      }
      const { text, telegramId } = req.body;
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return res.status(400).json({ error: 'text field is required and must be a non-empty string' });
      }
      if (text.length > 4000) {
        return res.status(400).json({ error: 'text exceeds maximum allowed length' });
      }
      const tId = telegramId || Math.floor(Math.random() * 10000000);
      const groupId = "OfficialQuidaxCommunity";
      
      const dbTicket = await processAndIngestMessage(text, tId, groupId, undefined, undefined, false);
      res.status(200).json({ success: true, message: "Ingested", ticket: dbTicket });
    } catch (e: any) {
      console.error('[ERROR]', req.path, e);
      return res.status(500).json({ error: 'An internal error occurred. Please try again.' });
    }
  });

  // Catch-all for unhandled API routes to prevent Vite from returning index.html (SPA fallback)
  app.all("/api/*", (req, res) => {
    res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
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
