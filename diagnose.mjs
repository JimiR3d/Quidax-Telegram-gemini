// Diagnostic script — run: node diagnose.mjs
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const SESSION_STRING = process.env.TELEGRAM_SESSION_STRING;
const API_ID        = parseInt(process.env.TELEGRAM_API_ID);
const API_HASH      = process.env.TELEGRAM_API_HASH;
const TARGET_GROUP  = process.env.TELEGRAM_GROUP_USERNAME || "OfficialQuidaxCommunity";
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

console.log("=".repeat(60));
console.log("PULSEDESK DIAGNOSTIC REPORT");
console.log("=".repeat(60));

// ── 1. Connect to Telegram ───────────────────────────────────────
console.log("\n[1] Connecting to Telegram...");
const client = new TelegramClient(new StringSession(SESSION_STRING), API_ID, API_HASH, {
  connectionRetries: 3,
});
await client.connect();
console.log("    ✅ Connected");

// ── 2. Fetch admins ──────────────────────────────────────────────
console.log("\n[2] Fetching channel admins...");
try {
  const { Api } = await import("telegram");
  const result = await client.invoke(
    new Api.channels.GetParticipants({
      channel: TARGET_GROUP,
      filter: new Api.ChannelParticipantsAdmins(),
      offset: 0,
      limit: 200,
      hash: BigInt(0),
    })
  );
  const participants = result.participants || [];
  const users = result.users || [];
  const userMap = new Map(users.map(u => [String(u.id), u]));
  console.log(`    Found ${participants.length} admins:\n`);
  for (const p of participants) {
    const u = userMap.get(String(p.userId)) || {};
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || "(no name)";
    const username = u.username ? `@${u.username}` : "(no username)";
    const isBot = u.bot ? " [BOT]" : "";
    console.log(`    • ID: ${p.userId} | ${name} | ${username}${isBot}`);
  }
  console.log("\n    ➡️  Add human admin IDs to TELEGRAM_ADMIN_USER_IDS in .env");
} catch (e) {
  console.log("    ❌ Could not fetch admins:", e.message);
}

// ── 3. Fetch recent Telegram messages and compare with DB ────────
console.log("\n[3] Comparing Telegram messages vs DB (last 200)...");
try {
  const telegramMsgs = await client.getMessages(TARGET_GROUP, { limit: 200 });
  const withText = telegramMsgs.filter(m => m.text && m.text.length >= 5);
  
  console.log(`    Telegram: ${telegramMsgs.length} messages fetched, ${withText.length} have text`);

  // Get the oldest and newest message timestamps
  const dates = withText.map(m => m.date).sort();
  const oldest = new Date(dates[0] * 1000).toISOString();
  const newest = new Date(dates[dates.length - 1] * 1000).toISOString();
  console.log(`    Date range: ${oldest} → ${newest}`);

  // Check which IDs are already in the messages table
  const telegramIds = withText.map(m => String(m.id));
  const { data: existingMsgs } = await supabase
    .from("messages")
    .select("telegram_message_id")
    .in("telegram_message_id", telegramIds);
  
  const existingIds = new Set((existingMsgs || []).map(m => m.telegram_message_id));
  const missing = withText.filter(m => !existingIds.has(String(m.id)));
  
  console.log(`    In DB: ${existingIds.size} / ${withText.length}`);
  console.log(`    MISSING from DB: ${missing.length} messages`);
  
  if (missing.length > 0) {
    console.log("\n    First 10 missing messages:");
    for (const m of missing.slice(0, 10)) {
      const d = new Date(m.date * 1000).toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
      console.log(`    • [${d}] ID:${m.id} — "${m.text.substring(0, 80)}"`);
    }
  }
} catch (e) {
  console.log("    ❌ Error:", e.message);
}

// ── 4. Check tickets table — what's the newest ticket? ──────────
console.log("\n[4] Checking tickets table...");
const { data: latest, error: latestErr } = await supabase
  .from("tickets")
  .select("id, created_at, raw_text, urgency, category, status")
  .order("created_at", { ascending: false })
  .limit(5);

if (latestErr) {
  console.log("    ❌ Error:", latestErr.message);
} else {
  console.log(`    Latest 5 tickets:`);
  for (const t of (latest || [])) {
    const d = new Date(t.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" });
    console.log(`    • [${d}] [${t.urgency}] [${t.category}] "${t.raw_text?.substring(0, 60)}..."`);
  }
}

// ── 5. Check total ticket count ──────────────────────────────────
const { count } = await supabase.from("tickets").select("*", { count: "exact", head: true });
const { count: todayCount } = await supabase
  .from("tickets")
  .select("*", { count: "exact", head: true })
  .gte("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString());
const { count: yesterdayCount } = await supabase
  .from("tickets")
  .select("*", { count: "exact", head: true })
  .gte("created_at", new Date(Date.now() - 48*3600*1000).toISOString())
  .lt("created_at", new Date(new Date().setHours(0,0,0,0)).toISOString());

console.log(`\n[5] Ticket counts:`);
console.log(`    Total: ${count}`);
console.log(`    Today: ${todayCount}`);
console.log(`    Yesterday: ${yesterdayCount}`);

await client.disconnect();
console.log("\n" + "=".repeat(60));
console.log("DIAGNOSTIC COMPLETE");
console.log("=".repeat(60));
