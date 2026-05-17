/**
 * Birdeye fast-path creator lookup.
 * Single call to /defi/token_creation_info — 1 credit, ~150-400ms.
 * Logs usage to birdeye_api_usage when a Supabase client is provided.
 * Returns the creator wallet, or null on miss / error / no key.
 */

export async function birdeyeResolveCreator(
  tokenMint: string,
  fnName: string,
  supabase?: any,
): Promise<string | null> {
  // BIRDEYE_SUSPENDED: temporarily disabled by user request. Remove this block to re-enable.
  return null;
  const key = Deno.env.get('BIRDEYE_API_KEY');
  if (!key) return null;

  // ---- INFRA / LAUNCHPAD BLOCKLIST ----------------------------------------
  // Birdeye's `data.owner` is the **mint authority owner**, which on Pump.fun
  // is the launchpad program / shared router wallet — NOT the human creator.
  // Any wallet here is a known infrastructure address that has been observed
  // attributed to dozens or thousands of unrelated tokens. If we see one, we
  // treat it as a miss so the caller can fall through to Pump.fun coin API or
  // the deeper Helius/mesh chain.
  const INFRA_BLOCKLIST = new Set<string>([
    // Pump.fun launchpad / shared mint-authority wallet (seen on 1,294+ pump tokens)
    'TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM',
    // Other high-frequency infra wallets observed in pumpfun_watchlist (>30 tokens each)
    '2oCXSSTk2XcF4xFfjxJZjDu66c18MfzkMb8woem6K4rc',
    'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM',
    'FWymgf7GwMXczUmqQ6jeeE4MukdZNuaRom4twz3U45nz',
    '7sA5em1nTKmLvGm8H85cpgA9hM9YvCoPp729mwe6akhh',
    'HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC',
    '7naFFwuEJWeWwWYQUkgAWHsxYKg3KctEuUj42JdAMidP',
  ]);

  const started = Date.now();
  let status = 0;
  let success = false;
  let owner: string | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(
      `https://public-api.birdeye.so/defi/token_creation_info?address=${tokenMint}`,
      {
        headers: {
          accept: 'application/json',
          'x-chain': 'solana',
          'X-API-KEY': key,
        },
        signal: AbortSignal.timeout(8000),
      },
    );
    status = res.status;
    if (res.ok) {
      const j = await res.json();
      const o = j?.data?.owner;
      if (typeof o === 'string' && o.length >= 32 && o !== tokenMint) {
        if (INFRA_BLOCKLIST.has(o)) {
          // Reject infrastructure wallets — caller must fall through.
          errorMessage = `infra_wallet_rejected:${o.slice(0, 8)}`;
          success = true; // 200 OK, just not usable
        } else {
          owner = o;
          success = true;
        }
      } else {
        success = true; // 200 but no owner
      }
    } else {
      errorMessage = `HTTP ${res.status}`;
    }
  } catch (e) {
    errorMessage = e instanceof Error ? e.message : 'timeout';
  }

  if (supabase?.from) {
    try {
      await supabase.from('birdeye_api_usage').insert({
        function_name: fnName,
        endpoint: 'defi/token_creation_info',
        method: 'GET',
        request_params: { address: tokenMint },
        response_status: status || null,
        response_time_ms: Date.now() - started,
        success,
        error_message: errorMessage,
        credits_used: 1,
        token_mint: tokenMint,
        resolved_creator: owner,
      });
    } catch { /* ignore logging errors */ }

    // Persist creator → token edge into reputation_mesh so mesh-only tokens
    // (no row in pumpfun_watchlist / scraped_tokens / lifecycle / holders_intel /
    // funnel_feed) still surface a creator inside master_token_directory.
    if (owner) {
      try {
        await supabase.from('reputation_mesh').upsert({
          source_type: 'wallet',
          source_id: owner,
          linked_type: 'token',
          linked_id: tokenMint,
          relationship: 'created_token',
          confidence: 95,
          discovered_via: `birdeye:${fnName}`,
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
      } catch { /* mesh write is best-effort augmentation */ }
    }
  }

  return owner;
}