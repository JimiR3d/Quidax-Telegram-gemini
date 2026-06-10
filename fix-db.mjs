// Run: node fix-db.mjs
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://dovgochitqpuvmneqeqz.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRvdmdvY2hpdHFwdXZtbmVxZXF6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODY1NzU4NCwiZXhwIjoyMDk0MjMzNTg0fQ.0oKinHtJq6YuoU5W_L4JQ5PJM_pYYRfAppNAlxw4cK0"
);

console.log("🔍 Checking messages table schema...");

// 1. List current columns
const { data: cols, error: colErr } = await supabase
  .from("messages")
  .select("*")
  .limit(1);

if (colErr) {
  console.log("messages table error:", colErr.message);
} else {
  console.log("messages table exists. Sample columns:", cols?.length ? Object.keys(cols[0]) : "empty table");
}

// 2. Try inserting a test row to see what columns are needed
const testInsert = await supabase.from("messages").insert({
  telegram_message_id: -999999999,
  group_id: "test",
  text: "test",
  sender_id: "test",
  is_admin: false,
  created_at: new Date().toISOString(),
}).select();

if (testInsert.error) {
  console.log("❌ Insert error:", testInsert.error.message);
  console.log("   Code:", testInsert.error.code);
  console.log("   Details:", testInsert.error.details);
} else {
  console.log("✅ Test insert succeeded:", testInsert.data);
  // Clean up test row
  await supabase.from("messages").delete().eq("telegram_message_id", -999999999);
  console.log("🧹 Test row cleaned up");
}

// 3. Run the migration via SQL function if available
const { data: migData, error: migErr } = await supabase.rpc("exec_sql", {
  sql_query: "ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();"
});

if (migErr) {
  console.log("⚠️  exec_sql RPC not available:", migErr.message);
  console.log("   → You need to run this SQL manually in Supabase dashboard:");
  console.log("   ALTER TABLE messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();");
} else {
  console.log("✅ Migration applied:", migData);
}
