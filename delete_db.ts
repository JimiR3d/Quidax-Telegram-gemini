import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const key = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(url, key);

async function run() {
  await supabase.from("tickets").delete().neq("id", 0);
  await supabase.from("messages").delete().neq("id", 0);
  console.log("DB cleared");
}
run();
