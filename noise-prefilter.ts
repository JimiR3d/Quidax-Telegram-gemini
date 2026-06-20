// noise-prefilter.ts
//
// Heuristics for banter that should be routed to the noise lane
// (Dismissed-but-reversible) without calling the LLM.
//
// Contract (decision #3, 2026-06-19):
//   - NEVER drop a message — just signals isPreFiltered=true so the caller
//     skips the LLM and applies category=General Question / Dismissed.
//   - A FAILED classification must still stay Open + [NEEDS REVIEW]; this
//     module is only called BEFORE classification, so that path is untouched.
//   - Must never catch a real support issue. When in doubt, return false.
//
// Scope (locked 2026-06-20):
//   1a. Bare slash-command price/chart bot calls  e.g. /p BTC, /price zec
//   1b. Pasted news / external promo             long, third-person, no "?"
//       no first-person pronoun, no Quidax/account/transaction keyword
//   1c. User-to-user chatter — DEFERRED (false-positive risk too high)
//   1d. Automated price-bot ticker dump          machine market snapshot,
//       two+ of the distinctive "Price: $…", "Fully Diluted Market Cap",
//       "View on CoinMarketCap"… labels (added 2026-06-20 after a tokenxoff.xyz
//       shill came back through reconciliation as an Open ticket)

// 1a — bare price/chart bot command: /p BTC, /price eth, /c SOL, /chart xrp
// The whole trimmed text must be just the slash-command + an optional ticker.
// Anything else (a question, a sentence after it) falls through.
const PRICE_CMD_RE = /^\s*\/(?:p|price|c|chart)\s+[a-z0-9]{2,10}\s*$/i;

// 1b — pasted news / external promo
// All five conditions must hold simultaneously (conservative AND-gate):
const NEWS_MIN_WORDS = 25; // long-form text only

// Triggers: signals that a message IS a real support issue even if it looks
// like news — any one of these rules out 1b.
const NEWS_SUPPORT_KEYWORDS_RE =
  /\b(quidax|my\s+(?:account|wallet|balance|withdrawal|deposit|trade|order|kyc|funds?)|your\s+(?:platform|app|exchange|service)|i\s+(?:can't|cannot|couldn't|couldn't|lost|sent|tried|deposited|withdrew|bought|sold|transferred|verified|uploaded)|we\s+(?:can't|cannot)|please\s+(?:help|check|look|assist|fix|resolve)|kindly|abeg|help\s+me|my\s+money|my\s+crypto|my\s+coin)\b/i;

const FIRST_PERSON_RE = /\b(i|i'm|i've|i'll|i'd|my|me|we|we're|we've|our)\b/i;

// Checks for question marks (a question is never news)
const QUESTION_MARK_RE = /\?/;

// Third-person news signals: starts with a proper-noun subject + reporting
// verb (case-sensitive — "Iran to allow", "Apple has announced"), OR starts
// with a journalism keyword like "Breaking:" (case-insensitive).
const NEWS_PROPER_NOUN_RE =
  /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\s+(?:to|has|have|will|says?|said|reports?|reported|announces?|announced|reveals?|revealed|plans?|planned|allows?|allowed|bans?|banned|launches?|launched)/;
const NEWS_KEYWORD_RE =
  /^(?:breaking|report|update|alert|news|source)s?\s*[:\-]/i;

// 1d — automated price-bot ticker dump. These are machine-generated market
// snapshots ("Bitcoin X (tokenxoff.xyz)\nPrice: $… USD\n… Fully Diluted Market
// Cap … View on CoinMarketCap"), never a support issue. Require TWO of these
// distinctive labels so a human casually mentioning a price stays safe.
const PRICE_BOT_LABELS: RegExp[] = [
  /\bprice:\s*\$?\d/i,
  /\bfully diluted market cap\b/i,
  /\bview on coinmarketcap\b/i,
  /\b24\s?hr?\s+change\b/i,
  /\b7d\s+change\b/i,
  /\btotal supply\b/i,
  /\bmarket cap:\s*\$?\d/i,
];

export function isBanterNoise(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1a — bare price/chart bot command
  if (PRICE_CMD_RE.test(trimmed)) return true;

  // 1d — automated price-bot ticker dump (two+ machine market-data labels)
  if (PRICE_BOT_LABELS.filter((re) => re.test(trimmed)).length >= 2) return true;

  // 1b — pasted news / external promo
  const words = trimmed.split(/\s+/);
  if (
    words.length >= NEWS_MIN_WORDS &&
    !QUESTION_MARK_RE.test(trimmed) &&
    !FIRST_PERSON_RE.test(trimmed) &&
    !NEWS_SUPPORT_KEYWORDS_RE.test(trimmed) &&
    (NEWS_PROPER_NOUN_RE.test(trimmed) || NEWS_KEYWORD_RE.test(trimmed))
  ) {
    return true;
  }

  return false;
}
