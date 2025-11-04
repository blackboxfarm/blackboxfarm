import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Call Solscan API to get token metadata
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

    if (!solscanResponse.ok) {
      console.error(`Solscan API error: ${solscanResponse.status}`);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch from Solscan', creatorWallet: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    const data = await solscanResponse.json();
    
    // Extract creator wallet from various possible fields
    const creatorWallet = data.creator || data.mint_authority || data.owner || null;

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
        metadata: data
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