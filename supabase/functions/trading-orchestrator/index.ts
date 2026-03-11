import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Trading & monitoring domain functions
const TRADING_FUNCTIONS = [
  'flipit-execute',
  'flipit-preflight',
  'flipit-price-monitor',
  'scalp-realtime-monitor',
  'dexscreener-top-200-scraper',
  'token-mint-watchdog-monitor',
  'telegram-channel-monitor',
  'telegram-fantasy-price-monitor',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const minute = new Date().getMinutes();
  const tickNumber = Math.floor(minute / 5);

  const results: Record<string, { status: string; durationMs: number; error?: string }> = {};

  for (const fn of TRADING_FUNCTIONS) {
    const fnStart = Date.now();
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ source: 'orchestrator', tick: tickNumber }),
      });
      results[fn] = { status: res.ok ? 'ok' : `error_${res.status}`, durationMs: Date.now() - fnStart };
    } catch (e: any) {
      results[fn] = { status: 'exception', durationMs: Date.now() - fnStart, error: e.message };
    }
  }

  const elapsed = Date.now() - startTime;
  const failures = Object.values(results).filter(r => r.status !== 'ok').length;
  
  console.log(`[trading-orchestrator] ${Object.keys(results).length} functions, ${failures} failures, ${elapsed}ms`);

  return new Response(
    JSON.stringify({ orchestrator: 'trading', tick: tickNumber, elapsed, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});