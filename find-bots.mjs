import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findBots() {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .limit(100);
  
  if (error) {
    console.error("Error:", error);
    return;
  }
  console.log("Messages snippet:", JSON.stringify(data, null, 2));
}

findBots();
