// leaderboard-html — public HTML render of a leaderboard run.
// Browserless calls this URL to screenshot it into a PNG.
// Also embeddable as iframe preview inside the admin UI.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { tableForCadence, RecapCadence } from '../_shared/leaderboard-recap.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  } as Record<string, string>)[c]);
}

function fmtMcap(n: number | null | undefined): string {
  if (!n || !isFinite(n)) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function fmtMult(m: number | null | undefined): string {
  if (!m || !isFinite(m)) return '—';
  if (m >= 10) return `${Math.round(m)}x`;
  return `${m.toFixed(1)}x`;
}

function htmlDoc(opts: {
  title: string;
  subtitle: string;
  accent: string;
  bgUrl: string | null;
  entries: Array<any>;
  brand: string;
  variant: 'public' | 'private';
  size: number;
}) {
  const { title, subtitle, accent, bgUrl, entries, brand, variant, size } = opts;
  const slotCount = size <= 10 ? 10 : size <= 20 ? 20 : 25;
  const padded = entries.slice(0, slotCount);
  while (padded.length < slotCount) padded.push(null);

  const medals = ['🥇', '🥈', '🥉'];

  const renderRow = (e: any, i: number) => {
    const rank = i + 1;
    const rankCell = rank <= 3
      ? `<div class="medal">${medals[rank - 1]}</div>`
      : `<div class="rank">${rank}</div>`;
    if (!e) {
      return `<div class="row row-empty">${rankCell}<div class="avatar empty"></div><div class="ticker muted-empty">—</div><div class="num muted-empty">—</div><div class="arrow muted-empty">→</div><div class="num muted-empty">—</div><div class="mult muted-empty">—</div></div>`;
    }
    const ticker = esc(e.ticker || e.token_symbol || 'TOKEN');
    const mult = fmtMult(Number(e.multiplier));
    const called = fmtMcap(Number(e.called_at_mcap));
    const ath = fmtMcap(Number(e.ath_mcap));
    const img = e.image_url ? esc(e.image_url) : '';
    const initials = ticker.slice(0, 2).toUpperCase();
    const multClass = rank === 1 ? 'mult mult-gold' : rank === 3 ? 'mult mult-bronze' : 'mult';
    return `<div class="row">
      ${rankCell}
      <div class="avatar" style="${img ? `background-image:url('${img}')` : ''}">${img ? '' : `<span>${esc(initials)}</span>`}</div>
      <div class="ticker">$${ticker}</div>
      <div class="num">${esc(called)}</div>
      <div class="arrow">→</div>
      <div class="num">${esc(ath)}</div>
      <div class="${multClass}">${esc(mult)}</div>
    </div>`;
  };

  const perCol = Math.ceil(slotCount / 2);
  const leftCol = padded.slice(0, perCol).map((e, i) => renderRow(e, i)).join('');
  const rightCol = padded.slice(perCol, slotCount).map((e, i) => renderRow(e, i + perCol)).join('');

  const bgCss = bgUrl
    ? `background-image: linear-gradient(rgba(0,0,0,.65), rgba(0,0,0,.85)), url('${esc(bgUrl)}'); background-size: cover; background-position: center;`
    : `background: #050505;`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;width:1920px;height:1080px;font-family:'Inter',system-ui,sans-serif;color:#fff;-webkit-font-smoothing:antialiased}
  .canvas{width:1920px;height:1080px;${bgCss};padding:48px 60px 40px;display:flex;flex-direction:column;position:relative;overflow:hidden}
  .title{text-align:center;font-family:'Barlow Condensed',sans-serif;font-weight:900;font-size:96px;line-height:1;letter-spacing:2px;color:${esc(accent)};text-shadow:0 4px 24px rgba(0,0,0,.8), 0 0 40px ${esc(accent)}33}
  .subtitle{text-align:center;font-size:36px;font-weight:500;margin-top:8px;color:#fff;text-shadow:0 2px 12px rgba(0,0,0,.9)}
  .panel{flex:1;margin-top:32px;border:3px solid ${esc(accent)};border-radius:24px;background:rgba(0,0,0,.78);padding:28px 40px;display:grid;grid-template-columns:1fr 1fr;gap:48px;box-shadow:0 0 60px rgba(0,0,0,.7), inset 0 0 30px rgba(0,0,0,.5)}
  .col{display:flex;flex-direction:column}
  .head{display:grid;grid-template-columns:48px 70px 1fr 130px 30px 130px 90px;align-items:center;gap:12px;padding:0 4px 12px;border-bottom:1px solid rgba(255,255,255,.18);color:#9ca3af;font-size:18px;font-weight:500;letter-spacing:.5px}
  .head .h-token{grid-column:1 / span 3}
  .rows{display:flex;flex-direction:column;justify-content:space-between;flex:1;padding-top:8px}
  .row{display:grid;grid-template-columns:48px 70px 1fr 130px 30px 130px 90px;align-items:center;gap:12px;padding:10px 4px;font-size:26px;font-weight:700}
  .row-empty{opacity:.25}
  .rank{font-size:22px;color:#9ca3af;font-weight:700;text-align:center}
  .medal{font-size:38px;text-align:center;line-height:1}
  .avatar{width:58px;height:58px;border-radius:50%;background:#1a1a1a;background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.1)}
  .avatar.empty{opacity:.4}
  .avatar span{font-size:18px;font-weight:800;color:#9ca3af;font-family:'Inter',sans-serif}
  .ticker{font-size:28px;font-weight:800;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.5px}
  .num{font-size:26px;font-weight:700;color:#fff;text-align:right;font-variant-numeric:tabular-nums}
  .arrow{color:${esc(accent)};font-size:24px;text-align:center;font-weight:800}
  .mult{font-size:30px;font-weight:800;color:#fff;text-align:right;font-variant-numeric:tabular-nums}
  .mult-gold{color:${esc(accent)}}
  .mult-bronze{color:#cd7f32}
  .muted-empty{color:#4b5563}
</style></head>
<body><div class="canvas">
  <div class="title">${esc(title)}</div>
  <div class="subtitle">${esc(subtitle)}</div>
  <div class="panel">
    <div class="col">
      <div class="head"><div class="h-token">Token</div><div>Called MC</div><div></div><div>Peak MC</div><div style="text-align:right">Multiplier</div></div>
      <div class="rows">${leftCol}</div>
    </div>
    <div class="col">
      <div class="head"><div class="h-token">Token</div><div>Called MC</div><div></div><div>Peak MC</div><div style="text-align:right">Multiplier</div></div>
      <div class="rows">${rightCol}</div>
    </div>
  </div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const runId = url.searchParams.get('run_id');
    const variant = (url.searchParams.get('variant') === 'private' ? 'private' : 'public') as 'public' | 'private';
    const cadenceParam = url.searchParams.get('cadence') || 'daily';
    const cadence: RecapCadence =
      cadenceParam === 'weekly' || cadenceParam === 'monthly' ? cadenceParam : 'daily';
    const table = tableForCadence(cadence);
    if (!runId) {
      return new Response('run_id required', { status: 400 });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: run, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', runId)
      .maybeSingle();
    if (error || !run) return new Response('run not found', { status: 404 });

    const { data: profile } = await supabase
      .from('leaderboard_profiles')
      .select('display_name, bg_public_url, bg_private_url, accent_hex, brand_tagline')
      .eq('id', run.profile_id)
      .maybeSingle();

    const bgUrl = variant === 'private' ? profile?.bg_private_url : profile?.bg_public_url;
    // Pretty subtitle per cadence
    let prettyDate = '';
    if (cadence === 'daily') {
      prettyDate = String(run.local_date);
      try {
        const d = new Date(`${run.local_date}T12:00:00Z`);
        prettyDate = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' });
      } catch {}
    } else if (cadence === 'weekly') {
      prettyDate = `${run.week_start_date} → ${run.week_end_date}`;
    } else {
      prettyDate = String(run.month_label || run.month_start_date);
    }
    const brandUpper = (profile?.brand_tagline || profile?.display_name || 'INSIDER ACCESS').toUpperCase();
    const entriesArr = (run.entries as any[]) || [];
    const size = entriesArr.length || (cadence === 'monthly' ? 25 : cadence === 'weekly' ? 20 : 10);
    const titleLabel = cadence === 'weekly'
      ? `${brandUpper} WEEKLY RECAP`
      : cadence === 'monthly'
        ? `${brandUpper} MONTHLY RECAP`
        : `${brandUpper} DAILY RECAP`;
    const html = htmlDoc({
      title: titleLabel,
      subtitle: prettyDate,
      accent: profile?.accent_hex || '#22d3ee',
      bgUrl: bgUrl || null,
      entries: entriesArr,
      brand: profile?.brand_tagline || profile?.display_name || 'No Lube Alpha',
      variant,
      size,
    });
    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return new Response(`fatal: ${e?.message || e}`, { status: 500 });
  }
});