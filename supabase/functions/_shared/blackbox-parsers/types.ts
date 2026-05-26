// Shared shape every per-bot parser normalizes to. Anything bot-specific
// the parser doesn't know how to map falls through into `extras` so we
// never lose data — the composer can decide whether to surface it.

export interface NormalizedBotFields {
  // Identity
  symbol?: string | null;
  name?: string | null;
  mint?: string | null;

  // Market
  price_usd?: number | null;
  price_sol?: number | null;
  market_cap_usd?: number | null;
  fdv_usd?: number | null;
  liquidity_usd?: number | null;
  volume_24h_usd?: number | null;
  volume_1h_usd?: number | null;
  price_change_5m_pct?: number | null;
  price_change_1h_pct?: number | null;
  price_change_24h_pct?: number | null;

  // Safety / tax
  buy_tax_pct?: number | null;
  sell_tax_pct?: number | null;
  lp_locked_pct?: number | null;
  lp_burned?: boolean | null;
  mint_authority_revoked?: boolean | null;
  freeze_authority_revoked?: boolean | null;

  // Distribution
  holders?: number | null;
  top10_holders_pct?: number | null;
  dev_holdings_pct?: number | null;
  insiders_pct?: number | null;
  snipers_pct?: number | null;
  bundlers_pct?: number | null;

  // Age
  age_text?: string | null;
  age_minutes?: number | null;

  // ATH + freshness
  ath_usd?: number | null;
  ath_drawdown_pct?: number | null;
  ath_age_text?: string | null;
  fresh_wallets_pct?: number | null;
  dev_sold?: boolean | null;

  // Socials / links
  twitter_url?: string | null;
  telegram_url?: string | null;
  website_url?: string | null;

  // Anything we don't have a slot for
  extras?: Record<string, string>;
}

export interface BotParser {
  /** Lowercase Telegram username this parser handles (without @). */
  matches(usernameLower: string | null): boolean;
  /** Human display name for this bot. */
  displayName: string;
  /** Parse a single raw Telegram message body. */
  parse(rawText: string): NormalizedBotFields;
}

/** Helper: parse "$1.2M", "120k", "$717", etc. */
export function parseMoney(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).replace(/[, ]/g, '').match(/\$?([\d.]+)\s*([kKmMbB])?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return null;
  const suf = (m[2] || '').toLowerCase();
  return num * (suf === 'k' ? 1e3 : suf === 'm' ? 1e6 : suf === 'b' ? 1e9 : 1);
}

/** Helper: parse "5.2%" → 5.2 */
export function parsePct(s: string | null | undefined): number | null {
  if (!s) return null;
  const m = String(s).match(/(-?[\d.]+)\s*%/);
  return m ? parseFloat(m[1]) : null;
}

/** Helper: parse "3h", "45m", "2d" → minutes */
export function parseAgeMinutes(s: string | null | undefined): number | null {
  if (!s) return null;
  const parts = String(s).match(/(\d+)\s*([dhm])/gi);
  if (!parts) return null;
  let mins = 0;
  for (const p of parts) {
    const m = p.match(/(\d+)\s*([dhm])/i);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    const u = m[2].toLowerCase();
    mins += n * (u === 'd' ? 1440 : u === 'h' ? 60 : 1);
  }
  return mins || null;
}