// leaderboard-weekly-builder — runs hourly. For each enabled profile,
// if local day-of-week is Monday and local hour == post_hour and no run exists
// for the prior Mon→Mon window, builds the Top 20 from the lifecycle table,
// inserts a leaderboard_weekly_runs row, then invokes render + post (cadence=weekly).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function localParts(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', weekday: 'short', hour12: false,
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  return {
    date: `${m.year}-${m.month}-${m.day}`,
    hour: parseInt(m.hour, 10),
    weekday: m.weekday, // 'Mon', 'Tue', ...
  };
}

function localToUtc(dateStr: string, hour: number, tz: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  let guess = Date.UTC(y, m - 1, d, hour, 0, 0);
  for (let i = 0; i < 3; i++) {
    const got = localParts(new Date(guess), tz);
    const gotMs = Date.UTC(
      Number(got.date.slice(0, 4)), Number(got.date.slice(5, 7)) - 1, Number(got.date.slice(8, 10)),
      got.hour, 0, 0,
    );
    const wantMs = Date.UTC(y, m - 1, d, hour, 0, 0);
    guess += (wantMs - gotMs);
  }
  return new Date(guess);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

async function buildForProfile(supabase: any, supabaseUrl: string, anonKey: string, profile: any, force?: { week_start_date?: string }) {
  const now = new Date();
  const here = localParts(now, profile.timezone);
  // Default trigger window: this Monday at post_hour → previous Mon→Mon week.
  const thisMondayLocal = force?.week_start_date
    ? addDays(force.week_start_date, 7)
    : here.date; // assumed Monday at scheduled time
  const weekEndDate = thisMondayLocal;          // exclusive end (the Monday we're running on)
  const weekStartDate = addDays(weekEndDate, -7);

  const winEnd = localToUtc(weekEndDate, profile.day_start_hour, profile.timezone);
  const winStart = localToUtc(weekStartDate, profile.day_start_hour, profile.timezone);

  const { data: existing } = await supabase
    .from('leaderboard_weekly_runs')
    .select('id, status')
    .eq('profile_id', profile.id)
    .eq('week_start_date', weekStartDate)
    .maybeSingle();
  if (existing && !force) return { skipped: true, reason: 'already_exists', run_id: existing.id };

  let q = supabase.from('telegram_insider_token_lifecycle')
    .select('token_mint, token_symbol, channel_name, first_called_at, entry_market_cap, peak_market_cap, peak_multiplier, peak_reached_at')
    .gte('first_called_at', winStart.toISOString())
    .lt('first_called_at', winEnd.toISOString())
    .not('entry_market_cap', 'is', null)
    .gt('entry_market_cap', 0)
    .limit(2000);
  if (profile.channel_name_filter) q = q.eq('channel_name', profile.channel_name_filter);
  const { data: rows, error } = await q;
  if (error) throw new Error(`lifecycle query: ${error.message}`);

  const scored = (rows || []).map((r: any) => {
    const entry = Number(r.entry_market_cap) || 0;
    const peak = Number(r.peak_market_cap) || 0;
    const mult = Number(r.peak_multiplier) || (entry > 0 ? peak / entry : 0);
    return {
      mint: r.token_mint,
      ticker: r.token_symbol || 'TOKEN',
      multiplier: mult,
      called_at_mcap: entry,
      ath_mcap: peak,
      called_at: r.first_called_at,
      ath_at: r.peak_reached_at,
      image_url: null as string | null,
    };
  }).filter((e: any) => e.multiplier >= 1.5)
    .sort((a: any, b: any) => b.multiplier - a.multiplier)
    .slice(0, 20);

  if (scored.length) {
    const mints = scored.map((e: any) => e.mint);
    try {
      const { data: meta } = await supabase.from('token_metadata').select('mint, image_url').in('mint', mints);
      const map = new Map<string, string>((meta || []).map((m: any) => [m.mint, m.image_url]));
      for (const e of scored) { const img = map.get(e.mint); if (img) e.image_url = img; }
    } catch {}
  }

  const payload = {
    profile_id: profile.id,
    week_start_date: weekStartDate,
    week_end_date: weekEndDate,
    window_start_utc: winStart.toISOString(),
    window_end_utc: winEnd.toISOString(),
    entries: scored,
    entry_count: scored.length,
    status: 'pending',
  };

  let runId = existing?.id;
  if (existing) {
    await supabase.from('leaderboard_weekly_runs').update(payload).eq('id', existing.id);
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('leaderboard_weekly_runs').insert(payload).select('id').single();
    if (insErr) throw new Error(`insert run: ${insErr.message}`);
    runId = inserted.id;
  }

  try {
    await fetch(`${supabaseUrl}/functions/v1/leaderboard-render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
      body: JSON.stringify({ run_id: runId, cadence: 'weekly' }),
    });
  } catch (e) { console.warn('render dispatch', e); }

  if ((profile.post_to_tg_public || profile.post_to_tg_private) && scored.length > 0) {
    try {
      await fetch(`${supabaseUrl}/functions/v1/leaderboard-post`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: JSON.stringify({ run_id: runId, cadence: 'weekly' }),
      });
    } catch (e) { console.warn('post dispatch', e); }
  }

  return { skipped: false, run_id: runId, entry_count: scored.length, week_start_date: weekStartDate, week_end_date: weekEndDate };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    let body: any = {};
    try { body = await req.json(); } catch {}
    const { force_profile_id, force_week_start_date } = body;

    const { data: profiles } = await supabase
      .from('leaderboard_profiles')
      .select('*')
      .eq('enabled', true);

    const results: any[] = [];
    for (const profile of (profiles || [])) {
      try {
        if (force_profile_id && profile.id !== force_profile_id) continue;
        if (!force_profile_id) {
          const here = localParts(new Date(), profile.timezone);
          if (here.weekday !== 'Mon') {
            results.push({ id: profile.id, skipped: true, reason: `weekday ${here.weekday} != Mon` });
            continue;
          }
          if (here.hour !== profile.post_hour) {
            results.push({ id: profile.id, skipped: true, reason: `local_hour ${here.hour} != post_hour ${profile.post_hour}` });
            continue;
          }
        }
        const r = await buildForProfile(supabase, supabaseUrl, anonKey, profile,
          force_week_start_date ? { week_start_date: force_week_start_date } : undefined);
        results.push({ id: profile.id, ...r });
      } catch (e: any) {
        results.push({ id: profile.id, error: String(e?.message || e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[leaderboard-weekly-builder] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});