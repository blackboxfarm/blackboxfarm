import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getHeliusRpcUrl } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * HELIUS RPC PROXY - Proxies DAS API calls to Helius
 * Used by bubble map holdings overlay to fetch token balances per wallet
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { method, params } = await req.json();

    if (!method || !params) {
      return new Response(
        JSON.stringify({ error: 'Missing method or params' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Only allow specific safe DAS methods
    const allowedMethods = ['getAssetsByOwner', 'getAsset', 'getAssetsByGroup'];
    if (!allowedMethods.includes(method)) {
      return new Response(
        JSON.stringify({ error: `Method '${method}' not allowed` }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rpcUrl = getHeliusRpcUrl();

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'helius-rpc-proxy',
        method,
        params,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[helius-rpc-proxy] Helius error ${response.status}:`, errorText);
      return new Response(
        JSON.stringify({ error: `Helius returned ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('[helius-rpc-proxy] Error:', err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
