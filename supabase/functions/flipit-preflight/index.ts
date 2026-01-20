import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getVenueAwareQuote, detectVenue } from "../_shared/venue-aware-quote.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * FLIPIT PREFLIGHT ENDPOINT
 * 
 * Returns venue-aware executable price quote BEFORE trade execution.
 * Frontend should call this to display accurate price to user before confirmation.
 * 
 * This ensures:
 * 1. User sees the SAME price that will be used for Trade Guard validation
 * 2. User can confirm/reject based on actual executable price, not stale display price
 * 3. No "silent repricing" - full transparency
 */
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

    const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
    
    if (!heliusApiKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error: missing HELIUS_API_KEY' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const solAmountLamports = Math.floor(solAmount * 1e9);
    
    // Get venue detection first for metadata
    const { venue, isOnCurve } = await detectVenue(tokenMint, heliusApiKey);
    
    // Get venue-aware quote
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

    // Return comprehensive preflight data
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
    console.error('[flipit-preflight] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
