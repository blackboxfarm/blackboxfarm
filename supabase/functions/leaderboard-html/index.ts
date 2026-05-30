// leaderboard-html — public HTML render of a leaderboard run.
// Browserless calls this URL to screenshot it into a PNG.
// Also embeddable as iframe preview inside the admin UI.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

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
}) {
  const { title, subtitle, accent, bgUrl, entries, brand, variant } = opts;
  const padded = entries.slice(0, 20);
  while (padded.length < 20) padded.push(null);

  const pillsHtml = padded.map((e, i) => {
    const rank = i + 1;
    if (!e) {
      return `<div class="pill pill-empty"><div class="rank">#${rank}</div><div class="empty-slot">—</div></div>`;
    }
    const ticker = esc(e.ticker || e.token_symbol || 'TOKEN');
    const mult = fmtMult(Number(e.multiplier));
    const called = fmtMcap(Number(e.called_at_mcap));
    const ath = fmtMcap(Number(e.ath_mcap));
    const img = e.image_url ? esc(e.image_url) : '';
    const initials = ticker.slice(0, 2).toUpperCase();
    return `
    <div class="pill">
      <div class="rank">#${rank}</div>
      <div class="avatar" style="${img ? `background-image:url('${img}')` : ''}">
        ${img ? '' : `<span>${esc(initials)}</span>`}
      </div>
      <div class="body">
        <div class="row1">
          <span class="ticker">$${ticker}</span>
          <span class="mult">${esc(mult)}</span>
        </div>
        <div class="row2">
          <span class="muted">called</span> ${esc(called)} <span class="arr">→</span> <span class="muted">ATH</span> ${esc(ath)}
        </div>
      </div>
    </div>`;
  }).join('');

  const bgCss = bgUrl
    ? `background-image: linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.75)), url('${esc(bgUrl)}'); background-size: cover; background-position: center;`
    : `background: radial-gradient(1200px 800px at 20% 0%, #0e1b2c 0%, #050a14 60%, #02050b 100%);`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;width:1200px;height:1500px;font-family:'Space Grotesk',system-ui,sans-serif;color:#e6f6ff}
  .canvas{width:1200px;height:1500px;${bgCss};padding:48px 56px 56px;display:flex;flex-direction:column;position:relative;overflow:hidden}
  .header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:24px}
  h1{font-size:54px;margin:0;letter-spacing:-1px;text-shadow:0 0 24px rgba(34,211,238,.35)}
  .accent{color:${esc(accent)}}
  .sub{margin-top:6px;color:#9fc5d8;font-size:20px;font-family:'JetBrains Mono',monospace}
  .badge{padding:8px 14px;border-radius:999px;border:1px solid rgba(34,211,238,.4);background:rgba(34,211,238,.08);font-size:14px;font-family:'JetBrains Mono',monospace;color:${esc(accent)};text-transform:uppercase;letter-spacing:1px}
  .grid{flex:1;display:grid;grid-template-columns:1fr 1fr;gap:14px;align-content:start}
  .pill{display:flex;align-items:center;gap:14px;padding:12px 16px;border-radius:18px;background:rgba(8,18,32,.72);border:1px solid rgba(255,255,255,.08);box-shadow:inset 0 1px 0 rgba(255,255,255,.06), 0 6px 20px rgba(0,0,0,.45);min-height:78px}
  .pill-empty{opacity:.35}
  .rank{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:18px;color:${esc(accent)};min-width:42px}
  .avatar{width:54px;height:54px;border-radius:50%;background-color:#0a1626;background-size:cover;background-position:center;border:2px solid ${esc(accent)};box-shadow:0 0 18px rgba(34,211,238,.35);display:flex;align-items:center;justify-content:center;flex:none}
  .avatar span{font-weight:700;color:${esc(accent)};font-size:18px;font-family:'JetBrains Mono',monospace}
  .body{display:flex;flex-direction:column;gap:4px;flex:1;min-width:0}
  .row1{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
  .ticker{font-weight:700;font-size:20px;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px}
  .mult{font-family:'JetBrains Mono',monospace;font-weight:700;font-size:24px;color:${esc(accent)};text-shadow:0 0 10px rgba(34,211,238,.45)}
  .row2{font-family:'JetBrains Mono',monospace;font-size:13px;color:#bcd4e2}
  .muted{color:#6f8a9d;text-transform:uppercase;letter-spacing:.5px;font-size:11px;margin-right:2px}
  .arr{color:${esc(accent)};margin:0 6px}
  .footer{margin-top:18px;display:flex;justify-content:space-between;align-items:center;font-family:'JetBrains Mono',monospace;font-size:13px;color:#6f8a9d}
  .v-tag{padding:6px 10px;border:1px solid rgba(255,255,255,.15);border-radius:6px;text-transform:uppercase;letter-spacing:2px;color:${esc(accent)}}
</style></head>
<body><div class="canvas">
  <div class="header">
    <div>
      <h1>🏆 <span class="accent">TOP 20</span> CALLS</h1>
      <div class="sub">${esc(subtitle)}</div>
    </div>
    <div class="badge">${esc(brand)}</div>
  </div>
  <div class="grid">${pillsHtml}</div>
  <div class="footer"><span>blackbox.farm</span><span class="v-tag">${variant}</span></div>
</div></body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const runId = url.searchParams.get('run_id');
    const variant = (url.searchParams.get('variant') === 'private' ? 'private' : 'public') as 'public' | 'private';
    if (!runId) {
      return new Response('run_id required', { status: 400 });
    }
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: run, error } = await supabase
      .from('leaderboard_daily_runs')
      .select('id, profile_id, local_date, entries, window_start_utc, window_end_utc')
      .eq('id', runId)
      .maybeSingle();
    if (error || !run) return new Response('run not found', { status: 404 });

    const { data: profile } = await supabase
      .from('leaderboard_profiles')
      .select('display_name, bg_public_url, bg_private_url, accent_hex, brand_tagline')
      .eq('id', run.profile_id)
      .maybeSingle();

    const bgUrl = variant === 'private' ? profile?.bg_private_url : profile?.bg_public_url;
    const subtitle = `${run.local_date} · 6am→6am window · ${(run.entries as any[])?.length || 0} qualifying calls`;
    const html = htmlDoc({
      title: `${profile?.display_name || 'Leaderboard'} — ${run.local_date}`,
      subtitle,
      accent: profile?.accent_hex || '#22d3ee',
      bgUrl: bgUrl || null,
      entries: (run.entries as any[]) || [],
      brand: profile?.brand_tagline || profile?.display_name || 'No Lube Alpha',
      variant,
    });
    return new Response(html, {
      headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e: any) {
    return new Response(`fatal: ${e?.message || e}`, { status: 500 });
  }
});