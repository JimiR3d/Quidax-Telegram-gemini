import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const nonEssential = ["General Question", "Praise", "Spam/Irrelevant"];
const filterString = `(${nonEssential.map(c => `"${c}"`).join(",")})`;

async function run() {
  const { data, error } = await supabase
    .from("tickets")
    .select("id, category")
    .not("category", "in", filterString);
    
  console.log("Error:", error);
  console.log("Data count:", data?.length);
  
  // Try array syntax
  const { data: d2, error: e2 } = await supabase
    .from("tickets")
    .select("id, category")
    .not("category", "in", `(${nonEssential.join(",")})`);
    
  console.log("Error 2:", e2);
  console.log("Data count 2:", d2?.length);
}
run();
