/**
 * Hosts that are NOT a token's own website — they're trading aggregators,
 * block explorers, social platforms, or other tooling. Surfaced in the
 * Master Token Directory cells so junk like "$BADANI website = axiom.trade"
 * doesn't pollute the UI. We do NOT delete underlying mesh rows; we just
 * filter them at render time.
 */
export const NON_TOKEN_HOSTS = new Set<string>([
  'axiom.trade',
  'photon-sol.tinyastro.io',
  'photon.trade',
  'gmgn.ai',
  'bullx.io',
  'bullx.neo',
  'jup.ag',
  'birdeye.so',
  'dexscreener.com',
  'dextools.io',
  'pump.fun',
  'pumpfun.com',
  'raydium.io',
  'solscan.io',
  'solana.fm',
  'solanafloor.com',
  't.me',
  'telegram.me',
  'telegram.org',
  'x.com',
  'twitter.com',
  'discord.gg',
  'discord.com',
  'tiktok.com',
  'youtube.com',
]);

export function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export function isNonTokenHost(urlOrHost: string): boolean {
  const host = urlOrHost.includes('://') || urlOrHost.includes('.') === false
    ? hostFromUrl(urlOrHost)
    : urlOrHost.toLowerCase().replace(/^www\./, '');
  if (!host) return false;
  return NON_TOKEN_HOSTS.has(host);
}