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
    const { tokenMint } = await req.json();
    
    if (!tokenMint) {
      return new Response(JSON.stringify({ error: 'tokenMint required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch metadata from DexScreener
    let symbol = null;
    let name = null;
    let imageUri = null;
    let marketCap = null;
    let mintedAt = null;
    let bondedAt = null;

    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      if (dexRes.ok) {
        const dexData = await dexRes.json();
        const pair = dexData?.pairs?.[0];
        if (pair) {
          symbol = pair.baseToken?.symbol;
          name = pair.baseToken?.name;
          imageUri = pair.info?.imageUrl;
          marketCap = pair.marketCap || pair.fdv;
          
          // Get creation time
          if (pair.pairCreatedAt) {
            bondedAt = new Date(pair.pairCreatedAt).toISOString();
          }
        }
      }
    } catch (e) {
      console.log('DexScreener fetch failed:', e);
    }

    // Try to get minted_at from Helius if pump.fun token
    if (tokenMint.endsWith('pump')) {
      try {
        const heliusKey = Deno.env.get('HELIUS_API_KEY');
        if (heliusKey) {
          const sigRes = await fetch(`https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusKey}&limit=1&type=NFT_MINT`);
          if (sigRes.ok) {
            const txs = await sigRes.json();
            if (txs?.[0]?.timestamp) {
              mintedAt = new Date(txs[0].timestamp * 1000).toISOString();
            }
          }
        }
      } catch (e) {
        console.log('Helius mint time fetch failed:', e);
      }
    }

    // Upsert into holders_intel_seen_tokens
    // Set was_posted = true so it appears in Token X Dashboard
    const { data, error } = await supabase
      .from('holders_intel_seen_tokens')
      .upsert({
        token_mint: tokenMint,
        symbol,
        name,
        image_uri: imageUri,
        market_cap_at_discovery: marketCap,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        times_seen: 1,
        was_posted: true,
        minted_at: mintedAt,
        bonded_at: bondedAt,
      }, { 
        onConflict: 'token_mint',
        ignoreDuplicates: false 
      })
      .select()
      .single();

    if (error) {
      console.error('Upsert error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      token: data,
      metadata: { symbol, name, imageUri, marketCap }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
