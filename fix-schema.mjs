// Use Supabase admin auth.admin.* pathway or raw fetch to the pg REST proxy
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "public" },
  auth: { persistSession: false },
});

// Supabase JS client v2 actually exposes supabase.schema() which can run DDL
// via the pg-rest-style — let's try the internal query path
// Actually the proper way is via the /query REST endpoint of the DB API

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase exposes DB directly at /rest/v1/ but for DDL we need the
// pg-proxy endpoint — let's use the actual db REST proxy
const queries = [
  "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sender_hash TEXT",
  "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS is_admin_message BOOLEAN NOT NULL DEFAULT false",
  "ALTER TABLE tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
];

for (const sql of queries) {
  console.log(`Running: ${sql}`);
  
  // Try via Supabase's internal SQL execution endpoint
  const res = await fetch(`${url}/pg/query`, {
    method: "POST",
    headers: {
      "apikey": key,
      "Authorization": `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  
  console.log(`  /pg/query: ${res.status} — ${(await res.text()).substring(0, 100)}`);
}

// Check if it worked
const { data, error } = await supabase.from("tickets").select("*").limit(0);
if (error) {
  console.log("\n❌ Still an issue:", error.message);
} else {
  // Test insert with the new columns
  const { error: insertErr } = await supabase.from("tickets").insert({
    telegram_message_id: "TEST_SCHEMA_CHECK_XYZ",
    group_id: "test",
    raw_text: "schema check",
    category: "General Question",
    urgency: "Low",
    product_area: "Other",
    sentiment: "Neutral",
    is_complaint: false,
    suggested_action: "check",
    summary: "schema check",
    status: "Open",
    sender_hash: "testhash",
    is_admin_message: false,
  });
  
  if (insertErr) {
    console.log("\n❌ Insert still failing:", insertErr.message);
    console.log("\nThe Supabase schema cache may need a refresh — try calling /rest/v1/ with Prefer: return=representation");
  } else {
    console.log("\n✅ Schema fixed! Columns added successfully.");
    await supabase.from("tickets").delete().eq("telegram_message_id", "TEST_SCHEMA_CHECK_XYZ");
  }
}
