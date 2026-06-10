// Apply DB migration — adds missing columns to tickets table
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log("Applying DB migration...\n");

// Supabase JS client can't run raw DDL via .from() — use REST API with service role
const baseUrl = process.env.SUPABASE_URL;
const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function runSQL(sql) {
  const res = await fetch(`${baseUrl}/rest/v1/rpc/exec`, {
    method: "POST",
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

// Try via Supabase management API style — just do it via direct postgres connection check
// Since we can't run DDL via REST, let's use the Supabase admin endpoint
const migrations = [
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sender_hash TEXT;`,
  `ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_admin_message BOOLEAN NOT NULL DEFAULT false;`,
];

for (const sql of migrations) {
  console.log("Running:", sql.substring(0, 60) + "...");
  const result = await runSQL(sql);
  console.log(`  Status: ${result.status}, ok: ${result.ok}`);
  console.log(`  Response: ${result.body.substring(0, 100)}`);
  console.log();
}

// Now test a proper insert  
console.log("Testing insert with all columns...");
const { data, error } = await supabase.from("tickets").insert({
  telegram_message_id: "TEST_MIGRATION_CHECK",
  group_id: "test",
  raw_text: "migration test",
  category: "General Question",
  urgency: "Low",
  product_area: "Other",
  sentiment: "Neutral",
  is_complaint: false,
  suggested_action: "test",
  summary: "migration test",
  status: "Open",
  sender_hash: "test_hash",
  is_admin_message: false,
}).select("id");

if (error) {
  console.log("❌ Still failing:", error.message);
  console.log("\nThe column must be added manually in Supabase SQL Editor.");
  console.log("Go to: https://supabase.com/dashboard/project/dovgochitqpuvmneqeqz/editor");
  console.log("\nRun these SQL statements:");
  console.log("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sender_hash TEXT;");
  console.log("ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_admin_message BOOLEAN NOT NULL DEFAULT false;");
} else {
  console.log("✅ Migration successful! Cleaning up test row...");
  await supabase.from("tickets").delete().eq("telegram_message_id", "TEST_MIGRATION_CHECK");
  console.log("Done.");
}
