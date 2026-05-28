// Insiders Channel Lifecycle Builder
// Parses every message from the 'insiders' Telegram channel and reconstructs
// per-token lifecycle records: first call → milestones → peak multiplier.
// Idempotent: re-runnable, upserts into telegram_insider_token_lifecycle.
//
// Phase 2 (cron-driven, every 3h): after the message aggregation pass,
// it runs a per-token enrichment loop that:
//   - resolves creator_wallet via the unified creator-resolver
//   - feeds token + creator + socials into reputation_mesh via meshFeed
//   - snapshots socials from launchpad + DexScreener + Metaplex and detects drift
//   - traces parent wallets / KYC root via auto-genealogy
// Then it chains into insiders-mesh-promoter so newly-resolved ≥3x creators
// are promoted as good actors in the same run.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveTokenCreator } from "../_shared/creator-resolver.ts";
import { meshFeed } from "../_shared/mesh-feeder.ts";
import { traceParentWallets, meshGenealogyResults } from "../_shared/auto-genealogy.ts";
import { fetchPumpFunCoin } from "../_shared/pumpfun-fetch.ts";
import { assertUpdate } from "../_shared/db-assert.ts";

import { enableHeliusTracking } from "../_shared/helius-fetch-interceptor.ts";
enableHeliusTracking("insiders-lifecycle-builder");

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MilestoneEvent {
  multiplier: number;
  current_mc: number | null;
  current_mc_text: string | null;
  timestamp: string;
  message_id: number | null;
}

interface TokenAggregate {
  token_mint: string;
  token_symbol: string | null;
  first_called_at: string;
  first_call_message_id: number | null;
  entry_market_cap: number | null;
  entry_mc_text: string | null;
  raw_alert_message: string | null;
  milestones: MilestoneEvent[];
  total_messages: number;
}

// --- Parsers ---

// "Market Cap: $49k" / "$1.2M" / "$717"
function parseMcText(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/[, ]/g, '').match(/\$?([\d.]+)\s*([kKmMbB])?/);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (!isFinite(num)) return null;
  const suffix = (m[2] || '').toLowerCase();
  const mult = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
  return num * mult;
}

function parseAlert(raw: string): { entryMcText: string | null; entryMc: number | null } {
  const mcMatch = raw.match(/Market Cap:\s*(\$?[\d.,]+\s*[kKmMbB]?)/);
  const entryMcText = mcMatch ? mcMatch[1].trim() : null;
  return { entryMcText, entryMc: parseMcText(entryMcText) };
}

function parseMilestone(raw: string): { multiplier: number | null; currentMcText: string | null; currentMc: number | null; entryMcText: string | null; entryMc: number | null } {
  const xMatch = raw.match(/MILESTONE:?\s*([\d.]+)\s*X/i);
  const entryMatch = raw.match(/Entry MC:\s*(\$?[\d.,]+\s*[kKmMbB]?)/i);
  const currentMatch = raw.match(/Current MC:\s*(\$?[\d.,]+\s*[kKmMbB]?)/i);
  return {
    multiplier: xMatch ? parseFloat(xMatch[1]) : null,
    currentMcText: currentMatch ? currentMatch[1].trim() : null,
    currentMc: currentMatch ? parseMcText(currentMatch[1]) : null,
    entryMcText: entryMatch ? entryMatch[1].trim() : null,
    entryMc: entryMatch ? parseMcText(entryMatch[1]) : null,
  };
}

// =====================================================================
// PHASE 2 — per-token enrichment helpers
// =====================================================================

const TWITTER_RE = /(?:twitter\.com|x\.com)\/(@?[a-zA-Z0-9_]+)/i;
const TG_RE = /t\.me\/([a-zA-Z0-9_]+)/i;

function normHandle(url: string | null | undefined, re: RegExp): string | null {
  if (!url) return null;
  const m = String(url).match(re);
  if (!m) return null;
  return m[1].replace(/^@/, '').toLowerCase();
}

/**
 * Pull socials from DexScreener for a given mint.
 */
