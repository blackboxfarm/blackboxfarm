import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KOLEntry {
  wallet_address: string;
  twitter_handle?: string;
  twitter_followers?: number;
  kolscan_rank?: number;
  display_name?: string;
  kol_tier?: string;
  is_verified?: boolean;
  manual_trust_level?: string;
  manual_override_reason?: string;
  source?: string;
  kolscan_weekly_score?: number;
}

interface RefreshResult {
  added: number;
  updated: number;
  total_kols: number;
  errors: string[];
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
      case 'refresh-kolscan': {
        // Simulate kolscan refresh - in production would scrape kolscan.io
        // For now, we'll just update the last_refreshed_at for existing entries
        const result = await refreshKolscanData(supabase);
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'add-manual': {
        const { kol } = params as { kol: KOLEntry };
        const { data, error } = await supabase
          .from('pumpfun_kol_registry')
          .upsert({
            ...kol,
            source: 'manual',
            first_seen_at: new Date().toISOString(),
            last_refreshed_at: new Date().toISOString()
          }, { onConflict: 'wallet_address' })
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, kol: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'update-trust': {
        const { wallet_address, trust_level, reason, user_id } = params;
        const { data, error } = await supabase
          .from('pumpfun_kol_registry')
          .update({
            manual_trust_level: trust_level,
            manual_override_reason: reason,
            manual_override_by: user_id,
            manual_override_at: new Date().toISOString()
          })
          .eq('wallet_address', wallet_address)
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, kol: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-kols': {
        const { tier, active_only, limit = 100, offset = 0 } = params;
        let query = supabase
          .from('pumpfun_kol_registry')
          .select('*')
          .order('kolscan_rank', { ascending: true, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (tier) query = query.eq('kol_tier', tier);
        if (active_only) query = query.eq('is_active', true);

        const { data, error, count } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, kols: data, count }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'check-wallets': {
        const { wallets } = params as { wallets: string[] };
        const { data, error } = await supabase
          .from('pumpfun_kol_registry')
          .select('*')
          .in('wallet_address', wallets)
          .eq('is_active', true);

        if (error) throw error;

        const kolMap = new Map(data?.map(k => [k.wallet_address, k]) || []);
        const results = wallets.map(w => ({
          wallet: w,
          is_kol: kolMap.has(w),
          kol_data: kolMap.get(w) || null
        }));

        return new Response(JSON.stringify({ 
          success: true, 
          results,
          kols_found: data?.length || 0,
          total_checked: wallets.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete-kol': {
        const { wallet_address } = params;
        const { error } = await supabase
          .from('pumpfun_kol_registry')
          .delete()
          .eq('wallet_address', wallet_address);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-stats': {
        const { data: stats } = await supabase
          .from('pumpfun_kol_registry')
          .select('kol_tier, trust_score, chart_kills, successful_pumps, is_active');

        const total = stats?.length || 0;
        const active = stats?.filter(k => k.is_active).length || 0;
        const byTier = {
          top_10: stats?.filter(k => k.kol_tier === 'top_10').length || 0,
          top_50: stats?.filter(k => k.kol_tier === 'top_50').length || 0,
          top_100: stats?.filter(k => k.kol_tier === 'top_100').length || 0,
          verified: stats?.filter(k => k.kol_tier === 'verified').length || 0,
          suspected: stats?.filter(k => k.kol_tier === 'suspected').length || 0,
        };
        const avgTrust = stats?.reduce((sum, k) => sum + (k.trust_score || 50), 0) / (total || 1);
        const totalKills = stats?.reduce((sum, k) => sum + (k.chart_kills || 0), 0) || 0;
        const totalPumps = stats?.reduce((sum, k) => sum + (k.successful_pumps || 0), 0) || 0;

        return new Response(JSON.stringify({
          success: true,
          stats: { total, active, byTier, avgTrust, totalKills, totalPumps }
        }), {
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
    console.error('KOL Registry error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function refreshKolscanData(supabase: any): Promise<RefreshResult> {
  const result: RefreshResult = { added: 0, updated: 0, total_kols: 0, errors: [] };

  try {
    // Update last_refreshed_at for all kolscan entries
    const { error: updateError } = await supabase
      .from('pumpfun_kol_registry')
      .update({ last_refreshed_at: new Date().toISOString() })
      .eq('source', 'kolscan');

    if (updateError) {
      result.errors.push(`Update error: ${updateError.message}`);
    }

    // Get total count
    const { count } = await supabase
      .from('pumpfun_kol_registry')
      .select('*', { count: 'exact', head: true });

    result.total_kols = count || 0;

    // Note: In production, this would fetch from kolscan.io API
    // and upsert new KOLs, updating ranks and scores
    console.log('KOL refresh completed. In production, would fetch from kolscan.io');

  } catch (err) {
    result.errors.push(`Refresh error: ${err.message}`);
  }

  return result;
}
