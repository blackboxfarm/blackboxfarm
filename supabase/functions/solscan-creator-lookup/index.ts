import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { resolveTokenCreator } from '../_shared/creator-resolver.ts';

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

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Use unified creator resolver (pump.fun → Helius → DAS → DB)
    const apiErrors: string[] = [];
    const resolution = await resolveTokenCreator(tokenMint, supabaseClient, apiErrors);
    
    const creatorWallet = resolution.creatorWallet;
    console.log(`Creator resolved: ${creatorWallet || 'none'} via ${resolution.source} (confidence: ${resolution.confidence})`);
    
    if (apiErrors.length > 0) {
      console.log(`API errors during resolution: ${apiErrors.join(', ')}`);
    }

    // Check if this creator has a developer profile
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
        source: resolution.source,
        confidence: resolution.confidence,
        metadata: {},
        apiErrors: apiErrors.length > 0 ? apiErrors : undefined,
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
