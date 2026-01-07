import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CabalDetection {
  members: string[];
  tokens_in_common: string[];
  avg_entry_delta_secs: number;
  coordination_score: number;
  is_predatory: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...params } = await req.json();

    switch (action) {
      case 'calculate-trust-scores': {
        // Recalculate trust scores for all KOLs
        const { data: kols } = await supabase
          .from('pumpfun_kol_registry')
          .select('*');

        if (!kols) {
          return new Response(JSON.stringify({ success: true, updated: 0 }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        let updated = 0;
        for (const kol of kols) {
          const newScore = calculateTrustScore(kol);
          if (newScore !== kol.trust_score) {
            await supabase
              .from('pumpfun_kol_registry')
              .update({ trust_score: newScore })
              .eq('id', kol.id);
            updated++;
          }
        }

        return new Response(JSON.stringify({ success: true, updated, total: kols.length }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'detect-cabals': {
        const cabals = await detectCabals(supabase);
        
        // Upsert detected cabals
        for (const cabal of cabals) {
          await supabase
            .from('pumpfun_kol_cabals')
            .upsert({
              member_wallets: cabal.members,
              tokens_coordinated: cabal.tokens_in_common.length,
              sample_token_mints: cabal.tokens_in_common.slice(0, 10),
              avg_entry_delta_secs: cabal.avg_entry_delta_secs,
              coordination_score: cabal.coordination_score,
              is_predatory: cabal.is_predatory,
              cabal_trust_score: cabal.is_predatory ? 20 : 60,
              last_activity_at: new Date().toISOString()
            }, { 
              onConflict: 'id',
              ignoreDuplicates: false 
            });
        }

        return new Response(JSON.stringify({ success: true, cabals_detected: cabals.length, cabals }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-cabals': {
        const { predatory_only, limit = 20 } = params;
        let query = supabase
          .from('pumpfun_kol_cabals')
          .select('*')
          .order('coordination_score', { ascending: false })
          .limit(limit);

        if (predatory_only) query = query.eq('is_predatory', true);

        const { data, error } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, cabals: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'add-cabal': {
        const { cabal } = params;
        const { data, error } = await supabase
          .from('pumpfun_kol_cabals')
          .insert({
            cabal_name: cabal.name,
            cabal_description: cabal.description,
            member_wallets: cabal.member_wallets || [],
            member_kol_ids: cabal.member_kol_ids || [],
            suspected_hustle_wallets: cabal.hustle_wallets || [],
            linked_mint_wallets: cabal.mint_wallets || [],
            linked_twitter_accounts: cabal.twitter_accounts || [],
            linked_telegram_groups: cabal.telegram_groups || [],
            is_predatory: cabal.is_predatory || false,
            predatory_evidence: cabal.predatory_evidence,
            evidence_notes: cabal.evidence_notes
          })
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, cabal: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'update-cabal': {
        const { id, updates } = params;
        const { data, error } = await supabase
          .from('pumpfun_kol_cabals')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, cabal: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete-cabal': {
        const { id } = params;
        const { error } = await supabase
          .from('pumpfun_kol_cabals')
          .delete()
          .eq('id', id);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'analyze-kol-patterns': {
        const { kol_wallet } = params;
        const patterns = await analyzeKOLPatterns(supabase, kol_wallet);
        
        return new Response(JSON.stringify({ success: true, patterns }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'find-hustle-wallets': {
        const { kol_wallet } = params;
        const hustleWallets = await findHustleWallets(supabase, kol_wallet);
        
        return new Response(JSON.stringify({ success: true, hustle_wallets: hustleWallets }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('KOL Analyzer error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

function calculateTrustScore(kol: any): number {
  let score = 50; // Base score

  // Manual override takes precedence
  if (kol.manual_trust_level === 'trusted') return 90;
  if (kol.manual_trust_level === 'dangerous') return 10;
  if (kol.manual_trust_level === 'neutral') score = 50;

  // Positive factors
  score += Math.min(20, (kol.successful_pumps || 0) * 2);
  score += Math.min(15, (kol.avg_hold_time_mins || 0) / 60);
  
  // Twitter influence
  if (kol.twitter_followers > 100000) score += 5;
  else if (kol.twitter_followers > 50000) score += 3;
  else if (kol.twitter_followers > 10000) score += 1;

  // Negative factors
  score -= Math.min(30, (kol.chart_kills || 0) * 10);

  // Tier bonus
  if (kol.kol_tier === 'top_10') score += 5;
  else if (kol.kol_tier === 'verified') score += 10;

  return Math.max(0, Math.min(100, Math.round(score)));
}

async function detectCabals(supabase: any): Promise<CabalDetection[]> {
  const cabals: CabalDetection[] = [];

  // Get all KOL activity in the last 7 days
  const { data: activity } = await supabase
    .from('pumpfun_kol_activity')
    .select('kol_wallet, token_mint, detected_at, action')
    .eq('action', 'buy')
    .gte('detected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order('detected_at', { ascending: true });

  if (!activity || activity.length < 2) return cabals;

  // Group by token
  const tokenWallets: Map<string, { wallet: string; time: Date }[]> = new Map();
  for (const a of activity) {
    if (!tokenWallets.has(a.token_mint)) {
      tokenWallets.set(a.token_mint, []);
    }
    tokenWallets.get(a.token_mint)!.push({
      wallet: a.kol_wallet,
      time: new Date(a.detected_at)
    });
  }

  // Find tokens with 2+ KOLs buying within 60 seconds
  const coordinatedTokens: Map<string, string[]> = new Map(); // token -> wallets
  for (const [token, entries] of tokenWallets) {
    if (entries.length < 2) continue;

    // Check for close timing
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const delta = Math.abs(entries[i].time.getTime() - entries[j].time.getTime()) / 1000;
        if (delta <= 60) {
          if (!coordinatedTokens.has(token)) {
            coordinatedTokens.set(token, []);
          }
          const wallets = coordinatedTokens.get(token)!;
          if (!wallets.includes(entries[i].wallet)) wallets.push(entries[i].wallet);
          if (!wallets.includes(entries[j].wallet)) wallets.push(entries[j].wallet);
        }
      }
    }
  }

  // Group wallets that appear together frequently
  const walletPairs: Map<string, { tokens: string[]; deltas: number[] }> = new Map();
  for (const [token, wallets] of coordinatedTokens) {
    for (let i = 0; i < wallets.length; i++) {
      for (let j = i + 1; j < wallets.length; j++) {
        const pairKey = [wallets[i], wallets[j]].sort().join('|');
        if (!walletPairs.has(pairKey)) {
          walletPairs.set(pairKey, { tokens: [], deltas: [] });
        }
        walletPairs.get(pairKey)!.tokens.push(token);
      }
    }
  }

  // Create cabals for pairs that appear on 3+ tokens
  for (const [pairKey, data] of walletPairs) {
    if (data.tokens.length >= 3) {
      const [w1, w2] = pairKey.split('|');
      const avgDelta = data.deltas.length > 0 
        ? data.deltas.reduce((a, b) => a + b, 0) / data.deltas.length 
        : 30;

      // Check if predatory (high chart kill count)
      const { data: kols } = await supabase
        .from('pumpfun_kol_registry')
        .select('chart_kills')
        .in('wallet_address', [w1, w2]);

      const totalKills = kols?.reduce((sum: number, k: any) => sum + (k.chart_kills || 0), 0) || 0;
      const isPredatory = totalKills > 3 || data.tokens.length > 10;

      cabals.push({
        members: [w1, w2],
        tokens_in_common: data.tokens,
        avg_entry_delta_secs: avgDelta,
        coordination_score: Math.min(100, data.tokens.length * 10 + (60 - avgDelta)),
        is_predatory: isPredatory
      });
    }
  }

  return cabals;
}

async function analyzeKOLPatterns(supabase: any, kolWallet: string) {
  const { data: activity } = await supabase
    .from('pumpfun_kol_activity')
    .select('*')
    .eq('kol_wallet', kolWallet)
    .order('detected_at', { ascending: false })
    .limit(100);

  if (!activity || activity.length === 0) {
    return { has_data: false };
  }

  const buys = activity.filter((a: any) => a.action === 'buy');
  const sells = activity.filter((a: any) => a.action === 'sell');
  const chartKills = activity.filter((a: any) => a.chart_killed);

  return {
    has_data: true,
    total_trades: activity.length,
    buys: buys.length,
    sells: sells.length,
    chart_kills: chartKills.length,
    avg_hold_time_mins: sells.reduce((sum: number, s: any) => sum + (s.hold_time_mins || 0), 0) / (sells.length || 1),
    avg_profit_pct: sells.reduce((sum: number, s: any) => sum + (s.profit_pct || 0), 0) / (sells.length || 1),
    preferred_buy_zone: getMostCommon(buys.map((b: any) => b.buy_zone)),
    tokens_traded: [...new Set(activity.map((a: any) => a.token_mint))].length,
    last_activity: activity[0]?.detected_at
  };
}

function getMostCommon(arr: string[]): string {
  const counts: { [key: string]: number } = {};
  arr.forEach(item => {
    if (item) counts[item] = (counts[item] || 0) + 1;
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
}

async function findHustleWallets(supabase: any, kolWallet: string): Promise<string[]> {
  // Find wallets that consistently trade alongside this KOL
  // This would require more sophisticated analysis in production
  
  // Get tokens this KOL traded
  const { data: kolTokens } = await supabase
    .from('pumpfun_kol_activity')
    .select('token_mint')
    .eq('kol_wallet', kolWallet)
    .eq('action', 'buy');

  if (!kolTokens || kolTokens.length < 5) return [];

  const tokenMints = kolTokens.map((t: any) => t.token_mint);

  // This is a placeholder - in production, you'd query transaction history
  // to find wallets that frequently trade the same tokens within seconds
  return [];
}
