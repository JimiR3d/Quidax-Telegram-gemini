// bot-sender.ts
//
// Grouping precision tune (2026-07-08): a DURABLE, source-level stop for known
// bot accounts (the price bot, the welcome/moderation bot). Evidence — live
// ticket 27ea2751 ("Saylor", Community Chat/Low) — showed those bots'
// output (a CoinMarketCap ticker dump, the welcome template) attached as
// [ADMIN_REPLY] blocks because the bots are group admins and checkIsAdmin
// returns true for them. The content noise-guard (noise-prefilter.ts
// isNonThreadNoise) catches that specific output by WORDING; this module is the
// wording-independent backstop keyed on sender IDENTITY, so a bot never becomes a
// ticket and never attaches to a thread regardless of what it posts.
//
// Operator-maintained via two env vars (parsed once at startup, exactly like
// TELEGRAM_ADMIN_USER_IDS / TELEGRAM_ADMIN_USERNAMES): TELEGRAM_BOT_USER_IDS and
// TELEGRAM_BOT_USERNAMES, comma-separated. Ships DORMANT (empty by default) — the
// content guard is the working default, and the denylist is armed later with the
// real handles (which cannot be recovered offline: `messages` stores only a
// sender_hash, never a senderId/username — same constraint as ADMIN_SENDER_HASHES).
//
// Pure module, mirroring the admin-message-policy.ts / message-reconciliation.ts
// convention: parsing + the match decision live here (unit-testable with plain
// values); the DB-bound drop stays in processAndIngestMessage / checkIsAdmin.

// Parse a comma-separated env value into a trimmed, non-empty Set. Usernames are
// lower-cased with any leading @ stripped so matching is case- and @-insensitive
// (mirrors the TELEGRAM_ADMIN_USERNAMES handling in checkIsAdmin). IDs are kept
// verbatim (Telegram user ids are numeric strings; no case to normalise).
export function parseBotList(
  raw: string | undefined,
  { lowercase = false }: { lowercase?: boolean } = {},
): Set<string> {
  if (typeof raw !== "string") return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => {
        const trimmed = s.trim().replace(/^@/, "");
        return lowercase ? trimmed.toLowerCase() : trimmed;
      })
      .filter((s) => s.length > 0),
  );
}

export interface BotSenderConfig {
  // Denylisted Telegram user ids (verbatim string match).
  ids: Set<string>;
  // Denylisted @usernames, lower-cased and @-stripped.
  usernames: Set<string>;
}

// Build the config from the two env vars in one place.
export function buildBotSenderConfig(
  idsRaw: string | undefined,
  usernamesRaw: string | undefined,
): BotSenderConfig {
  return {
    ids: parseBotList(idsRaw),
    usernames: parseBotList(usernamesRaw, { lowercase: true }),
  };
}

// Is this sender a denylisted bot? True iff the sender id is in `ids` OR the
// (@-stripped, lower-cased) username is in `usernames`. An empty config always
// returns false, so a dormant denylist never drops anything. A missing
// senderId/username simply can't match — never throws.
export function isBotSender(
  senderId: unknown,
  senderUsername: unknown,
  cfg: BotSenderConfig,
): boolean {
  if (!cfg || (cfg.ids.size === 0 && cfg.usernames.size === 0)) return false;
  if (senderId != null && senderId !== "") {
    if (cfg.ids.has(String(senderId))) return true;
  }
  if (senderUsername != null && senderUsername !== "") {
    const u = String(senderUsername).trim().replace(/^@/, "").toLowerCase();
    if (u && cfg.usernames.has(u)) return true;
  }
  return false;
}
