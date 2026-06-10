import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testInsert() {
  const ticketInsert = {
      message_id: 111111, // dummy
      group_id: "test",
      summary: "Processing message...",
      category: "Other",
      urgency: "Low",
      product_area: "Other",
      sentiment: "Neutral",
      is_complaint: false,
      suggested_action: "Pending classification...",
      status: "Classifying",
      raw_text: "test",
      created_at: new Date().toISOString(),
      is_admin_message: false,
      sender_hash: "1234567890123456",
    };

    const { data: dbTicket, error: ticketError } = await supabase
      .from("tickets")
      .insert(ticketInsert)
      .select("*")
      .single();

    console.log("Error:", ticketError);
}

testInsert();
