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

      console.log(`[helius-fast-price] No price in getAsset for ${tokenMint.slice(0, 8)}... (${latencyMs}ms). Trying pump.fun bonding curve...`);
      
      // FALLBACK: Pump.fun bonding curve API for pre-graduation tokens
      try {
        const pumpController = new AbortController();
        const pumpTimeout = setTimeout(() => pumpController.abort(), 3000);
        
        const pumpRes = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`, {
          signal: pumpController.signal
        });
        clearTimeout(pumpTimeout);
        
        if (pumpRes.ok) {
          const pumpData = await pumpRes.json();
          const vSol = pumpData.virtual_sol_reserves;
          const vToken = pumpData.virtual_token_reserves;
          
          if (vSol && vToken && vToken > 0) {
            // Bonding curve math: price in SOL = virtual_sol_reserves / virtual_token_reserves
            // Convert lamports to SOL (reserves are in lamports/raw units)
            const priceSol = (vSol / 1e9) / (vToken / 1e6);
            
            // Get SOL price from the pump.fun data or fallback
            let solPriceUsd = 0;
            if (pumpData.usd_market_cap && pumpData.market_cap) {
              // market_cap is in SOL, usd_market_cap is in USD
              solPriceUsd = pumpData.usd_market_cap / pumpData.market_cap;
            }
            
            if (solPriceUsd <= 0) {
              // Quick SOL price from CoinGecko
              try {
                const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                if (cgRes.ok) {
                  const cgData = await cgRes.json();
                  solPriceUsd = cgData?.solana?.usd || 0;
                }
              } catch {}
            }
            
            const priceUsd = priceSol * solPriceUsd;
            
            if (priceUsd > 0) {
              console.log(`[helius-fast-price] Pump.fun bonding curve price: $${priceUsd.toFixed(10)} (${priceSol.toFixed(12)} SOL)`);
              
              return new Response(
                JSON.stringify({
                  success: true,
                  price: priceUsd,
                  priceSol,
                  currency: 'USD',
                  source: 'pumpfun_bonding_curve',
                  latencyMs: Date.now() - startTime,
                  symbol: pumpData.symbol || data.result?.content?.metadata?.symbol || null,
                  name: pumpData.name || data.result?.content?.metadata?.name || null,
                  image: pumpData.image_uri || data.result?.content?.links?.image || null,
                  decimals: pumpData.decimals || tokenInfo?.decimals || null,
                  supply: tokenInfo?.supply || null,
                  bondingCurveProgress: pumpData.bonding_curve_progress || null,
                  marketCapUsd: pumpData.usd_market_cap || null
                }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          }
        }
      } catch (pumpErr) {
        console.log(`[helius-fast-price] Pump.fun fallback failed: ${(pumpErr as Error).message}`);
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NO_PRICE',
          message: 'Token price not available from Helius or pump.fun bonding curve',
          latencyMs: Date.now() - startTime,
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
