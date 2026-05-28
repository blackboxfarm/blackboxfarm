// Solscan Pro v2 - single-call "fund_by" resolver.
// Given a creator wallet (on-chain InitializeMint signer / Pump.fun PDA),
// returns the wallet that FUNDED it — i.e. the real dev_wallet.
// One HTTP call. If Solscan fails for any reason we return null and the
// caller decides what to do.

export interface SolscanFundByResult {
  funder: string | null;
  funderLabel: string | null;  // e.g. "Binance Hot Wallet" when Solscan tags it
  raw: any;
}

export async function fetchSolscanFundBy(
  wallet: string,
  apiErrors: string[] = [],
): Promise<SolscanFundByResult | null> {
  const apiKey = Deno.env.get('SOLSCAN_API_KEY');
  if (!apiKey) {
    apiErrors.push('SOLSCAN_API_KEY not configured');
    return null;
  }
  if (!wallet || wallet.length < 32) return null;

  try {
    const url = `https://pro-api.solscan.io/v2.0/account/detail?address=${wallet}`;
    const res = await fetch(url, {
      headers: { token: apiKey, accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      apiErrors.push(`Solscan account/detail ${res.status}`);
      return null;
    }
    const json = await res.json();
    const data = json?.data ?? json;
    const funder: string | null = data?.fund_by?.funded_by ?? data?.fund_by?.address ?? data?.fund_by ?? null;
    const funderLabel: string | null = data?.fund_by?.label ?? data?.account_label ?? null;
    return {
      funder: typeof funder === 'string' && funder.length >= 32 ? funder : null,
      funderLabel: typeof funderLabel === 'string' ? funderLabel : null,
      raw: data?.fund_by ?? null,
    };
  } catch (e) {
    apiErrors.push(`Solscan fund_by error: ${(e as Error).message}`);
    return null;
  }
}