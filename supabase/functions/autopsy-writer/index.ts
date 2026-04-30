/**
 * autopsy-writer
 *
 * Picks the highest-scoring autopsy_candidate that hasn't been drafted yet,
 * gathers all available evidence (token_lifecycle, dev_behavior_scores,
 * dev_wallet_reputation, token_social_links, pumpfun_watchlist), feeds it
 * to Gemini via Lovable AI Gateway with the GPT autopsy as a few-shot example,
 * and produces:
 *
 *   1. A markdown report saved to autopsy_candidates.draft_md_path
 *   2. An autopsy banner image (DexScreener banner + forensic overlay) saved
 *      to /autopsies/<slug>-autopsy-v2.jpg via Lovable AI image edit
 *   3. An autopsy_reports row (status='drafted')
 *
 * Tier-A + confidence ≥ autoPublishMinConfidence → auto-publish path
 * Tier-A low conf or Tier-B → drafted, awaits admin approval
 *
 * Body:
 *   { candidate_id?: uuid, batch?: number }
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { assertInsert, assertUpdate } from '../_shared/db-assert.ts';
import { classifyDeath, DEATH_TAXONOMY, shouldAutoPublish, type DeathCauseId } from '../_shared/autopsy-taxonomy.ts';
import { enrichCandidate } from '../_shared/autopsy-enrich.ts';
import { buildDevDossier } from '../_shared/autopsy-dev-context.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

function slugify(s: string): string {
  return s.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

function num(...values: unknown[]): number | null {
  for (const v of values) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function meaningfulCause(cause: unknown): cause is DeathCauseId {
  return typeof cause === 'string' && cause in DEATH_TAXONOMY && cause !== 'unknown';
}

const FEW_SHOT_MALICIOUS = `# Token Autopsy — GPT "Greedy Pissing Testicle"
**Verdict: TEXTBOOK COORDINATED RUG.**
## 1. Subject
| Field | Value |
|---|---|
| Mint | \`...\` |
| Symbol | \`GPT\` |
| ATH MCap | $265,346 |
| Lifetime | 6.26h |
| 🪦 Time of Death | ~14:45:33 UTC, 2026-04-29 |
## 2. Players
| Role | Address | Behavior |
|---|---|---|
| Creator / Dev | \`...\` | Brand-new burner. Created token. |
| Funder | \`...\` | Pre-funded dev. Consolidated to USDC. |
## 3. Timeline
## 4. The Rug Mechanic
## 5. Classic Rug-Dev Fingerprint
## 6. Verdict & Recommendation`;

const FEW_SHOT_NEGLIGENT = `# Token Autopsy — EXAMPLE "Soft Fade"
**Verdict: DEV WALKED — NO MALICE PROVEN.**
## 1. Subject
| Field | Value | (ATH, lifetime, time of death) |
## 2. Players
| Role | Address | Behavior |
## 3. Timeline
## 4. Failure Mechanic
(No malicious dump pattern. Dev wallet went silent at ~Xh. Mods stopped responding.
Spam took over. Holders rotated out passively.)
## 5. Fingerprint
## 6. Verdict & Recommendation`;

const FEW_SHOT_ORGANIC = `# Token Autopsy — EXAMPLE "Honest Run"
**Verdict: RAN ITS CYCLE — NO MALICE DETECTED.**
## 1. Subject
| Field | Value | (ATH, lifetime, time of death) |
## 2. Players (credit where credit is due)
| Role | Address | Contribution |
|---|---|---|
| Creator / Dev | \`...\` | Built and shipped: website, X (N followers), X-community (N members, N mods), Telegram (N subs), Discord, YouTube. |
| Promotion | — | DexScreener Boost paid (N×). CoinMarketCap submission. |
## 3. Timeline
## 4. What They Did Right
(List the legitimate build: socials shipped, community grown, paid promotion run, ATH reached on real volume.)
## 5. Cycle Anatomy
(Legitimate peak. Retail rotated to the next attention cycle. No bundle dump, no LP pull,
no honeypot, no admin abandonment mid-pump. Standard meta-coin lifecycle.)
## 6. Fingerprint (Dev Dossier)
(Clean dossier OR mixed dossier with prior cycle history. Neutral framing.)
## 7. Verdict & Recommendation
Project completed its on-chain lifecycle. **No reputational flag on the dev or cluster.**`;

function fewShotForIntent(intent: string): string {
  if (intent === 'organic') return FEW_SHOT_ORGANIC;
  if (intent === 'negligent') return FEW_SHOT_NEGLIGENT;
  return FEW_SHOT_MALICIOUS;
}

const BANNED_PHRASES_HIGH_SOCIAL = [
  /on[-\s]?chain ghost/i,
  /dead on arrival/i,
  /failed launch/i,
  /no community/i,
  /abandoned token creation attempt/i,
  /unclassified.*ghost/i,
];

async function callAI(prompt: string, systemPrompt: string): Promise<string> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) throw new Error('LOVABLE_API_KEY not configured');
  const res = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`AI gateway ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

Deno.serve(withRunLog('autopsy-writer', async (req) => {
  if (!await isFunctionEnabled('autopsy-writer')) {
    return new Response(JSON.stringify({ skipped: 'disabled' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  }
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const body = await req.json().catch(() => ({}));
  const batchSize = Math.min(body.batch || 1, 3); // small batch — each costs $$
  const isRegenerate = !!body.regenerate;

  // Pick top-scoring candidates, Tier-A first, that are still pending
  let query = supabase
    .from('autopsy_candidates')
    .select('*')
    .eq('status', 'pending')
    .order('tier', { ascending: true }) // 'A' < 'B' < 'C'
    .order('candidate_score', { ascending: false })
    .limit(batchSize);

  if (body.candidate_id) {
    query = supabase.from('autopsy_candidates').select('*').eq('id', body.candidate_id).limit(1);
  }

  const { data: candidates } = await query;
  if (!candidates || candidates.length === 0) {
    return new Response(JSON.stringify({ message: 'No candidates pending' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const results: Array<{ candidate_id: string; slug?: string; status: string; error?: string }> = [];

  for (const c of candidates) {
    try {
      // Mark as analyzing
      await assertUpdate(
        supabase.from('autopsy_candidates').update({ status: 'analyzing', analyzed_at: new Date().toISOString() }).eq('id', c.id).select('id').single(),
        'autopsy_candidates'
      );

      // ── Gather evidence ──────────────────────────────────────
      const [{ data: lifecycle }, { data: pf }, { data: socials }, { data: liveDeath }, { data: backlog }] = await Promise.all([
        supabase.from('token_lifecycle').select('*').eq('token_mint', c.token_mint).maybeSingle(),
        supabase.from('pumpfun_watchlist').select('*').eq('token_mint', c.token_mint).maybeSingle(),
        supabase.from('token_social_links').select('platform, link_type, url, extracted_handle, is_community, community_id, source, phase, is_current').eq('token_mint', c.token_mint).neq('is_current', false),
        supabase.from('v_live_death_watch').select('*').eq('token_mint', c.token_mint).maybeSingle(),
        supabase.from('autopsy_backlog').select('*').eq('token_mint', c.token_mint).maybeSingle(),
      ]);

      let devBehavior: any = null;
      let devReputation: any = null;
      const creatorWallet = c.creator_wallet ?? pf?.creator_wallet ?? lifecycle?.creator_wallet ?? liveDeath?.creator_wallet ?? backlog?.creator_wallet;
      if (creatorWallet) {
        const [{ data: db }, { data: dr }] = await Promise.all([
          supabase.from('dev_behavior_scores').select('*').eq('wallet_address', creatorWallet).maybeSingle(),
          supabase.from('dev_wallet_reputation').select('*').eq('wallet_address', creatorWallet).maybeSingle(),
        ]);
        devBehavior = db;
        devReputation = dr;
      }

      // ── v2: enrichment + dev dossier + evidence blobs ───────
      const enrichment = await enrichCandidate(supabase, c.token_mint, creatorWallet);
      const dossier = await buildDevDossier(supabase, creatorWallet);
      const { data: blobs } = await supabase
        .from('autopsy_evidence_blobs')
        .select('kind, payload, captured_at')
        .eq('candidate_id', c.id)
        .order('captured_at', { ascending: false })
        .limit(10);

      const athMcap = num(c.ath_mcap_usd, liveDeath?.ath_usd, backlog?.ath_usd, lifecycle?.ath_24h_usd, pf?.ath_market_cap_usd, Number(pf?.price_ath_usd ?? 0) * 1_000_000_000, pf?.market_cap_usd);
      const currentMcap = num(c.current_mcap_usd, liveDeath?.current_mcap_usd, backlog?.current_mcap_usd, lifecycle?.market_cap, pf?.market_cap_usd);
      const liquidityUsd = num(c.liquidity_usd, liveDeath?.liquidity_usd, backlog?.liquidity_usd, lifecycle?.liquidity_usd, pf?.liquidity_usd);
      const ageHours = num(c.age_hours) ?? (liveDeath?.first_seen_at ? (Date.now() - new Date(liveDeath.first_seen_at).getTime()) / 3600000 : null);
      const freshClass = classifyDeath({
        ageHours: ageHours ?? 0,
        mcap: currentMcap ?? 0,
        liquidity: liquidityUsd ?? 0,
        athMcap: athMcap ?? 0,
        dumpVelocity: devBehavior?.dump_velocity_score ?? 0,
        lpPullScore: devBehavior?.lp_pull_score ?? 0,
        devBuyPct: 100 - (devBehavior?.supply_retention_pct ?? 100),
        hasMaliciousDump: (devBehavior?.dump_velocity_score ?? 0) > 60,
        socialCompleteness: enrichment.social_completeness,
        devDossier: dossier,
      });
      const causeId = (!meaningfulCause(c.death_cause) || isRegenerate || freshClass.cause === 'natural_cycle') ? freshClass.cause : c.death_cause;
      const causeDef = DEATH_TAXONOMY[causeId] ?? DEATH_TAXONOMY.unknown;
      const confidence = freshClass.confidence ?? c.death_confidence ?? 30;
      const matchedSignals = freshClass.matchedSignals?.length ? freshClass.matchedSignals : (c.matched_signals ?? []);

      // Persist enrichment + hydrated facts on the candidate so the UI and next run see them
      await assertUpdate(supabase.from('autopsy_candidates').update({
        ...enrichment,
        dev_dossier: dossier,
        death_cause: causeId,
        death_intent: causeDef.intent,
        death_confidence: confidence,
        matched_signals: matchedSignals,
        ath_mcap_usd: athMcap,
        current_mcap_usd: currentMcap,
        liquidity_usd: liquidityUsd,
        age_hours: ageHours,
        creator_wallet: creatorWallet,
      }).eq('id', c.id).select('id').single(), 'autopsy_candidates');

      const ticker = c.ticker ?? pf?.token_symbol ?? liveDeath?.symbol ?? backlog?.symbol ?? c.token_mint.slice(0, 6);
      const tokenName = c.token_name ?? pf?.token_name ?? liveDeath?.name ?? backlog?.name ?? ticker;
      const baseSlug = slugify(`${ticker}-${tokenName}`);

      // Determine version for this candidate
      const { data: existingReports } = await supabase
        .from('autopsy_reports')
        .select('id, version, slug')
        .eq('candidate_id', c.id)
        .order('version', { ascending: false });
      const nextVersion = ((existingReports?.[0]?.version as number | undefined) ?? 0) + 1;
      const slug = baseSlug;

      // ── AI prompt ────────────────────────────────────────────
      const intent = causeDef.intent;
      const fewShot = fewShotForIntent(intent);
      const highSocial = (enrichment.social_completeness ?? 0) >= 3;
      const isOrganic = intent === 'organic';
      const clusterRugs = (dossier.cluster_history_summary?.rug_count ?? 0)
                       + (dossier.cluster_history_summary?.soft_rug_count ?? 0);

      const systemPrompt = `You are the BlackBox Farm forensic analyst. You write coroner-style autopsy reports for dead Solana tokens. Tone: clinical, evidence-based, dry forensic humor. NEVER fabricate addresses, transaction hashes, or numbers. If a value is unknown, write "unknown" or omit. Match the structure of the reference example for the determined intent.

CLASSIFIED INTENT FOR THIS REPORT: ${intent.toUpperCase()}

REFERENCE EXAMPLE (structure to follow):
${fewShot}

HARD RULES:
- The verdict at the top of the report MUST be exactly: "${causeDef.verdict}".
${highSocial ? `- This project shipped a real social stack (social_completeness=${enrichment.social_completeness}). You are FORBIDDEN from using any of these phrases: "on-chain ghost", "dead on arrival", "failed launch", "no community", "abandoned token creation attempt".` : ''}
${isOrganic ? '- Do NOT call the dev a rugger or grifter. Credit the social build-out explicitly. Frame retail rotation as a normal lifecycle event, not a failure.' : ''}
${clusterRugs >= 3 ? `- The creator cluster has ${clusterRugs} prior rugs/abandonments. The report MUST name this as a repeat-pattern actor in the Fingerprint and Verdict sections, citing the prior mints by ticker + ATH. Even if the immediate on-chain footprint is gentle, this is a serial pattern.` : ''}
- Always include a "🪦 Time of Death" row in the Subject table.`;

      const userPrompt = `Write a complete BlackBox Autopsy markdown report for the following dead Solana token, matching the reference structure for intent="${intent}".

## CLASSIFICATION (already determined by classifier — do NOT contradict)
- Death cause: ${causeDef.label} (${causeDef.id})
- Intent: ${causeDef.intent}
- Verdict tag: ${causeDef.verdict}
- Confidence: ${c.death_confidence}/100
- Matched signals: ${JSON.stringify(c.matched_signals)}

## TOKEN
Mint: ${c.token_mint}
Ticker: ${ticker}
Name: ${tokenName}
ATH MCap USD: ${c.ath_mcap_usd ?? 'unknown'}
Current MCap USD: ${c.current_mcap_usd ?? 'unknown'}
Liquidity USD: ${c.liquidity_usd ?? 'unknown'}
Lifetime hours: ${c.age_hours?.toFixed(2) ?? 'unknown'}
Creator wallet: ${creatorWallet ?? 'unknown'}

## SOCIAL STACK (enrichment)
- Social completeness: ${enrichment.social_completeness}/6 platforms
- X community: ${enrichment.x_community_member_count ?? 'unknown'} members
- Telegram subscribers: ${enrichment.telegram_subscriber_count ?? 'unknown'}
- Discord present: ${enrichment.discord_present}
- YouTube: ${enrichment.youtube_url ?? 'none'}
- Paid boosts (USD): ${enrichment.boosts_paid_usd ?? 'none recorded'}
- DexScreener paid: ${enrichment.dex_paid ?? 'unknown'}
- Holders at peak: ${enrichment.holders_at_ath ?? 'unknown'}
- Dev holdings at death: ${enrichment.dev_holding_pct_at_death ?? 'unknown'}%

## DEV DOSSIER (cluster-aware)
- Reputation verdict: ${dossier.reputation_verdict}
- KYC root: ${dossier.kyc_root ?? 'not resolved'}
- Cluster size: ${dossier.cluster_wallets?.length ?? 1} linked wallets
- Cluster history: ${JSON.stringify(dossier.cluster_history_summary)}
- Prior tokens (most recent first):
${(dossier.prior_tokens ?? []).slice(0, 8).map(t => `  - ${t.mint} ATH=${t.ath_mcap_usd ?? '?'} status=${t.status ?? '?'} cause=${t.death_cause ?? '?'}`).join('\n') || '  (none on record)'}
- Evidence strings: ${JSON.stringify(dossier.primary_evidence_strings)}

## TOKEN LIFECYCLE
${JSON.stringify(lifecycle ?? {}, null, 2)}

## DEV BEHAVIOR SCORE
${JSON.stringify(devBehavior ?? {}, null, 2)}

## DEV WALLET REPUTATION
${JSON.stringify(devReputation ?? {}, null, 2)}

## SOCIALS
${JSON.stringify(socials ?? [], null, 2)}

## SOCIAL EVIDENCE BLOBS (TG deep-pulls, X community scrapes — verbatim)
${JSON.stringify(blobs ?? [], null, 2)}

## SOCIAL DEATH SIGNALS
No-admin-message hours: ${c.social_no_admin_hours ?? 'unchecked'}
Spam %: ${c.social_spam_pct ?? 'unchecked'}

Write the full markdown now. No preamble, no code fence — start with "# Token Autopsy — ...".`;

      let md = await callAI(userPrompt, systemPrompt);

      // Banned-phrase guard for high-social-completeness projects
      if (highSocial) {
        const violations = BANNED_PHRASES_HIGH_SOCIAL.filter(rx => rx.test(md)).map(rx => String(rx));
        if (violations.length > 0) {
          console.warn(`[autopsy-writer] banned phrases on first pass: ${violations.join(', ')} — re-prompting`);
          const retrySys = systemPrompt + `\n\nPREVIOUS DRAFT VIOLATED THE BANNED-PHRASE RULE. Rewrite without any of: "on-chain ghost", "dead on arrival", "failed launch", "no community". This project had a real social build (${enrichment.social_completeness} platforms).`;
          md = await callAI(userPrompt, retrySys);
        }
      }

      // ── If regenerating, mark prior reports as not current ──
      if (existingReports && existingReports.length > 0) {
        await supabase
          .from('autopsy_reports')
          .update({ is_current: false })
          .eq('candidate_id', c.id);
      }

      // ── Insert report draft ──────────────────────────────────
      const subtitle = causeDef.summary;
      const insertedRows = await assertInsert(
        supabase.from('autopsy_reports').insert({
          slug,
          version: nextVersion,
          is_current: true,
          token_mint: c.token_mint,
          ticker,
          title: `${ticker} — ${tokenName}`,
          subtitle,
          verdict: causeDef.verdict,
          risk_score: c.death_confidence ? `${Math.round(c.death_confidence / 10)}/10` : null,
          death_cause: c.death_cause ?? 'unclassified',
          death_intent: c.death_intent ?? null,
          death_confidence: c.death_confidence,
          md_content: md,
          md_path: `/autopsies/${slug}.md`,
          tags: [causeDef.intent, causeDef.id],
          candidate_id: c.id,
        }).select('id, slug').single() as any,
        'autopsy_reports'
      );

      const drafted = (insertedRows as { id: string; slug: string });

      // ── Banner overlay (best-effort, non-blocking) ──────────
      try {
        const overlayRes = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/autopsy-banner-overlay`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            },
            body: JSON.stringify({
              slug: drafted.slug,
              token_mint: c.token_mint,
              ticker,
              report_id: drafted.id,
            }),
          },
        );
        if (!overlayRes.ok) {
          console.warn(`[autopsy-writer] banner overlay non-OK ${overlayRes.status} for ${drafted.slug}`);
        } else {
          const ovr = await overlayRes.json();
          console.log(`[autopsy-writer] banner ready: ${ovr.hero_image_url}`);
        }
      } catch (bannerErr: any) {
        console.warn(`[autopsy-writer] banner overlay failed for ${drafted.slug}:`, bannerErr?.message);
        // Don't fail the draft — admin can retry banner from the queue.
      }

      // ── Update candidate ─────────────────────────────────────
      const autoPublish = shouldAutoPublish(c.death_cause as DeathCauseId, c.death_confidence ?? 0);
      await assertUpdate(
        supabase.from('autopsy_candidates').update({
          status: autoPublish ? 'approved' : 'drafted',
          drafted_at: new Date().toISOString(),
          decided_at: autoPublish ? new Date().toISOString() : null,
          published_slug: drafted.slug,
          draft_md_path: `/autopsies/${slug}.md`,
        }).eq('id', c.id).select('id').single(),
        'autopsy_candidates'
      );

      results.push({ candidate_id: c.id, slug: drafted.slug, status: autoPublish ? 'approved' : 'drafted' });
    } catch (e: any) {
      console.error(`[autopsy-writer] failed for ${c.id}:`, e);
      await supabase.from('autopsy_candidates').update({
        status: 'failed',
        status_reason: e.message?.slice(0, 500),
      }).eq('id', c.id);
      results.push({ candidate_id: c.id, status: 'failed', error: e.message });
    }
  }

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));