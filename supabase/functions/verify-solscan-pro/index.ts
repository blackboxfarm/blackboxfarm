import { corsHeaders } from '@supabase/supabase-js/cors';

// One-shot probe: confirm SOLSCAN_API_KEY is a Pro v2.0 key by hitting
// a Pro-only endpoint (/v2.0/token/meta) and a free endpoint side-by-side.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const key = Deno.env.get('SOLSCAN_API_KEY') ?? '';
  const masked = key ? `${key.slice(0, 6)}…${key.slice(-4)} (len=${key.length})` : '(missing)';

  const probe = async (url: string) => {
    const t0 = Date.now();
    try {
      const r = await fetch(url, { headers: { token: key, accept: 'application/json' } });
      const text = await r.text();
      let body: unknown;
      try { body = JSON.parse(text); } catch { body = text.slice(0, 400); }
      return { url, status: r.status, ms: Date.now() - t0, body };
    } catch (e) {
      return { url, status: 0, ms: Date.now() - t0, error: String(e) };
    }
  };

  // Reference token: SOL itself (always valid)
  const SOL = 'So11111111111111111111111111111111111111112';
  const results = await Promise.all([
    probe(`https://pro-api.solscan.io/v2.0/token/meta?address=${SOL}`),
    probe(`https://pro-api.solscan.io/v2.0/token/markets?address=${SOL}&page=1&page_size=10`),
    probe(`https://pro-api.solscan.io/v2.0/account/transfer?address=${SOL}&page=1&page_size=10`),
  ]);

  const proOk = results.every(r => r.status === 200);
  const verdict = proOk
    ? 'PRO_V2_OK'
    : results.some(r => r.status === 401 || r.status === 403)
      ? 'NOT_PRO_OR_INVALID'
      : 'UNKNOWN';

  return new Response(
    JSON.stringify({ key: masked, verdict, results }, null, 2),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
});