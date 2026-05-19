/**
 * autopsy-community-sweep
 *
 * One Apify scrape of the X Community feed, fed in parallel into multiple
 * AI lenses:
 *   - vulture lens   -> writes vulture_sightings + vulture_accounts
 *                       + autopsy_evidence_blobs(kind='vulture_sweep')
 *   - dissent lens   -> writes community_dissent_signals
 *                       + autopsy_evidence_blobs(kind='community_dissent')
 *
 * Also (optionally) checks the dev's main X timeline for "days since dev
 * last posted publicly anywhere" so the autopsy writer can quote a hard
 * silence number alongside community-only silence.
 *
 * Body: { candidate_id?, token_mint?, community_id?, force?, lenses? }
 *   lenses defaults to ['vulture','dissent'].
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';
import { createApiLogger } from '../_shared/api-logger.ts';
import {
  buildClassifierPrompt as buildVulturePrompt,
  findCopypastaGroups,
  preflagPost,
  type RawPost,
} from '../_shared/vulture-classify.ts';
import {
import { meteredAiFetch } from '../_shared/ai-meter.ts';
  buildDissentPrompt,
  computeDissentScore,
  preflagDissent,
  type DissentSignal,
} from '../_shared/dissent-classify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';
const COMMUNITY_RX = /x\.com\/i\/communities\/(\d+)/i;
const RESERVED_X_PATHS = new Set(['i', 'home', 'explore', 'search', 'notifications', 'messages', 'compose', 'settings']);

function extractCommunityId(input: string | null | undefined): string | null {
  if (!input) return null;
  if (/^\d{6,}$/.test(input)) return input;
  const m = input.match(COMMUNITY_RX);
  return m ? m[1] : null;
}

async function resolveCommunityForToken(supabase: any, tokenMint: string): Promise<string | null> {
  const { data } = await supabase
    .from('token_social_links')
    .select('community_id, url, is_community')
    .eq('token_mint', tokenMint)
    .neq('is_current', false);
  for (const r of data ?? []) {
    if (r.community_id) return String(r.community_id);
    const id = extractCommunityId(r.url);
    if (id) return id;
  }
  return null;
}

async function resolveDevTwitterHandle(supabase: any, tokenMint: string): Promise<string | null> {
  const { data } = await supabase
    .from('token_social_links')
    .select('extracted_handle, platform, link_type, is_community, url, community_id')
    .eq('token_mint', tokenMint)
    .eq('platform', 'twitter')
    .neq('is_current', false);

  const normalizeHandle = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const cleaned = String(value).replace(/^@/, '').trim().toLowerCase();
    if (!cleaned || RESERVED_X_PATHS.has(cleaned) || /^communit(y|ies)$/i.test(cleaned)) return null;
    return cleaned;
  };

  const handleFromUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (extractCommunityId(url)) return null;
    try {
      const parsed = new URL(url);
      const first = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
      return normalizeHandle(first);
    } catch {
      return null;
    }
  };

  // pick first non-community twitter profile handle
  for (const r of data ?? []) {
    if (r.is_community || r.community_id || extractCommunityId(r.url)) continue;
    const handle = normalizeHandle(r.extracted_handle) ?? handleFromUrl(r.url);
    if (handle) return handle;
  }
  return null;
}

function normalizeTweet(t: any): RawPost {
  // powerai actor returns raw X GraphQL Tweet objects: { legacy, core.user_results.result.legacy, ... }
  // Other actors return flatter shapes. Support both.
  const legacy = t.legacy ?? {};
  const userLegacy = t.core?.user_results?.result?.legacy ?? {};
  const handle = String(
    userLegacy.screen_name ??
    t.author?.userName ?? t.author?.screen_name ??
    t.user?.screen_name ?? t.username ?? t.authorUsername ?? '',
  ).replace(/^@/, '').toLowerCase();
  const display = userLegacy.name ?? t.author?.name ?? t.user?.name ?? t.authorName ?? null;
  const text = String(
    legacy.full_text ?? t.fullText ?? t.full_text ?? t.text ?? t.tweetText ?? t.content ?? '',
  ).trim();
  const urls: string[] = [];
  const urlEntitiesSources = [
    legacy.entities?.urls,
    t.entities?.urls,
    t.urls,
  ];
  for (const src of urlEntitiesSources) {
    if (!Array.isArray(src)) continue;
    for (const e of src) {
      const u = typeof e === 'string' ? e : (e?.expanded_url || e?.unwound_url || e?.url);
      if (u) urls.push(u);
    }
  }
  const bareMatches = text.match(/https?:\/\/[^\s)]+/g);
  if (bareMatches) urls.push(...bareMatches);
  const restId = t.rest_id ?? legacy.id_str ?? t.id_str ?? t.id ?? null;
  const postUrl = t.url ?? t.twitterUrl ?? t.tweetUrl
    ?? (handle && restId ? `https://x.com/${handle}/status/${restId}` : null);
  const postedAt = legacy.created_at ?? t.createdAt ?? t.created_at ?? t.tweetCreatedAt ?? t.timestamp ?? null;
  return {
    handle, display_name: display, text, urls: [...new Set(urls)],
    posted_at: postedAt,
    post_url: postUrl,
    raw: t,
  };
}

async function scrapeCommunityPosts(communityId: string, apifyKey: string, fnName: string): Promise<RawPost[]> {
  const actorId = 'powerai~twitter-community-tweets-scraper';
  const logger = createApiLogger({
    serviceName: 'apify',
    endpoint: `${actorId}/community-feed`,
    method: 'POST',
    functionName: fnName,
    metadata: { communityId },
  });
  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        communityId,
        searchType: 'Default',
        rankingMode: 'Recency',
        maxResults: 80,
      }),
    },
  );
  await logger.complete(res.status);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.warn(`[autopsy-community-sweep] community scrape ${res.status}: ${errText.slice(0, 500)}`);
    return [];
  }
  const tweets = await res.json();
  if (!Array.isArray(tweets)) {
    console.warn(`[autopsy-community-sweep] non-array response, keys=${Object.keys(tweets || {}).join(',')}`);
    return [];
  }
  console.log(`[autopsy-community-sweep] raw apify returned ${tweets.length} items; sample keys=${tweets[0] ? Object.keys(tweets[0]).join(',') : 'none'}`);
  return tweets
    .map(normalizeTweet)
    .filter((p) => p.handle && p.text);
}

async function scrapeDevTimelineLastPostAt(handle: string, apifyKey: string, fnName: string): Promise<{ last_post_at: string | null; sample_count: number }> {
  const actorId = 'apidojo~tweet-scraper';
  const logger = createApiLogger({
    serviceName: 'apify',
    endpoint: `${actorId}/dev-timeline`,
    method: 'POST',
    functionName: fnName,
    metadata: { handle },
  });
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startUrls: [{ url: `https://x.com/${handle}` }],
          maxItems: 20,
          sort: 'Latest',
        }),
      },
    );
    await logger.complete(res.status);
    if (!res.ok) return { last_post_at: null, sample_count: 0 };
    const tweets = await res.json();
    if (!Array.isArray(tweets) || tweets.length === 0) return { last_post_at: null, sample_count: 0 };
    let latest: string | null = null;
    for (const t of tweets) {
      const at = t.createdAt ?? t.created_at ?? null;
      if (at && (!latest || new Date(at).getTime() > new Date(latest).getTime())) latest = at;
    }
    return { last_post_at: latest, sample_count: tweets.length };
  } catch (e) {
    await logger.complete(0, (e as Error).message);
    return { last_post_at: null, sample_count: 0 };
  }
}

async function callGemini(systemPrompt: string, userPrompt: string): Promise<any> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY missing');
  const res = await meteredAiFetch("autopsy-community-sweep", LOVABLE_AI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  const cleaned = raw.replace(/^```(?:json)?\s*|\s*```\s*$/g, '').trim();
  try { return JSON.parse(cleaned); } catch { return { posts: [], parse_error: true, raw }; }
}

Deno.serve(withRunLog('autopsy-community-sweep', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const apifyKey = Deno.env.get('APIFY_API_KEY');
  if (!apifyKey) {
    return new Response(JSON.stringify({ error: 'APIFY_API_KEY missing' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const body = await req.json().catch(() => ({}));
  const candidateId: string | undefined = body.candidate_id;
  let tokenMint: string | undefined = body.token_mint;
  let communityId: string | undefined = body.community_id ? extractCommunityId(body.community_id) ?? body.community_id : undefined;
  const force: boolean = body.force === true;
  const lenses: string[] = Array.isArray(body.lenses) && body.lenses.length > 0
    ? body.lenses.map((s: any) => String(s).toLowerCase())
    : ['vulture', 'dissent'];

  if (candidateId && (!tokenMint || !communityId)) {
    const { data: cand } = await supabase
      .from('autopsy_candidates')
      .select('token_mint')
      .eq('id', candidateId)
      .maybeSingle();
    if (cand?.token_mint) tokenMint = cand.token_mint;
  }
  if (!communityId && tokenMint) {
    communityId = (await resolveCommunityForToken(supabase, tokenMint)) ?? undefined;
  }
  if (!communityId) {
    return new Response(JSON.stringify({ ok: false, reason: 'no community resolved' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 30-min cooldown — match autopsy-vulture-sweep behavior
  if (!force) {
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const q = supabase
      .from('autopsy_evidence_blobs')
      .select('id, kind')
      .in('kind', ['vulture_sweep', 'community_dissent'])
      .gte('captured_at', since);
    const { data: recent } = candidateId
      ? await q.eq('candidate_id', candidateId)
      : await q.eq('token_mint', tokenMint!);
    const haveVulture = (recent ?? []).some((r: any) => r.kind === 'vulture_sweep');
    const haveDissent = (recent ?? []).some((r: any) => r.kind === 'community_dissent');
    const allCovered = lenses.every((l) => (l === 'vulture' ? haveVulture : l === 'dissent' ? haveDissent : true));
    if (allCovered) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'recent sweep covers all requested lenses' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Resolve dev handle (used for dev-timeline silence check)
  const devHandle = tokenMint ? await resolveDevTwitterHandle(supabase, tokenMint) : null;

  // ───────────────────── Step A: ONE scrape ─────────────────────
  console.log(`[autopsy-community-sweep] scraping community ${communityId} (lenses=${lenses.join(',')})`);
  const [posts, devTimeline] = await Promise.all([
    scrapeCommunityPosts(communityId, apifyKey, 'autopsy-community-sweep'),
    devHandle ? scrapeDevTimelineLastPostAt(devHandle, apifyKey, 'autopsy-community-sweep') : Promise.resolve({ last_post_at: null, sample_count: 0 }),
  ]);
  console.log(`[autopsy-community-sweep] scraped ${posts.length} community posts; dev=${devHandle ?? '?'} dev_last=${devTimeline.last_post_at ?? 'unknown'}`);

  // Persist raw scrape blob (reusable for future lenses)
  const rawBlobRow: Record<string, unknown> = {
    kind: 'community_scrape',
    payload: { community_id: communityId, posts_scanned: posts.length, posts: posts.slice(0, 80) },
    captured_at: new Date().toISOString(),
  };
  if (candidateId) rawBlobRow.candidate_id = candidateId;
  if (tokenMint) rawBlobRow.token_mint = tokenMint;
  await assertDbWrite(
    supabase.from('autopsy_evidence_blobs').insert(rawBlobRow).select('id').single(),
    'autopsy_evidence_blobs', 'INSERT',
  );

  // Build the dev-silence numbers (community-only + global timeline)
  const devCommunityPosts = devHandle ? posts.filter((p) => p.handle === devHandle) : [];
  let devLastInCommunityAt: string | null = null;
  for (const p of devCommunityPosts) {
    if (p.posted_at && (!devLastInCommunityAt || new Date(p.posted_at).getTime() > new Date(devLastInCommunityAt).getTime())) {
      devLastInCommunityAt = p.posted_at;
    }
  }
  const daysSince = (iso: string | null): number | null => iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000) : null;

  // ───────────────────── Step B: lenses in parallel ─────────────────────
  const lensPromises: Array<Promise<{ lens: string; result: any } | null>> = [];

  // VULTURE LENS
  if (lenses.includes('vulture') && posts.length > 0) {
    lensPromises.push((async () => {
      const { data: domains } = await supabase.from('vulture_lookalike_domains').select('domain');
      const lookalikeSet = new Set<string>((domains ?? []).map((d: any) => String(d.domain).toLowerCase()));
      const preflags = posts.map((p) => preflagPost(p, lookalikeSet));
      const copypastaGroups = findCopypastaGroups(posts, 3);
      const { system, user } = buildVulturePrompt(posts, preflags, [...lookalikeSet], copypastaGroups);
      const aiResult = await callGemini(system, user);
      const classifications: any[] = Array.isArray(aiResult?.posts) ? aiResult.posts : [];

      const vultureHandles = new Set<string>();
      const allScamUrls = new Set<string>();
      let modActivitySeen = false;
      const sightingRows: any[] = [];
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const pre = preflags[i];
        const cls = classifications[i] ?? {};
        const aiKind = String(cls.vulture_kind ?? '').toLowerCase();
        const confidence = Math.max(0, Math.min(100, Number(cls.confidence ?? 0)));
        const reason = String(cls.reason ?? '').slice(0, 500);
        const aiScamUrls: string[] = Array.isArray(cls.scam_urls) ? cls.scam_urls : [];
        if (aiKind === 'mod') modActivitySeen = true;
        if (aiKind === 'mod' || aiKind === 'dev' || aiKind === 'benign' || !aiKind) {
          if (!pre.flagged) continue;
        }
        const finalKind = (aiKind && aiKind !== 'benign' && aiKind !== 'mod' && aiKind !== 'dev')
          ? aiKind : (pre.matched_kind ?? 'unknown');
        const scamUrls = [...new Set([...(pre.scam_urls ?? []), ...aiScamUrls])];
        scamUrls.forEach((u) => allScamUrls.add(u));
        vultureHandles.add(post.handle);
        sightingRows.push({
          token_mint: tokenMint ?? null,
          candidate_id: candidateId ?? null,
          community_id: communityId,
          handle: post.handle,
          display_name: post.display_name ?? null,
          post_url: post.post_url ?? null,
          post_text: (post.text ?? '').slice(0, 2000),
          posted_at: post.posted_at ?? null,
          vulture_kind: finalKind,
          scam_urls: scamUrls,
          ai_confidence: confidence || (pre.flagged ? 60 : 0),
          ai_reason: reason || pre.reasons.join('; '),
          raw_post: post.raw ?? null,
        });
      }
      if (sightingRows.length > 0) {
        await assertDbWrite(
          supabase.from('vulture_sightings').insert(sightingRows).select('id'),
          'vulture_sightings', 'INSERT',
        );
      }
      // upsert vulture_accounts
      for (const handle of vultureHandles) {
        const handleRows = sightingRows.filter((s) => s.handle === handle);
        const kinds = [...new Set(handleRows.map((s) => s.vulture_kind))];
        const avgConf = Math.round(handleRows.reduce((a, s) => a + (s.ai_confidence ?? 0), 0) / handleRows.length);
        const display = handleRows.find((s) => s.display_name)?.display_name ?? null;
        const { data: existing } = await supabase
          .from('vulture_accounts')
          .select('total_sightings, distinct_tokens, vulture_kinds, confidence_avg')
          .eq('handle', handle).maybeSingle();
        const mergedKinds = [...new Set([...(existing?.vulture_kinds ?? []), ...kinds])];
        const newTotal = (existing?.total_sightings ?? 0) + handleRows.length;
        let newDistinct = existing?.distinct_tokens ?? 0;
        if (tokenMint) {
          const { data: prior } = await supabase
            .from('vulture_sightings').select('id').eq('handle', handle).eq('token_mint', tokenMint).limit(1);
          if (!prior || prior.length === 0) newDistinct += 1;
        }
        const newConfAvg = Math.round(
          ((existing?.confidence_avg ?? 0) * (existing?.total_sightings ?? 0) + avgConf * handleRows.length) /
            Math.max(1, newTotal),
        );
        await assertDbWrite(
          supabase.from('vulture_accounts').upsert({
            handle, display_name: display,
            last_seen_at: new Date().toISOString(),
            total_sightings: newTotal, distinct_tokens: newDistinct,
            vulture_kinds: mergedKinds, confidence_avg: newConfAvg,
            is_likely_bot: newDistinct >= 3,
          }, { onConflict: 'handle' }).select('handle').single(),
          'vulture_accounts', 'UPSERT',
        );
      }
      const sampledPosts = sightingRows
        .sort((a, b) => (b.ai_confidence ?? 0) - (a.ai_confidence ?? 0))
        .slice(0, 8)
        .map((s) => ({
          handle: s.handle, vulture_kind: s.vulture_kind, confidence: s.ai_confidence,
          text: (s.post_text ?? '').slice(0, 200), scam_urls: s.scam_urls, post_url: s.post_url,
        }));
      const summary = {
        community_id: communityId, posts_scanned: posts.length,
        vulture_count: vultureHandles.size, sighting_count: sightingRows.length,
        vulture_handles: [...vultureHandles], scam_urls: [...allScamUrls],
        copypasta_groups: copypastaGroups.map((g) => ({ handles: g.handles, sample: g.text.slice(0, 200) })),
        mod_activity_seen: modActivitySeen, sampled_posts: sampledPosts,
      };
      const blobRow: Record<string, unknown> = {
        kind: 'vulture_sweep', payload: summary, captured_at: new Date().toISOString(),
      };
      if (candidateId) blobRow.candidate_id = candidateId;
      if (tokenMint) blobRow.token_mint = tokenMint;
      await assertDbWrite(
        supabase.from('autopsy_evidence_blobs').insert(blobRow).select('id').single(),
        'autopsy_evidence_blobs', 'INSERT',
      );
      return { lens: 'vulture', result: summary };
    })().catch((e) => {
      console.error('[autopsy-community-sweep] vulture lens failed:', (e as Error).message);
      return null;
    }));
  }

  // DISSENT LENS
  if (lenses.includes('dissent') && posts.length > 0) {
    lensPromises.push((async () => {
      const preflags = posts.map(preflagDissent);
      const { system, user } = buildDissentPrompt(posts, preflags);
      const aiResult = await callGemini(system, user);
      const classifications: any[] = Array.isArray(aiResult?.posts) ? aiResult.posts : [];

      const counts: Record<DissentSignal, number> = {
        absent_dev: 0, no_marketing: 0, no_creator_rewards: 0,
        no_communication: 0, demanding_action: 0, capitulation: 0, benign: 0,
      };
      const signalRows: any[] = [];
      const topQuotesBySignal = new Map<DissentSignal, Array<{ handle: string; quote: string; conf: number; post_url: string | null; posted_at: string | null }>>();

      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        const pre = preflags[i];
        const cls = classifications[i] ?? {};
        const aiSignals: DissentSignal[] = (Array.isArray(cls.signals) ? cls.signals : [])
          .map((s: any) => String(s).toLowerCase())
          .filter((s: string) => ['absent_dev', 'no_marketing', 'no_creator_rewards', 'no_communication', 'demanding_action', 'capitulation'].includes(s)) as DissentSignal[];
        const finalSignals = aiSignals.length > 0 ? aiSignals : pre.signals.filter((s) => s !== 'benign');
        if (finalSignals.length === 0) { counts.benign++; continue; }
        const confidence = Math.max(0, Math.min(100, Number(cls.confidence ?? (pre.flagged ? 60 : 0))));
        const quote = (String(cls.quote ?? '').trim() || (post.text ?? '').slice(0, 200)).slice(0, 280);

        for (const sig of finalSignals) {
          counts[sig] = (counts[sig] ?? 0) + 1;
          signalRows.push({
            candidate_id: candidateId ?? null, token_mint: tokenMint ?? null,
            community_id: communityId, signal_kind: sig,
            handle: post.handle, post_url: post.post_url ?? null,
            quote, posted_at: post.posted_at ?? null, ai_confidence: confidence,
          });
          if (!topQuotesBySignal.has(sig)) topQuotesBySignal.set(sig, []);
          topQuotesBySignal.get(sig)!.push({ handle: post.handle, quote, conf: confidence, post_url: post.post_url ?? null, posted_at: post.posted_at ?? null });
        }
      }

      if (signalRows.length > 0) {
        await assertDbWrite(
          supabase.from('community_dissent_signals').insert(signalRows).select('id'),
          'community_dissent_signals', 'INSERT',
        );
      }

      const dissentScore = computeDissentScore(counts, posts.length);
      // pick top 5 quotes overall by confidence
      const allQuotes: Array<{ kind: DissentSignal; handle: string; quote: string; conf: number; post_url: string | null; posted_at: string | null }> = [];
      for (const [kind, arr] of topQuotesBySignal.entries()) {
        for (const q of arr) allQuotes.push({ kind, ...q });
      }
      const topQuotes = allQuotes.sort((a, b) => b.conf - a.conf).slice(0, 5);

      const summary = {
        community_id: communityId,
        posts_scanned: posts.length,
        dissent_score: dissentScore,
        riot_threshold_met: dissentScore >= 60,
        counts,
        top_quotes: topQuotes,
        dev_handle: devHandle,
        dev_last_post_in_community_at: devLastInCommunityAt,
        dev_last_post_anywhere_at: devTimeline.last_post_at,
        dev_timeline_sample_count: devTimeline.sample_count,
        days_since_dev_post_in_community: daysSince(devLastInCommunityAt),
        days_since_dev_post_anywhere: daysSince(devTimeline.last_post_at),
      };
      const blobRow: Record<string, unknown> = {
        kind: 'community_dissent', payload: summary, captured_at: new Date().toISOString(),
      };
      if (candidateId) blobRow.candidate_id = candidateId;
      if (tokenMint) blobRow.token_mint = tokenMint;
      await assertDbWrite(
        supabase.from('autopsy_evidence_blobs').insert(blobRow).select('id').single(),
        'autopsy_evidence_blobs', 'INSERT',
      );
      return { lens: 'dissent', result: summary };
    })().catch((e) => {
      console.error('[autopsy-community-sweep] dissent lens failed:', (e as Error).message);
      return null;
    }));
  }

  const lensResults = (await Promise.all(lensPromises)).filter(Boolean);
  const out: Record<string, any> = {
    ok: true,
    community_id: communityId,
    posts_scanned: posts.length,
    dev_handle: devHandle,
    dev_last_post_anywhere_at: devTimeline.last_post_at,
    lenses: {},
  };
  for (const lr of lensResults) out.lenses[(lr as any).lens] = (lr as any).result;

  return new Response(JSON.stringify(out), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));