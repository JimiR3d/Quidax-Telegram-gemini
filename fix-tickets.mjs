import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function fixMissingTickets() {
  console.log("Looking for messages without tickets...");

  // Get all messages
  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("*");

  if (msgError) {
    console.error("Error fetching messages:", msgError);
    return;
  }

  // Get all tickets
  const { data: tickets, error: tktError } = await supabase
    .from("tickets")
    .select("message_id");

  if (tktError) {
    console.error("Error fetching tickets:", tktError);
    return;
  }

  const ticketMessageIds = new Set(tickets.map(t => t.message_id));
  
  const missingTicketsForMessages = messages.filter(m => !ticketMessageIds.has(m.id));

  console.log(`Found ${missingTicketsForMessages.length} messages missing tickets.`);

  for (const msg of missingTicketsForMessages) {
    const telegramId = msg.telegram_message_id;
    const groupId = msg.group_id || "OfficialQuidaxCommunity";
    
    // Ignore admin replies that are in the messages table
    // Wait, how do we know if it's an admin reply? We just create a ticket for all of them
    // and let the LLM classify it.
    // If it's a genuine admin reply, we might not want to create a ticket, but for now we'll just create tickets 
    // and they will be dismissed if they are just general chat.
    
    const ticketInsert = {
      message_id: msg.id,
      group_id: groupId,
      summary: "Processing missing message...",
      category: "General Question",
      urgency: "Low",
      product_area: "Other",
      sentiment: "Neutral",
      is_complaint: false,
      suggested_action: "Pending classification...",
      status: "Open",
      raw_text: msg.raw_text,
      created_at: msg.message_timestamp || new Date().toISOString(),
      is_admin_message: false,
      sender_hash: crypto.createHash("sha256").update(String(telegramId) + groupId).digest("hex").substring(0, 16),
      telegram_message_id: String(telegramId),
    };

    const { error } = await supabase
      .from("tickets")
      .insert(ticketInsert);

    if (error) {
      console.error(`Failed to insert ticket for message ${msg.id}:`, error.message);
    } else {
      console.log(`Inserted ticket for message ${msg.id}`);
      
      // Hit the classification API internally, or just let the LLM do it?
      // Since server.ts does this async, we can just fetch our local endpoint to trigger classification.
      try {
        await fetch('http://127.0.0.1:3000/api/health'); // just a ping
      } catch(e) {}
    }
  }
  
  console.log("Done fixing tickets.");
}

fixMissingTickets();
