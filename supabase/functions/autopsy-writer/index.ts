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
import { DEATH_TAXONOMY, shouldAutoPublish, type DeathCauseId } from '../_shared/autopsy-taxonomy.ts';

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

const FEW_SHOT_REFERENCE = `# Token Autopsy — GPT "Greedy Pissing Testicle"
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
      const [{ data: lifecycle }, { data: pf }, { data: socials }] = await Promise.all([
        supabase.from('token_lifecycle').select('*').eq('token_mint', c.token_mint).maybeSingle(),
        supabase.from('pumpfun_watchlist').select('*').eq('token_mint', c.token_mint).maybeSingle(),
        supabase.from('token_social_links').select('platform, url, handle').eq('token_mint', c.token_mint),
      ]);

      let devBehavior: any = null;
      let devReputation: any = null;
      const creatorWallet = c.creator_wallet ?? pf?.creator_wallet;
      if (creatorWallet) {
        const [{ data: db }, { data: dr }] = await Promise.all([
          supabase.from('dev_behavior_scores').select('*').eq('wallet_address', creatorWallet).maybeSingle(),
          supabase.from('dev_wallet_reputation').select('*').eq('wallet_address', creatorWallet).maybeSingle(),
        ]);
        devBehavior = db;
        devReputation = dr;
      }

      const ticker = c.ticker ?? pf?.token_symbol ?? c.token_mint.slice(0, 6);
      const tokenName = c.token_name ?? pf?.token_name ?? ticker;
      const slug = slugify(`${ticker}-${tokenName}`);
      const causeDef = DEATH_TAXONOMY[c.death_cause as DeathCauseId] ?? DEATH_TAXONOMY.unknown;

      // ── AI prompt ────────────────────────────────────────────
      const systemPrompt = `You are the BlackBox Farm forensic analyst. You write coroner-style autopsy reports for dead Solana tokens. Tone: clinical, evidence-based, dry forensic humor. NEVER fabricate addresses, transaction hashes, or numbers. If a value is unknown, write "unknown" or omit. Match the structure of the reference example exactly.

REFERENCE EXAMPLE (structure to follow):
${FEW_SHOT_REFERENCE}`;

      const userPrompt = `Write a complete BlackBox Autopsy markdown report for the following dead Solana token. Use the reference structure: Subject table, Players table, Timeline, Rug Mechanic (or Failure Mechanic), Fingerprint table, Verdict & Recommendation. Always include a "🪦 Time of Death" row in the Subject table.

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

## TOKEN LIFECYCLE
${JSON.stringify(lifecycle ?? {}, null, 2)}

## DEV BEHAVIOR SCORE
${JSON.stringify(devBehavior ?? {}, null, 2)}

## DEV WALLET REPUTATION
${JSON.stringify(devReputation ?? {}, null, 2)}

## SOCIALS
${JSON.stringify(socials ?? [], null, 2)}

## SOCIAL DEATH SIGNALS
No-admin-message hours: ${c.social_no_admin_hours ?? 'unchecked'}
Spam %: ${c.social_spam_pct ?? 'unchecked'}

Write the full markdown now. No preamble, no code fence — start with "# Token Autopsy — ...".`;

      const md = await callAI(userPrompt, systemPrompt);

      // ── Insert report draft ──────────────────────────────────
      const subtitle = causeDef.summary;
      const insertedRows = await assertInsert(
        supabase.from('autopsy_reports').insert({
          slug,
          token_mint: c.token_mint,
          ticker,
          title: `${ticker} — ${tokenName}`,
          subtitle,
          verdict: causeDef.verdict,
          risk_score: c.death_confidence ? `${Math.round(c.death_confidence / 10)}/10` : null,
          death_cause: c.death_cause,
          death_intent: c.death_intent,
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