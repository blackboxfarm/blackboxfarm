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

  // Pick rows: either the single requested one, or oldest-missing-mods ascending
  let query = supabase
    .from('x_communities')
    .select('community_id, name, last_scraped_at, moderator_usernames, raw_data')
    .eq('is_deleted', false)
    .limit(limit);

  if (onlyCommunityId) {
    query = query.eq('community_id', onlyCommunityId);
  } else {
    // missing mods OR never scraped — oldest first to fairness-rotate
    query = query
      .or('moderator_usernames.is.null,last_scraped_at.is.null')
      .order('last_scraped_at', { ascending: true, nullsFirst: true });
  }

  const { data: rows, error } = await query;
  if (error) {
    console.error('[backfill-x-community-members] select failed:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

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
    } catch (e) {
      const msg = (e as Error).message;
      console.error(`❌ ${communityId}: ${msg}`);
      results.push({ communityId, source: 'error', mods: 0, admin: null, ok: false, error: msg });
    }

    if (rows && rows.length > 1) await new Promise(r => setTimeout(r, SLEEP_MS));
  }

  const summary = {
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