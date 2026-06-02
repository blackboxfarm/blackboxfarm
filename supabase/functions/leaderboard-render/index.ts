// leaderboard-render — screenshots leaderboard-html into PNGs for public + private,
// uploads to storage, updates the run row.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { tableForCadence, RecapCadence } from '../_shared/leaderboard-recap.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'no-lube-rendered-cards';

async function screenshot(targetUrl: string): Promise<Uint8Array> {
  const browserlessUrl = Deno.env.get('BROWSERLESS_URL');
  const browserlessToken = Deno.env.get('BROWSERLESS_TOKEN');
  if (!browserlessUrl || !browserlessToken) {
    throw new Error('BROWSERLESS_URL or BROWSERLESS_TOKEN missing');
  }
  // Pre-fetch HTML and pass as inline html to Browserless — avoids URL/auth quirks
  // that caused Chrome to render the response as source text instead of HTML.
  const htmlRes = await fetch(targetUrl);
  if (!htmlRes.ok) throw new Error(`html fetch ${htmlRes.status}`);
  const html = await htmlRes.text();
  const res = await fetch(`${browserlessUrl.replace(/\/$/, '')}/screenshot?token=${browserlessToken}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      html,
      options: { fullPage: false, type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } },
      viewport: { width: 1920, height: 1080, deviceScaleFactor: 1 },
      waitForTimeout: 2500,
      gotoOptions: { waitUntil: 'networkidle0', timeout: 30000 },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`browserless ${res.status}: ${t.slice(0, 200)}`);
  }
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { run_id, cadence: rawCadence } = await req.json();
    if (!run_id) throw new Error('run_id required');
    const cadence: RecapCadence =
      rawCadence === 'weekly' || rawCadence === 'monthly' ? rawCadence : 'daily';
    const table = tableForCadence(cadence);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const htmlBase = `${supabaseUrl}/functions/v1/leaderboard-html?run_id=${run_id}&cadence=${cadence}`;
    const variants: Array<'public' | 'private'> = ['public', 'private'];
    const out: Record<string, string> = {};
    for (const v of variants) {
      const png = await screenshot(`${htmlBase}&variant=${v}`);
      const filename = `leaderboard/${run_id}_${v}_${Date.now()}.png`;
      const { error: upErr } = await supabase.storage.from(BUCKET)
        .upload(filename, png, { contentType: 'image/png', upsert: false });
      if (upErr) throw new Error(`upload ${v}: ${upErr.message}`);
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filename);
      out[v] = pub.publicUrl;
    }

    await supabase.from(table).update({
      image_public_url: out.public,
      image_private_url: out.private,
      status: 'rendered',
      rendered_at: new Date().toISOString(),
      error: null,
    }).eq('id', run_id);

    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[leaderboard-render] fatal', e);
    try {
      const body = await req.clone().json().catch(() => ({}));
      const cad: RecapCadence =
        body?.cadence === 'weekly' || body?.cadence === 'monthly' ? body.cadence : 'daily';
      const tbl = tableForCadence(cad);
      if (body?.run_id) {
        const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
        await supabase.from(tbl).update({
          status: 'failed', error: String(e?.message || e),
        }).eq('id', body.run_id);
      }
    } catch {}
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});