// Backfill X community moderators (and admin re-confirm) for every row that's missing mods.
// Throttled: 30 communities per invocation; cron should run every 5 min during initial run.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { resolveXCommunity, linkWalletToCommunityStaff } from '../_shared/x-community-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BATCH_SIZE = 30;
const SLEEP_MS = 1500; // gentle pacing within batch

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const url = new URL(req.url);
  let body: any = {};
  try { body = req.method === 'POST' ? await req.json() : {}; } catch {}
  const limit = Math.min(BATCH_SIZE, Number(body.limit ?? url.searchParams.get('limit') ?? BATCH_SIZE));
  const onlyCommunityId: string | null = body.communityId ?? url.searchParams.get('communityId') ?? null;
  const force = body.force === true || url.searchParams.get('force') === 'true';
  const deep = body.deep === true || url.searchParams.get('deep') === 'true';

  const startedAt = Date.now();
  console.log(`[backfill-x-community-members] start limit=${limit} only=${onlyCommunityId ?? 'auto'} force=${force}`);

  // Step 1: DRAIN THE QUEUE FIRST. Discovery functions (DexScreener, harvest, social-link-checker, etc.)
  // enqueue communities into x_community_resolution_queue. Those take priority over the oldest-mods scan.
  let rows: any[] = [];
  let source: 'queue' | 'scan' | 'single' = 'scan';

  if (onlyCommunityId) {
    source = 'single';
    const { data, error } = await supabase
      .from('x_communities')
      .select('community_id, name, last_scraped_at, moderator_usernames, raw_data')
      .eq('community_id', onlyCommunityId)
      .limit(1);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    rows = data ?? [];
  } else {
    // 1a. Try queue first
    const { data: queueRows, error: queueErr } = await supabase
      .from('x_community_resolution_queue')
      .select('community_id, priority, attempts')
      .is('resolved_at', null)
      .lt('attempts', 3)
      .order('priority', { ascending: true })
      .order('enqueued_at', { ascending: true })
      .limit(limit);

    if (queueErr) console.warn('[backfill] queue read failed:', queueErr.message);

    if (queueRows && queueRows.length > 0) {
      source = 'queue';
      const ids = queueRows.map((q: any) => q.community_id);
      const { data: communityRows } = await supabase
        .from('x_communities')
        .select('community_id, name, last_scraped_at, moderator_usernames, raw_data')
        .in('community_id', ids);
      // Preserve order from queue
      const byId = new Map((communityRows ?? []).map((r: any) => [r.community_id, r]));
      rows = ids.map(id => byId.get(id) ?? { community_id: id, name: null, last_scraped_at: null, moderator_usernames: null, raw_data: null });
    } else {
      // 1b. Fallback: oldest-missing-mods scan
      // CRITICAL: only scan rows with numeric community_id (6-25 digits) — never
      // pseudo-IDs like "https___x_com_handle" created by admin-add-seen-token
      // for plain Twitter handles. Those waste Apify credits with 400 errors.
      const { data, error } = await supabase
        .from('x_communities')
        .select('community_id, name, last_scraped_at, moderator_usernames, raw_data')
        .eq('is_deleted', false)
        .filter('community_id', 'similar to', '[0-9]{6,25}')
        .or('moderator_usernames.is.null,last_scraped_at.is.null')
        .order('last_scraped_at', { ascending: true, nullsFirst: true })
        .limit(limit);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      rows = data ?? [];
    }
  }

  console.log(`[backfill-x-community-members] source=${source} rows=${rows.length}`);

  const results: Array<{ communityId: string; source: string; mods: number; admin: string | null; ok: boolean; error?: string }> = [];

  for (const row of rows ?? []) {
    const communityId = row.community_id as string;
    try {
      const resolved = await resolveXCommunity(supabase, communityId, { forceRefresh: force, deep });

      // Cross-link any wallets that already point at this community (token_social_links → tokens.creator_wallet)
      try {
        const { data: linkedWallets } = await supabase
          .from('token_social_links')
          .select('token_mint, tokens:tokens!inner(creator_wallet)')
          .eq('platform', 'x_community')
          .ilike('url', `%/communities/${communityId}%`)
          .limit(20);

        for (const lw of linkedWallets ?? []) {
          const w = (lw as any).tokens?.creator_wallet;
          if (w) {
            await linkWalletToCommunityStaff(supabase, w, resolved, {
              tokenMint: (lw as any).token_mint,
              discoveredVia: 'backfill-x-community-members',
            });
          }
        }
      } catch (linkErr) {
        console.warn(`[backfill] link step failed for ${communityId}:`, (linkErr as Error).message);
      }

      results.push({
        communityId,
        source: resolved.source,
        mods: resolved.moderators.length,
        admin: resolved.admin?.handle ?? null,
        ok: true,
      });
      console.log(`✅ ${communityId} [${resolved.source}] admin=@${resolved.admin?.handle ?? '—'} mods=${resolved.moderators.length}`);

      // Mark queue row resolved (no-op if not from queue)
      await supabase
        .from('x_community_resolution_queue')
        .update({ resolved_at: new Date().toISOString() })
        .eq('community_id', communityId)
        .is('resolved_at', null);
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`❌ ${communityId}: ${msg}`);
      results.push({ communityId, source: 'error', mods: 0, admin: null, ok: false, error: msg });

      // Increment attempts on the queue row
      await supabase.rpc('increment_xcrq_attempt', { p_community_id: communityId, p_error: msg }).catch(() => {
        // Fallback: direct update
        return supabase
          .from('x_community_resolution_queue')
          .update({ attempts: (row as any)?.attempts ? (row as any).attempts + 1 : 1, last_error: msg })
          .eq('community_id', communityId)
          .is('resolved_at', null);
      });
    }

    if (rows && rows.length > 1) await new Promise(r => setTimeout(r, SLEEP_MS));
  }

  const summary = {
    source,
    processed: results.length,
    succeeded: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    with_mods: results.filter(r => r.mods > 0).length,
    duration_ms: Date.now() - startedAt,
    results,
  };

  console.log(`[backfill-x-community-members] done`, JSON.stringify({
    processed: summary.processed, succeeded: summary.succeeded, with_mods: summary.with_mods, duration_ms: summary.duration_ms,
  }));

  return new Response(JSON.stringify(summary), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});