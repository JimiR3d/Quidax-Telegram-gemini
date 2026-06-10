import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
  const { data, error } = await supabase.from("tickets").select("category, status");
  if (error) {
    console.error(error);
    return;
  }
  const cats = {};
  const stats = {};
  data.forEach(t => {
    cats[t.category] = (cats[t.category] || 0) + 1;
    stats[t.status] = (stats[t.status] || 0) + 1;
  });
  console.log("Categories:", cats);
  console.log("Statuses:", stats);
}

run();
