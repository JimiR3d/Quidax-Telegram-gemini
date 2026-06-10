import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkToday() {
  const { data: messages, count: msgCount } = await supabase
    .from("messages")
    .select("message_timestamp, raw_text", { count: "exact" })
    .order("message_timestamp", { ascending: false })
    .limit(5);

  const { data: tickets, count: ticketCount } = await supabase
    .from("tickets")
    .select("created_at, summary", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("Total messages:", msgCount);
  console.log("Recent messages:", JSON.stringify(messages, null, 2));
  
  console.log("\nTotal tickets:", ticketCount);
  console.log("Recent tickets:", JSON.stringify(tickets, null, 2));
}

checkToday();
