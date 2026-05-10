// Mirror of src/lib/non-token-domains.ts for edge functions.
// Used to discard aggregator/explorer/social hosts when capturing a token's
// "official" website from Launchpad or DexScreener-Paid sources.
export const NON_TOKEN_HOSTS = new Set<string>([
  'axiom.trade','photon-sol.tinyastro.io','photon.trade','gmgn.ai','bullx.io','bullx.neo',
  'jup.ag','birdeye.so','dexscreener.com','dextools.io','pump.fun','pumpfun.com',
  'raydium.io','solscan.io','solana.fm','solanafloor.com','t.me','telegram.me',
  'telegram.org','x.com','twitter.com','discord.gg','discord.com','tiktok.com','youtube.com',
]);

export function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch { return null; }
}

export function isNonTokenHost(urlOrHost: string): boolean {
  const host = urlOrHost.includes('://') ? hostFromUrl(urlOrHost) : urlOrHost.toLowerCase().replace(/^www\./, '');
  if (!host) return false;
  return NON_TOKEN_HOSTS.has(host);
}

/** Returns normalized URL or null if junk/aggregator. */
export function normalizeTokenWebsite(raw: string | null | undefined): { url: string; host: string } | null {
  if (!raw) return null;
  const url = raw.trim();
  if (!url) return null;
  const host = hostFromUrl(url);
  if (!host) return null;
  if (NON_TOKEN_HOSTS.has(host)) return null;
  return { url, host };
}
