import { BotParser, NormalizedBotFields, parseMoney, parsePct, parseAgeMinutes } from './types.ts';

// GMGN typical layout includes emoji-prefixed lines:
//   🪙 $SYMBOL · Name
//   💰 MC $345K · Liq $48K · Vol $120K
//   📊 5m +12% · 1h +45% · 24h +120%
//   👥 423 holders · Top10 18%
//   🛡️ B/S 0/0% · LP 100% burned
//   🚀 Snipers 4% · Insiders 2%

export const gmgn: BotParser = {
  displayName: 'GMGN',
  matches(u) { return !!u && /gmgn/.test(u); },
  parse(text: string): NormalizedBotFields {
    const out: NormalizedBotFields = {};
    const sym = text.match(/\$([A-Z0-9]{2,15})\b/);
    if (sym) out.symbol = sym[1];
    const mc = text.match(/MC[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (mc) out.market_cap_usd = parseMoney(mc[1]);
    const liq = text.match(/Liq[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (liq) out.liquidity_usd = parseMoney(liq[1]);
    const vol = text.match(/Vol[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
    if (vol) out.volume_24h_usd = parseMoney(vol[1]);
    const c5 = text.match(/5m\s*([+\-]?[\d.]+\s*%)/i);
    if (c5) out.price_change_5m_pct = parsePct(c5[1]);
    const c1 = text.match(/1h\s*([+\-]?[\d.]+\s*%)/i);
    if (c1) out.price_change_1h_pct = parsePct(c1[1]);
    const c24 = text.match(/24h\s*([+\-]?[\d.]+\s*%)/i);
    if (c24) out.price_change_24h_pct = parsePct(c24[1]);
    const h = text.match(/([\d,]+)\s*holders/i);
    if (h) out.holders = parseInt(h[1].replace(/,/g, ''), 10);
    const t10 = text.match(/Top\s*10[:\s]*([\d.]+\s*%)/i);
    if (t10) out.top10_holders_pct = parsePct(t10[1]);
    const tax = text.match(/B\/S\s*(\d+)\/(\d+)\s*%/i);
    if (tax) { out.buy_tax_pct = +tax[1]; out.sell_tax_pct = +tax[2]; }
    const lp = text.match(/LP\s*([\d.]+\s*%)\s*burned/i);
    if (lp) { out.lp_locked_pct = parsePct(lp[1]); out.lp_burned = true; }
    const sn = text.match(/Snipers?\s*([\d.]+\s*%)/i);
    if (sn) out.snipers_pct = parsePct(sn[1]);
    const ins = text.match(/Insiders?\s*([\d.]+\s*%)/i);
    if (ins) out.insiders_pct = parsePct(ins[1]);
    const age = text.match(/(?:Age|Created)[:\s]*([\d.]+\s*[dhm](?:\s*[\d.]+\s*[dhm])*)/i);
    if (age) { out.age_text = age[1]; out.age_minutes = parseAgeMinutes(age[1]); }
    return out;
  },
};