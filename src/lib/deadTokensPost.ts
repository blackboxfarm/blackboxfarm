import { sanitizeForTwitter, sanitizeTickerForTwitter } from './twitterSanitizer';

export interface DeadTokenPostInput {
  ticker: string;
  title: string;
  mintAddress: string;
  slug: string;
  verdict?: string | null;
  deathCause?: string | null;
  harmHeadline?: string | null;
  harmScore?: number | null;
  xHandle?: string | null; // e.g. "@GPT_SOLANA"
}

const VERDICT_BY_CAUSE: Record<string, string> = {
  coordinated_rug: 'TEXTBOOK COORDINATED RUG',
  atomic_snipe_rug: 'ATOMIC-SNIPE RUG',
  rug_pull: 'TEXTBOOK COORDINATED RUG',
  liquidity_pulled: 'LIQUIDITY PULLED — RUG CONFIRMED',
  honeypot: 'HONEYPOT — BUYS ONLY, NO EXITS',
  mint_authority_abuse: 'MINT-AUTHORITY ABUSE',
  soft_rug: 'SLOW-DRAIN SOFT RUG',
  slow_bleed_dump: 'SLOW-BLEED DUMP',
  wash_trade_exit: 'WASH-TRADE EXIT',
  dev_abandonment: 'DEV ABANDONED — BAGHOLDERS LEFT',
  mod_abandonment: 'MOD ABANDONMENT',
  abandoned: 'ABANDONED PROJECT',
  failed_launch: 'FAILED LAUNCH',
  hype_decay: 'HYPE DIED — ORGANIC FLATLINE',
  community_burnout: 'COMMUNITY BURNOUT',
  organic_death: "RAN ITS CYCLE — ORGANIC DEATH",
};

const HASHTAGS_BY_INTENT: Record<string, string[]> = {
  rug:        ['#Solana', '#RugPull', '#DeadTokens', '#OnChainForensics'],
  soft_rug:   ['#Solana', '#SoftRug', '#DeadTokens', '#WalletForensics'],
  abandoned:  ['#Solana', '#DeadTokens', '#DevAbandoned', '#Bagholders'],
  organic:    ['#Solana', '#DeadTokens', '#MemeCoinPostMortem'],
  default:    ['#Solana', '#DeadTokens', '#TokenAutopsy'],
};

function intentBucket(cause?: string | null): keyof typeof HASHTAGS_BY_INTENT {
  if (!cause) return 'default';
  if (['coordinated_rug', 'atomic_snipe_rug', 'rug_pull', 'liquidity_pulled', 'honeypot', 'mint_authority_abuse'].includes(cause)) return 'rug';
  if (['soft_rug', 'slow_bleed_dump', 'wash_trade_exit'].includes(cause)) return 'soft_rug';
  if (['dev_abandonment', 'mod_abandonment', 'abandoned', 'failed_launch'].includes(cause)) return 'abandoned';
  if (['hype_decay', 'community_burnout', 'organic_death'].includes(cause)) return 'organic';
  return 'default';
}

/** Strip leading "${TICKER} — " or similar from the title to leave just the descriptor. */
function extractTitleTag(title: string, ticker: string): string {
  const cleaned = title
    .replace(new RegExp(`^\\$?${ticker}\\s*[—\\-:]\\s*`, 'i'), '')
    .replace(/^["'"']|["'"']$/g, '')
    .trim();
  return cleaned || title;
}

export function buildDeadTokensPost(input: DeadTokenPostInput): string {
  const ticker = sanitizeTickerForTwitter(input.ticker);
  const titleTag = extractTitleTag(input.title, ticker);
  const verdictLine =
    (input.deathCause && VERDICT_BY_CAUSE[input.deathCause]) ||
    (input.verdict ? input.verdict.toUpperCase() : 'AUTOPSY COMPLETE');
  const harmLine = input.harmHeadline
    ? `🪦 ${input.harmHeadline}`
    : (typeof input.harmScore === 'number' ? `🪦 Harm Score ${input.harmScore}/100` : '🪦 Forensic post-mortem complete');
  const handleLine = input.xHandle ? `${input.xHandle}\n` : '';
  const url = `https://blackbox.farm/autopsy/${input.slug}`;
  const tags = HASHTAGS_BY_INTENT[intentBucket(input.deathCause)]
    .concat([`#${ticker}`])
    .concat(['@blackbox_farm'])
    .join(' ');

  const raw = [
    `☠️ DEADTOKEN : BlackBox Autopsy 🪦`,
    `🩸 $${ticker} '${titleTag}'`,
    input.mintAddress,
    handleLine.trim(),
    ``,
    `🪦 Death Archives 🪦 Did this Burn you?`,
    harmLine,
    `See the Players & Profits 💰, the Rug Mechanics, Timeline & Ruggers Wallet 💰 — all linked wallets.`,
    ``,
    `Verdict: ${verdictLine}`,
    `🔍 Discover all the Players & Snipers 👇`,
    `🪦 Read the FULL AUTOPSY REPORT! 🪦`,
    ``,
    `🌐 ${url}`,
    ``,
    `💬 On target or did we miss something? Got an insider tip or front-row view? WTF Happened? Comment 👉 ${url}#comments`,
    ``,
    tags,
  ].filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');

  return sanitizeForTwitter(raw);
}

export const DEAD_TOKENS_HANDLE = '@DeadTokens83517';
