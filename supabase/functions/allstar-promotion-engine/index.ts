import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Allstar Promotion Engine
 * 
 * Scans token_lifecycle for high market-cap tokens, resolves creators,
 * and auto-promotes qualifying developers into allstar_dev_registry.
 * 
 * Uses market_cap (USD) as the primary qualification metric.
 * Runs on cron every 30 min.
 */

const MIN_MCAP_USD = 100_000;
const MIN_MCAP_TIER_2 = 250_000;
const MIN_MCAP_TIER_3 = 500_000;
const MIN_MCAP_TIER_4 = 1_000_000;
const MIN_MCAP_TIER_5 = 5_000_000;
const MIN_MCAP_TIER_6 = 10_000_000;

const MAX_PROMOTIONS_PER_RUN = 15;

function mcapToTier(mcap: number): number {
  if (mcap >= MIN_MCAP_TIER_6) return 6;
  if (mcap >= MIN_MCAP_TIER_5) return 5;
  if (mcap >= MIN_MCAP_TIER_4) return 4;
  if (mcap >= MIN_MCAP_TIER_3) return 3;
  if (mcap >= MIN_MCAP_TIER_2) return 2;
  return 1;
}

Deno.serve(withRunLog('allstar-promotion-engine', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders }
  if (!await isFunctionEnabled('allstar-promotion-engine')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json().catch(() => ({}));
    const minMcap = body.min_ath_usd || MIN_MCAP_USD;
    const maxPromotions = body.max_promotions || MAX_PROMOTIONS_PER_RUN;

    console.log(`[AllstarPromotion] Starting scan (min mcap: $${minMcap.toLocaleString()}, max: ${maxPromotions})`);

    // ═══ Step 1: Find high-mcap tokens with known creators ═══
    const { data: candidates, error: candidateErr } = await supabase
      .from('token_lifecycle')
      .select('token_mint, name, symbol, creator_wallet, market_cap, launchpad')
      .gte('market_cap', minMcap)
      .not('creator_wallet', 'is', null)
      .order('market_cap', { ascending: false })
      .limit(500);

    if (candidateErr) {
      throw new Error(`Failed to query token_lifecycle: ${candidateErr.message}`);
    }

    if (!candidates || candidates.length === 0) {
      console.log('[AllstarPromotion] No high-mcap candidates found');
      return new Response(JSON.stringify({ 
        success: true, promoted: 0, scanned: 0, 
        message: 'No candidates met mcap threshold' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[AllstarPromotion] Found ${candidates.length} high-mcap token candidates`);

    // ═══ Step 2: Resolve creators for unresolved high-mcap tokens ═══
    const { data: unresolvedCandidates } = await supabase
      .from('token_lifecycle')
      .select('token_mint, name, symbol, market_cap, launchpad')
      .gte('market_cap', minMcap)
      .is('creator_wallet', null)
      .order('market_cap', { ascending: false })
      .limit(30);

    const resolvedFromUnresolved: typeof candidates = [];
    if (unresolvedCandidates && unresolvedCandidates.length > 0) {
      console.log(`[AllstarPromotion] Resolving creators for ${unresolvedCandidates.length} unresolved high-mcap tokens`);
      
      for (const token of unresolvedCandidates.slice(0, 10)) {
        const apiErrors: string[] = [];
        const resolution = await resolveTokenCreator(token.token_mint, supabase, apiErrors);
        
        if (resolution.creatorWallet) {
          await supabase.from('token_lifecycle').update({
            creator_wallet: resolution.creatorWallet,
          }).eq('token_mint', token.token_mint);

          resolvedFromUnresolved.push({
            ...token,
            creator_wallet: resolution.creatorWallet,
          });
          console.log(`[AllstarPromotion] Resolved creator for $${token.symbol}: ${resolution.creatorWallet.slice(0, 8)}... (${resolution.source})`);
        }

        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Merge all candidates
    const allCandidates = [...candidates, ...resolvedFromUnresolved];

    // ═══ Step 3: Deduplicate by creator wallet, keep best mcap ═══
    const creatorMap = new Map<string, typeof allCandidates[0]>();
    for (const c of allCandidates) {
      if (!c.creator_wallet) continue;
      const existing = creatorMap.get(c.creator_wallet);
      if (!existing || (c.market_cap || 0) > (existing.market_cap || 0)) {
        creatorMap.set(c.creator_wallet, c);
      }
    }

    const uniqueCreators = Array.from(creatorMap.keys());
    console.log(`[AllstarPromotion] ${uniqueCreators.length} unique creator wallets to check`);

    // Check which creators are already in allstar_dev_registry
    // Query in batches to avoid URL length limits
    const existingWallets = new Set<string>();
    for (let i = 0; i < uniqueCreators.length; i += 50) {
      const batch = uniqueCreators.slice(i, i + 50);
      const { data: existingAllstars } = await supabase
        .from('allstar_dev_registry')
        .select('master_wallet')
        .in('master_wallet', batch);
      for (const a of existingAllstars || []) {
        existingWallets.add(a.master_wallet);
      }
    }

    const newCreators = uniqueCreators.filter(w => !existingWallets.has(w));
    console.log(`[AllstarPromotion] ${newCreators.length} new creators eligible (${existingWallets.size} already registered)`);

    // ═══ Step 4: Promote qualifying creators ═══
    const results = {
      promoted: 0,
      upgraded: 0,
      skipped: 0,
      errors: [] as string[],
    };

    for (const creatorWallet of newCreators.slice(0, maxPromotions)) {
      try {
        const bestToken = creatorMap.get(creatorWallet)!;
        const mcap = bestToken.market_cap || 0;
        const tier = mcapToTier(mcap);

        // Get developer profile if exists
        const { data: devProfile } = await supabase
          .from('developer_profiles')
          .select('id, twitter_handle, master_wallet_address')
          .eq('master_wallet_address', creatorWallet)
          .maybeSingle();

        // Build family wallets from reputation_mesh
        const familyWallets: string[] = [creatorWallet];
        if (devProfile) {
          const { data: relatedWallets } = await supabase
            .from('developer_wallets')
            .select('wallet_address')
            .eq('developer_id', devProfile.id);
          for (const w of relatedWallets || []) {
            if (!familyWallets.includes(w.wallet_address)) familyWallets.push(w.wallet_address);
          }
        }

        const { data: meshWallets } = await supabase
          .from('reputation_mesh')
          .select('target_id')
          .eq('source_id', creatorWallet)
          .in('relationship_type', ['funded_by', 'funds', 'same_entity', 'parent_wallet', 'child_wallet'])
          .limit(50);
        for (const mw of meshWallets || []) {
          if (mw.target_id && !familyWallets.includes(mw.target_id)) familyWallets.push(mw.target_id);
        }

        // Get KYC root wallet if available
        let kycRoot: string | null = null;
        if (devProfile) {
          const { data: kycWallet } = await supabase
            .from('developer_wallets')
            .select('wallet_address')
            .eq('developer_id', devProfile.id)
            .eq('wallet_type', 'kyc_root')
            .limit(1)
            .maybeSingle();
          kycRoot = kycWallet?.wallet_address || null;
        }

        // Count proven tokens by this creator
        const { count: provenCount } = await supabase
          .from('proven_dev_tokens')
          .select('*', { count: 'exact', head: true })
          .eq('dev_wallet', creatorWallet);

        // Insert into allstar_dev_registry
        const { error: insertErr } = await supabase
          .from('allstar_dev_registry')
          .insert({
            developer_id: devProfile?.id || null,
            master_wallet: creatorWallet,
            twitter_handle: devProfile?.twitter_handle || null,
            kyc_root_wallet: kycRoot,
            best_tier: tier,
            best_token_mint: bestToken.token_mint,
            best_token_symbol: bestToken.symbol || 'UNKNOWN',
            best_mcap_achieved: mcap,
            total_proven_tokens: provenCount || 1,
            total_wallet_family_size: familyWallets.length,
            family_wallets: familyWallets,
            status: 'active',
            notes: `Auto-promoted: $${bestToken.symbol} MCap $${Math.round(mcap).toLocaleString()} (T${tier})`,
          });

        if (insertErr) {
          if (insertErr.message.includes('duplicate') || insertErr.message.includes('unique')) {
            results.skipped++;
          } else {
            results.errors.push(`${creatorWallet.slice(0, 8)}: ${insertErr.message}`);
          }
          continue;
        }

        results.promoted++;
        console.log(`[AllstarPromotion] ⭐ Promoted ${creatorWallet.slice(0, 8)}... → T${tier} via $${bestToken.symbol} (MCap $${Math.round(mcap).toLocaleString()})`);

        // ═══ Cross-feed: Seed into wallet_families ═══
        const { data: existingFamily } = await supabase
          .from('wallet_families')
          .select('id')
          .eq('seed_wallet', creatorWallet)
          .maybeSingle();

        if (!existingFamily) {
          const { data: newFamily } = await supabase
            .from('wallet_families')
            .insert({
              seed_wallet: creatorWallet,
              family_name: devProfile?.twitter_handle ? `@${devProfile.twitter_handle}` : `Dev-${creatorWallet.slice(0, 8)}`,
              total_wallets: familyWallets.length,
              risk_score: tier >= 4 ? 20 : tier >= 2 ? 40 : 60,
              total_mints_detected: 0,
            })
            .select('id')
            .single();

          if (newFamily) {
            await supabase.from('wallet_family_members').insert({
              family_id: newFamily.id,
              wallet_address: creatorWallet,
              label: 'seed',
              tier: 'A',
              confidence_score: 100,
              status: 'active',
              first_seen_at: new Date().toISOString(),
            });

            await supabase.from('wallet_family_poll_queue').insert({
              wallet_address: creatorWallet,
              family_id: newFamily.id,
              priority: 'P1',
              poll_interval_sec: 300,
              next_poll_at: new Date().toISOString(),
            });

            for (const fw of familyWallets.slice(1)) {
              await supabase.from('wallet_family_members').insert({
                family_id: newFamily.id,
                wallet_address: fw,
                label: 'sibling',
                tier: 'B',
                confidence_score: 60,
                status: 'active',
                first_seen_at: new Date().toISOString(),
              }).catch(() => {});

              await supabase.from('wallet_family_poll_queue').insert({
                wallet_address: fw,
                family_id: newFamily.id,
                priority: 'P2',
                poll_interval_sec: 900,
                next_poll_at: new Date().toISOString(),
              }).catch(() => {});
            }

            console.log(`[AllstarPromotion] 🕸️ Created wallet family for ${creatorWallet.slice(0, 8)}... (${familyWallets.length} wallets)`);
          }
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        results.errors.push(`${creatorWallet.slice(0, 8)}: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // ═══ Step 5: Upgrade existing allstars if mcap improved ═══
    for (const wallet of Array.from(existingWallets).slice(0, 50)) {
      const bestToken = creatorMap.get(wallet);
      if (!bestToken) continue;
      
      const newMcap = bestToken.market_cap || 0;
      const newTier = mcapToTier(newMcap);

      const { data: current } = await supabase
        .from('allstar_dev_registry')
        .select('id, best_tier, best_mcap_achieved')
        .eq('master_wallet', wallet)
        .maybeSingle();

      if (current && (newTier > current.best_tier || newMcap > (current.best_mcap_achieved || 0))) {
        await supabase.from('allstar_dev_registry').update({
          best_tier: Math.max(newTier, current.best_tier),
          best_mcap_achieved: Math.max(newMcap, current.best_mcap_achieved || 0),
          best_token_mint: bestToken.token_mint,
          best_token_symbol: bestToken.symbol,
          updated_at: new Date().toISOString(),
          notes: `Auto-upgraded: MCap $${Math.round(newMcap).toLocaleString()} → T${newTier}`,
        }).eq('id', current.id);

        results.upgraded++;
        console.log(`[AllstarPromotion] ⬆️ Upgraded ${wallet.slice(0, 8)}... → T${newTier}`);
      }
    }

    // ═══ Step 6: TG alert if promotions happened ═══
    if (results.promoted > 0) {
      try {
        const { data: tgTargets } = await supabase
          .from('telegram_message_targets')
          .select('chat_id')
          .eq('label', 'BLACKBOX')
          .eq('is_active', true);

        if (tgTargets && tgTargets.length > 0) {
          const lines = [
            `⭐ <b>Allstar Promotion Engine</b>`,
            ``,
            `📊 <b>${results.promoted}</b> new devs promoted`,
            `⬆️ <b>${results.upgraded}</b> existing devs upgraded`,
            `⏭️ <b>${results.skipped}</b> duplicates skipped`,
            ``,
          ];

          const topPromoted = newCreators.slice(0, 5).map(w => {
            const t = creatorMap.get(w)!;
            return `  • <code>${w.slice(0, 8)}...</code> → T${mcapToTier(t.market_cap || 0)} via $${t.symbol} (MCap $${Math.round(t.market_cap || 0).toLocaleString()})`;
          });
          lines.push(...topPromoted);

          if (results.errors.length > 0) {
            lines.push(``, `⚠️ ${results.errors.length} errors`);
          }

          for (const target of tgTargets) {
            await supabase.functions.invoke('telegram-mtproto-auth', {
              body: { action: 'send_message', chat_id: target.chat_id, message: lines.join('\n'), parse_mode: 'HTML' },
            }).catch(e => console.error('[AllstarPromotion] TG error:', e));
          }

          await supabase.from('telegram_message_targets')
            .update({ last_used_at: new Date().toISOString() })
            .eq('label', 'BLACKBOX');
        }
      } catch (e) {
        console.error('[AllstarPromotion] TG broadcast error:', e);
      }
    }

    const summary = `Promoted ${results.promoted}, upgraded ${results.upgraded}, skipped ${results.skipped}, errors: ${results.errors.length}`;
    console.log(`[AllstarPromotion] ✅ Complete: ${summary}`);

    return new Response(JSON.stringify({
      success: true,
      ...results,
      scanned: allCandidates.length,
      uniqueCreators: uniqueCreators.length,
      message: summary,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[AllstarPromotion] Fatal error:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));
