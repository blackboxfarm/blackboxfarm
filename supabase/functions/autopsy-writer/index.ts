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
import { enrichCandidate, backfillDexBoostsLive } from '../_shared/autopsy-enrich.ts';
import { buildDevDossier } from '../_shared/autopsy-dev-context.ts';
import { checkXAccountStatus, extractXHandle } from '../_shared/autopsy-x-status.ts';
import { meteredAiFetch } from '../_shared/ai-meter.ts';

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

/**
 * Lifetime renderer: "13d 4h" / "5h 12m" / "37m". Never decimal hours.
 */
function formatLifetime(ageHours: number | null | undefined): string {
  if (!ageHours || !Number.isFinite(ageHours) || ageHours <= 0) return 'unknown';
  const totalMin = Math.round(ageHours * 60);
  if (totalMin < 60) return `${totalMin}m`;
  if (ageHours < 24) {
    const h = Math.floor(ageHours);
    const m = Math.round((ageHours - h) * 60);
    return m === 0 ? `${h}h` : `${h}h ${m}m`;
  }
  const d = Math.floor(ageHours / 24);
  const h = Math.round(ageHours - d * 24);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

/**
 * Time-of-Death renderer: "2 days ago (2026-04-28 17:49:43 UTC)".
 */
function formatTimeOfDeath(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const t = new Date(iso);
  if (isNaN(t.getTime())) return iso;
  const diffMs = Date.now() - t.getTime();
  const mins = Math.floor(diffMs / 60000);
  let rel: string;
  if (mins < 1) rel = 'just now';
  else if (mins < 60) rel = `${mins} minute${mins === 1 ? '' : 's'} ago`;
  else if (mins < 60 * 24) {
    const h = Math.floor(mins / 60);
    rel = `${h} hour${h === 1 ? '' : 's'} ago`;
  } else {
    const d = Math.floor(mins / (60 * 24));
    rel = `${d} day${d === 1 ? '' : 's'} ago`;
  }
  const abs = t.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC').replace(/Z$/, ' UTC');
  return `${rel} (${abs})`;
}

/**
 * Build a markdown link if URL exists, else plain label.
 */
function mdLink(label: string, url: string | null | undefined): string {
  if (!url) return label;
  return `[${label}](${url})`;
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
| Lifetime | 6h 16m |
| 🪦 Time of Death | 2 hours ago (2026-04-29 14:45:33 UTC) |
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
  const res = await meteredAiFetch("autopsy-writer", LOVABLE_AI_URL, {
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

  // Heavy work (AI gen, image overlay, scrapes) frequently exceeds the 150s
  // edge-function idle timeout. Run the per-candidate loop in the background
  // via EdgeRuntime.waitUntil and return immediately. Callers that need the
  // slug should poll `autopsy_reports` by `token_mint` / `candidate_id`.
  const runWork = async () => {
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

      // ── Dev Track-Record (full prior-tokens roll-up) ────────
      // Read existing summary if present; if missing, fire-and-forget the
      // build so it's ready next time. Never block the autopsy on it.
      let devTrackRecord: any = null;
      if (creatorWallet) {
        const { data: tr } = await supabase
          .from('dev_track_record_summary')
          .select('*')
          .eq('dev_wallet', creatorWallet)
          .maybeSingle();
        devTrackRecord = tr ?? null;
        if (!tr) {
          supabase.functions.invoke('dev-track-record-run-all', { body: { dev_wallet: creatorWallet } })
            .catch(e => console.warn('[autopsy-writer] track-record build skipped:', (e as Error).message));
        }
      }

      // ── v2: enrichment + dev dossier + evidence blobs ───────
      const enrichment = await enrichCandidate(supabase, c.token_mint, creatorWallet);
      const dossier = await buildDevDossier(supabase, creatorWallet);
      const evidenceGaps: Array<{ source: string; reason: string }> = [];

      // Trigger AI interpretation of any raw TG/X scrape blobs (best effort)
      try {
        await supabase.functions.invoke('autopsy-evidence-interpret', {
          body: { candidate_id: c.id, token_mint: c.token_mint },
        });
      } catch (e) {
        const reason = (e as Error).message;
        console.warn('[autopsy-writer] evidence interpret skipped:', reason);
        evidenceGaps.push({ source: 'evidence_interpret', reason });
      }

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
      } catch (e) {
        const reason = (e as Error).message;
        console.warn('[autopsy-writer] community sweep skipped:', reason);
        evidenceGaps.push({ source: 'community_sweep', reason });
      }

      // ── On-chain forensics (launch tx + dev timeline + cascade) ──
      // This is THE substance for Section 3/4 of the report. Awaited so the
      // evidence is in autopsy_tx_evidence + autopsy_evidence_blobs before
      // we build the user prompt.
      let txEvidence: any = null;
      try {
        await supabase.functions.invoke('autopsy-tx-timeline', {
          body: { candidate_id: c.id, force: isRegenerate },
        });
        const { data: txRow } = await supabase
          .from('autopsy_tx_evidence')
          .select('*')
          .eq('candidate_id', c.id)
          .maybeSingle();
        txEvidence = txRow ?? null;
      } catch (e) {
        console.warn('[autopsy-writer] tx timeline skipped:', (e as Error).message);
        evidenceGaps.push({ source: 'tx_timeline', reason: (e as Error).message });
      }

      const { data: blobs } = await supabase
        .from('autopsy_evidence_blobs')
        .select('kind, payload, captured_at')
        .eq('candidate_id', c.id)
        .order('captured_at', { ascending: false })
        .limit(10);

      // ── Live pump.fun snapshot (authoritative ATH source) ──
      // pumpfun_watchlist.ath_market_cap_usd is just the max of polled snapshots,
      // so it routinely under-reports the true intraday peak. Pump.fun's API
      // returns the actual all-time-high market cap that the user sees in the
      // pump.fun UI — that IS the canonical ATH and overrides the watchlist.
      let livePf: any = null;
      try {
        const r = await fetch(`https://frontend-api-v3.pump.fun/coins/${c.token_mint}`);
        if (r.ok) livePf = await r.json();
      } catch (e) {
        console.warn('[autopsy-writer] live pump.fun fetch failed:', (e as Error).message);
        evidenceGaps.push({ source: 'pumpfun_live', reason: (e as Error).message });
      }

      // ── X account status check (suspended detection) ───────
      let xAccountStatus: { status: string; source: string; evidence: string | null; handle: string | null } = {
        status: 'unchecked', source: 'no_handle', evidence: null, handle: null,
      };
      try {
        const handleCandidate =
          extractXHandle(livePf?.twitter) ??
          extractXHandle(pf?.twitter) ??
          (socials ?? [])
            .map((s: any) => extractXHandle(s.url))
            .find((h: string | null) => !!h) ?? null;
        if (handleCandidate) {
          const status = await checkXAccountStatus(handleCandidate);
          xAccountStatus = { ...status, handle: handleCandidate };
          await supabase.from('autopsy_candidates').update({
            social_x_account_status: status.status,
            social_x_checked_at: new Date().toISOString(),
          }).eq('id', c.id);
          if (status.status === 'unchecked') {
            evidenceGaps.push({ source: 'x_account_status', reason: status.source });
          }
        }
      } catch (e) {
        evidenceGaps.push({ source: 'x_account_status', reason: (e as Error).message });
      }

      // ATH source priority (most accurate first):
      //  1. livePf.ath_market_cap — LIVE pump.fun API ATH (canonical for pump.fun tokens)
      //  2. lifecycle.ath_24h_usd  — populated by ath-backfill via GeckoTerminal hourly OHLCV
      //  3. liveDeath.ath_usd / backlog.ath_usd — death-watch snapshots
      //  4. pf.ath_market_cap_usd — pumpfun_watchlist (under-reports — only polled samples)
      //  5. c.ath_mcap_usd — last persisted value
      //  6. pf.market_cap_usd — current mcap as last-resort floor
      // ⚠️ Removed: `price_ath_usd × 1_000_000_000` — that fallback assumed exactly 1B supply
      // and produced wildly inflated ATHs (e.g. $4.7M for a token whose real peak was ~$760k).
      const athMcap = num(
        livePf?.ath_market_cap,
        lifecycle?.ath_24h_usd,
        liveDeath?.ath_usd,
        backlog?.ath_usd,
        pf?.ath_market_cap_usd,
        c.ath_mcap_usd,
        pf?.market_cap_usd,
      );
      const currentMcap = num(c.current_mcap_usd, liveDeath?.current_mcap_usd, backlog?.current_mcap_usd, lifecycle?.market_cap, pf?.market_cap_usd);
      const liquidityUsd = num(c.liquidity_usd, liveDeath?.liquidity_usd, backlog?.liquidity_usd, lifecycle?.liquidity_usd, pf?.liquidity_usd);
      const todIso = txEvidence?.time_of_death_at ?? null;
      // Tradeable lifespan = first on-chain trade → time of death.
      // The token's mint timestamp is irrelevant for "how long did it live as a
      // tradeable market" — a coin can be minted hours/days before it ever hits
      // a DEX. Prefer launch_tx_at → time_of_death_at; fall back to dev's final
      // action; only use mint→now as last-resort floor when no on-chain
      // forensics exist.
      const launchAt = txEvidence?.launch_tx_at ? new Date(txEvidence.launch_tx_at).getTime() : null;
      const deathAt =
        (todIso ? new Date(todIso).getTime() : null) ??
        (txEvidence?.dev_final_action_at ? new Date(txEvidence.dev_final_action_at).getTime() : null) ??
        Date.now();
      const tradeableHours = launchAt ? Math.max(0, (deathAt - launchAt) / 3600000) : null;
      const mintAgeFallback = num(c.age_hours) ?? (liveDeath?.first_seen_at ? (Date.now() - new Date(liveDeath.first_seen_at).getTime()) / 3600000 : null);
      const ageHours = tradeableHours ?? mintAgeFallback;
      const ageHoursDisplay = formatLifetime(ageHours);
      const todDisplay = formatTimeOfDeath(todIso);
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
        noAdminMessageHours: c.social_no_admin_hours ?? 0,
        devWalletInactiveHours: txEvidence?.dev_final_action_at
          ? Math.max(0, (Date.now() - new Date(txEvidence.dev_final_action_at).getTime()) / 3600000)
          : 0,
        devDossier: dossier,
        clusterCapturePct: Number(txEvidence?.cluster_capture_pct ?? 0) || 0,
        xAccountSuspended: (c as any).social_x_account_status === 'suspended',
        devRealizedValueUsd: Number((dossier as any).dev_realized_value_usd ?? 0) || 0,
        exitVerdict: (txEvidence?.exit_verdict ?? undefined) as any,
        exitPattern: (txEvidence?.exit_pattern ?? undefined) as any,
        exitGroupLinkagePct: (() => {
          const s = txEvidence?.exit_group_linkage_summary as any;
          if (!s) return 0;
          return Number(s.dev_funded_pct ?? 0) + Number(s.launch_sniper_overlap_pct ?? 0);
        })(),
        exitGroupSameFunderPct: Number((txEvidence?.exit_group_linkage_summary as any)?.same_funder_pct ?? 0) || 0,
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
        evidence_gaps: evidenceGaps,
        dev_realized_value_usd: (dossier as any).dev_realized_value_usd ?? null,
      }).eq('id', c.id).select('id').single(), 'autopsy_candidates');

      // Backfill the canonical mesh tables with anything Pump.fun handed us this run.
      // Same payload that powered the ATH lookup — don't waste it.
      if (livePf) {
        const lifecyclePatch: Record<string, unknown> = {};
        if (typeof livePf.ath_market_cap === 'number' && livePf.ath_market_cap > 0) {
          lifecyclePatch.ath_24h_usd = livePf.ath_market_cap; // column = lifetime ATH
        }
        if (typeof livePf.usd_market_cap === 'number' && livePf.usd_market_cap > 0) {
          lifecyclePatch.market_cap = livePf.usd_market_cap;
        }
        if (typeof livePf.image_uri === 'string' && livePf.image_uri.length > 0) {
          lifecyclePatch.image_url = livePf.image_uri;
        }
        if (Object.keys(lifecyclePatch).length > 0) {
          await supabase.from('token_lifecycle')
            .update({ ...lifecyclePatch, updated_at: new Date().toISOString() })
            .eq('token_mint', c.token_mint);
        }
        // Mirror to pumpfun_watchlist (best-effort — row may not exist for non-watched mints)
        const wlPatch: Record<string, unknown> = {};
        if (typeof livePf.ath_market_cap === 'number' && livePf.ath_market_cap > 0) {
          wlPatch.ath_market_cap_usd = livePf.ath_market_cap;
        }
        if (typeof livePf.usd_market_cap === 'number' && livePf.usd_market_cap > 0) {
          wlPatch.market_cap_usd = livePf.usd_market_cap;
        }
        if (typeof livePf.image_uri === 'string' && livePf.image_uri.length > 0) {
          wlPatch.image_url = livePf.image_uri;
        }
        if (Object.keys(wlPatch).length > 0) {
          await supabase.from('pumpfun_watchlist').update(wlPatch).eq('token_mint', c.token_mint);
        }
      }

      const ticker = c.ticker ?? pf?.token_symbol ?? liveDeath?.symbol ?? backlog?.symbol ?? c.token_mint.slice(0, 6);
      const tokenName = c.token_name ?? pf?.token_name ?? liveDeath?.name ?? backlog?.name ?? ticker;
      const baseSlug = slugify(`${ticker}-${tokenName}`);

      // ── Discovery legend (top-of-report ✓/✗ snapshot) ──────
      // Mirrors the data-points the analyst sees at a glance: which sources/socials
      // we have on file vs which came up empty. Always rendered, in fixed order.
      const findSocial = (re: RegExp) => (socials ?? []).some((s: any) =>
        re.test(`${s.platform ?? ''} ${s.link_type ?? ''} ${s.url ?? ''}`)
      );
      const hasMint = !!c.token_mint;
      const hasDevWallet = !!creatorWallet;
      const hasKyc = !!(dossier?.kyc_root);
      const hasPumpfunProfile = !!(livePf?.creator || pf?.creator_wallet);
      // Pump.fun's payload is the canonical source for socials of any pump.fun mint.
      // Consult it FIRST, then fall back to the mesh DB. Otherwise the legend lies
      // when hydration was partial / stale.
      const pfTwitter  = livePf?.twitter  ?? pf?.twitter  ?? null;
      const pfTelegram = livePf?.telegram ?? pf?.telegram ?? null;
      const pfWebsite  = livePf?.website  ?? pf?.website  ?? null;
      const hasXCommunity = (enrichment.x_community_member_count ?? 0) > 0
        || (socials ?? []).some((s: any) => s.is_community === true)
        || !!pfTwitter;
      const hasWebsite = !!pfWebsite
        || (findSocial(/website|^www|http/i) && (socials ?? []).some((s: any) => /website|www/i.test(s.platform ?? s.link_type ?? '')));
      const hasTelegram = !!pfTelegram || findSocial(/telegram|t\.me/i);
      const hasDiscord = !!enrichment.discord_present || findSocial(/discord/i);
      const hasTiktok = findSocial(/tiktok/i);
      const hasDexPaid = enrichment.dex_paid === true || (enrichment.paid_orders ?? []).length > 0;
      const hasDexBoosts = (enrichment.boosts_paid_usd ?? 0) > 0 || (enrichment.boost_timeline ?? []).length > 0;
      // Gap-fill: Paid ❌ → call dex-paid-checker live. New autopsy candidates
      // often haven't been touched by the periodic checker, so enrichment.dex_paid
      // is null and the legend lies (renders ✗ even though pair has paid profile/CTO).
      let hasDexPaidFinal = hasDexPaid;
      if (!hasDexPaid) {
        try {
          const { data: dpc, error: dpcErr } = await supabase.functions.invoke('dex-paid-checker', {
            body: { tokenMints: [c.token_mint], updateDb: false },
          });
          const status = !dpcErr && Array.isArray(dpc?.results) ? dpc.results[0] : null;
          if (status && (status.hasPaidProfile || status.hasActiveAds || status.hasCTO || (status.activeBoosts ?? 0) > 0)) {
            hasDexPaidFinal = status.hasPaidProfile || status.hasActiveAds || status.hasCTO;
            // Persist so future runs short-circuit, mirroring dex-paid-checker's
            // own write (but to pumpfun_watchlist, not flip_positions).
            await supabase
              .from('pumpfun_watchlist')
              .update({ dex_paid_status: status })
              .eq('token_mint', c.token_mint);
            // Reflect into the enrichment we already have so the legend matches.
            (enrichment as any).dex_paid = hasDexPaidFinal;
          }
        } catch (e) {
          console.warn('[autopsy-writer] live dex-paid gap-fill failed:', (e as Error).message);
        }
      }
      // Gap-fill: Paid ✅ but Boosts ❌ → call DexScreener boosts API on demand,
      // upsert into token_boost_history, re-enrich.
      let dexBoostFootnote: string | null = null;
      if (hasDexPaidFinal && !hasDexBoosts) {
        try {
          const liveBoost = await backfillDexBoostsLive(supabase, c.token_mint);
          if (liveBoost.inserted > 0) {
            const refreshed = await enrichCandidate(supabase, c.token_mint, creatorWallet);
            Object.assign(enrichment, refreshed);
          } else {
            dexBoostFootnote = '_DexScreener paid order recorded but no boost-spend captured — boost API returned empty._';
          }
        } catch (e) {
          console.warn('[autopsy-writer] live boost backfill failed:', (e as Error).message);
        }
      }
      const hasDexBoostsFinal = (enrichment.boosts_paid_usd ?? 0) > 0 || (enrichment.boost_timeline ?? []).length > 0;
      const yn = (b: boolean) => b ? '✅' : '❌';

      // ── Build link targets for the Discovery Snapshot ───────
      const solscanMint = `https://solscan.io/token/${c.token_mint}`;
      const dexUrl = `https://dexscreener.com/solana/${c.token_mint}`;
      const solscanDev = creatorWallet ? `https://solscan.io/account/${creatorWallet}` : null;
      const solscanKyc = dossier?.kyc_root ? `https://solscan.io/account/${dossier.kyc_root}` : null;
      const pumpfunProfile = creatorWallet ? `https://pump.fun/profile/${creatorWallet}` : null;
      const xCommunityRow = (socials ?? []).find((s: any) => s?.is_community || s?.community_id || /x\.com\/i\/communities\//i.test(s?.url ?? ''));
      const xCommunityUrl = xCommunityRow?.url
        ?? (xCommunityRow?.community_id ? `https://x.com/i/communities/${xCommunityRow.community_id}` : null)
        ?? (pfTwitter ?? null);
      const websiteUrl = pfWebsite
        ?? (socials ?? []).find((s: any) => /website|www|^https?:/i.test(`${s?.platform ?? ''} ${s?.url ?? ''}`))?.url
        ?? null;
      const tgRow = (socials ?? []).find((s: any) => /telegram|t\.me/i.test(`${s?.platform ?? ''} ${s?.url ?? ''}`));
      const telegramUrl = pfTelegram ?? tgRow?.url ?? null;
      const discordRow = (socials ?? []).find((s: any) => /discord/i.test(`${s?.platform ?? ''} ${s?.url ?? ''}`));
      const discordUrl = discordRow?.url ?? null;
      const tiktokRow = (socials ?? []).find((s: any) => /tiktok/i.test(`${s?.platform ?? ''} ${s?.url ?? ''}`));
      const tiktokUrl = tiktokRow?.url ?? null;

      const discoveryLegend = `## 0. Discovery Snapshot

| Data Point | Status |
|---|---|
| ${mdLink('Mint Data', solscanMint)} | ${yn(hasMint)} |
| ${mdLink('Dev Wallet', solscanDev)} | ${yn(hasDevWallet)} |
| ${mdLink('KYC Account (cluster root)', solscanKyc)} | ${yn(hasKyc)} |
| ${mdLink('Pump.fun Profile', pumpfunProfile)} | ${yn(hasPumpfunProfile)} |
| ${mdLink('X Community', xCommunityUrl)} | ${yn(hasXCommunity)} |
| ${mdLink('WWW', websiteUrl)} | ${yn(hasWebsite)} |
| ${mdLink('Telegram', telegramUrl)} | ${yn(hasTelegram)} |
| ${mdLink('Discord', discordUrl)} | ${yn(hasDiscord)} |
| ${mdLink('TikTok', tiktokUrl)} | ${yn(hasTiktok)} |
| ${mdLink('DexScreener Paid', dexUrl)} | ${yn(hasDexPaidFinal)} |
| ${mdLink('DexScreener Boosts', dexUrl)} | ${yn(hasDexBoostsFinal)} |
${dexBoostFootnote ? `\n${dexBoostFootnote}\n` : ''}
`;

      // Determine version for this candidate
      const { data: existingReports } = await supabase
        .from('autopsy_reports')
        .select('id, version, slug')
        .eq('candidate_id', c.id)
        .order('version', { ascending: false });
      const nextVersion = ((existingReports?.[0]?.version as number | undefined) ?? 0) + 1;
      const slug = baseSlug;

      // ── Reuse banner if one was already generated for this slug ──
      // Banner generation is expensive (Gemini image edit, ~30-90s) and the
      // visual treatment is deterministic per token. If ANY prior report row
      // for this slug already has a hero_image_path, reuse it verbatim and
      // skip the overlay call entirely.
      const { data: priorBanner } = await supabase
        .from('autopsy_reports')
        .select('hero_image_path, source_banner_url')
        .eq('slug', slug)
        .not('hero_image_path', 'is', null)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const existingHeroImage = (priorBanner as any)?.hero_image_path ?? null;
      const existingSourceBanner = (priorBanner as any)?.source_banner_url ?? null;

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
${intent === 'negligent' ? '- Frame this as: the dev built and shipped, but went silent during the decline. Credit the build, then call out the inaction. The failure was the *absence of action* during the fade, not the original effort. Do NOT call this organic. Do NOT call this a coordinated rug. The verdict is "dev walked".' : ''}
${clusterRugs >= 3 ? `- The creator cluster has ${clusterRugs} prior rugs/abandonments. The report MUST name this as a repeat-pattern actor in the Fingerprint and Verdict sections, citing the prior mints by ticker + ATH. Even if the immediate on-chain footprint is gentle, this is a serial pattern.` : ''}
- Always include a "🪦 Time of Death" row in the Subject table.
- The Subject table MUST use the pre-formatted strings provided in PRESENTATION FIELDS below — copy them verbatim. Do NOT invent your own formats. Specifically:
    - "Lifetime" row value = the "Lifetime (display)" string (e.g. "13d 4h"). NEVER write decimal hours like "315.76h".
    - "🪦 Time of Death" row value = the "Time of Death (display)" string (e.g. "2 days ago (2026-04-28 17:49:43 UTC)"). NEVER print a raw ISO timestamp.`;

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

## PRESENTATION FIELDS (use these strings verbatim in the Subject table)
- Lifetime (display): ${ageHoursDisplay}
- Time of Death (display): ${todDisplay}

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
- KYC root: ${dossier.kyc_root ?? 'not resolved'} (source: ${(dossier as any).kyc_source ?? 'none'})
- Funding chain: ${JSON.stringify((dossier as any).funding_chain ?? [])}
- Dev wallet SOL balance NOW: ${(dossier as any).dev_wallet_sol_balance ?? 'unknown'} SOL (~$${(dossier as any).dev_realized_value_usd ? Math.round((dossier as any).dev_realized_value_usd).toLocaleString() : 'unknown'})
- Cluster size: ${dossier.cluster_wallets?.length ?? 1} linked wallets
- Cluster history: ${JSON.stringify(dossier.cluster_history_summary)}
- Prior tokens (most recent first):
${(dossier.prior_tokens ?? []).slice(0, 8).map(t => `  - ${t.mint} ATH=${t.ath_mcap_usd ?? '?'} status=${t.status ?? '?'} cause=${t.death_cause ?? '?'}`).join('\n') || '  (none on record)'}
- Evidence strings: ${JSON.stringify(dossier.primary_evidence_strings)}

## CO-SNIPER PROVENANCE (cluster dump trace)
${(() => {
  const v = txEvidence?.cluster_dump_verdict;
  if (!v) return '(no cluster dump trace available)';
  const prov = (txEvidence?.cluster_dump_provenance ?? []) as any[];
  const lines = [
    `Verdict: ${v}`,
    `Cluster capture %: ${txEvidence?.cluster_capture_pct?.toFixed?.(1) ?? '?'}% of launch-tx buy controlled by dev/cluster/shared-funder wallets`,
    'Per-sniper trace:',
    ...prov.slice(0, 8).map(p => `  - ${p.wallet} pct=${p.pct_of_curve?.toFixed?.(1) ?? '?'}% bucket=${p.bucket} funder=${p.funder ?? '?'} (${p.funder_label ?? 'no label'})`),
  ];
  return lines.join('\n');
})()}

REPORT REQUIREMENT: If "Verdict: coordinated_bundle" or cluster_capture_pct >= 30, you MUST add a "## Cluster Dump Analysis" section calling out which sniper wallets trace back to the dev / KYC root / shared funder, and treat the launch buy as a coordinated bundle (NOT an organic launch). Cite the per-sniper bucket labels.

## EXIT GROUP — WHO ACTUALLY PULLED THE PLUG
${(() => {
  const eg: any = txEvidence?.exit_group;
  const sum: any = txEvidence?.exit_group_linkage_summary;
  const win: any = txEvidence?.collapse_window;
  if (!eg || !Array.isArray(eg) || eg.length === 0) return '(exit group trace unavailable for this token — pair signatures could not be decoded)';
  const lines: string[] = [];
  lines.push(`Exit verdict: ${txEvidence?.exit_verdict ?? 'unknown'}`);
  lines.push(`Exit pattern: ${txEvidence?.exit_pattern ?? 'unknown'}`);
  if (win) lines.push(`Collapse window: ${win.start} → ${win.end} (${win.duration_sec}s, ${win.tx_count} sells across ${win.seller_count} wallets, ~${win.sol_extracted?.toFixed?.(2) ?? '?'} SOL extracted)`);
  if (sum) lines.push(`Linkage summary: dev/family=${sum.dev_funded_pct?.toFixed?.(1) ?? '?'}%  launch_sniper_overlap=${sum.launch_sniper_overlap_pct?.toFixed?.(1) ?? '?'}%  same_funder=${sum.same_funder_pct?.toFixed?.(1) ?? '?'}%  independent=${sum.independent_pct?.toFixed?.(1) ?? '?'}%`);
  lines.push('Top exit wallets:');
  for (const w of eg.slice(0, 12)) {
    lines.push(`  - ${w.wallet} :: ${w.sol_received?.toFixed?.(2) ?? '?'} SOL (${w.pct_of_window_volume?.toFixed?.(1) ?? '?'}% of dump) sells=${w.sells_count} bucket=${w.bucket} score=${w.linkage_score} acquired=${w.acquisition?.mode}${w.acquisition?.source_wallet ? ` from ${w.acquisition.source_wallet}` : ''} funder=${w.funder?.wallet ?? '?'} (${w.funder?.label ?? 'no label'}${w.funder?.is_cex ? ', CEX' : ''})`);
  }
  return lines.join('\n');
})()}

REPORT REQUIREMENT — Exit Group section:
You MUST include a clearly-titled section "## The Exit Group — Who Actually Pulled the Plug" that:
  - Opens with a one-line verdict mapping to "Exit verdict" above (e.g. "Pre-planned exit by 4 wallets, all linked to KYC root <addr>." or "Insufficient on-chain coverage to identify the dump cohort.").
  - Quotes the collapse window timing (start, end, duration, SOL extracted) and the exit pattern label.
  - Includes a markdown table of the top exit wallets with columns: Wallet (short addr), SOL out, % of dump, Acquired (mode + source wallet if any), Funder, Linkage. Use the bucket label as the Linkage tag (dev / kyc_root / dev_family / launch_sniper / shared_funder / cex_funded / independent / unknown).
  - Adds a short "Where the plan started" paragraph that traces backwards: exit wallet → acquisition (launch sniper / airdrop / cluster transfer) → funder → KYC root if known. If multiple exiters share an upstream funder, name that funder.
  - If the exit verdict is "insufficient_data", say so explicitly. Do NOT invent wallets, signatures or amounts. Do NOT claim "no coordination found" when the verdict is insufficient_data — those are different statements.

## DEV TRACK RECORD (full prior-tokens roll-up)
${(() => {
  const t: any = devTrackRecord;
  if (!t) return '(no track record on file yet — this dev wallet has not been scraped against pump.fun history)';
  const lines = [
    `Total prior tokens analysed: ${t.total_tokens} (${t.classified_tokens} classified)`,
    `Verdict: ${t.verdict_label} — ${t.verdict_one_liner ?? ''}`,
    `Indices: skill=${t.skill_index ?? '?'} / intent=${t.intent_index ?? '?'} / luck=${t.luck_index ?? '?'}`,
    `Counts: sustained_hits=${t.sustained_hits} flash_hits=${t.flash_hits} hard_rugs=${t.hard_rugs} slow_bleeds=${t.slow_bleeds} bundle_rugs=${t.bundle_rugs} community_collapses=${t.community_collapses} inexperience_fails=${t.inexperience_fails} dev_abandoneds=${t.dev_abandoneds} viral_memes=${t.viral_memes} marketed_memes=${t.marketed_memes} skill_builds=${t.skill_builds}`,
    t.best_token_ticker ? `Best prior token: $${t.best_token_ticker} (mcap ~$${Math.round(Number(t.best_token_ath_usd) || 0).toLocaleString()})` : '',
    t.ai_interpretation ? `AI summary: ${t.ai_interpretation}` : '',
  ].filter(Boolean);
  return lines.join('\n');
})()}

REPORT REQUIREMENT — Track Record paragraph:
If a track record is on file, you MUST weave a 2-3 sentence "Dev Track Record" paragraph into the Verdict section that quotes the verdict label and at least two specific counts (e.g. "X sustained hits, Y hard rugs"). When the current death CAUSE rhymes with this dev's dominant prior cause (e.g. dev with many community_collapses → another community_collapse), explicitly say "this death matches his dominant pattern". Never fabricate counts; if the track record block above says "no track record on file yet", omit the paragraph instead of inventing one.

## X ACCOUNT STATUS (live check at autopsy time)
Handle: ${xAccountStatus.handle ?? 'no handle on file'}
Status: ${xAccountStatus.status} (source: ${xAccountStatus.source}${xAccountStatus.evidence ? `, evidence: ${xAccountStatus.evidence}` : ''})

REPORT REQUIREMENT: If status is "suspended" or "not_found", you MUST add a sentence in the Players AND Verdict sections noting that the dev's X account is **${xAccountStatus.status === 'suspended' ? 'currently SUSPENDED by X' : 'no longer reachable'}** — this is itself a death signal (either reported as a scam, or the dev deleted to evade attribution).

## EVIDENCE GAPS (scrape failures — disclose, do not omit)
${evidenceGaps.length === 0 ? '(no scrape failures — all sources reached)' : evidenceGaps.map(g => `- ${g.source}: ${g.reason}`).join('\n')}

REPORT REQUIREMENT: If "EVIDENCE GAPS" lists ANY entries, you MUST include a section "## Evidence Gaps" near the end stating which sources failed to load. Do NOT silently treat a failed scrape as "no evidence found" — that is the difference between "we looked and saw nothing" and "we couldn't look."

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

## LAUNCH TX FORENSICS (on-chain, deterministic)
${(() => {
  if (!txEvidence) return '(on-chain forensics unavailable for this token)';
  const lines: string[] = [];
  lines.push(`Launch tx: ${txEvidence.launch_tx_signature ?? 'unknown'}`);
  lines.push(`Launch time: ${txEvidence.launch_tx_at ?? 'unknown'}`);
  lines.push(`Dev buy: ${txEvidence.dev_buy_amount_tokens ?? 'unknown'} tokens for ${txEvidence.dev_buy_sol ?? '?'} SOL`);
  lines.push(`Dev % of curve consumed: ${txEvidence.dev_buy_pct_of_curve?.toFixed?.(2) ?? 'unknown'}%`);
  lines.push(`Atomic snipe % (dev + top sniper, same tx): ${txEvidence.atomic_snipe_pct?.toFixed?.(2) ?? 'unknown'}%`);
  const snipers = (txEvidence.co_snipers ?? []) as any[];
  if (snipers.length === 0) lines.push('Co-snipers: none detected');
  else {
    lines.push(`Co-snipers (${snipers.length}):`);
    for (const s of snipers.slice(0, 5)) {
      lines.push(`  - ${s.wallet} bought ${s.amount_tokens?.toFixed?.(0) ?? '?'} tokens (${s.pct_of_curve?.toFixed?.(2) ?? '?'}% of curve)`);
    }
  }
  lines.push(`Funder wallet: ${txEvidence.funder_wallet ?? 'unresolved'}`);
  lines.push(`Funder amount: ${txEvidence.funder_funded_amount_sol ?? 'unknown'} SOL`);
  if (txEvidence.funder_minutes_before_launch !== null && txEvidence.funder_minutes_before_launch !== undefined) {
    lines.push(`Funded ${Math.round(txEvidence.funder_minutes_before_launch)} minutes BEFORE launch`);
  }
  return lines.join('\n');
})()}

## DEV WALLET TIMELINE (chronological, classified)
${(() => {
  if (!txEvidence?.dev_signatures?.length) return '(dev wallet timeline unavailable)';
  const sigs = (txEvidence.dev_signatures as any[]).slice(0, 30);
  return sigs.map((s: any) =>
    `- ${s.ts ?? 'no-time'} [${s.kind}] ${s.summary} (sig: ${s.signature?.slice(0, 12)}…)`
  ).join('\n');
})()}
Final dev action: ${txEvidence?.dev_final_action_at ?? 'unknown'} — ${txEvidence?.dev_final_action_kind ?? 'unknown'}

## DUMP CASCADE
${(() => {
  const d = txEvidence?.dump_cascade;
  if (!d) return '(no dump cascade detected — slow bleed or organic decay)';
  return [
    `Cascade start: ${d.start_at}`,
    `Cascade end: ${d.end_at}`,
    `Tx count in 60s window: ${d.tx_count}`,
    `Estimated SOL extracted: ${d.est_sol_out ?? 'unknown'} SOL`,
    `USDC consolidation pattern observed: ${txEvidence?.usdc_consolidation_observed ? 'YES — funds laundered into USDC chunks' : 'no'}`,
  ].join('\n');
})()}
Time of Death (last on-chain activity): ${txEvidence?.time_of_death_at ?? 'unknown'}

REPORT REQUIREMENT — Sections 3 and 4:
- Section 3 (Timeline) MUST cite specific UTC timestamps from "DEV WALLET TIMELINE" and "LAUNCH TX FORENSICS" above. Reference the funder→dev SOL transfer, the launch tx, and the dump cascade window if those facts are populated.
- Section 4 (Mechanic) MUST quantify the atomic-snipe percentage, dev SOL spent at launch, and cascade SOL out using the numbers above.
- If "LAUNCH TX FORENSICS" reads "(on-chain forensics unavailable for this token)" you MUST write "On-chain forensics unavailable" in Section 3 instead of inventing prose. Never fabricate signatures, timestamps, or SOL amounts.

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

      // Inject the Discovery Snapshot legend right after the verdict line.
      // It's deterministic and built from real data — never let the AI write it.
      {
        const verdictLineMatch = md.match(/^\*\*Verdict:[^\n]*\n/m);
        if (verdictLineMatch) {
          const insertAt = (verdictLineMatch.index ?? 0) + verdictLineMatch[0].length;
          md = md.slice(0, insertAt) + '\n' + discoveryLegend + '\n' + md.slice(insertAt);
        } else {
          // Fallback: prepend after the H1 title
          const h1Match = md.match(/^#\s+[^\n]*\n/);
          if (h1Match) {
            const insertAt = (h1Match.index ?? 0) + h1Match[0].length;
            md = md.slice(0, insertAt) + '\n' + discoveryLegend + '\n' + md.slice(insertAt);
          } else {
            md = discoveryLegend + '\n' + md;
          }
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
          hero_image_path: existingHeroImage,
          source_banner_url: existingSourceBanner,
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

      // ── Banner overlay (fire-and-forget, must NOT block response) ──
      // Skip entirely when a banner already exists for this slug — the visual
      // treatment is deterministic per token, regenerating wastes AI credits
      // and adds ~60s of unnecessary work on every re-draft.
      if (existingHeroImage) {
        console.log(`[autopsy-writer] reusing existing banner for ${slug}: ${existingHeroImage}`);
        results.push({ candidate_id: c.id, slug: drafted.slug, status: autoPublish ? 'approved' : 'drafted' });
        continue;
      }

      // [skipped — banners are manual-only] auto banner overlay disabled to preserve AI credits.
      console.log(`[autopsy-writer] banner overlay skipped (manual-only) for ${drafted.slug}`);

      // Fire-and-forget Harm Score computation
      const harmPromise = fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/autopsy-harm-scorer`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({ slug: drafted.slug }),
        },
      ).catch((e: any) => console.warn(`[autopsy-writer] harm scorer failed: ${e?.message}`));
      try {
        // @ts-ignore
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(harmPromise);
        }
      } catch { /* ignore */ }

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
  };

  // @ts-ignore - EdgeRuntime is provided by Supabase edge-runtime
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(runWork());
    return new Response(
      JSON.stringify({
        success: true,
        queued: true,
        candidates: candidates.map((c: any) => ({ id: c.id, token_mint: c.token_mint })),
      }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // Fallback (local/dev): run inline
  await runWork();

  return new Response(JSON.stringify({ success: true, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));