import { withRunLog } from '../_shared/run-logger.ts';
import { resolveCreatorCoins } from '../_shared/pumpfun-creator-coins-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Diagnostic endpoint for the 3-tier creator-coins resolver.
 * Body: { wallet: string, allowApify?: boolean, bypassCooldown?: boolean }
 */
Deno.serve(withRunLog('pumpfun-profile-scrape-test', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { wallet, allowApify, bypassCooldown } = await req.json();
    if (!wallet || typeof wallet !== 'string') {
      return new Response(JSON.stringify({ error: 'wallet required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = await resolveCreatorCoins(wallet, {
      callerName: 'pumpfun-profile-scrape-test',
      apiOnly: false,
      allowApify: allowApify === true,
      bypassCooldown: bypassCooldown === true,
    });

    return new Response(
      JSON.stringify({
        wallet,
        tier_used: result.tierUsed,
        coins_found: result.coins.length,
        elapsed_ms: result.elapsedMs,
        errors: result.errors,
        coins: result.coins.slice(0, 25),
      }, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));