import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';
import { getHeliusApiKey } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Allstar Promotion Engine
 * 
 * Continuously scans master_token_directory / token_lifecycle for high-ATH tokens,
 * resolves their creators, evaluates launch history, and auto-promotes qualifying
 * "good actor" developers into allstar_dev_registry.
 * 
 * Runs on cron every 30 min.
 */

// Minimum ATH thresholds for promotion consideration
const MIN_ATH_USD = 100_000;       // $100K ATH minimum
const MIN_ATH_TIER_2 = 250_000;    // $250K → Tier 2
const MIN_ATH_TIER_3 = 500_000;    // $500K → Tier 3  
const MIN_ATH_TIER_4 = 1_000_000;  // $1M → Tier 4
const MIN_ATH_TIER_5 = 5_000_000;  // $5M → Tier 5
const MIN_ATH_TIER_6 = 10_000_000; // $10M → Tier 6

const MAX_PROMOTIONS_PER_RUN = 15;

function athToTier(ath: number): number {
  if (ath >= MIN_ATH_TIER_6) return 6;
  if (ath >= MIN_ATH_TIER_5) return 5;
  if (ath >= MIN_ATH_TIER_4) return 4;
  if (ath >= MIN_ATH_TIER_3) return 3;
  if (ath >= MIN_ATH_TIER_2) return 2;
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
    const minAth = body.min_ath_usd || MIN_ATH_USD;
    const maxPromotions = body.max_promotions || MAX_PROMOTIONS_PER_RUN;

    console.log(`[AllstarPromotion] Starting scan (min ATH: $${minAth.toLocaleString()}, max: ${maxPromotions})`);

    // ═══ Step 1: Find high-ATH tokens not yet linked to an allstar ═══
    // Query token_lifecycle for tokens with strong ATH that have a creator_wallet
    // but whose creator is NOT yet in allstar_dev_registry
    const { data: candidates, error: candidateErr } = await supabase
      .from('token_lifecycle')
      .select('token_mint, token_name, token_symbol, creator_wallet, ath_usd_24h, market_cap_usd, launchpad')
      .gte('ath_usd_24h', minAth)
      .not('creator_wallet', 'is', null)
      .order('ath_usd_24h', { ascending: false })
      .limit(200);

    if (candidateErr) {
      throw new Error(`Failed to query token_lifecycle: ${candidateErr.message}`);
    }

    if (!candidates || candidates.length === 0) {
      console.log('[AllstarPromotion] No high-ATH candidates found');
      return new Response(JSON.stringify({ 
        success: true, promoted: 0, scanned: 0, 
        message: 'No candidates met ATH threshold' 
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[AllstarPromotion] Found ${candidates.length} high-ATH token candidates`);

    // ═══ Step 2: Also check tokens WITHOUT creator_wallet that need resolution ═══
    const { data: unresolvedCandidates } = await supabase
      .from('token_lifecycle')
      .select('token_mint, token_name, token_symbol, ath_usd_24h, launchpad')
      .gte('ath_usd_24h', minAth)
      .is('creator_wallet', null)
      .order('ath_usd_24h', { ascending: false })
      .limit(30);

    // Resolve creators for unresolved high-ATH tokens
    const resolvedFromUnresolved: typeof candidates = [];
    if (unresolvedCandidates && unresolvedCandidates.length > 0) {
      console.log(`[AllstarPromotion] Resolving creators for ${unresolvedCandidates.length} unresolved high-ATH tokens`);
      
      for (const token of unresolvedCandidates.slice(0, 10)) {
        const apiErrors: string[] = [];
        const resolution = await resolveTokenCreator(token.token_mint, supabase, apiErrors);
        
        if (resolution.creatorWallet) {
          // Update token_lifecycle with resolved creator
          await supabase.from('token_lifecycle').update({
            creator_wallet: resolution.creatorWallet,
          }).eq('token_mint', token.token_mint);

          resolvedFromUnresolved.push({
            ...token,
            creator_wallet: resolution.creatorWallet,
            market_cap_usd: null,
          });
          console.log(`[AllstarPromotion] Resolved creator for $${token.token_symbol}: ${resolution.creatorWallet.slice(0, 8)}... (${resolution.source})`);
        }

        // Rate limit
        await new Promise(r => setTimeout(r, 500));
      }
    }

    // Merge all candidates
    const allCandidates = [...candidates, ...resolvedFromUnresolved];

    // ═══ Step 3: Deduplicate by creator wallet and filter out existing allstars ═══
    const creatorMap = new Map<string, typeof allCandidates[0]>();
    for (const c of allCandidates) {
      if (!c.creator_wallet) continue;
      const existing = creatorMap.get(c.creator_wallet);
      if (!existing || (c.ath_usd_24h || 0) > (existing.ath_usd_24h || 0)) {
        creatorMap.set(c.creator_wallet, c);
      }
    }

    const uniqueCreators = Array.from(creatorMap.keys());
    console.log(`[AllstarPromotion] ${uniqueCreators.length} unique creator wallets to check`);

    // Check which creators are already in allstar_dev_registry
    const { data: existingAllstars } = await supabase
      .from('allstar_dev_registry')
      .select('master_wallet')
      .in('master_wallet', uniqueCreators);

    const existingWallets = new Set((existingAllstars || []).map(a => a.master_wallet));
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
        const ath = bestToken.ath_usd_24h || 0;
        const tier = athToTier(ath);

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
            best_token_symbol: bestToken.token_symbol || 'UNKNOWN',
            best_mcap_achieved: ath,
            total_proven_tokens: provenCount || 1,
            total_wallet_family_size: familyWallets.length,
            family_wallets: familyWallets,
            status: 'active',
            notes: `Auto-promoted: $${bestToken.token_symbol} ATH $${Math.round(ath).toLocaleString()} (T${tier})`,
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
        console.log(`[AllstarPromotion] ⭐ Promoted ${creatorWallet.slice(0, 8)}... → T${tier} via $${bestToken.token_symbol} (ATH $${Math.round(ath).toLocaleString()})`);

        // ═══ Cross-feed: Also seed into wallet_families if not already there ═══
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
            // Add seed wallet to family members + poll queue
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

            // Add family wallets as siblings
            for (const fw of familyWallets.slice(1)) {
              await supabase.from('wallet_family_members').insert({
                family_id: newFamily.id,
                wallet_address: fw,
                label: 'sibling',
                tier: 'B',
                confidence_score: 60,
                status: 'active',
                first_seen_at: new Date().toISOString(),
              }).catch(() => {}); // ignore dupes

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

        // Rate limit between promotions
        await new Promise(r => setTimeout(r, 300));
      } catch (e) {
        results.errors.push(`${creatorWallet.slice(0, 8)}: ${e instanceof Error ? e.message : 'unknown'}`);
      }
    }

    // ═══ Step 5: Also upgrade existing allstars if their ATH improved ═══
    for (const wallet of Array.from(existingWallets).slice(0, 50)) {
      const bestToken = creatorMap.get(wallet);
      if (!bestToken) continue;
      
      const newAth = bestToken.ath_usd_24h || 0;
      const newTier = athToTier(newAth);

      const { data: current } = await supabase
        .from('allstar_dev_registry')
        .select('id, best_tier, best_mcap_achieved')
        .eq('master_wallet', wallet)
        .maybeSingle();

      if (current && (newTier > current.best_tier || newAth > (current.best_mcap_achieved || 0))) {
        await supabase.from('allstar_dev_registry').update({
          best_tier: Math.max(newTier, current.best_tier),
          best_mcap_achieved: Math.max(newAth, current.best_mcap_achieved || 0),
          best_token_mint: bestToken.token_mint,
          best_token_symbol: bestToken.token_symbol,
          updated_at: new Date().toISOString(),
          notes: `Auto-upgraded: ATH $${Math.round(newAth).toLocaleString()} → T${newTier}`,
        }).eq('id', current.id);

        results.upgraded++;
        console.log(`[AllstarPromotion] ⬆️ Upgraded ${wallet.slice(0, 8)}... → T${newTier}`);
      }
    }

    // ═══ Step 6: Send TG alert if promotions happened ═══
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

          // Show top 5 promotions
          const topPromoted = newCreators.slice(0, 5).map(w => {
            const t = creatorMap.get(w)!;
            return `  • <code>${w.slice(0, 8)}...</code> → T${athToTier(t.ath_usd_24h || 0)} via $${t.token_symbol} (ATH $${Math.round(t.ath_usd_24h || 0).toLocaleString()})`;
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
});
