import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Batched label resolver for the bubblemap schematic view.
 *
 * Input:  { communities: string[], tokens: string[] }
 * Output: {
 *   communities: { [community_id]: { name, member_count, recycled_count } },
 *   tokens:      { [mint]:        { ticker, name } },
 * }
 *
 * Reads from the local x_communities and token_metadata caches only —
 * never calls the X API or any external provider in the hot path so
 * this returns within ~1s even on cold cache.
 *
 * Cache misses are silently enqueued for background resolution via the
 * existing x_community_resolution_queue (and token_metadata_queue if it
 * exists). Misses are returned with name=null so the client can show
 * a fallback ID label.
 */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const body = await req.json().catch(() => ({}));
    const communityIds: string[] = Array.from(new Set(((body.communities || []) as any[])
      .filter((x) => typeof x === 'string' && /^\d{6,25}$/.test(x))));
    const tokenMints: string[] = Array.from(new Set(((body.tokens || []) as any[])
      .filter((x) => typeof x === 'string' && x.length >= 30 && x.length <= 64)));

    const communities: Record<string, { name: string | null; member_count: number | null; recycled_count: number | null; recycled_band: string | null; name_history: any[] | null; linked_token_mints: string[] | null }> = {};
    const tokens: Record<string, { ticker: string | null; name: string | null }> = {};

    if (communityIds.length > 0) {
      const { data, error } = await supabase
        .from('x_communities')
        .select('community_id, name, member_count, linked_token_mints, recycled_band, name_history')
        .in('community_id', communityIds);
      if (error) console.warn('[resolve-labels] x_communities lookup error:', error.message);
      const seen = new Set<string>();
      for (const row of data || []) {
        const cid = (row as any).community_id as string;
        seen.add(cid);
        const linked = (row as any).linked_token_mints as string[] | null;
        const nh = (row as any).name_history;
        communities[cid] = {
          name: (row as any).name || null,
          member_count: (row as any).member_count ?? null,
          recycled_count: Array.isArray(linked) ? linked.length : null,
          recycled_band: (row as any).recycled_band || null,
          name_history: Array.isArray(nh) ? nh.slice(-4) : null,
          linked_token_mints: Array.isArray(linked) ? linked.slice(-4) : null,
        };
      }
      // Enqueue misses
      const misses = communityIds.filter((c) => !seen.has(c));
      if (misses.length > 0) {
        const rows = misses.map((c) => ({ community_id: c, discovered_via: 'resolve-labels', priority: 6 }));
        await supabase
          .from('x_community_resolution_queue')
          .upsert(rows, { onConflict: 'community_id', ignoreDuplicates: true })
          .then(() => {})
          .catch(() => {});
        for (const c of misses) {
          communities[c] = { name: null, member_count: null, recycled_count: null, recycled_band: null, name_history: null, linked_token_mints: null };
        }
      }
    }

    if (tokenMints.length > 0) {
      const { data, error } = await supabase
        .from('token_metadata')
        .select('mint_address, name, symbol')
        .in('mint_address', tokenMints);
      if (error) console.warn('[resolve-labels] token_metadata lookup error:', error.message);
      const seen = new Set<string>();
      for (const row of data || []) {
        const mint = (row as any).mint_address as string;
        seen.add(mint);
        tokens[mint] = {
          ticker: (row as any).symbol || null,
          name: (row as any).name || null,
        };
      }
      for (const m of tokenMints) {
        if (!seen.has(m)) tokens[m] = { ticker: null, name: null };
      }
    }

    return new Response(JSON.stringify({ communities, tokens }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    console.error('[resolve-labels] error:', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});