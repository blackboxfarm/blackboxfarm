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

async function getTicker(mint: string): Promise<string | null> {
  try {
    const r = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const s = j?.data?.attributes?.symbol;
    return typeof s === 'string' ? s.toUpperCase() : null;
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

async function renderChart(mint: string, buyTs: number | null): Promise<Uint8Array | null> {
  const pool = await getTopPool(mint);
  if (!pool) return null;
  const [raw, ticker] = await Promise.all([getOhlcv(pool), getTicker(mint)]);
  if (raw.length < 2) return null;

  const rows = raw.slice().sort((a, b) => a[0] - b[0]);
  const labels = rows.map((r) => {
    const d = new Date(r[0] * 1000);
    const mm = (d.getUTCMonth() + 1).toString().padStart(2, '0');
    const dd = d.getUTCDate().toString().padStart(2, '0');
    const hh = d.getUTCHours().toString().padStart(2, '0');
    const mi = d.getUTCMinutes().toString().padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}`;
  });
  const closes = rows.map((r) => r[4]);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const pct = first ? ((last - first) / first) * 100 : 0;
  const up = pct >= 0;
  const color = up ? '#22c55e' : '#ef4444';
  const fill = up ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)';
  const priceStr = last < 0.01 ? last.toPrecision(3) : last.toFixed(4);
  const tick = ticker ? `$${ticker}` : `$${mint.slice(0, 4).toUpperCase()}`;
  const titleLine = `${tick}   ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%   $${priceStr}`;
  const subLine = mint;

  const lastIdx = closes.length - 1;

  // Locate closest candle to the buy timestamp (unix seconds) if provided
  let buyIdx: number | null = null;
  let buyPrice: number | null = null;
  if (buyTs && isFinite(buyTs)) {
    let bestI = -1, bestD = Infinity;
    for (let i = 0; i < rows.length; i++) {
      const d = Math.abs(rows[i][0] - buyTs);
      if (d < bestD) { bestD = d; bestI = i; }
    }
    if (bestI >= 0 && bestD <= 5 * 60) {
      buyIdx = bestI;
      buyPrice = closes[bestI];
    }
  }

  // Format helper: readable USD price (no scientific notation)
  const fmtPrice = (n: number): string => {
    if (!isFinite(n) || n === 0) return '$0';
    const abs = Math.abs(n);
    if (abs >= 1) return '$' + n.toFixed(4);
    if (abs >= 0.01) return '$' + n.toFixed(6);
    // Sub-cent: show 8 decimals, trimmed
    return '$' + n.toFixed(9).replace(/0+$/, '').replace(/\.$/, '');
  };

  // Pre-compute readable y-axis ticks so we don't rely on JS callbacks
  // (QuickChart JSON strips functions).
  const yMin = Math.min(...closes);
  const yMax = Math.max(...closes);
  const yPad = (yMax - yMin) * 0.08 || yMax * 0.05 || 1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;
  const tickCount = 8;
  const tickStep = (yHi - yLo) / (tickCount - 1);
  const yTickValues: number[] = [];
  for (let i = 0; i < tickCount; i++) yTickValues.push(yLo + tickStep * i);
  const yTickLabelMap: Record<string, string> = {};
  for (const v of yTickValues) yTickLabelMap[v.toString()] = fmtPrice(v);

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'price',
          data: closes,
          borderColor: color,
          backgroundColor: fill,
          fill: true,
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.25,
        },
      ],
    },
    options: {
      layout: { padding: { top: 10, right: 40, bottom: 10, left: 10 } },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: titleLine,
          color: '#ffffff',
          font: { size: 34, weight: 'bold', family: 'monospace' },
          padding: { top: 14, bottom: 4 },
        },
        subtitle: {
          display: true,
          text: subLine,
          color: '#ffffff',
          font: { size: 16, weight: 'bold', family: 'monospace' },
          padding: { bottom: 18 },
        },
        datalabels: { display: false },
        annotation: {
          annotations: {
            youAreHere: {
              type: 'point',
              xValue: lastIdx,
              yValue: last,
              backgroundColor: '#facc15',
              borderColor: '#ffffff',
              borderWidth: 3,
              radius: 8,
            },
            youAreHereLabel: {
              type: 'label',
              xValue: lastIdx,
              yValue: last,
              xAdjust: -100,
              yAdjust: -22,
              backgroundColor: 'rgba(0,0,0,0.75)',
              borderColor: '#facc15',
              borderWidth: 1,
              borderRadius: 4,
              color: '#facc15',
              font: { size: 16, weight: 'bold', family: 'monospace' },
              padding: 6,
              content: ['YOU ARE HERE ▶'],
            },
            ...(buyIdx !== null && buyPrice !== null ? {
              buyPoint: {
                type: 'point',
                xValue: buyIdx,
                yValue: buyPrice,
                backgroundColor: '#22c55e',
                borderColor: '#ffffff',
                borderWidth: 3,
                radius: 10,
              },
              buyLabel: {
                type: 'label',
                xValue: buyIdx,
                yValue: buyPrice,
                xAdjust: 0,
                yAdjust: -28,
                backgroundColor: '#22c55e',
                borderColor: '#ffffff',
                borderWidth: 2,
                borderRadius: 4,
                color: '#ffffff',
                font: { size: 22, weight: 'bold', family: 'monospace' },
                padding: { top: 2, bottom: 2, left: 10, right: 10 },
                content: ['B'],
              },
            } : {}),
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#ffffff',
            maxTicksLimit: 10,
            font: { size: 14, weight: 'bold', family: 'monospace' },
          },
          grid: { color: 'rgba(255,255,255,0.18)', lineWidth: 1 },
        },
        y: {
          min: yLo,
          max: yHi,
          afterBuildTicks: undefined,
          ticks: {
            color: '#ffffff',
            font: { size: 14, weight: 'bold', family: 'monospace' },
          },
          grid: { color: 'rgba(255,255,255,0.18)', lineWidth: 1 },
        },
      },
    },
  };

  // Serialize config as a JS string so we can inject a live tick callback
  // (QuickChart preserves functions only when `chart` is a JS string).
  const jsCallback = `function(v){var n=Number(v);if(!isFinite(n)||n===0)return '$0';var a=Math.abs(n);if(a>=1)return '$'+n.toFixed(4);if(a>=0.01)return '$'+n.toFixed(6);return '$'+n.toFixed(9).replace(/0+$/,'').replace(/\\.$/,'');}`;
  const configJson = JSON.stringify(config);
  const chartJs =
    '(function(){var c=' + configJson +
    ';c.options.scales.y.ticks.callback=' + jsCallback +
    ';return c;})()';

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
        chart: chartJs,
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
  const buyRaw = u.searchParams.get('buy');
  let buyTs: number | null = null;
  if (buyRaw) {
    const n = Number(buyRaw);
    if (isFinite(n) && n > 0) {
      // Accept unix seconds or milliseconds
      buyTs = n > 10_000_000_000 ? Math.floor(n / 1000) : Math.floor(n);
    }
  }
  if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    return new Response(JSON.stringify({ error: 'invalid mint' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const png = (await renderChart(mint, buyTs)) ?? b64ToBytes(PLACEHOLDER_PNG_B64);
  return new Response(png, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
});