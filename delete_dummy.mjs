import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  console.log("Deleting dummy tickets...");
  const { data, error } = await supabase
    .from("tickets")
    .delete()
    .eq("summary", "Processing missing message...");
    
  console.log("Deleted processing messages:", { data, error });
  
  const { data: d2, error: e2 } = await supabase
    .from("tickets")
    .delete()
    .eq("category", "Uncategorized");
    
  console.log("Deleted uncategorized messages:", { data: d2, error: e2 });
}

run();
