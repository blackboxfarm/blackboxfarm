import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getVenueAwareQuote, detectVenue } from "../_shared/venue-aware-quote.ts";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { requireHeliusApiKey, redactHeliusSecrets } from '../_shared/helius-client.ts';
enableHeliusTracking('flipit-preflight');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint, solAmount, walletPubkey, slippageBps = 500 } = await req.json();

    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'tokenMint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!solAmount || solAmount <= 0) {
      return new Response(
        JSON.stringify({ error: 'solAmount must be positive' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const heliusApiKey = requireHeliusApiKey();

    const solAmountLamports = Math.floor(solAmount * 1e9);
    
    const { venue, isOnCurve } = await detectVenue(tokenMint, heliusApiKey);
    
    const quote = await getVenueAwareQuote(
      tokenMint,
      solAmountLamports,
      walletPubkey || 'preflight-check',
      {
        heliusApiKey,
        slippageBps
      }
    );

    if (!quote) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'QUOTE_UNAVAILABLE',
          message: 'Could not fetch executable quote for this token',
          venue,
          isOnCurve
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        venue: quote.venue,
        isOnCurve: quote.isOnCurve,
        executablePriceUsd: quote.executablePriceUsd,
        tokensOut: quote.tokensOut,
        solSpent: quote.solSpent,
        priceImpactPct: quote.priceImpactPct,
        confidence: quote.confidence,
        source: quote.source,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[flipit-preflight] Error:', redactHeliusSecrets((err as Error).message || 'Internal server error'));
    return new Response(
      JSON.stringify({ error: redactHeliusSecrets((err as Error).message || 'Internal server error') }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
