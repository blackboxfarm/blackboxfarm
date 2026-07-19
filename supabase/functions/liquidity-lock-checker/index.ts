// STOPPED & ARCHIVED 2026-07-19
// Original source: docs/archived-functions/liquidity-lock-checker.md
// Stub returns an empty "not locked / unknown" payload immediately.
// No Helius, Solscan, DexScreener, or Meteora calls are made.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      stopped: true,
      isLocked: false,
      lockPercentage: null,
      lockMechanism: 'stub_disabled',
      dataQuality: 'disabled',
      checkedMethods: [],
      detectedPlatforms: [],
      note: 'liquidity-lock-checker has been retired. See docs/archived-functions/liquidity-lock-checker.md',
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
  );
});