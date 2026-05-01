/**
 * autopsy-vulture-sweep
 *
 * Scrapes the X Community feed of a dead/dying token (autopsy candidate)
 * via Apify's apidojo~tweet-scraper, pre-filters posts for known phishing
 * patterns (fake pump.fun live streams, lookalike domains, copypasta bots),
 * sends the candidate set to Gemini Flash for forensic classification,
 * and writes:
 *   - vulture_sightings    (one row per non-benign post)
 *   - vulture_accounts     (upsert per handle, increment counters)
 *   - autopsy_evidence_blobs (kind='vulture_sweep', summary for the writer)
 *
 * Body: { candidate_id?: uuid, token_mint?: text, community_id?: text, force?: bool }
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertDbWrite } from '../_shared/db-assert.ts';
import { createApiLogger } from '../_shared/api-logger.ts';
import {
  buildClassifierPrompt,
  findCopypastaGroups,
  preflagPost,
  type RawPost,
} from '../_shared/vulture-classify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

const COMMUNITY_RX = /x\.com\/i\/communities\/(\d+)/i;

function extractCommunityId(input: string | null | undefined): string | null {
  if (!input) return null;
  if (/^\d{6,}$/.test(input)) return input; // already a bare id
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

async function scrapeCommunityPosts(communityId: string, apifyKey: string): Promise<RawPost[]> {
  const actorId = 'apidojo~tweet-scraper';
  const logger = createApiLogger({
    serviceName: 'apify',
    endpoint: `${actorId}/community-feed`,
    method: 'POST',
    functionName: 'autopsy-vulture-sweep',
    metadata: { communityId },
  });

  const res = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: `https://x.com/i/communities/${communityId}` }],
        maxItems: 80,
        sort: 'Latest',
        tweetLanguage: 'en',
      }),
    },
  );
  await logger.complete(res.status);

  if (!res.ok) {
    console.warn(`[autopsy-vulture-sweep] tweet-scraper non-200 (${res.status}) for community ${communityId}`);
    return [];
  }

  const tweets = await res.json();
  if (!Array.isArray(tweets)) return [];

  return tweets.map((t: any) => {
    const handle = String(
      t.author?.userName ?? t.author?.screen_name ?? t.user?.screen_name ?? t.username ?? '',
    ).replace(/^@/, '').toLowerCase();
    const display = t.author?.name ?? t.user?.name ?? null;
    const text = String(t.text ?? t.full_text ?? '').trim();
    const urls: string[] = [];
    const urlEntities = t.entities?.urls || t.urls || [];
    for (const e of urlEntities) {
      const u = e.expanded_url || e.unwound_url || e.url;
      if (u) urls.push(u);
    }
    // also pull bare URLs from text as a fallback
    const bareMatches = text.match(/https?:\/\/[^\s)]+/g);
    if (bareMatches) urls.push(...bareMatches);
    return {
      handle,
      display_name: display,
      text,
      urls: [...new Set(urls)],
      posted_at: t.createdAt ?? t.created_at ?? null,
      post_url: t.url ?? t.twitterUrl ?? null,
      raw: t,
    } as RawPost;
  }).filter((p) => p.handle && p.text);
}

async function callGeminiClassifier(systemPrompt: string, userPrompt: string): Promise<any> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY missing');
  const res = await fetch(LOVABLE_AI_URL, {
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

Deno.serve(withRunLog('autopsy-vulture-sweep', async (req) => {
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

  // Resolve token / community from candidate
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

  // Cooldown — skip if a vulture_sweep blob captured in the last 30 min, unless force=true
  if (!force) {
    const since = new Date(Date.now() - 30 * 60_000).toISOString();
    const q = supabase
      .from('autopsy_evidence_blobs')
      .select('id')
      .eq('kind', 'vulture_sweep')
      .gte('captured_at', since)
      .limit(1);
    const { data: recent } = candidateId
      ? await q.eq('candidate_id', candidateId)
      : await q.eq('token_mint', tokenMint!);
    if (recent && recent.length > 0) {
      return new Response(JSON.stringify({ ok: true, reason: 'recent sweep exists, force=false', skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // Pull lookalike domains from DB
  const { data: domains } = await supabase
    .from('vulture_lookalike_domains')
    .select('domain');
  const lookalikeSet = new Set<string>((domains ?? []).map((d: any) => String(d.domain).toLowerCase()));

  console.log(`[autopsy-vulture-sweep] sweeping community ${communityId} (token ${tokenMint ?? '?'})`);
  const posts = await scrapeCommunityPosts(communityId, apifyKey);
  console.log(`[autopsy-vulture-sweep] scraped ${posts.length} posts`);

  if (posts.length === 0) {
    const blobRow: Record<string, unknown> = {
      kind: 'vulture_sweep',
      payload: { community_id: communityId, vulture_count: 0, posts_scanned: 0, vulture_handles: [], scam_urls: [], copypasta_groups: [], mod_activity_seen: null, sampled_posts: [] },
      captured_at: new Date().toISOString(),
    };
    if (candidateId) blobRow.candidate_id = candidateId;
    if (tokenMint) blobRow.token_mint = tokenMint;
    await assertDbWrite(
      supabase.from('autopsy_evidence_blobs').insert(blobRow).select('id').single(),
      'autopsy_evidence_blobs', 'INSERT',
    );
    return new Response(JSON.stringify({ ok: true, vulture_count: 0, posts_scanned: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Pre-filter
  const preflags = posts.map((p) => preflagPost(p, lookalikeSet));
  const copypastaGroups = findCopypastaGroups(posts, 3);

  // Send ALL posts to AI (small enough — 80 max)
  const { system, user } = buildClassifierPrompt(posts, preflags, [...lookalikeSet], copypastaGroups);
  const aiResult = await callGeminiClassifier(system, user);
  const classifications: any[] = Array.isArray(aiResult?.posts) ? aiResult.posts : [];

  // Walk classifications back to posts and write sightings
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
      // If pre-filter caught it but AI cleared it, still record at low confidence to keep evidence trail
      if (!pre.flagged) continue;
    }

    // Final kind: prefer AI when meaningful, fallback to pre-filter kind
    const finalKind = (aiKind && aiKind !== 'benign' && aiKind !== 'mod' && aiKind !== 'dev')
      ? aiKind
      : (pre.matched_kind ?? 'unknown');

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

  // Insert sightings
  if (sightingRows.length > 0) {
    await assertDbWrite(
      supabase.from('vulture_sightings').insert(sightingRows).select('id'),
      'vulture_sightings', 'INSERT',
    );
  }

  // Upsert vulture_accounts (counters per handle)
  for (const handle of vultureHandles) {
    const handleRows = sightingRows.filter((s) => s.handle === handle);
    const kinds = [...new Set(handleRows.map((s) => s.vulture_kind))];
    const avgConf = Math.round(
      handleRows.reduce((a, s) => a + (s.ai_confidence ?? 0), 0) / handleRows.length,
    );
    const display = handleRows.find((s) => s.display_name)?.display_name ?? null;

    // Read existing row to merge counters
    const { data: existing } = await supabase
      .from('vulture_accounts')
      .select('total_sightings, distinct_tokens, vulture_kinds, confidence_avg')
      .eq('handle', handle)
      .maybeSingle();

    const mergedKinds = [...new Set([...(existing?.vulture_kinds ?? []), ...kinds])];
    const newTotal = (existing?.total_sightings ?? 0) + handleRows.length;
    // distinct_tokens is approximate — increment when this token is new for this handle
    let newDistinct = existing?.distinct_tokens ?? 0;
    if (tokenMint) {
      const { data: priorForToken } = await supabase
        .from('vulture_sightings')
        .select('id')
        .eq('handle', handle)
        .eq('token_mint', tokenMint)
        .limit(1);
      if (!priorForToken || priorForToken.length === 0) newDistinct += 1;
    }
    const newConfAvg = Math.round(
      ((existing?.confidence_avg ?? 0) * (existing?.total_sightings ?? 0) + avgConf * handleRows.length) /
        Math.max(1, newTotal),
    );
    const isLikelyBot = newDistinct >= 3;

    await assertDbWrite(
      supabase.from('vulture_accounts').upsert({
        handle,
        display_name: display,
        last_seen_at: new Date().toISOString(),
        total_sightings: newTotal,
        distinct_tokens: newDistinct,
        vulture_kinds: mergedKinds,
        confidence_avg: newConfAvg,
        is_likely_bot: isLikelyBot,
      }, { onConflict: 'handle' }).select('handle').single(),
      'vulture_accounts', 'UPSERT',
    );
  }

  // Summary blob for the autopsy writer
  const sampledPosts = sightingRows
    .sort((a, b) => (b.ai_confidence ?? 0) - (a.ai_confidence ?? 0))
    .slice(0, 8)
    .map((s) => ({
      handle: s.handle,
      vulture_kind: s.vulture_kind,
      confidence: s.ai_confidence,
      text: (s.post_text ?? '').slice(0, 200),
      scam_urls: s.scam_urls,
      post_url: s.post_url,
    }));

  const summary = {
    community_id: communityId,
    posts_scanned: posts.length,
    vulture_count: vultureHandles.size,
    sighting_count: sightingRows.length,
    vulture_handles: [...vultureHandles],
    scam_urls: [...allScamUrls],
    copypasta_groups: copypastaGroups.map((g) => ({ handles: g.handles, sample: g.text.slice(0, 200) })),
    mod_activity_seen: modActivitySeen,
    sampled_posts: sampledPosts,
  };

  const blobRow: Record<string, unknown> = {
    kind: 'vulture_sweep',
    payload: summary,
    captured_at: new Date().toISOString(),
  };
  if (candidateId) blobRow.candidate_id = candidateId;
  if (tokenMint) blobRow.token_mint = tokenMint;
  await assertDbWrite(
    supabase.from('autopsy_evidence_blobs').insert(blobRow).select('id').single(),
    'autopsy_evidence_blobs', 'INSERT',
  );

  return new Response(JSON.stringify({ ok: true, ...summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));
