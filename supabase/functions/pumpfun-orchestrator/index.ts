import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PumpFun domain functions to call in sequence
const PUMPFUN_FUNCTIONS = [
  'pumpfun-watchlist-monitor',
  'pumpfun-new-token-monitor',
  'pumpfun-buy-executor',
  'pumpfun-sell-monitor',
  'pumpfun-fantasy-executor',
  'pumpfun-fantasy-sell-monitor',
  'pumpfun-global-safeguards',
  'pumpfun-vip-monitor',
  'pumpfun-rejected-reviewer',
  'pumpfun-websocket-listener',
  'pumpfun-dev-wallet-monitor',
];

// These run less frequently — only on matching ticks
const SLOW_FUNCTIONS: Record<string, number> = {
  'pumpfun-token-enricher': 2,       // every 2nd tick (10 min)
  'pumpfun-comment-scanner': 2,      // every 2nd tick (10 min)
  'social-mesh-linker': 2,           // every 2nd tick (10 min) — auto-links socials to mesh
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Determine tick number for slow-function gating
  const minute = new Date().getMinutes();
  const tickNumber = Math.floor(minute / 5); // 0-11 ticks per hour

  const results: Record<string, { status: string; durationMs: number; error?: string }> = {};

  // Run all fast functions
  for (const fn of PUMPFUN_FUNCTIONS) {
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

  // Run slow functions on matching ticks
  for (const [fn, everyN] of Object.entries(SLOW_FUNCTIONS)) {
    if (tickNumber % everyN !== 0) {
      results[fn] = { status: 'skipped', durationMs: 0 };
      continue;
    }
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
  const failures = Object.values(results).filter(r => r.status !== 'ok' && r.status !== 'skipped').length;
  
  console.log(`[pumpfun-orchestrator] ${Object.keys(results).length} functions, ${failures} failures, ${elapsed}ms`);

  return new Response(
    JSON.stringify({ orchestrator: 'pumpfun', tick: tickNumber, elapsed, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});