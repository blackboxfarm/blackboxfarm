import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusRpcUrl, requireHeliusApiKey, redactHeliusSecrets } from '../_shared/helius-client.ts';
enableHeliusTracking('helius-fast-price');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * HELIUS FAST PRICE - Fastest possible price fetch
 * Uses Helius getAsset RPC method to get real-time price from token_info.price_info
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

    requireHeliusApiKey(); // Throws if not configured
    const url = getHeliusRpcUrl();
    
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

      const tokenInfo = data.result?.token_info;
      const priceInfo = tokenInfo?.price_info;
      const pricePerToken = priceInfo?.price_per_token;

      if (pricePerToken && pricePerToken > 0) {
        const content = data.result?.content;
        const metadata = content?.metadata;
        
        let finalPrice = pricePerToken;
        let priceSource = 'helius_getAsset';
        
        try {
          const dexController = new AbortController();
          const dexTimeoutId = setTimeout(() => dexController.abort(), 2000);
          
          const dexRes = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
            { signal: dexController.signal }
          );
          clearTimeout(dexTimeoutId);
          
          if (dexRes.ok) {
            const dexData = await dexRes.json();
            const dexPrice = parseFloat(dexData?.pairs?.[0]?.priceUsd);
            
            if (dexPrice > 0) {
              const deviation = Math.abs(pricePerToken - dexPrice) / dexPrice;
              
              if (deviation > 0.05) {
                console.log(`[helius-fast-price] Price deviation ${(deviation * 100).toFixed(1)}% - Helius: $${pricePerToken}, DexScreener: $${dexPrice}. Using DexScreener.`);
                finalPrice = dexPrice;
                priceSource = 'dexscreener_validated';
              }
            }
          }
        } catch (dexErr) {
          console.log(`[helius-fast-price] DexScreener validation skipped: ${redactHeliusSecrets((dexErr as Error).message)}`);
        }
        
        return new Response(
          JSON.stringify({
            success: true,
            price: finalPrice,
            currency: priceInfo?.currency || 'USDC',
            source: priceSource,
            heliusPrice: pricePerToken,
            latencyMs: Date.now() - startTime,
            symbol: metadata?.symbol || null,
            name: metadata?.name || null,
            image: content?.links?.image || content?.files?.[0]?.uri || null,
            decimals: tokenInfo?.decimals || null,
            supply: tokenInfo?.supply || null
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[helius-fast-price] No price in getAsset for ${tokenMint.slice(0, 8)}... (${latencyMs}ms)`);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NO_PRICE',
          message: 'Token price not available in Helius index',
          latencyMs,
          symbol: data.result?.content?.metadata?.symbol || null,
          name: data.result?.content?.metadata?.name || null
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      if ((fetchError as Error).name === 'AbortError') {
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
    console.error('[helius-fast-price] Error:', redactHeliusSecrets((err as Error).message || 'Internal server error'));
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: redactHeliusSecrets((err as Error).message || 'Internal server error'),
        latencyMs: Date.now() - startTime
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
