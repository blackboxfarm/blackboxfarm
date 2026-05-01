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

      // Trigger AI interpretation of any raw TG/X scrape blobs (best effort)
      try {
        await supabase.functions.invoke('autopsy-evidence-interpret', {
          body: { candidate_id: c.id, token_mint: c.token_mint },
        });
      } catch (e) { console.warn('[autopsy-writer] evidence interpret skipped:', (e as Error).message); }

      // Trigger one X-Community sweep that runs vulture + dissent lenses in
      // parallel off a single Apify scrape. Populates vulture_sightings,
      // community_dissent_signals, and the matching autopsy_evidence_blobs
      // rows that enrichCandidate will pick up on the next read.
      try {
        await supabase.functions.invoke('autopsy-community-sweep', {
          body: { candidate_id: c.id, token_mint: c.token_mint, force: isRegenerate, lenses: ['vulture', 'dissent'] },
        });
        const refreshed = await enrichCandidate(supabase, c.token_mint, creatorWallet);
        Object.assign(enrichment, refreshed);
      } catch (e) { console.warn('[autopsy-writer] community sweep skipped:', (e as Error).message); }

      const { data: blobs } = await supabase
        .from('autopsy_evidence_blobs')
        .select('kind, payload, captured_at')
        .eq('candidate_id', c.id)
        .order('captured_at', { ascending: false })
        .limit(10);

      // ATH source priority (most accurate first):
      //  1. lifecycle.ath_24h_usd  — populated by ath-backfill via GeckoTerminal hourly OHLCV (true historical peak)
      //  2. liveDeath.ath_usd / backlog.ath_usd — death-watch snapshots
      //  3. pf.ath_market_cap_usd — Pump.fun reported ATH mcap
      //  4. c.ath_mcap_usd — last persisted value (only if nothing fresher)
      //  5. pf.market_cap_usd — current mcap as last-resort floor
      // ⚠️ Removed: `price_ath_usd × 1_000_000_000` — that fallback assumed exactly 1B supply
      // and produced wildly inflated ATHs (e.g. $4.7M for a token whose real peak was ~$760k).
      const athMcap = num(
        lifecycle?.ath_24h_usd,
        liveDeath?.ath_usd,
        backlog?.ath_usd,
        pf?.ath_market_cap_usd,
        c.ath_mcap_usd,
        pf?.market_cap_usd,
      );
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
      const existingCause: DeathCauseId = meaningfulCause(c.death_cause) ? c.death_cause : 'unknown';
      const causeId: DeathCauseId = (existingCause === 'unknown' || isRegenerate || freshClass.cause === 'natural_cycle') ? freshClass.cause : existingCause;
      const causeDef = DEATH_TAXONOMY[causeId] ?? DEATH_TAXONOMY.unknown;
      const confidence = causeId === freshClass.cause ? freshClass.confidence : (c.death_confidence ?? freshClass.confidence ?? 30);
      const matchedSignals = causeId === freshClass.cause && freshClass.matchedSignals?.length ? freshClass.matchedSignals : (c.matched_signals ?? []);

      // Persist hydrated facts on the candidate so the UI and next run see them.
      // Only write columns that actually exist on autopsy_candidates — the rest of
      // the enrichment object (vulture_summary, dissent_summary, paid_orders, etc.)
      // lives in autopsy_evidence_blobs and is read back via enrichCandidate().
      await assertUpdate(supabase.from('autopsy_candidates').update({
        // enrichment fields that ARE columns on autopsy_candidates
        social_completeness: enrichment.social_completeness,
        x_community_member_count: enrichment.x_community_member_count,
        telegram_subscriber_count: enrichment.telegram_subscriber_count,
        discord_present: enrichment.discord_present,
        youtube_url: enrichment.youtube_url,
        boosts_paid_usd: enrichment.boosts_paid_usd,
        dex_paid: enrichment.dex_paid,
        holders_at_ath: enrichment.holders_at_ath,
        dev_holding_pct_at_death: enrichment.dev_holding_pct_at_death,
        // hydrated facts
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
- Confidence: ${confidence}/100
- Matched signals: ${JSON.stringify(matchedSignals)}

## TOKEN
Mint: ${c.token_mint}
Ticker: ${ticker}
Name: ${tokenName}
ATH MCap USD: ${athMcap ?? 'unknown'}
Current MCap USD: ${currentMcap ?? 'unknown'}
Liquidity USD: ${liquidityUsd ?? 'unknown'}
Lifetime hours: ${ageHours?.toFixed(2) ?? 'unknown'}
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

## BOOST TIMELINE (DexScreener — every recorded change in totalAmount)
${(enrichment.boost_timeline ?? []).length === 0
  ? '(no boost activity captured)'
  : (enrichment.boost_timeline ?? []).map(b => `- ${b.captured_at} total=${b.total_amount ?? '?'} delta=${b.delta_amount ?? 0} src=${b.source}`).join('\n')}

## PAID ORDERS (DexScreener)
${(enrichment.paid_orders ?? []).length === 0
  ? '(no paid orders recorded)'
  : (enrichment.paid_orders ?? []).map(o => `- ${o.payment_timestamp ?? 'unknown'} ${o.order_type} ${o.status ?? ''} amount=${o.amount ?? '?'}`).join('\n')}

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

## VULTURES & PHISHING ACTIVITY (X Community sweep)
${(() => {
  const v = enrichment.vulture_summary;
  if (!v) return '(no community sweep on record)';
  if (v.vulture_count === 0) return `(swept ${v.posts_scanned} posts in community ${v.community_id ?? '?'} — no vultures detected; mod_activity_seen=${v.mod_activity_seen})`;
  const lines = [
    `Posts scanned: ${v.posts_scanned}`,
    `Distinct vulture handles: ${v.vulture_count}`,
    `Total vulture sightings: ${v.sighting_count}`,
    `Mod activity seen: ${v.mod_activity_seen}`,
    `Lookalike/scam URLs observed: ${(v.scam_urls ?? []).slice(0, 8).join(' | ') || '(none)'}`,
    `Copypasta groups: ${v.copypasta_groups?.length ?? 0}`,
    'Top vulture posts:',
    ...((v.sampled_posts ?? []).slice(0, 6).map(p => `  - @${p.handle} kind=${p.vulture_kind} conf=${p.confidence} :: ${p.text}`)),
  ];
  return lines.join('\n');
})()}

REPORT REQUIREMENT: If the vulture sweep shows vulture_count > 0, you MUST include a clearly-titled section "## 7. Vultures & Phishing Activity" with:
  - A red-flag warning that readers should NOT click links inside the X Community.
  - The specific count of vulture handles and the lookalike domains observed.
  - A note on whether moderators are actively cleaning the feed (mod_activity_seen).
  - A short explanation that fake "dev going live on pump.fun" posts linking to lookalike domains (pumpem.fun, etc.) are wallet-drainer phishing scams that steal Phantom/MetaMask credentials.
If vulture_count is 0, omit the section entirely.

## COMMUNITY SENTIMENT & DISSENT (X Community sweep — same scrape)
${(() => {
  const d = (enrichment as any).dissent_summary;
  if (!d) return '(no dissent sweep on record)';
  const lines = [
    `Posts scanned: ${d.posts_scanned}`,
    `Dissent score: ${d.dissent_score}/100  (riot threshold met: ${d.riot_threshold_met ? 'YES' : 'no'})`,
    `Signal counts: ${JSON.stringify(d.counts ?? {})}`,
    `Dev handle: ${d.dev_handle ?? '(unresolved)'}`,
    `Days since dev posted IN community: ${d.days_since_dev_post_in_community ?? 'unknown'}`,
    `Days since dev posted ANYWHERE on X: ${d.days_since_dev_post_anywhere ?? 'unknown'}`,
    'Top verbatim quotes (admin-only — counts may be cited publicly, full quotes are admin-only):',
    ...((d.top_quotes ?? []).slice(0, 5).map((q: any) => `  - [${q.kind}] @${q.handle} (conf ${q.conf}): "${q.quote}"`)),
  ];
  return lines.join('\n');
})()}

REPORT REQUIREMENT — Community Sentiment section:
If posts_scanned > 0, include a section "## 8. Community Sentiment & Dissent" with:
  - The dissent score (X/100) and a 1-line summary of what the community was complaining about (using counts, not raw quotes).
  - "Days since the dev last spoke in the community" and "days since the dev last posted publicly anywhere on X" — quote both numbers if known.
  - A single sentence describing the loudest signal (absent_dev / no_marketing / no_creator_rewards / no_communication / demanding_action / capitulation), again citing counts only. Do NOT print verbatim member quotes — those are admin-only evidence.
  - If riot_threshold_met=true (dissent_score >= 60), shift the section's tone to reflect that holders openly demanded action and the dev was unresponsive. If false, write a calmer "community frustration was limited" paragraph.
If posts_scanned = 0, omit the section entirely.

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
          risk_score: confidence ? `${Math.round(confidence / 10)}/10` : null,
          death_cause: causeId,
          death_intent: causeDef.intent,
          death_confidence: confidence,
          md_content: md,
          md_path: `/autopsies/${slug}.md`,
          tags: [causeDef.intent, causeDef.id],
          candidate_id: c.id,
        }).select('id, slug').single() as any,
        'autopsy_reports'
      );

      const drafted = (insertedRows as { id: string; slug: string });

      // ── Update candidate BEFORE best-effort banner work ──────
      // The report is the critical artifact; banner generation must never leave
      // the row stuck in analyzing after a valid draft was inserted.
      const autoPublish = shouldAutoPublish(causeId as DeathCauseId, confidence ?? 0);
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
            signal: AbortSignal.timeout(8000),
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