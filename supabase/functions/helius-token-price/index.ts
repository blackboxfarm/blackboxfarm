import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const heliusRpcUrl = Deno.env.get('HELIUS_RPC_URL');
    
    if (!heliusRpcUrl) {
      console.error('HELIUS_RPC_URL not configured');
      throw new Error('Helius RPC URL not configured');
    }

    const { tokenMint } = await req.json();
    
    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }

    console.log('Fetching price for token from Helius:', tokenMint);

    // Extract API key from the RPC URL
    const apiKey = heliusRpcUrl.split('api-key=')[1];
    
    if (!apiKey) {
      throw new Error('API key not found in HELIUS_RPC_URL');
    }

    // Use Helius DAS API to get token price
    const heliusResponse = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mintAccounts: [tokenMint],
        includeOffChain: true,
        disableCache: false
      })
    });

    if (!heliusResponse.ok) {
      throw new Error(`Helius API error: ${heliusResponse.status}`);
    }

    const heliusData = await heliusResponse.json();
    console.log('Helius response:', heliusData);

    if (!heliusData || heliusData.length === 0) {
      throw new Error('No token data found from Helius');
    }

    const tokenData = heliusData[0];
    
    // Try to get price from token metadata
    let price = 0;
    if (tokenData.offChainMetadata?.price) {
      price = parseFloat(tokenData.offChainMetadata.price);
    }

    return new Response(
      JSON.stringify({
        success: true,
        tokenMint,
        price,
        heliusData: tokenData,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Error in helius-token-price:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});