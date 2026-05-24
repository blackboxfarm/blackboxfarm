import { BotParser, NormalizedBotFields, parseMoney, parsePct, parseAgeMinutes } from './types.ts';

// Fallback parser used for BonkBot, Photon, RickBot, Maestro, and any other
// trader bot that shows up. They all expose roughly the same fields in
// roughly the same words, so one regex pass covers all of them. Anything
// not matched falls through cleanly — composer renders raw text.

function build(displayName: string, match: (u: string) => boolean): BotParser {
  return {
    displayName,
    matches(u) { return !!u && match(u); },
    parse(text: string): NormalizedBotFields {
      const out: NormalizedBotFields = {};
      const sym = text.match(/\$([A-Z0-9]{2,15})\b/);
      if (sym) out.symbol = sym[1];
      const mc = text.match(/(?:MC|Market\s*Cap|Cap)[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
      if (mc) out.market_cap_usd = parseMoney(mc[1]);
      const fdv = text.match(/FDV[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
      if (fdv) out.fdv_usd = parseMoney(fdv[1]);
      const liq = text.match(/Liq(?:uidity)?[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
      if (liq) out.liquidity_usd = parseMoney(liq[1]);
      const vol = text.match(/Vol(?:ume)?[^:]*[:\s]*\$?([\d.,]+\s*[kKmMbB]?)/i);
      if (vol) out.volume_24h_usd = parseMoney(vol[1]);
      const price = text.match(/Price[:\s]*\$?([\d.]+)/i);
      if (price) out.price_usd = parseFloat(price[1]);
      const holders = text.match(/(?:Holders|HODL)[:\s]*([\d,]+)/i);
      if (holders) out.holders = parseInt(holders[1].replace(/,/g, ''), 10);
      const top10 = text.match(/Top\s*10[:\s]*([\d.]+\s*%)/i);
      if (top10) out.top10_holders_pct = parsePct(top10[1]);
      const tax = text.match(/(?:Tax|B\/S)[^:\d]*(\d+)\s*\/\s*(\d+)/i);
      if (tax) { out.buy_tax_pct = +tax[1]; out.sell_tax_pct = +tax[2]; }
      const lpBurn = text.match(/LP\s*([\d.]+\s*%)?\s*burned/i);
      if (lpBurn) { out.lp_burned = true; if (lpBurn[1]) out.lp_locked_pct = parsePct(lpBurn[1]); }
      out.mint_authority_revoked = /mint\s*(?:revoked|renounced|disabled|✅)/i.test(text) ? true : null;
      out.freeze_authority_revoked = /freeze\s*(?:revoked|renounced|disabled|✅)/i.test(text) ? true : null;
      const dev = text.match(/Dev[^:]*[:\s]*([\d.]+\s*%)/i);
      if (dev) out.dev_holdings_pct = parsePct(dev[1]);
      const sn = text.match(/Snipers?\s*([\d.]+\s*%)/i);
      if (sn) out.snipers_pct = parsePct(sn[1]);
      const ins = text.match(/Insiders?\s*([\d.]+\s*%)/i);
      if (ins) out.insiders_pct = parsePct(ins[1]);
      const bun = text.match(/Bundl(?:e|er)s?\s*([\d.]+\s*%)/i);
      if (bun) out.bundlers_pct = parsePct(bun[1]);
      const age = text.match(/(?:Age|Created)[:\s]*([\d.]+\s*[dhm](?:\s*[\d.]+\s*[dhm])*)/i);
      if (age) { out.age_text = age[1]; out.age_minutes = parseAgeMinutes(age[1]); }
      return out;
    },
  };
}

export const bonkbot = build('BonkBot', (u) => /bonk.*bot|bonkbot/.test(u));
export const photon  = build('Photon',  (u) => /photon/.test(u));
export const rickbot = build('RickBot', (u) => /rick.*bot|rickbot/.test(u));
export const maestro = build('Maestro', (u) => /maestro/.test(u));
export const unknown = build('Unknown', (_u) => false); // explicit no-match; used as fallback