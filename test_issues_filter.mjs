import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const NON_ESSENTIAL_CATEGORIES = new Set([
    "General Question",
    "Praise",
    "Spam/Irrelevant",
  ]);

  const nonEssStr = Array.from(NON_ESSENTIAL_CATEGORIES).map(c => `"${c}"`).join(",");
  
  let q1 = supabase.from("tickets").select("id, summary, category, urgency").limit(5);
  let q2 = supabase.from("tickets").select("id, summary, category, urgency").limit(5);

  // How the current code does it (without quotes, no urgency filter):
  const oldNonEssStr = Array.from(NON_ESSENTIAL_CATEGORIES).join(",");
  q1 = q1.or(`summary.eq."Processing message...",category.not.in.(${oldNonEssStr})`);
  
  // New corrected string with quotes and urgency filter:
  q2 = q2.or(`summary.eq."Processing message...",and(category.not.in.(${nonEssStr}),urgency.neq.Low)`);

  const [res1, res2] = await Promise.all([q1, q2]);
  
  if (res1.error) console.error("Old query error:", res1.error);
  else console.log("Old query success, returned:", res1.data.length);
  
  if (res2.error) console.error("New query error:", res2.error);
  else console.log("New query success, returned:", res2.data.length);
}

test();
