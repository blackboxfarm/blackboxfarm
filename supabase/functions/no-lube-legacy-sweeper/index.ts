// no-lube-legacy-sweeper
// Long-tail "look what we called" marketing sweeper. Targets tokens that
// were called more than 48h ago and have CONTINUED to climb past their
// last posted multiplier. Posts a retrospective brag to BOTH private and
// public channels — reinforces subscriber value, no fresh-fomo framing.
//
// Eligibility (all must hold):
//   - lifecycle.first_called_at between (48h ago) and (legacy_max_age_days ago)
//   - has at least one prior posted big_picture / milestone / legacy_brag row
//   - now() - last_posted_at >= legacy_min_gap_hours
//   - current_mcap >= legacy_min_mcap (drops dead carcasses)
//   - current_mcap / entry_market_cap >= last_multiplier * legacy_progress_step
//
// Throttled per-mint via telegram_insider_token_lifecycle.last_legacy_swept_at.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LEGACY_MAX_MINTS_PER_RUN = 10;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Load tuning knobs.
    let legacyMinMcap = 250000;
    let legacyMinGapHours = 24;
    let legacyMaxAgeDays = 30;
    let legacyProgressStep = 1.5;
    const { data: gprof } = await supabase
      .from('no_lube_global_profile')
      .select('legacy_min_mcap, legacy_min_gap_hours, legacy_max_age_days, legacy_progress_step')
      .eq('id', 'singleton')
      .maybeSingle();
    if ((gprof as any)?.legacy_min_mcap != null) legacyMinMcap = Number((gprof as any).legacy_min_mcap) || legacyMinMcap;
    if ((gprof as any)?.legacy_min_gap_hours != null) legacyMinGapHours = Number((gprof as any).legacy_min_gap_hours) || legacyMinGapHours;
    if ((gprof as any)?.legacy_max_age_days != null) legacyMaxAgeDays = Number((gprof as any).legacy_max_age_days) || legacyMaxAgeDays;
    if ((gprof as any)?.legacy_progress_step != null) {
      const v = Number((gprof as any).legacy_progress_step);
      if (isFinite(v) && v > 1) legacyProgressStep = v;
    }

    const now = Date.now();
    const olderThan = new Date(now - 48 * 3600 * 1000).toISOString();
    const newerThan = new Date(now - legacyMaxAgeDays * 24 * 3600 * 1000).toISOString();
    const gapCutoff = new Date(now - legacyMinGapHours * 3600 * 1000).toISOString();

    // Pull candidate lifecycle rows in the legacy window with a valid entry mcap.
    const { data: lcRows, error: lcErr } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('token_mint, token_symbol, entry_market_cap, first_called_at, last_legacy_swept_at')
      .lt('first_called_at', olderThan)
      .gt('first_called_at', newerThan)
      .gt('entry_market_cap', 0)
      .limit(500);
    if (lcErr) throw lcErr;

    const mints = (lcRows || []).map((r: any) => r.token_mint);
    if (mints.length === 0) {
      return new Response(JSON.stringify({ ok: true, considered: 0, swept: 0, results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Latest posted row per mint (any kind) to get last_multiplier + last_posted_at.
    const { data: lastPosts } = await supabase
      .from('no_lube_post_log')
      .select('token_mint, last_multiplier, last_posted_at, posted_at, composed_at, post_kind')
      .in('token_mint', mints)
      .eq('posted', true)
      .order('composed_at', { ascending: false });
    const lastByMint = new Map<string, any>();
    for (const r of (lastPosts || []) as any[]) {
      if (!lastByMint.has(r.token_mint)) lastByMint.set(r.token_mint, r);
    }

    // Build candidate list: must have a prior post + gap satisfied + per-mint sweep cooldown.
    const candidates: Array<{ mint: string; entry: number; lastMult: number; ticker: string | null }> = [];
    for (const row of (lcRows || []) as any[]) {
      const last = lastByMint.get(row.token_mint);
      if (!last) continue;
      const lastPostedAt = last.last_posted_at || last.posted_at || last.composed_at;
      if (!lastPostedAt || lastPostedAt > gapCutoff) continue;
      if (row.last_legacy_swept_at && row.last_legacy_swept_at > gapCutoff) continue;
      const lastMult = Number(last.last_multiplier) || 0;
      // First legacy brag needs at least one prior multiplier post (>=2x).
      if (lastMult < 2) continue;
      candidates.push({
        mint: row.token_mint,
        entry: Number(row.entry_market_cap) || 0,
        lastMult,
        ticker: row.token_symbol || null,
      });
    }

    const composeUrl = `${supabaseUrl}/functions/v1/no-lube-compose`;
    const results: any[] = [];

    for (const c of candidates) {
      if (results.filter(r => r.dispatched).length >= LEGACY_MAX_MINTS_PER_RUN) break;

      // Probe live mcap via compose dry-run (no log write).
      let currentMcap: number | null = null;
      try {
        const probe = await fetch(composeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ mint: c.mint, channel: 'private', dry_run: true }),
        });
        const pj = await probe.json().catch(() => ({}));
        if (pj?.ok && pj?.mcap != null && isFinite(Number(pj.mcap))) {
          currentMcap = Number(pj.mcap);
        }
      } catch (_) { /* ignore probe failure */ }

      if (currentMcap == null) {
        results.push({ mint: c.mint, dispatched: false, reason: 'probe_mcap_unknown' });
        continue;
      }
      if (currentMcap < legacyMinMcap) {
        results.push({ mint: c.mint, dispatched: false, reason: 'below_legacy_min_mcap', current_mcap: currentMcap });
        continue;
      }
      const ratio = c.entry > 0 ? currentMcap / c.entry : 0;
      const required = c.lastMult * legacyProgressStep;
      if (ratio < required) {
        results.push({
          mint: c.mint, dispatched: false, reason: 'no_upward_progression',
          current_mcap: currentMcap, ratio, required_ratio: required, last_multiplier: c.lastMult,
        });
        continue;
      }

      // Dispatch to orchestrate with the legacy_brag hint.
      try {
        const r = await fetch(`${supabaseUrl}/functions/v1/no-lube-orchestrate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${anonKey}`,
            apikey: anonKey,
          },
          body: JSON.stringify({ mint: c.mint, source: 'legacy-sweeper', flow_hint: 'legacy_brag' }),
        });
        const j = await r.json().catch(() => ({}));
        results.push({
          mint: c.mint, dispatched: true, ok: r.ok && j?.ok !== false,
          flow: j?.flow, ratio, current_mcap: currentMcap, last_multiplier: c.lastMult,
        });
      } catch (e: any) {
        results.push({ mint: c.mint, dispatched: false, reason: `dispatch_error: ${e?.message || e}` });
      }

      await supabase
        .from('telegram_insider_token_lifecycle')
        .update({ last_legacy_swept_at: new Date().toISOString() })
        .eq('token_mint', c.mint);
    }

    return new Response(JSON.stringify({
      ok: true,
      considered: candidates.length,
      swept: results.filter(r => r.dispatched).length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[no-lube-legacy-sweeper] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});