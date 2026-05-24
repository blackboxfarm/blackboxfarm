import { BotParser, NormalizedBotFields } from './types.ts';
import { trojan } from './trojan.ts';
import { gmgn } from './gmgn.ts';
import { bonkbot, photon, rickbot, maestro } from './generic.ts';

export type { NormalizedBotFields, BotParser } from './types.ts';

const REGISTRY: BotParser[] = [trojan, gmgn, bonkbot, photon, rickbot, maestro];

export function parseReply(username: string | null, text: string): {
  parser: string;
  fields: NormalizedBotFields;
} {
  const u = (username || '').toLowerCase().replace(/^@/, '');
  for (const p of REGISTRY) {
    if (p.matches(u)) {
      return { parser: p.displayName, fields: p.parse(text) };
    }
  }
  // Try every parser on unknown bots and keep the one with most fields
  let best = { parser: 'unknown', fields: {} as NormalizedBotFields, n: 0 };
  for (const p of REGISTRY) {
    const f = p.parse(text);
    const n = Object.values(f).filter((v) => v !== null && v !== undefined).length;
    if (n > best.n) best = { parser: `${p.displayName}?`, fields: f, n };
  }
  return { parser: best.parser, fields: best.fields };
}