async function fetchDexscreenerSocials(mint: string): Promise<{ twitter: string | null; telegram: string | null; website: string | null } | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const pairs = await res.json();
    const pair = Array.isArray(pairs) ? pairs[0] : null;
    if (!pair) return null;
    const info = pair.info || {};
    const socials: any[] = info.socials || [];
    const websites: any[] = info.websites || [];
    const twitter = socials.find((s: any) => /twitter|x/i.test(s.type))?.url || null;
    const telegram = socials.find((s: any) => /telegram/i.test(s.type))?.url || null;
    const website = websites[0]?.url || null;
    return { twitter, telegram, website };
  } catch {
    return null;
  }
}

/**
 * Pull on-chain Metaplex socials via Helius DAS getAsset → metadata URI.
 */
async function fetchMetaplexSocials(mint: string): Promise<{ twitter: string | null; telegram: string | null; website: string | null } | null> {
  try {
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusKey) return null;
    const r = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 'mp', method: 'getAsset', params: { id: mint },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const uri = j?.result?.content?.json_uri;
    if (!uri) return null;
    const meta = await fetch(uri, { signal: AbortSignal.timeout(5000) }).then(rr => rr.ok ? rr.json() : null).catch(() => null);
    if (!meta) return null;
    return {
      twitter: meta.twitter || meta.x || null,
      telegram: meta.telegram || null,
      website: meta.website || null,
    };
  } catch {
    return null;
  }
}

/**
 * Persist a discovered social link as a versioned row in token_social_links.
 * Marks any prior `is_current=true` of the same (mint, link_type, source) as superseded
 * if the URL changed — that's how we get a history.
 */
async function recordSocialLink(supabase: any, params: {
  mint: string;
  url: string | null;
  linkType: 'twitter' | 'telegram' | 'website';
  source: 'launchpad' | 'dex' | 'metaplex';
}) {
  const { mint, url, linkType, source } = params;
  if (!url) return { changed: false };
  const normUrl = url.trim();
  const handle = linkType === 'twitter' ? normHandle(normUrl, TWITTER_RE)
               : linkType === 'telegram' ? normHandle(normUrl, TG_RE)
               : null;

  // Fetch the latest current row for this mint+link_type+source
  const { data: prior } = await supabase
    .from('token_social_links')
    .select('id, url')
    .eq('token_mint', mint)
    .eq('link_type', linkType)
    .eq('source', source)
    .eq('is_current', true)
    .maybeSingle();

  if (prior?.url === normUrl) return { changed: false };

  const now = new Date().toISOString();
  if (prior?.id) {
    const { error: supErr } = await supabase
      .from('token_social_links')
      .update({ is_current: false, superseded_at: now })
      .eq('id', prior.id);
    if (supErr) console.warn(`[enrich] supersede ${linkType} (${source}) failed: ${supErr.message}`);
  }

  const { error: insErr } = await supabase.from('token_social_links').insert({
    token_mint: mint,
    url: normUrl,
    link_type: linkType,
    platform: linkType,
    extracted_handle: handle,
    source,
    is_current: true,
    discovered_at: now,
  });
  if (insErr && !/duplicate/i.test(insErr.message || '')) {
    console.warn(`[enrich] insert ${linkType} (${source}) failed: ${insErr.message}`);
  }
  return { changed: true };
}

interface EnrichmentResult {
  candidates: number;
  enriched: number;
  creator_resolved: number;
  creator_failed: number;
  socials_found: number;
  socials_changed: number;
  genealogy_traced: number;
  errors: string[];
}

