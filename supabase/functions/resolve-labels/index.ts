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
    const handles: string[] = Array.from(new Set(((body.handles || []) as any[])
      .filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 32)
      .map((x) => x.replace(/^@/, '').toLowerCase())));

    const communities: Record<string, { name: string | null; member_count: number | null; recycled_count: number | null; recycled_band: string | null; name_history: any[] | null; linked_token_mints: string[] | null }> = {};
    const tokens: Record<string, { ticker: string | null; name: string | null }> = {};
    const handlesOut: Record<string, { display_name: string | null; handle_history: any[] | null; is_rotated: boolean }> = {};

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
        // Fallback: when name is null, surface the most recent name from name_history
        const histArr = Array.isArray(nh) ? nh : [];
        const lastHistName = histArr.length > 0
          ? (histArr[histArr.length - 1]?.name || histArr[histArr.length - 1]?.title || null)
          : null;
        communities[cid] = {
          name: (row as any).name || lastHistName || null,
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
        const ticker = (row as any).symbol || null;
        const name = (row as any).name || null;
        if (ticker || name) {
          seen.add(mint);
          tokens[mint] = { ticker, name };
        }
      }
      // Fallback to token_lifecycle for any mint that still has no ticker/name
      const misses = tokenMints.filter((m) => !seen.has(m));
      if (misses.length > 0) {
        const { data: lifecycleRows, error: lcErr } = await supabase
          .from('token_lifecycle')
          .select('token_mint, name, symbol')
          .in('token_mint', misses);
        if (lcErr) console.warn('[resolve-labels] token_lifecycle lookup error:', lcErr.message);
        for (const row of lifecycleRows || []) {
          const mint = (row as any).token_mint as string;
          const ticker = (row as any).symbol || null;
          const name = (row as any).name || null;
          if (ticker || name) {
            seen.add(mint);
            tokens[mint] = { ticker, name };
          }
        }
        for (const m of tokenMints) {
          if (!seen.has(m)) tokens[m] = { ticker: null, name: null };
        }
      }
    }

    if (handles.length > 0) {
      const { data, error } = await supabase
        .from('x_account_registry')
        .select('current_handle, display_name, handle_history')
        .in('current_handle', handles);
      if (error) console.warn('[resolve-labels] x_account_registry lookup error:', error.message);
      const seen = new Set<string>();
      for (const row of data || []) {
        const h = ((row as any).current_handle || '').toLowerCase();
        if (!h) continue;
        seen.add(h);
        const hist = (row as any).handle_history;
        const arr = Array.isArray(hist) ? hist.slice(-4) : null;
        handlesOut[h] = {
          display_name: (row as any).display_name || null,
          handle_history: arr,
          is_rotated: Array.isArray(arr) && arr.length > 0,
        };
      }
      for (const h of handles) {
        if (!seen.has(h)) handlesOut[h] = { display_name: null, handle_history: null, is_rotated: false };
      }
    }

    return new Response(JSON.stringify({ communities, tokens, handles: handlesOut }), {
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