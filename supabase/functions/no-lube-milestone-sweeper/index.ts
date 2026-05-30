// no-lube-milestone-sweeper
// Periodic cron that re-invokes no-lube-orchestrate for every recently active
// token so the multiplier gate (2x / 3x / 4x ...) actually has a chance to
// fire. Without this sweeper, orchestrate is only ever called once per token
// (by blackbox-tick at handoff), which is why milestone posts had stopped.
//
// Targets, deduped by mint:
//   1) Tokens with a successful snapshot post but NO big_picture yet (so
//      stuck snapshots eventually advance to big_picture once enrichment
//      catches up).
//   2) Tokens with a posted big_picture in the last 48h (re-sighting / 2x+).
//
// Throttled per-mint via last_resighting_swept_at on the lifecycle row.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_MINTS_PER_RUN = 40;
const RESIGHT_LOOKBACK_HOURS = 48;
const PER_MINT_COOLDOWN_SECS = 180; // don't re-poke the same mint faster than ~3 minutes

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const since = new Date(Date.now() - RESIGHT_LOOKBACK_HOURS * 3600 * 1000).toISOString();

    // Pull recent posted rows (snapshot + big_picture). Distinct on mint.
    const { data: recent, error: recentErr } = await supabase
      .from('no_lube_post_log')
      .select('token_mint, post_kind, posted_at')
      .eq('posted', true)
      .gte('posted_at', since)
      .order('posted_at', { ascending: false })
      .limit(500);
    if (recentErr) throw recentErr;

    const seen = new Set<string>();
    const candidates: string[] = [];
    for (const row of recent || []) {
      const m = (row as any).token_mint as string;
      if (!m || seen.has(m)) continue;
      seen.add(m);
      candidates.push(m);
      if (candidates.length >= MAX_MINTS_PER_RUN * 2) break;
    }

    // Cooldown + UPWARD-PROGRESSION gate.
    // A retry only has value when peak_multiplier has actually advanced upward
    // since the last posted multiplier (e.g. last post was 4x, peak is now >=
    // 4x * PROGRESS_STEP = 6x). The upward-progression gate by itself prevents
    // flat-token re-enrichment — no separate freshness window needed. Tokens
    // routinely take >30 min to pump (XCAT hit 6x at ~85 min), and a tight
    // freshness window was silently killing every legitimate multiplier post.
    const FRESHNESS_HOURS = RESIGHT_LOOKBACK_HOURS; // match lookback (48h)
    const FIRST_MULTIPLIER_THRESHOLD = 2.0; // first multiplier post always at 2x
    const cutoff = new Date(Date.now() - PER_MINT_COOLDOWN_SECS * 1000).toISOString();
    const freshnessCutoff = new Date(Date.now() - FRESHNESS_HOURS * 3600 * 1000).toISOString();

    // Load global PROGRESS_STEP (configurable on no_lube_global_profile).
    let progressStep = 1.5;
    const { data: gprof } = await supabase
      .from('no_lube_global_profile')
      .select('progress_step')
      .eq('id', 'singleton')
      .maybeSingle();
    if ((gprof as any)?.progress_step != null) {
      const v = Number((gprof as any).progress_step);
      if (isFinite(v) && v > 1) progressStep = v;
    }

    const { data: lcRows } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint, last_resighting_swept_at, first_called_at, entry_market_cap, peak_market_cap, peak_multiplier')
      .in('token_mint', candidates);
    const lcByMint = new Map<string, any>(
      (lcRows || []).map((r: any) => [r.token_mint, r])
    );

    // Pull last_multiplier of the most recent posted big_picture/milestone row per mint.
    const { data: lastPosts } = await supabase
      .from('no_lube_post_log')
      .select('token_mint, last_multiplier, composed_at, post_kind')
      .in('token_mint', candidates)
      .eq('posted', true)
      .in('post_kind', ['big_picture', 'milestone'])
      .order('composed_at', { ascending: false });
    const lastMultByMint = new Map<string, number>();
    for (const r of (lastPosts || []) as any[]) {
      if (!lastMultByMint.has(r.token_mint)) {
        lastMultByMint.set(r.token_mint, Number(r.last_multiplier) || 0);
      }
    }

    const eligible = candidates
      .filter((m) => {
        const row = lcByMint.get(m);
        if (!row) return false;
        if (row.last_resighting_swept_at && row.last_resighting_swept_at >= cutoff) return false;
        if (!row.first_called_at || row.first_called_at < freshnessCutoff) return false;
        const entry = Number(row.entry_market_cap) || 0;
        const peakMcap = Number(row.peak_market_cap) || 0;
        const peakMult = Number(row.peak_multiplier) || 0;
        const mult = peakMult > 0 ? peakMult : (entry > 0 && peakMcap > 0 ? peakMcap / entry : 0);
        if (mult < FIRST_MULTIPLIER_THRESHOLD) return false;
        // Upward-progression gate
        const lastMult = lastMultByMint.get(m) || 0;
        const required = lastMult > 0 ? lastMult * progressStep : FIRST_MULTIPLIER_THRESHOLD;
        if (mult < required) return false;
        return true;
      })
      .slice(0, MAX_MINTS_PER_RUN);

    const results: Array<{ mint: string; ok: boolean; flow?: string; reason?: string }> = [];

    for (const mint of eligible) {
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/no-lube-orchestrate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ mint, source: 'milestone-sweeper' }),
        });
        const j = await r.json().catch(() => ({}));
        results.push({
          mint,
          ok: r.ok && j?.ok !== false,
          flow: j?.flow,
          reason: j?.reason,
        });
      } catch (e: any) {
        results.push({ mint, ok: false, reason: `dispatch_error: ${e?.message || e}` });
      }
      // Stamp swept timestamp (best-effort).
      await supabase
        .from('telegram_insider_token_lifecycle')
        .update({ last_resighting_swept_at: new Date().toISOString() })
        .eq('token_mint', mint);
    }

    return new Response(JSON.stringify({
      ok: true,
      considered: candidates.length,
      swept: results.length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[no-lube-milestone-sweeper] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});