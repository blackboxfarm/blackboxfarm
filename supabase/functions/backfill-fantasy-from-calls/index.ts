import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { channelConfigId, limit = 100 } = await req.json().catch(() => ({}));

    console.log(`[backfill-fantasy] Starting backfill, channelConfigId: ${channelConfigId || 'all'}, limit: ${limit}`);

    // Get all call records that don't have a corresponding fantasy position
    let query = supabase
      .from('telegram_channel_calls')
      .select(`
        id,
        channel_config_id,
        channel_id,
        channel_name,
        token_mint,
        token_symbol,
        token_name,
        price_at_call,
        buy_amount_usd,
        sell_multiplier,
        caller_username,
        caller_display_name,
        status,
        created_at
      `)
      .in('status', ['fantasy_bought', 'detected'])
      .order('created_at', { ascending: false })
      .limit(limit);

    if (channelConfigId) {
      query = query.eq('channel_config_id', channelConfigId);
    }

    const { data: calls, error: callsError } = await query;

    if (callsError) {
      throw callsError;
    }

    if (!calls || calls.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No calls to backfill',
        created: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[backfill-fantasy] Found ${calls.length} call records to check`);

    // Get existing fantasy positions by call_id
    const callIds = calls.map(c => c.id);
    const { data: existingPositions } = await supabase
      .from('telegram_fantasy_positions')
      .select('call_id')
      .in('call_id', callIds);

    const existingCallIds = new Set((existingPositions || []).map(p => p.call_id));

    // Filter to only calls without fantasy positions
    const callsToBackfill = calls.filter(c => !existingCallIds.has(c.id));

    console.log(`[backfill-fantasy] ${callsToBackfill.length} calls need fantasy positions`);

    if (callsToBackfill.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'All calls already have fantasy positions',
        created: 0,
        checked: calls.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fetch current prices for all tokens
    const uniqueTokens = [...new Set(callsToBackfill.map(c => c.token_mint))];
    const tokenPrices: Record<string, number> = {};

    for (const tokenMint of uniqueTokens) {
      try {
        const response = await fetch(`https://api.jup.ag/price/v2?ids=${tokenMint}`);
        if (response.ok) {
          const data = await response.json();
          if (data.data?.[tokenMint]?.price) {
            tokenPrices[tokenMint] = parseFloat(data.data[tokenMint].price);
          }
        }
      } catch (e) {
        console.warn(`[backfill-fantasy] Failed to fetch price for ${tokenMint}`);
      }
    }

    // Create fantasy positions
    const positionsToInsert = callsToBackfill.map(call => {
      const entryPrice = call.price_at_call || 0.00001;
      const buyAmount = call.buy_amount_usd || 50;
      const tokenAmount = entryPrice > 0 ? buyAmount / entryPrice : null;
      const currentPrice = tokenPrices[call.token_mint] || entryPrice;
      
      return {
        call_id: call.id,
        channel_config_id: call.channel_config_id,
        token_mint: call.token_mint,
        token_symbol: call.token_symbol,
        token_name: call.token_name,
        entry_price_usd: entryPrice,
        entry_amount_usd: buyAmount,
        token_amount: tokenAmount,
        current_price_usd: currentPrice,
        target_sell_multiplier: call.sell_multiplier || 2,
        status: 'open',
        caller_username: call.caller_username,
        caller_display_name: call.caller_display_name,
        channel_name: call.channel_name,
        is_active: true,
        stop_loss_enabled: false,
        trail_tracking_enabled: true,
        created_at: call.created_at // Preserve original timestamp
      };
    });

    const { data: inserted, error: insertError } = await supabase
      .from('telegram_fantasy_positions')
      .insert(positionsToInsert)
      .select('id, token_symbol');

    if (insertError) {
      console.error('[backfill-fantasy] Insert error:', insertError);
      throw insertError;
    }

    console.log(`[backfill-fantasy] Created ${inserted?.length || 0} fantasy positions`);

    return new Response(JSON.stringify({
      success: true,
      created: inserted?.length || 0,
      checked: calls.length,
      tokens: inserted?.map(p => p.token_symbol).join(', ')
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[backfill-fantasy] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
