import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { fetchDexBanner } from "../_shared/dexscreener-banner.ts";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Resolves and caches a DexScreener banner URL onto holders_intel_post_queue rows.
 *
 * Body: { queue_id?: string, queue_ids?: string[], force?: boolean }
 *  - With `force: true` we re-resolve even if dex_banner_url is already set.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const ids: string[] = body.queue_ids || (body.queue_id ? [body.queue_id] : []);
    const force = body.force === true;
    if (ids.length === 0) {
      return new Response(JSON.stringify({ error: 'queue_id or queue_ids required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: rows, error } = await supabase
      .from('holders_intel_post_queue')
      .select('id, token_mint, dex_banner_url')
      .in('id', ids);
    if (error) throw error;

    const results: any[] = [];
    for (const row of rows || []) {
      try {
        if (row.dex_banner_url && !force) {
          results.push({ id: row.id, ok: true, cached: true, url: row.dex_banner_url });
          continue;
        }
        const { url, source } = await fetchDexBanner(row.token_mint);
        if (!url) {
          results.push({ id: row.id, ok: true, url: null, source: null });
          continue;
        }
        await assertUpdate(
          supabase
            .from('holders_intel_post_queue')
            .update({ dex_banner_url: url })
            .eq('id', row.id),
          'holders_intel_post_queue',
        );
        results.push({ id: row.id, ok: true, url, source });
      } catch (e: any) {
        results.push({ id: row.id, ok: false, error: e?.message || String(e) });
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});