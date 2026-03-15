import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Background backfill: picks creator wallets that have NO genealogy/KYC data
 * in the reputation_mesh, then calls wallet-genealogy-scanner for each.
 * Designed to run every 10 minutes via pg_cron, processing a small batch
 * to stay within Helius rate limits.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize || 5, 15); // Max 15 per run

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Find creator wallets that have NO funded_by links in reputation_mesh
    // These are wallets we haven't traced yet
    const { data: untracedTokens, error: queryErr } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, creator_wallet')
      .not('status', 'in', '("rejected","dead")')
      .not('creator_wallet', 'is', null)
      .not('creator_wallet', 'eq', '')
      .limit(200); // Get a pool to filter from

    if (queryErr) throw queryErr;
    if (!untracedTokens || untracedTokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No tokens to process', traced: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Deduplicate by creator_wallet
    const uniqueWallets = new Map<string, string>();
    for (const t of untracedTokens) {
      if (t.creator_wallet && !uniqueWallets.has(t.creator_wallet)) {
        uniqueWallets.set(t.creator_wallet, t.token_mint);
      }
    }

    // Check which wallets already have funded_by links in mesh
    const walletsToCheck = Array.from(uniqueWallets.keys());
    const { data: existingLinks } = await supabase
      .from('reputation_mesh')
      .select('source_id')
      .eq('source_type', 'wallet')
      .eq('relationship', 'funded_by')
      .in('source_id', walletsToCheck.slice(0, 100)); // Check up to 100

    const alreadyTraced = new Set((existingLinks || []).map(l => l.source_id));
    
    // Filter to only untraced wallets
    const needsTracing = walletsToCheck.filter(w => !alreadyTraced.has(w));
    const batch = needsTracing.slice(0, batchSize);

    console.log(`[backfill-genealogy] Pool: ${uniqueWallets.size} unique wallets, ${alreadyTraced.size} already traced, ${needsTracing.length} need tracing, processing ${batch.length}`);

    let traced = 0;
    let failed = 0;

    for (const wallet of batch) {
      try {
        console.log(`[backfill-genealogy] Tracing ${wallet.slice(0, 8)}...`);
        
        const { data, error } = await supabase.functions.invoke('wallet-genealogy-scanner', {
          body: { wallet, depth: 3 },
        });

        if (error) {
          console.warn(`[backfill-genealogy] Scanner error for ${wallet.slice(0, 8)}:`, error.message);
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
      traced,
      failed,
      remaining: needsTracing.length - batch.length,
      totalUntraced: needsTracing.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('[backfill-genealogy] Fatal:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
