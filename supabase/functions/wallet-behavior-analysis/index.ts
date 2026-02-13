import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('wallet-behavior-analysis');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallet_address, token_mint } = await req.json();

    if (!wallet_address) {
      return new Response(
        JSON.stringify({ error: 'wallet_address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // Uses dedicated HELIUS_HOLDERS_KEY for /holders page functions
    const heliusApiKey = Deno.env.get('HELIUS_HOLDERS_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if we have a recent profile
    const { data: existingProfile } = await supabase
      .from('wallet_profiles')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    const shouldUpdate = !existingProfile || 
      (existingProfile.last_analyzed_at && 
       new Date(existingProfile.last_analyzed_at).getTime() < Date.now() - 60 * 60 * 1000); // 1 hour

    if (shouldUpdate && heliusApiKey) {
      // Fetch transaction history from Helius
      try {
        const heliusResponse = await fetch(
          `https://api.helius.xyz/v0/addresses/${wallet_address}/transactions?api-key=${heliusApiKey}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );

        if (heliusResponse.ok) {
          const transactions = await heliusResponse.json();
          
          // Analyze transactions and calculate Smart Money Score
          let smartMoneyScore = 50; // Base score
          let earlyEntryCount = 0;
          let diamondHandsCount = 0;
          let paperHandsCount = 0;
          let totalRealizedPnl = 0;

          // Simple heuristics (can be enhanced)
          const tokenTransactions = transactions.filter((tx: any) => 
            tx.tokenTransfers?.some((t: any) => t.mint === token_mint)
          );

          if (tokenTransactions.length > 0) {
            // Early entry bonus
            const firstTxTimestamp = tokenTransactions[0]?.timestamp;
            if (firstTxTimestamp) {
              const daysSinceLaunch = (Date.now() / 1000 - firstTxTimestamp) / 86400;
              if (daysSinceLaunch > 30) {
                smartMoneyScore += 10;
                earlyEntryCount++;
              }
            }

            // Look for diamond hands behavior (no sells for >30 days)
            const lastSell = tokenTransactions
              .filter((tx: any) => tx.type === 'SELL')
              .sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
            
            if (!lastSell || (Date.now() / 1000 - lastSell.timestamp) > 30 * 86400) {
              smartMoneyScore += 15;
              diamondHandsCount++;
            }
          }

          // Update or create profile
          await supabase.from('wallet_profiles').upsert({
            wallet_address,
            smart_money_score: Math.max(0, Math.min(100, smartMoneyScore)),
            total_tokens_traded: tokenTransactions.length,
            early_entry_count: earlyEntryCount,
            diamond_hands_count: diamondHandsCount,
            paper_hands_count: paperHandsCount,
            total_realized_pnl: totalRealizedPnl,
            last_analyzed_at: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Helius API error:', error);
      }
    }

    // Get wallet history for this token
    const { data: tokenHistory } = await supabase
      .from('wallet_token_history')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('token_mint', token_mint)
      .order('entry_date', { ascending: true });

    // Get updated profile
    const { data: profile } = await supabase
      .from('wallet_profiles')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    return new Response(
      JSON.stringify({
        profile: profile || {
          wallet_address,
          smart_money_score: 50,
          total_tokens_traded: 0,
        },
        token_history: tokenHistory || [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error analyzing wallet behavior:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
