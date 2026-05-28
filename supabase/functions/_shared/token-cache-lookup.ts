// DB-first cache lookup for a token mint.
// Returns anything we already know about it across prior /holders scans,
// previous Insiders calls, and developer_profiles. Avoids burning Helius /
// Solscan / Pump.fun credits when we've already seen this mint.

export interface CachedTokenFacts {
  creator_wallet: string | null;
  creator_source: string | null;
  dev_wallet: string | null;
  dev_wallet_source: string | null;
  kyc_root: string | null;
  kyc_label: string | null;
  kyc_status: string | null;
  launchpad: string | null;
  hit: boolean;
  hitSources: string[];
}

export async function lookupKnownToken(
  supabase: any,
  mint: string,
): Promise<CachedTokenFacts> {
  const out: CachedTokenFacts = {
    creator_wallet: null,
    creator_source: null,
    dev_wallet: null,
    dev_wallet_source: null,
    kyc_root: null,
    kyc_label: null,
    kyc_status: null,
    launchpad: null,
    hit: false,
    hitSources: [],
  };

  // 1. Previous Insiders row for the same mint (most authoritative).
  try {
    const { data: prior } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('creator_wallet, dev_wallet, dev_wallet_source, genealogy_kyc_root, kyc_label, kyc_status, launchpad')
      .eq('token_mint', mint)
      .not('creator_wallet', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (prior?.creator_wallet) {
      out.creator_wallet = prior.creator_wallet;
      out.creator_source = 'insider_prior';
      out.dev_wallet = prior.dev_wallet ?? null;
      out.dev_wallet_source = prior.dev_wallet_source ?? null;
      out.kyc_root = prior.genealogy_kyc_root ?? null;
      out.kyc_label = prior.kyc_label ?? null;
      out.kyc_status = prior.kyc_status ?? null;
      out.launchpad = prior.launchpad ?? null;
      out.hit = true;
      out.hitSources.push('insider_prior');
    }
  } catch { /* ignore */ }

  // 2. token_lifecycle (any /holders scan ever done).
  if (!out.creator_wallet) {
    try {
      const { data: lc } = await supabase
        .from('token_lifecycle')
        .select('creator_wallet, launchpad')
        .eq('token_mint', mint)
        .maybeSingle();
      if (lc?.creator_wallet) {
        out.creator_wallet = lc.creator_wallet;
        out.creator_source = 'token_lifecycle';
        out.launchpad = out.launchpad ?? lc.launchpad ?? null;
        out.hit = true;
        out.hitSources.push('token_lifecycle');
      }
    } catch { /* ignore */ }
  }

  // 3. developer_profiles joined via creator_wallet → grab KYC root / label.
  if (out.creator_wallet && !out.kyc_root) {
    try {
      const { data: dp } = await supabase
        .from('developer_profiles')
        .select('master_wallet_address, kyc_root_wallet, kyc_label, kyc_status')
        .eq('master_wallet_address', out.creator_wallet)
        .maybeSingle();
      if (dp?.kyc_root_wallet) {
        out.kyc_root = dp.kyc_root_wallet;
        out.kyc_label = out.kyc_label ?? dp.kyc_label ?? null;
        out.kyc_status = out.kyc_status ?? dp.kyc_status ?? null;
        out.hitSources.push('developer_profiles');
      }
    } catch { /* ignore */ }
  }

  return out;
}