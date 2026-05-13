import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Backfill AllStars from Top 200
 * 
 * 1. Fetches tokens from token_lifecycle with market_cap >= $100K and no creator_wallet
 * 2. Resolves creator wallets via Pump.fun / Helius
 * 3. Promotes qualifying developers to allstar_dev_registry
 * 
 * Can be triggered manually from the AllStars admin panel.
 */

const MIN_MCAP = 100_000;

function mcapToTier(mcap: number): number {
  if (mcap >= 10_000_000) return 6;
  if (mcap >= 5_000_000) return 5;
  if (mcap >= 1_000_000) return 4;
  if (mcap >= 500_000) return 3;
  if (mcap >= 250_000) return 2;
  return 1;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const minMcap = body.min_mcap || MIN_MCAP;
    const maxResolve = body.max_resolve || 30;
    const dryRun = body.dry_run || false;
    const wide: boolean = !!body.wide;

    console.log(`[BackfillAllstars] Starting (min mcap: $${minMcap.toLocaleString()}, max resolve: ${maxResolve}, dry_run: ${dryRun}, wide: ${wide})`);

    // Step 1: Find tokens with high mcap but no creator_wallet
    const { data: unresolvedTokens, error: fetchErr } = await supabase
      .from('token_lifecycle')
      .select('token_mint, symbol, name, market_cap, fdv, creator_wallet, launchpad')
      .or(`market_cap.gte.${minMcap},fdv.gte.${minMcap}`)
      .is('creator_wallet', null)
      .order('market_cap', { ascending: false })
      .limit(200);

    if (fetchErr) throw new Error(`Failed to query token_lifecycle: ${fetchErr.message}`);

    // Also find tokens that DO have creator_wallet but aren't in AllStars yet
    const { data: resolvedTokens } = await supabase
      .from('token_lifecycle')
      .select('token_mint, symbol, name, market_cap, fdv, creator_wallet, launchpad')
      .or(`market_cap.gte.${minMcap},fdv.gte.${minMcap}`)
      .not('creator_wallet', 'is', null)
      .order('market_cap', { ascending: false })
      .limit(200);

    const stats = {
      tokens_scanned: (unresolvedTokens?.length || 0) + (resolvedTokens?.length || 0),
      creators_resolved: 0,
      already_in_allstars: 0,
      newly_promoted: 0,
      upgraded: 0,
      failed_resolution: 0,
      wide_proven_added: 0,
      wide_reputation_added: 0,
      errors: [] as string[],
      promotions: [] as { wallet: string; symbol: string; mcap: number; tier: number }[],
    };

    // Step 2: Resolve creators for unresolved tokens
    const allTokens: Array<{ token_mint: string; symbol: string | null; name: string | null; market_cap: number; creator_wallet: string }> = [];

    // Add already-resolved tokens
    for (const t of resolvedTokens || []) {
      if (t.creator_wallet) {
        allTokens.push({
          token_mint: t.token_mint,
          symbol: t.symbol,
          name: t.name,
          market_cap: Math.max((t as any).market_cap || 0, (t as any).fdv || 0),
          creator_wallet: t.creator_wallet,
        });
      }
    }

    // === WIDE MODE: pull from proven_dev_tokens + dev_wallet_reputation ===
    if (wide) {
      // proven_dev_tokens: every dev is by definition proven
      const { data: proven, error: provenErr } = await supabase
        .from('proven_dev_tokens')
        .select('dev_wallet, token_mint, symbol, name, market_cap_ath, market_cap_at_discovery, tier')
        .order('market_cap_ath', { ascending: false, nullsFirst: false })
        .limit(2000);

      if (provenErr) {
        stats.errors.push(`proven_dev_tokens query: ${provenErr.message}`);
      } else {
        for (const p of proven || []) {
          if (!p.dev_wallet) continue;
          const mcap = Math.max(p.market_cap_ath || 0, p.market_cap_at_discovery || 0);
          allTokens.push({
            token_mint: p.token_mint,
            symbol: p.symbol,
            name: p.name,
            market_cap: mcap,
            creator_wallet: p.dev_wallet,
          });
          stats.wide_proven_added++;
        }
      }

      // dev_wallet_reputation: vetted survivors
      const { data: reps, error: repErr } = await supabase
        .from('dev_wallet_reputation')
        .select('wallet_address, avg_peak_mcap_usd, tokens_successful, tokens_graduated, is_legitimate_builder')
        .or('tokens_successful.gte.1,tokens_graduated.gte.1,is_legitimate_builder.eq.true')
        .order('avg_peak_mcap_usd', { ascending: false, nullsFirst: false })
        .limit(2000);

      if (repErr) {
        stats.errors.push(`dev_wallet_reputation query: ${repErr.message}`);
      } else {
        for (const r of reps || []) {
          if (!r.wallet_address) continue;
          allTokens.push({
            token_mint: '',
            symbol: null,
            name: null,
            market_cap: r.avg_peak_mcap_usd || 0,
            creator_wallet: r.wallet_address,
          });
          stats.wide_reputation_added++;
        }
      }

      stats.tokens_scanned += stats.wide_proven_added + stats.wide_reputation_added;
      console.log(`[BackfillAllstars][wide] +${stats.wide_proven_added} from proven_dev_tokens, +${stats.wide_reputation_added} from dev_wallet_reputation`);
    }

    // Resolve unresolved tokens (rate-limited)
    const toResolve = (unresolvedTokens || []).slice(0, maxResolve);
    console.log(`[BackfillAllstars] Resolving creators for ${toResolve.length} tokens...`);

    for (const token of toResolve) {
      try {
        const apiErrors: string[] = [];
        const resolution = await resolveTokenCreator(token.token_mint, supabase, apiErrors);
        
        if (resolution.creatorWallet) {
          stats.creators_resolved++;
          
          // Update token_lifecycle with resolved creator
          if (!dryRun) {
            await supabase.from('token_lifecycle').update({
              creator_wallet: resolution.creatorWallet,
            }).eq('token_mint', token.token_mint);
          }

          allTokens.push({
            token_mint: token.token_mint,
            symbol: token.symbol,
            name: token.name,
            market_cap: Math.max(token.market_cap || 0, token.fdv || 0),
            creator_wallet: resolution.creatorWallet,
          });

          console.log(`[BackfillAllstars] ✅ Resolved $${token.symbol || '?'}: ${resolution.creatorWallet.slice(0, 8)}... (${resolution.source})`);
        } else {
          stats.failed_resolution++;
          console.log(`[BackfillAllstars] ❌ Could not resolve $${token.symbol || token.token_mint.slice(0, 8)}`);
        }

        // Rate limit: 300ms between calls
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        stats.failed_resolution++;
        stats.errors.push(`Resolution failed for ${token.symbol || token.token_mint.slice(0, 8)}: ${err.message}`);
      }
    }

    // Step 3: Deduplicate by creator wallet, keep best mcap
    const creatorMap = new Map<string, typeof allTokens[0]>();
    for (const t of allTokens) {
      const existing = creatorMap.get(t.creator_wallet);
      if (!existing || t.market_cap > existing.market_cap) {
        creatorMap.set(t.creator_wallet, t);
      }
    }

    const uniqueCreators = Array.from(creatorMap.keys());
    console.log(`[BackfillAllstars] ${uniqueCreators.length} unique creators to evaluate`);

    // Step 4: Check existing AllStars
    const { data: existingAllstars } = await supabase
      .from('allstar_dev_registry')
      .select('master_wallet, best_tier, best_mcap_achieved')
      .in('master_wallet', uniqueCreators.length > 0 ? uniqueCreators : ['__none__']);

    const existingMap = new Map((existingAllstars || []).map(a => [a.master_wallet, a]));

    // Step 5: Promote or upgrade
    for (const [wallet, token] of creatorMap.entries()) {
      const tier = mcapToTier(token.market_cap);
      const existing = existingMap.get(wallet);

      if (existing) {
        stats.already_in_allstars++;
        // Check for tier upgrade
        if (tier > existing.best_tier || (token.market_cap > (existing.best_mcap_achieved || 0))) {
          if (!dryRun) {
            await supabase.from('allstar_dev_registry').update({
              best_tier: Math.max(tier, existing.best_tier),
              best_mcap_achieved: Math.max(token.market_cap, existing.best_mcap_achieved || 0),
              best_token_symbol: token.symbol,
              best_token_mint: token.token_mint,
              updated_at: new Date().toISOString(),
            }).eq('master_wallet', wallet);
          }
          stats.upgraded++;
          stats.promotions.push({ wallet, symbol: token.symbol || '?', mcap: token.market_cap, tier });
        }
        continue;
      }

      // New promotion
      if (!dryRun) {
        const { error: insertErr } = await supabase.from('allstar_dev_registry').insert({
          master_wallet: wallet,
          best_tier: tier,
          best_mcap_achieved: token.market_cap,
          best_token_symbol: token.symbol,
          best_token_mint: token.token_mint,
          status: 'active',
          notes: `Auto-promoted from Top 200 backfill. $${token.symbol} mcap: $${token.market_cap.toLocaleString()}`,
        });

        if (insertErr) {
          stats.errors.push(`Failed to insert ${wallet.slice(0, 8)}: ${insertErr.message}`);
          continue;
        }
      }

      stats.newly_promoted++;
      stats.promotions.push({ wallet, symbol: token.symbol || '?', mcap: token.market_cap, tier });
      console.log(`[BackfillAllstars] 🌟 Promoted $${token.symbol} dev ${wallet.slice(0, 8)}... → T${tier} (mcap: $${token.market_cap.toLocaleString()})`);
    }

    const summary = {
      success: true,
      dry_run: dryRun,
      wide,
      tokens_scanned: stats.tokens_scanned,
      creators_resolved: stats.creators_resolved,
      failed_resolution: stats.failed_resolution,
      already_in_allstars: stats.already_in_allstars,
      newly_promoted: stats.newly_promoted,
      upgraded: stats.upgraded,
      wide_proven_added: stats.wide_proven_added,
      wide_reputation_added: stats.wide_reputation_added,
      promotions: stats.promotions,
      errors: stats.errors.slice(0, 10),
    };

    console.log(`[BackfillAllstars] Complete:`, JSON.stringify(summary, null, 2));

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[BackfillAllstars] Fatal error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
