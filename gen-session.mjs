// Run this with: node gen-session.mjs
// It will prompt for your phone number and Telegram code, then print the new session string.

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import * as readline from "readline";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

const API_ID   = 38028112;
const API_HASH = "e1d006d5ee3d5d12289b612956009713";

console.log("\n🔑  Telegram Session Generator\n");

const client = new TelegramClient(new StringSession(""), API_ID, API_HASH, {
  connectionRetries: 5,
});

await client.start({
  phoneNumber: async () => {
    const num = await ask("📱 Phone number (e.g. +2348173638683): ");
    return num.trim();
  },
  password: async () => {
    const pw = await ask("🔐 2FA password (press Enter if none): ");
    return pw.trim();
  },
  phoneCode: async () => {
    const code = await ask("📨 Enter the code Telegram sent you: ");
    return code.trim();
  },
  onError: (err) => console.error("Error:", err.message),
});

const newSession = client.session.save();

console.log("\n\n✅ SUCCESS! Copy the line below into your .env as TELEGRAM_SESSION_STRING=\n");
console.log(newSession);
console.log("\n");

rl.close();
await client.disconnect();
process.exit(0);
