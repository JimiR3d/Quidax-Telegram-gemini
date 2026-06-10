import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nonEssStr = ["General Question", "Praise", "Spam/Irrelevant"].map(c => `"${c}"`).join(",");
const nonEssStrNoQuotes = ["General Question", "Praise", "Spam/Irrelevant"].join(",");

async function run() {
  const q1 = supabase.from("tickets").select("id").or(`summary.eq."Processing message...",and(urgency.neq.Low,category.not.in.(${nonEssStr}))`);
  const res1 = await q1;
  console.log("With quotes error:", res1.error);
  console.log("With quotes data length:", res1.data?.length);

  const q2 = supabase.from("tickets").select("id").or(`summary.eq."Processing message...",and(urgency.neq.Low,category.not.in.(${nonEssStrNoQuotes}))`);
  const res2 = await q2;
  console.log("Without quotes error:", res2.error);
  console.log("Without quotes data length:", res2.data?.length);
}
run();
