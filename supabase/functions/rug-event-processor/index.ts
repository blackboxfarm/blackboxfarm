import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * RUG EVENT PROCESSOR
 * 
 * Called when a rug pull is detected (dev dump + price crash).
 * Actions:
 * 1. Update developer_profiles (increment rug_pull_count, lower integrity score)
 * 2. Record rug evidence in developer_tokens
 * 3. Auto-blacklist the developer wallet
 * 4. Collect all associated wallets from developer_wallets
 * 5. Send admin notification + alert
 * 6. Trigger rug-investigator for bundle analysis
 */

interface RugEventRequest {
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  creator_wallet: string;
  rug_type: 'dev_full_exit' | 'dev_sold_crashed' | 'bundle_dump' | 'liquidity_pull' | 'manual_report';
  evidence?: {
    dev_holding_pct?: number;
    price_at_rug?: number;
    price_ath?: number;
    market_cap_at_rug?: number;
    holder_count?: number;
    volume_sol?: number;
    crash_pct?: number;
  };
  triggered_by?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body: RugEventRequest = await req.json();
    const { token_mint, token_symbol, token_name, creator_wallet, rug_type, evidence, triggered_by } = body;

    if (!token_mint || !creator_wallet) {
      return new Response(JSON.stringify({ error: "token_mint and creator_wallet required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🚨 [Rug Event] Processing ${rug_type} for ${token_symbol || token_mint} by ${creator_wallet.slice(0, 8)}...`);

    const results: Record<string, any> = {
      developer_updated: false,
      token_updated: false,
      blacklisted: false,
      alert_sent: false,
      wallets_collected: 0,
      investigation_triggered: false,
    };

    // 1. Find or create developer profile
    let { data: devProfile } = await supabase
      .from('developer_profiles')
      .select('*')
      .eq('master_wallet_address', creator_wallet)
      .single();

    if (!devProfile) {
      // Check developer_wallets for linked profile
      const { data: devWallet } = await supabase
        .from('developer_wallets')
        .select('developer_id')
        .eq('wallet_address', creator_wallet)
        .single();

      if (devWallet) {
        const { data: linked } = await supabase
          .from('developer_profiles')
          .select('*')
          .eq('id', devWallet.developer_id)
          .single();
        devProfile = linked;
      }
    }

    if (!devProfile) {
      // Create new developer profile
      const { data: newProfile, error: createError } = await supabase
        .from('developer_profiles')
        .insert({
          master_wallet_address: creator_wallet,
          display_name: `Dev ${creator_wallet.slice(0, 8)}`,
          reputation_score: 0,
          integrity_score: 0,
          trust_level: 'blacklisted',
          rug_pull_count: 1,
          total_tokens_created: 1,
          failed_tokens: 1,
          source: 'rug_event_processor',
          blacklist_reason: `${rug_type}: ${token_symbol || token_mint}`,
        })
        .select()
        .single();

      if (createError) {
        console.error('Failed to create developer profile:', createError);
      } else {
        devProfile = newProfile;
        results.developer_updated = true;
        console.log(`   Created new developer profile: ${devProfile.id}`);
      }
    } else {
      // Update existing developer profile
      const newRugCount = (devProfile.rug_pull_count || 0) + 1;
      const newIntegrity = Math.max(0, (devProfile.integrity_score || 50) - 25);
      const newReputation = Math.max(0, (devProfile.reputation_score || 50) - 30);
      const newFailedTokens = (devProfile.failed_tokens || 0) + 1;

      const { error: updateError } = await supabase
        .from('developer_profiles')
        .update({
          rug_pull_count: newRugCount,
          integrity_score: newIntegrity,
          reputation_score: newReputation,
          trust_level: newRugCount >= 2 ? 'blacklisted' : 'suspicious',
          failed_tokens: newFailedTokens,
          blacklist_reason: devProfile.blacklist_reason
            ? `${devProfile.blacklist_reason}; ${rug_type}: ${token_symbol || token_mint}`
            : `${rug_type}: ${token_symbol || token_mint}`,
          updated_at: new Date().toISOString(),
          last_analysis_at: new Date().toISOString(),
        })
        .eq('id', devProfile.id);

      if (!updateError) {
        results.developer_updated = true;
        console.log(`   Updated developer: rug_count=${newRugCount}, integrity=${newIntegrity}`);
      }
    }

    // 2. Update or create developer_tokens record
    if (devProfile) {
      const crashPct = evidence?.price_ath && evidence?.price_at_rug
        ? ((evidence.price_ath - evidence.price_at_rug) / evidence.price_ath * 100)
        : null;

      const { error: tokenError } = await supabase
        .from('developer_tokens')
        .upsert({
          developer_id: devProfile.id,
          token_mint,
          token_symbol: token_symbol || null,
          token_name: token_name || null,
          creator_wallet,
          outcome: 'rug_pull',
          is_active: false,
          death_date: new Date().toISOString(),
          peak_market_cap_usd: evidence?.price_ath ? evidence.price_ath * (evidence?.holder_count || 1000) : null,
          current_market_cap_usd: evidence?.market_cap_at_rug || null,
          holder_count: evidence?.holder_count || null,
          total_volume_usd: evidence?.volume_sol ? evidence.volume_sol * 180 : null, // rough SOL->USD
          rug_pull_evidence: {
            rug_type,
            dev_holding_pct: evidence?.dev_holding_pct,
            price_at_rug: evidence?.price_at_rug,
            price_ath: evidence?.price_ath,
            crash_pct: crashPct,
            market_cap_at_rug: evidence?.market_cap_at_rug,
            detected_at: new Date().toISOString(),
            triggered_by: triggered_by || 'auto',
          },
          launchpad: 'pump.fun',
        }, { onConflict: 'developer_id,token_mint' });

      if (!tokenError) {
        results.token_updated = true;
        console.log(`   Recorded rug evidence for ${token_mint}`);
      }
    }

    // 3. Auto-blacklist the developer wallet
    // First check if already blacklisted
    const { data: existingBlacklist } = await supabase
      .from('pumpfun_blacklist')
      .select('id')
      .eq('identifier', creator_wallet)
      .eq('entry_type', 'dev_wallet')
      .single();

    let blacklistError = null;
    if (existingBlacklist) {
      const { error } = await supabase.from('pumpfun_blacklist').update({
        blacklist_reason: `Rug pull: ${token_symbol || token_mint} (${rug_type})`,
        is_active: true,
        risk_level: 'critical',
        linked_token_mints: [token_mint],
        tokens_rugged: 1,
      }).eq('id', existingBlacklist.id);
      blacklistError = error;
    } else {
      const { error } = await supabase.from('pumpfun_blacklist').insert({
        identifier: creator_wallet,
        entry_type: 'dev_wallet',
        blacklist_reason: `Rug pull: ${token_symbol || token_mint} (${rug_type})`,
        is_active: true,
        risk_level: 'critical',
        added_by: triggered_by || 'rug_event_processor',
        source: 'rug_event_processor',
        evidence_notes: JSON.stringify({
          token_mint, token_symbol, rug_type, ...evidence, detected_at: new Date().toISOString(),
        }),
        linked_token_mints: [token_mint],
        tokens_rugged: 1,
      });
      blacklistError = error;
    }

    if (!blacklistError) {
      results.blacklisted = true;
      console.log(`   Blacklisted wallet: ${creator_wallet.slice(0, 8)}...`);
    } else {
      console.error(`   Blacklist insert failed:`, JSON.stringify(blacklistError));
    }

    // 4. Also add to dev_wallet_reputation
    await supabase.from('dev_wallet_reputation').upsert({
      wallet_address: creator_wallet,
      reputation_score: 0,
      rug_count: devProfile ? (devProfile.rug_pull_count || 0) + 1 : 1,
      trust_level: 'scammer',
      last_updated: new Date().toISOString(),
    }, { onConflict: 'wallet_address' });

    // 5. Collect associated wallets
    if (devProfile) {
      const { data: associatedWallets } = await supabase
        .from('developer_wallets')
        .select('wallet_address, wallet_type')
        .eq('developer_id', devProfile.id);

      results.wallets_collected = associatedWallets?.length || 0;

      // Blacklist all associated wallets too
      if (associatedWallets && associatedWallets.length > 0) {
        for (const w of associatedWallets) {
          const { data: existingW } = await supabase.from('pumpfun_blacklist')
            .select('id').eq('identifier', w.wallet_address).eq('entry_type', 'suspicious_wallet').single();
          if (!existingW) {
            await supabase.from('pumpfun_blacklist').insert({
              identifier: w.wallet_address,
              entry_type: 'suspicious_wallet',
              blacklist_reason: `Associated with rugger ${creator_wallet.slice(0, 8)}: ${token_symbol || token_mint}`,
              is_active: true,
              risk_level: 'high',
              added_by: 'rug_event_processor',
              source: 'rug_event_processor',
              evidence_notes: JSON.stringify({
                parent_wallet: creator_wallet, wallet_type: w.wallet_type, token_mint,
              }),
            });
          }
        }
        console.log(`   Blacklisted ${associatedWallets.length} associated wallets`);
      }
    }

    // 6. Send admin notification
    const { error: notifError } = await supabase.from('admin_notifications').insert({
      notification_type: 'critical_alert',
      title: `🚨 RUG PULL CONFIRMED: $${token_symbol || 'UNKNOWN'}`,
      message: `Developer ${creator_wallet.slice(0, 8)}... rugged $${token_symbol || token_mint.slice(0, 8)} via ${rug_type}. ` +
        `Dev holding: ${evidence?.dev_holding_pct?.toFixed(1) || '?'}%. ` +
        `Price crash: ${evidence?.crash_pct?.toFixed(0) || '?'}% from ATH. ` +
        `MCap: $${evidence?.market_cap_at_rug?.toFixed(0) || '?'}. ` +
        `Wallet blacklisted. ${results.wallets_collected} associated wallets flagged.`,
      metadata: {
        token_mint,
        token_symbol,
        creator_wallet,
        rug_type,
        evidence,
        developer_id: devProfile?.id,
        action_url: `https://pump.fun/${token_mint}`,
      },
    });

    if (!notifError) {
      results.alert_sent = true;
    }

    // 7. Trigger rug-investigator for deep bundle analysis
    try {
      await supabase.functions.invoke('rug-investigator', {
        body: { tokenMint: token_mint, maxSellers: 20, traceDepth: 3 },
      });
      results.investigation_triggered = true;
      console.log(`   Triggered rug-investigator for deep analysis`);
    } catch (e) {
      console.warn('   Rug investigator trigger failed:', e);
    }

    // 8. Trigger Telegram alert
    try {
      await supabase.functions.invoke('telegram-bot-webhook', {
        body: {
          type: 'rug_pull_alert',
          data: {
            token_mint,
            token_symbol: token_symbol || 'UNKNOWN',
            creator_wallet,
            rug_type,
            dev_holding_pct: evidence?.dev_holding_pct,
            crash_pct: evidence?.crash_pct,
            market_cap: evidence?.market_cap_at_rug,
          },
        },
      });
    } catch (e) {
      console.warn('   Telegram alert failed:', e);
    }

    console.log(`✅ [Rug Event] Complete:`, results);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Rug Event] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
