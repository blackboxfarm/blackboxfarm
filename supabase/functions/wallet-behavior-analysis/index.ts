import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusApiKey, heliusRestFetch, redactHeliusSecrets } from '../_shared/helius-client.ts';
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
    const { wallet_address, token_mint, pair_created_at } = await req.json();

    if (!wallet_address) {
      return new Response(
        JSON.stringify({ error: 'wallet_address is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const heliusApiKey = getHeliusApiKey();
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Determine token age for age-relative scoring
    let tokenAgeMinutes: number | null = null;
    if (pair_created_at) {
      tokenAgeMinutes = Math.floor((Date.now() - pair_created_at) / 60_000);
    }

    // Check if we have a recent profile
    const { data: existingProfile } = await supabase
      .from('wallet_profiles')
      .select('*')
      .eq('wallet_address', wallet_address)
      .single();

    const shouldUpdate = !existingProfile || 
      (existingProfile.last_analyzed_at && 
       new Date(existingProfile.last_analyzed_at).getTime() < Date.now() - 60 * 60 * 1000);

    if (shouldUpdate && heliusApiKey) {
      try {
        const heliusResponse = await heliusRestFetch(
          `/v0/addresses/${wallet_address}/transactions`,
          { method: 'GET', timeoutMs: 10000 }
        );

        if (heliusResponse.ok) {
          const transactions = await heliusResponse.json();
          
          let smartMoneyScore = 50;
          let earlyEntryCount = 0;
          let diamondHandsCount = 0;
          let paperHandsCount = 0;
          let totalRealizedPnl = 0;

          const tokenTransactions = transactions.filter((tx: any) => 
            tx.tokenTransfers?.some((t: any) => t.mint === token_mint)
          );

          if (tokenTransactions.length > 0) {
            const firstTxTimestamp = tokenTransactions[0]?.timestamp;

            if (firstTxTimestamp) {
              // Age-relative "early entry" — entered within first 10% of token's life
              if (tokenAgeMinutes !== null && tokenAgeMinutes > 0) {
                const entryAgeMinutes = (Date.now() / 1000 - firstTxTimestamp) / 60;
                const earlyThresholdMinutes = tokenAgeMinutes * 0.1; // first 10%
                if (entryAgeMinutes >= tokenAgeMinutes * 0.9) {
                  // Was there since near-launch (within first 10% of life)
                  smartMoneyScore += 15;
                  earlyEntryCount++;
                } else if (entryAgeMinutes >= tokenAgeMinutes * 0.7) {
                  // Was there within first 30%
                  smartMoneyScore += 8;
                  earlyEntryCount++;
                }
              } else {
                // Fallback: fixed 30-day window if no token age provided
                const daysSinceLaunch = (Date.now() / 1000 - firstTxTimestamp) / 86400;
                if (daysSinceLaunch > 30) {
                  smartMoneyScore += 10;
                  earlyEntryCount++;
                }
              }
            }

            // Age-relative "diamond hands" — holding for >50% of token's life without selling
            const lastSell = tokenTransactions
              .filter((tx: any) => tx.type === 'SELL')
              .sort((a: any, b: any) => b.timestamp - a.timestamp)[0];
            
            if (tokenAgeMinutes !== null && tokenAgeMinutes > 0) {
              const holdThresholdSeconds = (tokenAgeMinutes * 60) * 0.5; // 50% of token life
              if (!lastSell || (Date.now() / 1000 - lastSell.timestamp) > holdThresholdSeconds) {
                smartMoneyScore += 15;
                diamondHandsCount++;
              } else {
                // Sold recently relative to token age
                const sellRecency = Date.now() / 1000 - lastSell.timestamp;
                if (sellRecency < (tokenAgeMinutes * 60) * 0.1) {
                  // Sold within last 10% of token's life — paper hands
                  paperHandsCount++;
                  smartMoneyScore -= 5;
                }
              }
            } else {
              // Fallback: fixed 30-day window
              if (!lastSell || (Date.now() / 1000 - lastSell.timestamp) > 30 * 86400) {
                smartMoneyScore += 15;
                diamondHandsCount++;
              }
            }
          }

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
        console.error('Helius API error:', redactHeliusSecrets((error as Error).message));
      }
    }

    const { data: tokenHistory } = await supabase
      .from('wallet_token_history')
      .select('*')
      .eq('wallet_address', wallet_address)
      .eq('token_mint', token_mint)
      .order('entry_date', { ascending: true });

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
    console.error('Error analyzing wallet behavior:', redactHeliusSecrets(error.message));
    return new Response(
      JSON.stringify({ error: redactHeliusSecrets(error.message) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
