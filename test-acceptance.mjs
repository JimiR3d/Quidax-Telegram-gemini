// Acceptance tests — shouldProcessMessage & buildTelegramDeepLink
const ISSUE_SIGNALS = [
  /\b(stuck|pending|fail|error|problem|issue|help|urgent|cannot|can't|won't|didn't|doesn't|broken|not working|missing|lost|wrong|blocked|gone|disappeared|reversed)\b/i,
  /\b(withdraw|deposit|transfer|send|receive|kyc|verify|login|password|account|fund|balance|trade|swap|exchange|buy|sell)\b/i,
  /\b(how|why|when|what|where)\b/i,
  /\b(days?|hours?|minutes?|weeks?)\b/i,
  /\b(hacked|hack|scam|stolen|phishing|unauthorized|compromised|breach|fraud)\b/i,
  /[\u20a6]|\b(BVN|NIN|NGN|TRC20|BEP20|ERC20|USDT|USDC|BTC|ETH|XRP|QDX)\b/i,
  /\b[A-Z0-9]{6,}\b/,
  /\b[A-Z]{3,}\b/,
];
const CHATTER_PATTERNS = [
  /^(gm|gn|gg|lol|lmao|haha|ok|okay|yes|no|sure|cool|wow|nice|great|thanks|thx|ty|np|brb|afk|omg|wtf|wagmi|ngmi|lfg|ser|fren|moon|wen|gm+)\b/i,
];

function shouldProcessMessage(text, learnedKeywords = new Set()) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const words = trimmed.split(/\s+/);

  // Check issue signals FIRST
  for (const signal of ISSUE_SIGNALS) {
    if (signal.test(trimmed)) return true;
  }

  const lower = trimmed.toLowerCase();
  for (const kw of learnedKeywords) {
    if (lower.includes(kw)) return true;
  }

  for (const chatter of CHATTER_PATTERNS) {
    if (chatter.test(trimmed) && words.length <= 6) return false;
  }

  if (trimmed.length < 4) return false;
  return words.length >= 8;
}

function buildTelegramDeepLink(groupUsername, messageId) {
  const cleanGroup = groupUsername.replace(/^@/, '');
  if (cleanGroup.startsWith('-100')) {
    const cleanId = cleanGroup.slice(4);
    return `https://t.me/c/${cleanId}/${messageId}`;
  }
  return `https://t.me/${cleanGroup}/${messageId}`;
}

const cases = [
  ["shouldProcessMessage('HACKED') → true",                        () => shouldProcessMessage('HACKED'),                   true],
  ["shouldProcessMessage('gm fren') → false",                      () => shouldProcessMessage('gm fren'),                  false],
  ["shouldProcessMessage('funds gone') → true",                    () => shouldProcessMessage('funds gone'),                true],
  ["shouldProcessMessage('stuck 2 days no response') → true",      () => shouldProcessMessage('stuck 2 days no response'), true],
  ["shouldProcessMessage('wagmi to the moon 🚀') → false",         () => shouldProcessMessage('wagmi to the moon \uD83D\uDE80'),       false],
  ["shouldProcessMessage('BVN verification failed') → true",       () => shouldProcessMessage('BVN verification failed'),  true],
  ["buildTelegramDeepLink('OfficialQuidaxCommunity', 45231)",       () => buildTelegramDeepLink('OfficialQuidaxCommunity', 45231), 'https://t.me/OfficialQuidaxCommunity/45231'],
  ["buildTelegramDeepLink('-1001234567890', 45231)",                () => buildTelegramDeepLink('-1001234567890', 45231),   'https://t.me/c/1234567890/45231'],
];

let pass = 0, fail = 0;
for (const [label, fn, expected] of cases) {
  const result = fn();
  const ok = result === expected;
  console.log(`${ok ? '✅' : '❌'} ${label}`);
  if (!ok) console.log(`   got: ${result}  expected: ${expected}`);
  ok ? pass++ : fail++;
}
console.log(`\n${pass}/${cases.length} tests passed`);
if (fail > 0) process.exit(1);
