import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Trail-end states that are "settled" — no point re-tracing these on every pass.
const SETTLED_TRAIL_REASONS = ['hit_cex', 'cycle_detected'];

/**
 * Background backfill: picks creator wallets that have NO genealogy/KYC data
 * in the reputation_mesh, then calls wallet-genealogy-scanner for each.
 *
 * Tiered + newest-first:
 *   tier=A → high-value tokens (peak_multiplier > 5x OR in Insiders lifecycle)
 *   tier=B → everything else from pumpfun_watchlist (newest first)
 *
 * Always skips wallets where dev_wallet_reputation.trail_end_reason is settled
 * (hit_cex / cycle_detected), so we don't waste credits re-tracing solved cases.
 */
Deno.serve(withRunLog('backfill-genealogy', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 5, 25);
    const tier = body.tier === 'A' || body.tier === 'B' ? body.tier : 'B';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build the candidate pool depending on tier.
    let untracedTokens: Array<{ token_mint: string; creator_wallet: string }> = [];
    if (tier === 'A') {
      // Tier A: high-value tokens — peak_multiplier > 5x OR in Insiders lifecycle
      const { data: insiders, error: insErr } = await supabase
        .from('telegram_insider_token_lifecycle')
        .select('token_mint, creator_wallet, peak_multiplier')
        .not('creator_wallet', 'is', null)
        .order('peak_multiplier', { ascending: false, nullsFirst: false })
        .limit(200);
      if (insErr) throw insErr;
      untracedTokens = (insiders || []).map(t => ({ token_mint: t.token_mint, creator_wallet: t.creator_wallet }));
    } else {
      // Tier B: regular pumpfun watchlist — newest first
      const { data: pf, error: queryErr } = await supabase
        .from('pumpfun_watchlist')
        .select('token_mint, creator_wallet, first_seen_at')
        .not('status', 'in', '("rejected","dead")')
        .not('creator_wallet', 'is', null)
        .not('creator_wallet', 'eq', '')
        .order('first_seen_at', { ascending: false, nullsFirst: false })
        .limit(300);
      if (queryErr) throw queryErr;
      untracedTokens = (pf || []).map(t => ({ token_mint: t.token_mint, creator_wallet: t.creator_wallet }));
    }

    if (!untracedTokens || untracedTokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens to process', traced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduplicate by creator_wallet (preserve newest-first / highest-perf order)
    const uniqueWallets = new Map<string, string>();
    for (const t of untracedTokens) {
      if (t.creator_wallet && !uniqueWallets.has(t.creator_wallet)) {
        uniqueWallets.set(t.creator_wallet, t.token_mint);
      }
    }

    // Skip wallets that are already settled (hit_cex / cycle_detected) OR already have mesh links.
    const walletsToCheck = Array.from(uniqueWallets.keys());
    const checkSlice = walletsToCheck.slice(0, 200);

    const { data: settledRep } = await supabase
      .from('dev_wallet_reputation')
      .select('wallet_address, trail_end_reason')
      .in('wallet_address', checkSlice)
      .in('trail_end_reason', SETTLED_TRAIL_REASONS);
    const settled = new Set((settledRep || []).map((r: any) => r.wallet_address));

    const { data: existingLinks } = await supabase
      .from('reputation_mesh')
      .select('source_id')
      .eq('source_type', 'wallet')
      .eq('relationship', 'funded_by')
      .in('source_id', checkSlice);

    const alreadyTraced = new Set([
      ...(existingLinks || []).map((l: any) => l.source_id),
      ...settled,
    ]);
    
    // Filter to only untraced wallets
    const needsTracing = walletsToCheck.filter(w => !alreadyTraced.has(w));
    const batch = needsTracing.slice(0, batchSize);

    console.log(`[backfill-genealogy] tier=${tier} pool: ${uniqueWallets.size} unique wallets, ${alreadyTraced.size} already traced/settled, ${needsTracing.length} need tracing, processing ${batch.length}`);

    let traced = 0;
    let failed = 0;

    for (const wallet of batch) {
      try {
        console.log(`[backfill-genealogy] Tracing ${wallet.slice(0, 8)}...`);
        
        const { data, error } = await supabase.functions.invoke('wallet-genealogy-scanner', {
          body: { wallet, depth: 20 },
        });

        if (error) {
          console.warn(`[backfill-genealogy] Scanner error for ${wallet.slice(0, 8)}:`, (error as Error).message);
          failed++;
        } else {
          traced++;
          const result = data;
          console.log(`[backfill-genealogy] ✅ ${wallet.slice(0, 8)}: depth=${result?.max_depth_reached || 0}, wallets=${result?.total_wallets_traced || 0}`);
        }
      } catch (err: any) {
        console.warn(`[backfill-genealogy] Failed ${wallet.slice(0, 8)}:`, err.message);
        failed++;
      }

      // Delay between scans to respect Helius rate limits
      if (batch.indexOf(wallet) < batch.length - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    console.log(`[backfill-genealogy] Complete: ${traced} traced, ${failed} failed, ${needsTracing.length - batch.length} remaining`);

    return new Response(JSON.stringify({
      tier,
      traced,
      failed,
      remaining: needsTracing.length - batch.length,
      totalUntraced: needsTracing.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[backfill-genealogy] Fatal:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

