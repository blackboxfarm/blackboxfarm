import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Detect if a token is likely a pump.fun token
function isPumpFunToken(tokenMint: string): boolean {
  return tokenMint.endsWith('pump');
}

// Fetch creator directly from pump.fun API
async function fetchPumpFunCreator(tokenMint: string): Promise<string | null> {
  try {
    const response = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      console.log(`Pump.fun API returned ${response.status} for ${tokenMint}`);
      return null;
    }
    const data = await response.json();
    return data.creator || null;
  } catch (error) {
    console.error(`Pump.fun API error for ${tokenMint}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint } = await req.json();

    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Token mint address required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`Fetching creator for token: ${tokenMint}`);

    let creatorWallet: string | null = null;
    let metadata: any = {};

    // For pump.fun tokens, use pump.fun API as the PRIMARY and AUTHORITATIVE source
    if (isPumpFunToken(tokenMint)) {
      console.log(`[pump.fun token detected] Using pump.fun API as primary source`);
      creatorWallet = await fetchPumpFunCreator(tokenMint);
      
      if (creatorWallet) {
        console.log(`[pump.fun] Creator resolved: ${creatorWallet}`);
      } else {
        console.log(`[pump.fun] Creator not found via pump.fun API — NOT falling back to mint authority`);
      }
    } else {
      // For non-pump tokens, use Solscan as before
      const solscanApiKey = Deno.env.get('SOLSCAN_API_KEY');
      
      if (!solscanApiKey) {
        console.error('SOLSCAN_API_KEY not configured');
        return new Response(
          JSON.stringify({ error: 'API key not configured', creatorWallet: null }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );
      }

      const solscanResponse = await fetch(
        `https://pro-api.solscan.io/v1.0/token/meta?tokenAddress=${tokenMint}`,
        {
          headers: {
            'Accept': 'application/json',
            'token': solscanApiKey,
          }
        }
      );

      if (solscanResponse.ok) {
        metadata = await solscanResponse.json();
        // For non-pump tokens, mint_authority fallback is acceptable
        creatorWallet = metadata.creator || metadata.mint_authority || metadata.owner || null;
      } else {
        console.error(`Solscan API error: ${solscanResponse.status}`);
      }
    }

    console.log(`Creator wallet found: ${creatorWallet}`);

    // Check if this creator has a developer profile
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let profileExists = false;
    if (creatorWallet) {
      const { data: profile } = await supabaseClient
        .from('developer_profiles')
        .select('id')
        .eq('master_wallet_address', creatorWallet)
        .maybeSingle();

      profileExists = !!profile;
    }

    return new Response(
      JSON.stringify({ 
        creatorWallet,
        tokenMint,
        profileExists,
        metadata
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Error in solscan-creator-lookup:', error);
    return new Response(
      JSON.stringify({ error: error.message, creatorWallet: null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
