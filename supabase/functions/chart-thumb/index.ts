// chart-thumb
// Returns a 1200x628 PNG chart of a token's last ~60 1-minute closes.
// Data: GeckoTerminal public API (no key). Render: QuickChart (returns PNG).
// The previous Browserless+DexScreener embed approach produced "No data here"
// because DS renders the chart in a WebGL/JS layer that hydrates too slowly
// in headless — so we skip the browser entirely and draw the chart ourselves.
//
// GET /chart-thumb?mint=<MINT>
// Response: image/png (cached 5 minutes)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLACEHOLDER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function getTopPool(mint: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools`,
      { headers: { Accept: 'application/json' } },
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const pool = j?.data?.[0]?.attributes?.address;
    return typeof pool === 'string' ? pool : null;
  } catch { return null; }
}

async function getOhlcv(pool: string): Promise<number[][]> {
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/minute?aggregate=1&limit=60`,
      { headers: { Accept: 'application/json' } },
    );
    if (!r.ok) return [];
    const j: any = await r.json();
    return j?.data?.attributes?.ohlcv_list || [];
  } catch { return []; }
}

async function renderChart(mint: string): Promise<Uint8Array | null> {
  const pool = await getTopPool(mint);
  if (!pool) return null;
  const raw = await getOhlcv(pool);
  if (raw.length < 2) return null;

  const rows = raw.slice().sort((a, b) => a[0] - b[0]);
  const labels = rows.map((r) => {
    const d = new Date(r[0] * 1000);
    return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
  });
  const closes = rows.map((r) => r[4]);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const pct = first ? ((last - first) / first) * 100 : 0;
  const up = pct >= 0;
  const color = up ? '#22c55e' : '#ef4444';
  const fill = up ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
  const priceStr = last < 0.01 ? last.toPrecision(3) : last.toFixed(4);
  const title = `${mint.slice(0, 4)}…${mint.slice(-4)}   ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%   $${priceStr}`;

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: closes,
        borderColor: color,
        backgroundColor: fill,
        fill: true,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.25,
      }],
    },
    options: {
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: title,
          color: '#facc15',
          font: { size: 22, weight: 'bold', family: 'monospace' },
          padding: 16,
        },
      },
      scales: {
        x: { ticks: { color: '#9ca3af', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: { ticks: { color: '#9ca3af' }, grid: { color: 'rgba(255,255,255,0.05)' } },
      },
    },
  };

  try {
    const r = await fetch('https://quickchart.io/chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        width: 1200,
        height: 628,
        format: 'png',
        backgroundColor: '#0a0a0a',
        version: '4',
        chart: config,
      }),
    });
    if (!r.ok) {
      console.error('chart-thumb quickchart', r.status, await r.text());
      return null;
    }
    return new Uint8Array(await r.arrayBuffer());
  } catch (e) {
    console.error('chart-thumb render error', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const u = new URL(req.url);
  const mint = (u.searchParams.get('mint') || '').trim();
  if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    return new Response(JSON.stringify({ error: 'invalid mint' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const png = (await renderChart(mint)) ?? b64ToBytes(PLACEHOLDER_PNG_B64);
  return new Response(png, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
});