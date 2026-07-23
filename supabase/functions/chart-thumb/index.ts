// chart-thumb
// Returns a 1200x628 PNG snapshot of a token's chart (1m candles) for the
// given mint. Used by:
//   - Alpha Watch UI (thumbnail preview)
//   - Twilio MMS MediaUrl on alpha-dev-detector SMS alerts
//
// GET /chart-thumb?mint=<MINT>[&tf=1m][&src=dex|gt]
// Response: image/png (cached 5 minutes)
//
// Uses Browserless screenshot API. Fails open — if screenshot fails,
// responds with a tiny placeholder PNG so the caller (Twilio) never breaks.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// 1x1 transparent PNG fallback
const PLACEHOLDER_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function chartUrl(mint: string, src: string): string {
  if (src === 'gt') {
    // GeckoTerminal embed — 1m candles, no swaps/info chrome
    return `https://www.geckoterminal.com/solana/pools/${mint}?embed=1&info=0&swaps=0&resolution=1&theme=dark`;
  }
  // Default: DexScreener embed
  return `https://dexscreener.com/solana/${mint}?embed=1&theme=dark&trades=0&info=0&interval=1`;
}

async function shoot(mint: string, src: string): Promise<Uint8Array | null> {
  const key = Deno.env.get('BROWSERLESS_API_KEY');
  if (!key) return null;
  const url = chartUrl(mint, src);
  try {
    const r = await fetch(
      `https://production-sfo.browserless.io/screenshot?token=${key}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          options: { type: 'png', fullPage: false, encoding: 'base64' },
          viewport: { width: 1200, height: 628, deviceScaleFactor: 1 },
          gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 },
          waitForTimeout: 3500,
        }),
      },
    );
    if (!r.ok) {
      console.error('chart-thumb browserless', r.status, await r.text());
      return null;
    }
    const b64 = (await r.text()).trim();
    return b64ToBytes(b64);
  } catch (e) {
    console.error('chart-thumb error', e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const u = new URL(req.url);
  const mint = (u.searchParams.get('mint') || '').trim();
  const src = (u.searchParams.get('src') || 'dex').toLowerCase();
  if (!mint || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) {
    return new Response(JSON.stringify({ error: 'invalid mint' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const png = (await shoot(mint, src)) ?? b64ToBytes(PLACEHOLDER_PNG_B64);
  return new Response(png, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=300',
    },
  });
});