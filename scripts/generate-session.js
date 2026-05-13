const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const input = require("input");

// Replace these with your own API ID and Hash from my.telegram.org
const apiId = Number(process.env.TELEGRAM_API_ID) || 0; // e.g. 1234567
const apiHash = process.env.TELEGRAM_API_HASH || ""; // e.g. "0123456789abcdef0123456789abcdef"

const stringSession = new StringSession("");

(async () => {
  if (!apiId || !apiHash) {
    console.error("Please provide TELEGRAM_API_ID and TELEGRAM_API_HASH as environment variables or hardcode them in this script.");
    process.exit(1);
  }

  console.log("Loading interactive example...");
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });
  
  await client.start({
    phoneNumber: async () => await input.text("Please enter your phone number (with country code, e.g. +1234567890): "),
    password: async () => await input.text("Please enter your 2FA password (if you have one, otherwise just press enter): "),
    phoneCode: async () => await input.text("Please enter the code you received on Telegram: "),
    onError: (err) => console.log(err),
  });
  
  console.log("You should now be connected.");
  console.log("\n--- COPY THE STRING BELOW ---");
  console.log(client.session.save()); 
  console.log("-----------------------------\n");
  
  console.log("Save this string in your AI Studio Secrets as TELEGRAM_SESSION_STRING.");
  process.exit(0);
})();
