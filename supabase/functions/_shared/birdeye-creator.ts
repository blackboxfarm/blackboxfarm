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
  const key = Deno.env.get('BIRDEYE_API_KEY');
  if (!key) return null;

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
        owner = o;
        success = true;
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