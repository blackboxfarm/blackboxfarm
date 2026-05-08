import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { fetchWalletPortfolio } from '../_shared/solscan-portfolio.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

serve(withRunLog('wallet-portfolio-chip', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { wallet, force = false } = await req.json().catch(() => ({}));
    if (!wallet || typeof wallet !== 'string' || wallet.length < 32) {
      return new Response(JSON.stringify({ error: 'wallet (string) is required' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const apiErrors: string[] = [];
    const portfolio = await fetchWalletPortfolio(wallet, { force, apiErrors });

    if (!portfolio) {
      return new Response(
        JSON.stringify({ wallet, found: false, apiErrors }),
        { status: 200, headers: corsHeaders },
      );
    }

    return new Response(
      JSON.stringify({ wallet, found: true, portfolio, apiErrors }),
      { status: 200, headers: corsHeaders },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: corsHeaders },
    );
  }
}));