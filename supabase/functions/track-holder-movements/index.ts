import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token_mint } = await req.json();

    if (!token_mint) {
      return new Response(
        JSON.stringify({ error: 'token_mint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get latest snapshot for this token
    const { data: latestSnapshot } = await supabase
      .from('holder_snapshots')
      .select('*')
      .eq('token_mint', token_mint)
      .order('snapshot_date', { ascending: false })
      .limit(1000);

    // Get previous snapshot (1 day before)
    const { data: previousSnapshot } = await supabase
      .from('holder_snapshots')
      .select('*')
      .eq('token_mint', token_mint)
      .lt('snapshot_date', new Date().toISOString().split('T')[0])
      .order('snapshot_date', { ascending: false })
      .limit(1000);

    // Compare and detect movements
    const movements: any[] = [];
    const latestMap = new Map(latestSnapshot?.map(s => [s.wallet_address, s]) || []);
    const previousMap = new Map(previousSnapshot?.map(s => [s.wallet_address, s]) || []);

    // Detect new buyers and accumulators
    for (const [wallet, current] of latestMap.entries()) {
      const previous = previousMap.get(wallet);
      
      if (!previous) {
        // New entry
        if (current.usd_value && current.usd_value > 100) { // Only track significant entries
          movements.push({
            token_mint,
            wallet_address: wallet,
            action: 'buy',
            amount_tokens: current.balance,
            usd_value: current.usd_value,
            percentage_of_supply: (current.balance / 1000000000) * 100, // Assuming 1B supply
            tier: current.tier,
            detected_at: new Date().toISOString(),
          });
        }
      } else if (current.balance > previous.balance * 1.1) {
        // Accumulated >10%
        const increase = current.balance - previous.balance;
        const increaseUsd = (current.usd_value || 0) - (previous.usd_value || 0);
        
        if (increaseUsd > 500) {
          movements.push({
            token_mint,
            wallet_address: wallet,
            action: 'accumulate',
            amount_tokens: increase,
            usd_value: increaseUsd,
            percentage_of_supply: (increase / 1000000000) * 100,
            tier: current.tier,
            detected_at: new Date().toISOString(),
          });
        }
      }
    }

    // Detect sellers and distributors
    for (const [wallet, previous] of previousMap.entries()) {
      const current = latestMap.get(wallet);
      
      if (!current) {
        // Complete exit
        if (previous.usd_value && previous.usd_value > 100) {
          movements.push({
            token_mint,
            wallet_address: wallet,
            action: 'sell',
            amount_tokens: previous.balance,
            usd_value: previous.usd_value,
            percentage_of_supply: (previous.balance / 1000000000) * 100,
            tier: previous.tier,
            detected_at: new Date().toISOString(),
          });
        }
      } else if (current.balance < previous.balance * 0.9) {
        // Distributed >10%
        const decrease = previous.balance - current.balance;
        const decreaseUsd = (previous.usd_value || 0) - (current.usd_value || 0);
        
        if (decreaseUsd > 500) {
          movements.push({
            token_mint,
            wallet_address: wallet,
            action: 'distribute',
            amount_tokens: decrease,
            usd_value: decreaseUsd,
            percentage_of_supply: (decrease / 1000000000) * 100,
            tier: previous.tier,
            detected_at: new Date().toISOString(),
          });
        }
      }
    }

    // Insert movements
    if (movements.length > 0) {
      await supabase.from('holder_movements').insert(movements);
    }

    // Get recent movements (last 48h)
    const { data: recentMovements } = await supabase
      .from('holder_movements')
      .select('*')
      .eq('token_mint', token_mint)
      .gte('detected_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
      .order('detected_at', { ascending: false })
      .limit(100);

    return new Response(
      JSON.stringify({
        movements: recentMovements || [],
        new_detected: movements.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error tracking holder movements:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
