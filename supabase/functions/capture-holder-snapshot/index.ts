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
    const { token_mint, holders, price } = await req.json();

    if (!token_mint || !holders || !Array.isArray(holders)) {
      return new Response(
        JSON.stringify({ error: 'token_mint and holders array are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date().toISOString().split('T')[0];

    // Prepare snapshot data and deduplicate by wallet address
    // Keep the latest/highest balance if duplicate wallets exist
    const holderMap = new Map();
    holders.forEach((holder: any) => {
      const existingHolder = holderMap.get(holder.address);
      if (!existingHolder || (holder.balance || 0) > (existingHolder.balance || 0)) {
        holderMap.set(holder.address, holder);
      }
    });

    const snapshots = Array.from(holderMap.values()).map((holder: any) => ({
      token_mint,
      snapshot_date: today,
      wallet_address: holder.address,
      balance: holder.balance || 0,
      usd_value: holder.usdValue || 0,
      tier: holder.tier || 'Unknown',
      price_at_snapshot: price || 0,
    }));

    console.log(`Capturing ${snapshots.length} unique holders for ${token_mint}`);

    // Upsert snapshots (update if exists for today, insert if not)
    const { error } = await supabase
      .from('holder_snapshots')
      .upsert(snapshots, {
        onConflict: 'token_mint,snapshot_date,wallet_address',
      });

    if (error) {
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        snapshots_captured: snapshots.length,
        date: today,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error capturing snapshot:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