async function runEnrichmentPass(
  supabase: any,
  opts: { enrichLimit: number; socialsRecheck: boolean; socialsLimit: number; force?: boolean },
): Promise<EnrichmentResult> {
  const { enrichLimit, socialsRecheck, socialsLimit, force } = opts;
  const result: EnrichmentResult = {
    candidates: 0, enriched: 0, creator_resolved: 0, creator_failed: 0,
    socials_found: 0, socials_changed: 0, genealogy_traced: 0, errors: [],
  };

  // Pull two queues:
  //   A) tokens never enriched OR stale > 24h, ordered by peak DESC then newest
  //   B) recent top-N for socials drift recheck
  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data: queueA } = await supabase
    .from('telegram_insider_token_lifecycle')
    .select('id, token_mint, token_symbol, peak_multiplier, creator_wallet, enrichment_last_run_at, genealogy_kyc_root')
    .or(`enrichment_last_run_at.is.null,enrichment_last_run_at.lt.${cutoff}`)
    .order('peak_multiplier', { ascending: false })
    .order('first_called_at', { ascending: false })
    .limit(enrichLimit);

  const queueAIds = new Set((queueA || []).map((r: any) => r.id));

  let queueB: any[] = [];
  if (socialsRecheck) {
    const { data } = await supabase
      .from('telegram_insider_token_lifecycle')
      .select('id, token_mint, token_symbol, peak_multiplier, creator_wallet, enrichment_last_run_at, genealogy_kyc_root')
      .order('first_called_at', { ascending: false })
      .limit(socialsLimit);
    queueB = (data || []).filter((r: any) => !queueAIds.has(r.id));
  }

  let fullQueue = [...(queueA || []), ...queueB];

  // KYC-skip guard: rows with a known KYC root don't need a full re-trace
  // unless caller explicitly passes { force: true }.
  let skippedKyc = 0;
  if (!force) {
    const before = fullQueue.length;
    fullQueue = fullQueue.filter((r: any) => !r.genealogy_kyc_root);
    skippedKyc = before - fullQueue.length;
  }
  result.candidates = fullQueue.length;

  console.log(`[enrich] queueA=${queueA?.length || 0} queueB=${queueB.length} skippedKyc=${skippedKyc} retraced=${fullQueue.length}${force ? ' (force=true)' : ''}`);

  // Process in batches of 5 for governance (Helius credits, Pump.fun 200-300/hr)
  const BATCH = 5;
  for (let i = 0; i < fullQueue.length; i += BATCH) {
    const batch = fullQueue.slice(i, i + BATCH);
    await Promise.allSettled(batch.map(async (row: any) => {
      try {
        await enrichOneToken(supabase, row, result);
      } catch (e) {
        const msg = `${row.token_mint}: ${(e as Error).message}`;
        console.error('[enrich]', msg);
        result.errors.push(msg);
      }
    }));
    // Pacing pause between batches
    if (i + BATCH < fullQueue.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('[enrich] done', result);
  return result;
}

async function enrichOneToken(supabase: any, row: any, summary: EnrichmentResult): Promise<void> {
  const { id, token_mint: mint, token_symbol: symbol } = row;
  let creator: string | null = row.creator_wallet || null;
  let launchpad: string | null = null;
  let launchpadSocials: { twitter?: string; telegram?: string; website?: string } = {};

  // 1. Creator + launchpad socials in one call (mesh-feeder hits all 3 launchpads in parallel)
  if (!creator) {
    const lp = await meshFeed.resolveCreatorFromLaunchpads(supabase, mint, 'insiders-lifecycle-enrich');
    if (lp.creator) {
      creator = lp.creator;
      launchpad = lp.launchpad || null;
      if (lp.twitter) launchpadSocials.twitter = lp.twitter;
    }
    // Fallback to canonical resolver chain (Pump.fun → Helius mint tx → DAS → on-chain → DB cache)
    if (!creator) {
      const resolution = await resolveTokenCreator(mint, supabase, []);
      if (resolution.creatorWallet) {
        creator = resolution.creatorWallet;
        launchpad = launchpad || (resolution.source === 'pumpfun' ? 'pump.fun' : null);
      }
    }
  }

  // Pull launchpad socials directly via pump.fun if we still need them
  if (!launchpadSocials.twitter || !launchpadSocials.telegram || !launchpadSocials.website) {
    if (mint.toLowerCase().endsWith('pump')) {
      try {
        const pf = await fetchPumpFunCoin(mint, 'insiders-lifecycle-enrich');
        if (pf) {
          launchpadSocials.twitter ||= pf.twitter ? (String(pf.twitter).startsWith('http') ? pf.twitter : `https://x.com/${pf.twitter}`) : undefined;
          launchpadSocials.telegram ||= pf.telegram || undefined;
          launchpadSocials.website ||= pf.website || undefined;
          launchpad = launchpad || 'pump.fun';
        }
      } catch { /* throttled / 403 — fine */ }
    }
  }

  // 2. DEX + Metaplex socials (parallel)
  const [dex, mp] = await Promise.all([
    fetchDexscreenerSocials(mint),
    fetchMetaplexSocials(mint),
  ]);

  // 3. Record every social we found, by source — drift detection happens per-source
  let socialsFound = 0;
  let anyChanged = false;

  for (const linkType of ['twitter', 'telegram', 'website'] as const) {
    // launchpad
    const lpUrl = (launchpadSocials as any)[linkType] as string | undefined;
    if (lpUrl) {
      socialsFound++;
      const r = await recordSocialLink(supabase, { mint, url: lpUrl, linkType, source: 'launchpad' });
      if (r.changed) anyChanged = true;
    }
    // dex
    const dexUrl = (dex as any)?.[linkType] as string | undefined;
    if (dexUrl) {
      socialsFound++;
      const r = await recordSocialLink(supabase, { mint, url: dexUrl, linkType, source: 'dex' });
      if (r.changed) anyChanged = true;
    }
    // metaplex
    const mpUrl = (mp as any)?.[linkType] as string | undefined;
    if (mpUrl) {
      socialsFound++;
      const r = await recordSocialLink(supabase, { mint, url: mpUrl, linkType, source: 'metaplex' });
      if (r.changed) anyChanged = true;
    }
  }

  if (socialsFound > 0) summary.socials_found += socialsFound;
  if (anyChanged) summary.socials_changed++;

  // 4. Mesh-feed token + creator + best-known socials
  await meshFeed.token(supabase, {
    mint,
    symbol,
    creatorWallet: creator,
    twitterUrl: launchpadSocials.twitter || dex?.twitter || mp?.twitter || null,
    telegramUrl: launchpadSocials.telegram || dex?.telegram || mp?.telegram || null,
    websiteUrl: launchpadSocials.website || dex?.website || mp?.website || null,
    source: 'insiders-lifecycle',
  });

  // 5. Auto-genealogy on the creator (KYC root tracing)
  let genealogyDepth: number | null = null;
  let kycRoot: string | null = null;
  let genealogyChain: any[] | null = null;
  if (creator) {
    summary.creator_resolved++;
    try {
      const gen = await traceParentWallets(supabase, creator, 'insiders-lifecycle');
      if (gen.parentWallets.length > 0 || gen.xAccounts.length > 0) {
        await meshGenealogyResults(supabase, creator, gen, 'insiders-lifecycle');
        summary.genealogy_traced++;
        genealogyDepth = gen.parentWallets.length;
        // Find the deepest CEX-tagged parent → that's our KYC root
        const cexHit = gen.parentWallets.find((p: any) => p?.cex || p?.is_cex);
        kycRoot = cexHit?.wallet || null;
        // Build the ordered ladder for the UI: creator → hop1 → hop2 → ... → KYC
        genealogyChain = [
          { wallet: creator, depth: 0, role: 'creator' },
          ...gen.parentWallets
            .slice()
            .sort((a: any, b: any) => (a.depth ?? 0) - (b.depth ?? 0))
            .map((p: any) => ({
              wallet: p.wallet,
              depth: p.depth,
              amountSol: p.amountSol ?? null,
              cexName: p.cexName ?? null,
              role: p.cexName ? 'kyc_root' : 'funder',
            })),
        ];
      }
    } catch (e) {
      console.warn(`[enrich] genealogy failed for ${creator.slice(0, 8)}: ${(e as Error).message}`);
    }
  } else {
    summary.creator_failed++;
  }

  // 6. Persist enrichment outcome on the lifecycle row — assertUpdate so silent fails are impossible
  await assertUpdate(
    supabase
      .from('telegram_insider_token_lifecycle')
      .update({
        creator_wallet: creator,
        creator_resolved_at: creator ? new Date().toISOString() : null,
        launchpad,
        socials_last_checked_at: new Date().toISOString(),
        socials_changed: anyChanged ? true : row.socials_changed || false,
        socials_snapshot: {
          launchpad: launchpadSocials,
          dex,
          metaplex: mp,
          checked_at: new Date().toISOString(),
        },
        genealogy_depth: genealogyDepth,
        genealogy_kyc_root: kycRoot,
        genealogy_chain: genealogyChain,
        enrichment_last_run_at: new Date().toISOString(),
        enrichment_status: creator ? 'ok' : 'no_creator',
      })
      .eq('id', id),
    'telegram_insider_token_lifecycle',
  );

  summary.enriched++;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    console.log('[insiders-lifecycle-builder] Starting build...');

    // ---- Concurrency guard ----
    // Prevent stacked runs from exhausting the DB connection pool. If another
    // builder run is in flight, exit immediately. Lock auto-released at session
    // end (when this function instance exits).
    const LOCK_KEY = 728143001; // arbitrary stable int for this job
    const { data: lockData, error: lockErr } = await supabase
      .rpc('pg_try_advisory_lock', { key: LOCK_KEY })
      .single();
    // Fallback: many setups don't expose pg_try_advisory_lock via PostgREST.
    // If RPC missing, do a soft DB-side guard via a sentinel row check instead.
    let acquired = lockData === true;
    if (lockErr) {
      // Soft guard: check most recent run timestamp on edge_function_runs (best-effort)
      try {
        const { data: recent } = await supabase
          .from('edge_function_runs')
          .select('started_at, status')
          .eq('function_name', 'insiders-lifecycle-builder')
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (recent && recent.status === 'running' && recent.started_at) {
          const ageSec = (Date.now() - new Date(recent.started_at).getTime()) / 1000;
          if (ageSec < 120) {
            console.log('[insiders-lifecycle-builder] Soft-guard: prior run in flight, exiting');
            return new Response(JSON.stringify({ ok: true, skipped: 'prior_run_in_flight' }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        acquired = true; // proceed without advisory lock
      } catch {
        acquired = true;
      }
    }
    if (!acquired) {
      console.log('[insiders-lifecycle-builder] Another run in flight, exiting');
      return new Response(JSON.stringify({ ok: true, skipped: 'lock_held' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ---- Hard deadline ----
    const DEADLINE_MS = 90_000;
    const startedAt = Date.now();
    const deadlineExceeded = () => (Date.now() - startedAt) > DEADLINE_MS;

    // Pull every insiders message in chronological order.
    // Page through to bypass 1000-row limit.
    const allRows: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('telegram_channel_calls')
        .select('id, message_id, token_mint, token_symbol, raw_message, message_timestamp, created_at')
        .ilike('channel_name', 'insiders')
        .not('token_mint', 'is', null)
        .order('created_at', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
      if (deadlineExceeded()) {
        console.warn('[insiders-lifecycle-builder] Deadline hit during paging, stopping early');
        break;
      }
    }

    console.log(`[insiders-lifecycle-builder] Loaded ${allRows.length} messages`);

    // Aggregate by token_mint
    const byToken = new Map<string, TokenAggregate>();

    for (const row of allRows) {
      const mint = row.token_mint as string;
      if (!mint) continue;

      const ts = (row.message_timestamp || row.created_at) as string;
      const raw = (row.raw_message || '') as string;
      const isMilestone = /MILESTONE/i.test(raw);
      // Track which timestamp source we used so we can detect bulk-import collapse later
      const tsSource: 'message' | 'created' = row.message_timestamp ? 'message' : 'created';

      let agg = byToken.get(mint);
      if (!agg) {
        agg = {
          token_mint: mint,
          token_symbol: row.token_symbol || null,
          first_called_at: ts,
          first_call_message_id: row.message_id || null,
          entry_market_cap: null,
          entry_mc_text: null,
          raw_alert_message: null,
          milestones: [],
          total_messages: 0,
        };
        byToken.set(mint, agg);
      }

      agg.total_messages++;

      if (isMilestone) {
        const m = parseMilestone(raw);
        if (m.multiplier !== null) {
          agg.milestones.push({
            multiplier: m.multiplier,
            current_mc: m.currentMc,
            current_mc_text: m.currentMcText,
            timestamp: ts,
            message_id: row.message_id || null,
            // @ts-ignore — extra field, harmless in JSONB
            ts_source: tsSource,
          });
        }
        // If we never had an entry MC from an ALERT, take it from first milestone
        if (!agg.entry_market_cap && m.entryMc) {
          agg.entry_market_cap = m.entryMc;
          agg.entry_mc_text = m.entryMcText;
        }
        // Use symbol from milestone if missing
        if (!agg.token_symbol && row.token_symbol) agg.token_symbol = row.token_symbol;
      } else {
        // ALERT message — use first one we see for this mint
        if (!agg.raw_alert_message) {
          agg.raw_alert_message = raw;
          const a = parseAlert(raw);
          if (a.entryMc) {
            agg.entry_market_cap = a.entryMc;
            agg.entry_mc_text = a.entryMcText;
          }
          // Earliest timestamp (alerts come first chronologically)
          if (new Date(ts) < new Date(agg.first_called_at)) {
            agg.first_called_at = ts;
            agg.first_call_message_id = row.message_id || null;
          }
        }
      }
    }

    console.log(`[insiders-lifecycle-builder] Aggregated into ${byToken.size} unique tokens`);

    // Build upsert rows
    const upsertRows = Array.from(byToken.values()).map((agg) => {
      // Sort milestones chronologically and find peak
      agg.milestones.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      let peak = 1;
      let peakMc: number | null = null;
      let peakAt: string | null = null;
      for (const m of agg.milestones) {
        if (m.multiplier > peak) {
          peak = m.multiplier;
          peakMc = m.current_mc;
          peakAt = m.timestamp;
        }
      }
      // If no milestones, peak stays 1 with no peakMc
      const lastMilestoneAt = agg.milestones.length > 0
        ? agg.milestones[agg.milestones.length - 1].timestamp
        : null;

      // Lifespan: only meaningful if timestamps actually spread > 60s.
      // Bulk-import batches share an identical created_at and would collapse to 0m.
      let lifespanMin: number | null = null;
      if (lastMilestoneAt) {
        const spreadMs = new Date(lastMilestoneAt).getTime() - new Date(agg.first_called_at).getTime();
        if (spreadMs > 60_000) {
          lifespanMin = Math.round(spreadMs / 60_000);
        } else {
          // Collapsed — leave null so UI shows "—" / "unknown" instead of misleading 0m
          lifespanMin = null;
        }
      }

      return {
        token_mint: agg.token_mint,
        token_symbol: agg.token_symbol,
        channel_name: 'insiders',
        first_called_at: agg.first_called_at,
        first_call_message_id: agg.first_call_message_id,
        entry_market_cap: agg.entry_market_cap,
        entry_mc_text: agg.entry_mc_text,
        peak_multiplier: peak,
        peak_market_cap: peakMc,
        peak_reached_at: peakAt,
        milestone_count: agg.milestones.length,
        milestone_timeline: agg.milestones,
        last_milestone_at: lastMilestoneAt,
        lifespan_minutes: lifespanMin,
        total_messages: agg.total_messages,
        raw_alert_message: agg.raw_alert_message,
        built_at: new Date().toISOString(),
      };
    });

    // Detect which mints are net-new BEFORE we upsert, so we can fire
    // no-lube-ingest only for them (the existing rows already went
    // through the enrichment chain on their first sighting).
    const allMints = upsertRows.map(r => r.token_mint).filter(Boolean);
    const existingMints = new Set<string>();
    if (allMints.length > 0) {
      const { data: existing } = await supabase
        .from('telegram_insider_token_lifecycle')
        .select('token_mint')
        .in('token_mint', allMints);
      for (const r of (existing || []) as any[]) existingMints.add(r.token_mint);
    }
    const newMints = allMints.filter(m => !existingMints.has(m));

    // Upsert in chunks of 200 to avoid request size limits
    const CHUNK = 200;
    let upserted = 0;
    for (let i = 0; i < upsertRows.length; i += CHUNK) {
      const chunk = upsertRows.slice(i, i + CHUNK);
      const { error } = await supabase
        .from('telegram_insider_token_lifecycle')
        .upsert(chunk, { onConflict: 'token_mint' });
      if (error) {
        console.error('[insiders-lifecycle-builder] Upsert error:', error);
        throw error;
      }
      upserted += chunk.length;
    }

    // Fire-and-forget no-lube-ingest for every brand-new mint. Each call
    // runs the mesh probe → dev wallet → blackbox harvest → /holders →
    // orchestrate chain. We don't await so the cron stays snappy.
    if (newMints.length > 0) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      console.log(`[insiders-lifecycle-builder] Dispatching no-lube-ingest for ${newMints.length} new mints`);
      for (const mint of newMints) {
        fetch(`${supabaseUrl}/functions/v1/no-lube-ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
          body: JSON.stringify({ mint }),
        }).catch((e) => console.warn(`[insiders-lifecycle-builder] ingest dispatch failed for ${mint}:`, (e as Error).message));
      }
    }

    // Compute summary stats
    const stats = {
      total_tokens: upsertRows.length,
      reached_2x: upsertRows.filter(r => r.peak_multiplier >= 2).length,
      reached_3x: upsertRows.filter(r => r.peak_multiplier >= 3).length,
      reached_5x: upsertRows.filter(r => r.peak_multiplier >= 5).length,
      reached_10x: upsertRows.filter(r => r.peak_multiplier >= 10).length,
      reached_15x: upsertRows.filter(r => r.peak_multiplier >= 15).length,
      reached_50x: upsertRows.filter(r => r.peak_multiplier >= 50).length,
      total_milestones_recorded: upsertRows.reduce((s, r) => s + r.milestone_count, 0),
    };

    console.log('[insiders-lifecycle-builder] Done.', stats);

    // ============================================================
    // PHASE 2 — Per-token mesh enrichment
    // ============================================================
    // Cron-driven (every 3h). Picks tokens that are stale or never
    // enriched, runs the full mesh treatment per token (creator,
    // socials snapshot, genealogy, mesh feed), respects governance.
    //
    // Body params (all optional, sensible defaults for cron):
    //   enrich:          boolean — run phase 2 (default true)
    //   enrichLimit:     number  — max tokens per run (default 200)
    //   socialsRecheck:  boolean — also re-snapshot top recent (default true)
    //   socialsLimit:    number  — how many recent to recheck (default 50)
    //   chainPromoter:   boolean — call insiders-mesh-promoter at end (default true)
    let body: any = {};
    try { body = await req.clone().json(); } catch { /* GET / no body — use defaults */ }
    const doEnrich        = body.enrich !== false;
    const enrichLimit     = Number(body.enrichLimit ?? 200);
    const doSocialsRecheck = body.socialsRecheck !== false;
    const socialsLimit    = Number(body.socialsLimit ?? 50);
    const doChainPromoter = body.chainPromoter !== false;
    const force           = body.force === true;

    let enrichmentSummary: any = { skipped: true };
    if (doEnrich) {
      enrichmentSummary = await runEnrichmentPass(supabase, {
        enrichLimit,
        socialsRecheck: doSocialsRecheck,
        socialsLimit,
        force,
      });
    }

    // ============================================================
    // PHASE 3 — Chain into mesh promoter so newly-resolved
    // creators on ≥3x tokens get promoted in the same run.
    // ============================================================
    let promoterResult: any = { skipped: true };
    if (doChainPromoter) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const res = await fetch(`${supabaseUrl}/functions/v1/insiders-mesh-promoter`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({ source: 'lifecycle-builder-chain' }),
        });
        promoterResult = await res.json();
        console.log('[insiders-lifecycle-builder] Promoter chain done:', promoterResult);
      } catch (e) {
        console.error('[insiders-lifecycle-builder] Promoter chain failed:', e);
        promoterResult = { error: (e as Error).message };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        messages_processed: allRows.length,
        tokens_upserted: upserted,
        stats,
        enrichment: enrichmentSummary,
        promoter: promoterResult,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[insiders-lifecycle-builder] FATAL:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
