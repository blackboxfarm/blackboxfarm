import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusRpcUrl, requireHeliusApiKey, redactHeliusSecrets } from '../_shared/helius-client.ts';
import { fetchPumpFunCoin } from '../_shared/pumpfun-fetch.ts';
import { computeBondingCurvePrice, fetchBondingCurveState, resolvePrice } from '../_shared/price-resolver.ts';
import { getVenueAwareQuote } from '../_shared/venue-aware-quote.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getSolPriceFromCache } from '../_shared/sol-price-cache.ts';
enableHeliusTracking('helius-fast-price');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * HELIUS FAST PRICE - Fastest possible price fetch
 * Uses Helius getAsset RPC method to get real-time price from token_info.price_info
 */
serve(withRunLog('helius-fast-price', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const { tokenMint, solAmount, walletPubkey, slippageBps = 500 } = await req.json();

    if (!tokenMint || tokenMint.length < 32) {
      return new Response(
        JSON.stringify({ error: 'Invalid tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const quoteSolAmount = Number.isFinite(Number(solAmount)) && Number(solAmount) > 0
      ? Number(solAmount)
      : 0.1;
    const quoteLamports = Math.floor(quoteSolAmount * 1e9);

    const heliusApiKey = requireHeliusApiKey(); // Throws if not configured
    const url = getHeliusRpcUrl();

    try {
      const venueQuote = await getVenueAwareQuote(
        tokenMint,
        quoteLamports,
        walletPubkey || 'helius-fast-price',
        {
          heliusApiKey,
          slippageBps,
        }
      );

      if (venueQuote?.executablePriceUsd && venueQuote.executablePriceUsd > 0) {
        const venueHint = venueQuote.isOnCurve
          ? (venueQuote.venue === 'pumpfun'
              ? 'pumpfun_curve'
              : venueQuote.venue === 'bags_fm'
                ? 'bags_fm'
                : venueQuote.venue === 'bonk_fun'
                  ? 'bonk_fun'
                  : undefined)
          : 'dex';

        return new Response(
          JSON.stringify({
            success: true,
            price: venueQuote.executablePriceUsd,
            executablePriceUsd: venueQuote.executablePriceUsd,
            currency: 'USD',
            source: venueQuote.source,
            venue: venueQuote.venue,
            venueHint,
            isOnCurve: venueQuote.isOnCurve,
            solAmount: quoteSolAmount,
            tokensOut: venueQuote.tokensOut,
            solSpent: venueQuote.solSpent,
            priceImpactPct: venueQuote.priceImpactPct,
            confidence: venueQuote.confidence,
            latencyMs: Date.now() - startTime,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (venueQuoteErr) {
      console.log(`[helius-fast-price] venue-aware quote failed: ${(venueQuoteErr as Error).message}`);
    }

    try {
      const resolved = await resolvePrice(tokenMint, {
        forceFresh: true,
        heliusApiKey,
      });

      if (resolved?.price && resolved.price > 0) {
        return new Response(
          JSON.stringify({
            success: true,
            price: resolved.price,
            currency: 'USD',
            source: resolved.source,
            venueHint: resolved.isOnCurve ? 'pumpfun_curve' : 'pumpfun_graduated',
            isOnCurve: resolved.isOnCurve,
            latencyMs: Date.now() - startTime,
            bondingCurveProgress: resolved.bondingCurveProgress ?? null,
            pairAddress: resolved.pairAddress ?? null,
            virtualSolReserves: resolved.virtualSolReserves ?? null,
            virtualTokenReserves: resolved.virtualTokenReserves ?? null,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (resolvedErr) {
      console.log(`[helius-fast-price] resolvePrice failed: ${(resolvedErr as Error).message}`);
    }

    try {
      const curveState = await fetchBondingCurveState(tokenMint, heliusApiKey);
      if (curveState?.isOnCurve) {
        let solPriceUsd = 0;

        try {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
          if (supabaseUrl && serviceKey) {
            const sb = createClient(supabaseUrl, serviceKey);
            solPriceUsd = await getSolPriceFromCache(sb);
          }
        } catch (solErr) {
          console.log(`[helius-fast-price] SOL price cache lookup failed during on-chain curve probe: ${(solErr as Error).message}`);
        }

        if (solPriceUsd > 0) {
          const priceUsd = computeBondingCurvePrice(curveState, solPriceUsd);
          if (priceUsd > 0) {
            return new Response(
              JSON.stringify({
                success: true,
                price: priceUsd,
                currency: 'USD',
                source: 'pumpfun_curve',
                venueHint: 'pumpfun_curve',
                isOnCurve: true,
                latencyMs: Date.now() - startTime,
                bondingCurveProgress: curveState.progress,
                virtualSolReserves: Number(curveState.virtualSolReserves),
                virtualTokenReserves: Number(curveState.virtualTokenReserves),
              }),
              { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        }
      }
    } catch (curveProbeErr) {
      console.log(`[helius-fast-price] Generic on-chain pump.fun curve probe failed: ${(curveProbeErr as Error).message}`);
    }

    if (tokenMint.endsWith('pump')) {
      try {
        const resolved = await resolvePrice(tokenMint, {
          forceFresh: true,
          heliusApiKey,
          venueHint: 'pumpfun_curve',
        });

        if (resolved?.price && resolved.price > 0) {
          return new Response(
            JSON.stringify({
              success: true,
              price: resolved.price,
              currency: 'USD',
              source: resolved.source,
              venueHint: resolved.isOnCurve ? 'pumpfun_curve' : 'pumpfun_graduated',
              isOnCurve: resolved.isOnCurve,
              latencyMs: Date.now() - startTime,
              bondingCurveProgress: resolved.bondingCurveProgress ?? null,
              pairAddress: resolved.pairAddress ?? null,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } catch (resolvedErr) {
        console.log(`[helius-fast-price] resolvePrice failed for pump mint: ${(resolvedErr as Error).message}`);
      }
    }
    
    const controller = new AbortController();
    // Tightened: 1.5s. If Helius doesn't answer in 1.5s, fall through to pump.fun curve.
    const timeoutId = setTimeout(() => controller.abort(), 1500);

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
      const isPumpMint = tokenMint.endsWith('pump');

      if (isPumpMint) {
        try {
          const pumpData = await fetchPumpFunCoin(tokenMint, 'helius-fast-price');
          const isOnCurve = pumpData && !pumpData.complete && !pumpData.raydium_pool;
          const vSol = pumpData?.virtual_sol_reserves;
          const vToken = pumpData?.virtual_token_reserves;

          if (isOnCurve && vSol && vToken && vToken > 0) {
            let solPriceUsd = 0;
            if (pumpData.usd_market_cap && pumpData.market_cap) {
              solPriceUsd = pumpData.usd_market_cap / pumpData.market_cap;
            }

            if (solPriceUsd <= 0) {
              try {
                const supabaseUrl = Deno.env.get('SUPABASE_URL');
                const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                if (supabaseUrl && serviceKey) {
                  const sb = createClient(supabaseUrl, serviceKey);
                  solPriceUsd = await getSolPriceFromCache(sb);
                }
              } catch (solErr) {
                console.log(`[helius-fast-price] SOL price cache lookup failed: ${(solErr as Error).message}`);
              }
            }

            const priceSol = (vSol / 1e9) / (vToken / 1e6);
            const priceUsd = priceSol * solPriceUsd;

            if (priceUsd > 0) {
              return new Response(
                JSON.stringify({
                  success: true,
                  price: priceUsd,
                  priceSol,
                  currency: 'USD',
                  source: 'pumpfun_bonding_curve',
                  venueHint: 'pumpfun_curve',
                  isOnCurve: true,
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
        } catch (pumpCurveErr) {
          console.log(`[helius-fast-price] Pump-first curve check failed: ${(pumpCurveErr as Error).message}`);
        }
      }

      if (pricePerToken && pricePerToken > 0) {
        const content = data.result?.content;
        const metadata = content?.metadata;

        // INSTANT RETURN: Helius price is good — return it now.
        // DexScreener cross-check moved to background (non-blocking) for monitoring only.
        try {
          // @ts-ignore — EdgeRuntime is available in Supabase Edge runtime
          const waitUntil = (globalThis as any).EdgeRuntime?.waitUntil;
          if (typeof waitUntil === 'function') {
            waitUntil((async () => {
              try {
                const dexController = new AbortController();
                const dexTimeoutId = setTimeout(() => dexController.abort(), 2500);
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
                      console.log(`[helius-fast-price] BG deviation ${(deviation * 100).toFixed(1)}% - Helius: $${pricePerToken}, DexScreener: $${dexPrice} (logged only, response already sent)`);
                    }
                  }
                }
              } catch (bgErr) {
                console.log(`[helius-fast-price] BG DexScreener cross-check failed: ${redactHeliusSecrets((bgErr as Error).message)}`);
              }
            })());
          }
        } catch { /* waitUntil not available, skip silently */ }

        return new Response(
          JSON.stringify({
            success: true,
            price: pricePerToken,
            currency: priceInfo?.currency || 'USDC',
            source: 'helius_getAsset',
            isOnCurve: false,
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
        const pumpData = await fetchPumpFunCoin(tokenMint, 'helius-fast-price');
        if (pumpData) {
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
              // Use shared SOL price cache (5-min staleness guard) instead of inline CoinGecko call.
              try {
                const supabaseUrl = Deno.env.get('SUPABASE_URL');
                const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
                if (supabaseUrl && serviceKey) {
                  const sb = createClient(supabaseUrl, serviceKey);
                  solPriceUsd = await getSolPriceFromCache(sb);
                }
              } catch (solErr) {
                console.log(`[helius-fast-price] SOL price cache lookup failed: ${(solErr as Error).message}`);
              }
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
                    venueHint: 'pumpfun_curve',
                    isOnCurve: true,
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
        error: 'PRICE_FETCH_FAILED',
        message: redactHeliusSecrets((err as Error).message || 'Internal server error'),
        fallback: true,
        latencyMs: Date.now() - startTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));