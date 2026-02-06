import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * HELIUS FAST PRICE - Fastest possible price fetch
 * 
 * Uses Helius getAsset RPC method to get real-time price from token_info.price_info
 * This is the PRIMARY price source - called FIRST on paste, before any other API
 * 
 * Target latency: 200-500ms
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { tokenMint } = await req.json();

    if (!tokenMint || tokenMint.length < 32) {
      return new Response(
        JSON.stringify({ error: 'Invalid tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
    
    if (!heliusApiKey) {
      return new Response(
        JSON.stringify({ error: 'HELIUS_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
    
    // Use AbortController for fast timeout (3 seconds max)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAsset',
          params: { id: tokenMint }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Helius returned ${response.status}`);
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      // Extract price from token_info.price_info
      const tokenInfo = data.result?.token_info;
      const priceInfo = tokenInfo?.price_info;
      const pricePerToken = priceInfo?.price_per_token;

      if (pricePerToken && pricePerToken > 0) {
        // Also extract basic metadata while we're here
        const content = data.result?.content;
        const metadata = content?.metadata;
        
        return new Response(
          JSON.stringify({
            success: true,
            price: pricePerToken,
            currency: priceInfo?.currency || 'USDC',
            source: 'helius_getAsset',
            latencyMs,
            // Bonus: include basic metadata if available
            symbol: metadata?.symbol || null,
            name: metadata?.name || null,
            image: content?.links?.image || content?.files?.[0]?.uri || null,
            decimals: tokenInfo?.decimals || null,
            supply: tokenInfo?.supply || null
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Price not available in Helius response
      // This happens for very new tokens not yet indexed
      console.log(`[helius-fast-price] No price in getAsset for ${tokenMint.slice(0, 8)}... (${latencyMs}ms)`);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NO_PRICE',
          message: 'Token price not available in Helius index',
          latencyMs,
          // Still return any metadata we found
          symbol: data.result?.content?.metadata?.symbol || null,
          name: data.result?.content?.metadata?.name || null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if (fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'TIMEOUT', 
            message: 'Helius request timed out',
            latencyMs: Date.now() - startTime
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }

  } catch (err) {
    console.error('[helius-fast-price] Error:', err);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err.message || 'Internal server error',
        latencyMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
