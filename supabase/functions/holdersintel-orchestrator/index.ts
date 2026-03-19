import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from '../_shared/run-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HoldersIntel + social scanning domain
const INTEL_FUNCTIONS = [
  'holders-intel-dex-scanner',
  'holders-intel-poster',
  'search-surge-scanner',
];

// Slower functions with custom tick intervals
const SLOW_FUNCTIONS: Record<string, number> = {
  'twitter-token-mention-scanner': 3, // every ~15 min
  'token-vigil': 1, // every tick (~5 min) — death detection + mid-growth snapshots
  'allstar-mint-auditor': 6, // every ~30 min — audit allstar wallet families for new mints
  'ath-24h-backfill': 2, // every ~10 min — cycling ATH backfill for tokens missing ath_24h_usd
  'social-link-mint-checker': 3, // every ~15 min — check Metaplex + PumpFun for missing socials
  'x-community-enricher': 4, // every ~20 min — spider unspidered X communities for admin/mod handles
  'ai-pattern-extractor': 2016, // weekly (~every 7 days) — extract recurring patterns from post-mortems
};

Deno.serve(withRunLog('holdersintel-orchestrator', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const minute = new Date().getMinutes();
  const tickNumber = Math.floor(minute / 5);

  const results: Record<string, { status: string; durationMs: number; error?: string }> = {};

  for (const fn of INTEL_FUNCTIONS) {
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

  // Slow functions
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
  
  console.log(`[holdersintel-orchestrator] ${Object.keys(results).length} functions, ${failures} failures, ${elapsed}ms`);

  return new Response(
    JSON.stringify({ orchestrator: 'holdersintel', tick: tickNumber, elapsed, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}));