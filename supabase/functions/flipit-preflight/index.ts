import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getVenueAwareQuote, detectVenue } from "../_shared/venue-aware-quote.ts";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { requireHeliusApiKey, redactHeliusSecrets } from '../_shared/helius-client.ts';
import { runMeshGuard } from '../_shared/blacklist-mesh-guard.ts';
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
    const body = await req.json();

    // Pre-warm handler: keep isolate alive without side effects
    if (body.action === 'warmup') {
      return new Response(JSON.stringify({ warm: true, ts: Date.now() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { tokenMint, solAmount, walletPubkey, slippageBps = 500 } = body;

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

    // Run mesh guard check in parallel with venue detection
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const [guardResult, venueResult] = await Promise.all([
      runMeshGuard(supabase, tokenMint),
      detectVenue(tokenMint, heliusApiKey)
    ]);

    const meshGuardWarning = guardResult.blocked
      ? {
          blocked: true,
          reason: guardResult.reason,
          level: guardResult.level,
          source: guardResult.source,
          creatorWallet: guardResult.creatorWallet,
          creatorSource: guardResult.creatorSource,
        }
      : null;

    if (guardResult.blocked) {
      console.warn('[flipit-preflight] Mesh guard warning bypassed for buy preflight:', {
        tokenMint,
        level: guardResult.level,
        source: guardResult.source,
        reason: guardResult.reason,
      });
    }

    const { venue, isOnCurve } = venueResult;
    const solAmountLamports = Math.floor(solAmount * 1e9);

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
          isOnCurve,
          meshGuardWarning
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Derive venueHint for downstream use
    const venueHint = quote.isOnCurve 
      ? (quote.venue === 'pumpfun' ? 'pumpfun_curve' : quote.venue === 'bags_fm' ? 'bags_fm' : quote.venue === 'bonk_fun' ? 'bonk_fun' : undefined)
      : 'dex';

    return new Response(
      JSON.stringify({
        success: true,
        venue: quote.venue,
        isOnCurve: quote.isOnCurve,
        venueHint,
        executablePriceUsd: quote.executablePriceUsd,
        tokensOut: quote.tokensOut,
        solSpent: quote.solSpent,
        priceImpactPct: quote.priceImpactPct,
        confidence: quote.confidence,
        source: quote.source,
        meshGuardWarning,
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
