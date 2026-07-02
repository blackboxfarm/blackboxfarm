import { BotParser, NormalizedBotFields, ParseContext, parseMoney, parsePct, parseAgeMinutes, pickTwitterUrl, pickTelegramUrl, pickWebsiteUrl } from './types.ts';

// Trojan typical layout:
//   $SYMBOL — Name
//   CA: <mint>
//   Price: $0.000123 (+12.3%)
//   MC: $345K · FDV: $1.2M
//   Liq: $48K · Vol 1h: $120K
//   Top 10: 18% · Holders: 423
//   Tax B/S: 0/0
//   LP burned · Mint revoked · Freeze revoked

const USERNAMES = new Set(['solana_trojanbot', 'trojan_bot', 'odysseus_trojanbot', 'trojanonsolana_bot']);

export const trojan: BotParser = {
  displayName: 'Trojan',
  matches(u) {
    if (!u) return false;
    return USERNAMES.has(u) || /trojan/.test(u);
  },
  parse(text: string, ctx?: ParseContext): NormalizedBotFields {
    const out: NormalizedBotFields = {};
    const symMatch = text.match(/\$([A-Z0-9]{2,15})\b/);
    if (symMatch) out.symbol = symMatch[1];
    const mcap = text.match(/(?:MC|Market\s*Cap)[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (mcap) out.market_cap_usd = parseMoney(mcap[1]);
    const fdv = text.match(/FDV[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (fdv) out.fdv_usd = parseMoney(fdv[1]);
    const liq = text.match(/Liq(?:uidity)?[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (liq) out.liquidity_usd = parseMoney(liq[1]);
    const v1h = text.match(/Vol(?:ume)?\s*1h[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (v1h) out.volume_1h_usd = parseMoney(v1h[1]);
    const v24 = text.match(/Vol(?:ume)?\s*24h[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (v24) out.volume_24h_usd = parseMoney(v24[1]);
    const price = text.match(/Price[:\s]*\$?([\d.]+)/i);
    if (price) out.price_usd = parseFloat(price[1]);
    const top10 = text.match(/Top\s*10[:\s]*([\d.]+\s*%)/i);
    if (top10) out.top10_holders_pct = parsePct(top10[1]);
    const holders = text.match(/Holders[:\s]*([\d,]+)/i);
    if (holders) out.holders = parseInt(holders[1].replace(/,/g, ''), 10);
    const tax = text.match(/Tax[^:]*[:\s]*(\d+)\s*\/\s*(\d+)/i);
    if (tax) { out.buy_tax_pct = parseInt(tax[1], 10); out.sell_tax_pct = parseInt(tax[2], 10); }
    out.lp_burned = /LP\s*burned/i.test(text) ? true : null;
    out.mint_authority_revoked = /mint\s*(?:revoked|renounced|disabled)/i.test(text) ? true : null;
    out.freeze_authority_revoked = /freeze\s*(?:revoked|renounced|disabled)/i.test(text) ? true : null;
    const age = text.match(/(?:Age|Created)[:\s]*([\d.]+\s*[dhm](?:\s*[\d.]+\s*[dhm])*)/i);
    if (age) { out.age_text = age[1]; out.age_minutes = parseAgeMinutes(age[1]); }
    // Hidden hyperlinks (Trojan hides x/t.me/website behind glyphs)
    out.twitter_url = pickTwitterUrl(ctx?.linkUrls);
    out.telegram_url = pickTelegramUrl(ctx?.linkUrls);
    out.website_url = pickWebsiteUrl(ctx?.linkUrls);
    return out;
  },
};