/**
 * Classify a Solscan/Helius funder label into a KYC entity_type.
 *
 * Returns null if the label doesn't look like a KYC-attributable entity
 * (e.g. random program names, unlabeled wallets, MEV bots).
 *
 * KYC-positive entity_types we recognise:
 *   cex        — centralised exchange hot/cold wallet
 *   bridge     — cross-chain bridge (Wormhole, deBridge, Allbridge, Mayan, Portal)
 *   onramp     — fiat on-ramp (MoonPay, Transak, Ramp, Stripe, Coinbase Pay)
 *   aggregator — DEX/route aggregator with KYC attribution (Jupiter referral, Squads)
 *   mm_desk    — known market-maker desk (Wintermute, Jump, GSR, Amber)
 *   custodian  — institutional custodian (Fireblocks, BitGo, Anchorage)
 */

const CEX_KEYWORDS = [
  'binance', 'coinbase', 'okx', 'bybit', 'kraken', 'kucoin', 'huobi', 'htx',
  'gate.io', 'gateio', 'ftx', 'gemini', 'bitfinex', 'crypto.com', 'mexc',
  'bitget', 'bitstamp', 'upbit', 'bithumb', 'whitebit', 'lbank',
];

const BRIDGE_KEYWORDS = [
  'wormhole', 'debridge', 'allbridge', 'mayan', 'portal bridge', 'portalbridge',
  'across', 'synapse', 'celer', 'multichain', 'router protocol', 'cctp',
  'circle bridge',
];

const ONRAMP_KEYWORDS = [
  'moonpay', 'transak', 'ramp network', 'rampnetwork', 'stripe',
  'coinbase pay', 'mercuryo', 'banxa', 'simplex', 'wyre',
];

const AGGREGATOR_KEYWORDS = [
  'jupiter', 'squads', 'jito', 'phoenix', 'meteora protocol',
];

const MM_DESK_KEYWORDS = [
  'wintermute', 'jump trading', 'jump crypto', 'gsr', 'amber group',
  'cumberland', 'flow traders', 'ldn capital', 'auros', 'flowdesk',
];

const CUSTODIAN_KEYWORDS = [
  'fireblocks', 'bitgo', 'anchorage', 'copper', 'hex trust',
];

function matchKeyword(lower: string, list: string[]): string | null {
  return list.find(k => lower.includes(k)) ?? null;
}

function titleCaseLabel(raw: string): string {
  // "Binance Hot Wallet 7" → keep human label; "binance" → "Binance"
  if (raw.length > 3 && raw[0] === raw[0].toUpperCase()) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export interface ClassifiedEntity {
  /** Canonical short name, e.g. "Binance", "Wormhole", "MoonPay" */
  name: string;
  /** entity_type for known_cex_wallets / developer_profiles */
  type: 'cex' | 'bridge' | 'onramp' | 'aggregator' | 'mm_desk' | 'custodian';
}

/**
 * Attempt to classify a funder label string. Returns null if no match.
 * Order: cex → bridge → onramp → custodian → mm_desk → aggregator
 * (CEX wins ties because it's the most KYC-confident outcome.)
 */
export function classifyEntityFromLabel(label: string | null | undefined): ClassifiedEntity | null {
  if (!label) return null;
  const lower = label.toLowerCase().trim();
  if (!lower) return null;

  let hit = matchKeyword(lower, CEX_KEYWORDS);
  if (hit) {
    if (hit === 'gate.io' || hit === 'gateio') return { name: 'Gate.io', type: 'cex' };
    if (hit === 'crypto.com') return { name: 'Crypto.com', type: 'cex' };
    if (hit === 'htx' || hit === 'huobi') return { name: 'HTX', type: 'cex' };
    return { name: titleCaseLabel(hit), type: 'cex' };
  }

  hit = matchKeyword(lower, BRIDGE_KEYWORDS);
  if (hit) {
    if (hit.includes('wormhole') || hit.includes('portal')) return { name: 'Wormhole', type: 'bridge' };
    if (hit.includes('debridge')) return { name: 'deBridge', type: 'bridge' };
    if (hit.includes('allbridge')) return { name: 'Allbridge', type: 'bridge' };
    if (hit.includes('mayan')) return { name: 'Mayan', type: 'bridge' };
    if (hit === 'cctp' || hit.includes('circle')) return { name: 'Circle CCTP', type: 'bridge' };
    return { name: titleCaseLabel(hit), type: 'bridge' };
  }

  hit = matchKeyword(lower, ONRAMP_KEYWORDS);
  if (hit) {
    if (hit.includes('coinbase pay')) return { name: 'Coinbase Pay', type: 'onramp' };
    if (hit === 'moonpay') return { name: 'MoonPay', type: 'onramp' };
    if (hit === 'transak') return { name: 'Transak', type: 'onramp' };
    if (hit.includes('ramp')) return { name: 'Ramp Network', type: 'onramp' };
    return { name: titleCaseLabel(hit), type: 'onramp' };
  }

  hit = matchKeyword(lower, CUSTODIAN_KEYWORDS);
  if (hit) return { name: titleCaseLabel(hit), type: 'custodian' };

  hit = matchKeyword(lower, MM_DESK_KEYWORDS);
  if (hit) return { name: titleCaseLabel(hit), type: 'mm_desk' };

  hit = matchKeyword(lower, AGGREGATOR_KEYWORDS);
  if (hit) return { name: titleCaseLabel(hit), type: 'aggregator' };

  return null;
}

/** Convenience: just the entity_type, or null. */
export function entityTypeFromLabel(label: string | null | undefined): string | null {
  return classifyEntityFromLabel(label)?.type ?? null;
}