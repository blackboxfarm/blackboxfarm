/**
 * autopsy-tx-timeline
 *
 * Pulls deterministic on-chain forensics for an autopsy candidate so the
 * AI writer has real timestamps + SOL amounts to cite. NO AI here — pure
 * Helius RPC + a tiny amount of logic.
 *
 * Captures:
 *   - launch tx (signature, time, dev-buy & co-sniper amounts inside the same tx)
 *   - funder wallet (first inbound SOL transfer to dev), funded amount, minutes-before-launch
 *   - dev wallet signature timeline (chronological action list with kind labels)
 *   - dev final on-chain action (last sig before death)
 *   - dump cascade window (largest 60s burst of net-sells against the pair)
 *   - post-dump consolidation flow (USDC chunking heuristic)
 *   - time of death (last activity on the dev wallet OR last swap on the pair)
 *
 * Persists to:
 *   - autopsy_tx_evidence (one row per candidate, upsert)
 *   - autopsy_evidence_blobs kind='tx_timeline' (so existing readers see it)
 *
 * Body: { candidate_id: uuid, force?: boolean }
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { assertUpsert } from '../_shared/db-assert.ts';
import { heliusRpcFetch } from '../_shared/helius-client.ts';
import { discoverFunding } from '../_shared/funding-resolver.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LAMPORTS_PER_SOL = 1_000_000_000;
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const RAYDIUM_AMM_V4 = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

type DevSig = {
  signature: string;
  block_time: number | null;
  ts: string | null;
  kind: string;
  summary: string;
};

type CoSniper = { wallet: string; amount_tokens: number; pct_of_curve: number | null };

function tsFromBlockTime(bt: number | null | undefined): string | null {
  if (!bt) return null;
  return new Date(bt * 1000).toISOString();
}

/**
 * Classify a dev-wallet tx by inspecting the program ids touched + balance deltas.
 */
function classifyDevTx(tx: any, dev: string): { kind: string; summary: string } {
  if (!tx) return { kind: 'unknown', summary: '' };
  const err = tx.meta?.err;
  if (err) return { kind: 'failed', summary: 'tx failed' };

  const accountKeys: string[] = (tx.transaction?.message?.accountKeys ?? []).map((k: any) => typeof k === 'string' ? k : (k?.pubkey ?? ''));
  const programIds = new Set<string>();
  const ixs = tx.transaction?.message?.instructions ?? [];
  for (const ix of ixs) {
    const pidIdx = ix.programIdIndex;
    if (typeof pidIdx === 'number' && accountKeys[pidIdx]) programIds.add(accountKeys[pidIdx]);
    if (typeof ix.programId === 'string') programIds.add(ix.programId);
  }
  for (const inner of tx.meta?.innerInstructions ?? []) {
    for (const ix of inner.instructions ?? []) {
      const pidIdx = ix.programIdIndex;
      if (typeof pidIdx === 'number' && accountKeys[pidIdx]) programIds.add(accountKeys[pidIdx]);
    }
  }

  const logs: string[] = tx.meta?.logMessages ?? [];
  const logBlob = logs.join(' ').toLowerCase();

  // SOL delta for dev wallet
  const devIdx = accountKeys.indexOf(dev);
  const preBal = devIdx >= 0 ? (tx.meta?.preBalances?.[devIdx] ?? 0) : 0;
  const postBal = devIdx >= 0 ? (tx.meta?.postBalances?.[devIdx] ?? 0) : 0;
  const solDelta = (postBal - preBal) / LAMPORTS_PER_SOL;

  if (programIds.has(PUMPFUN_PROGRAM)) {
    if (logBlob.includes('create') || logBlob.includes('initialize')) return { kind: 'token_create', summary: 'pump.fun token create' };
    if (logBlob.includes('buy')) return { kind: 'token_buy', summary: `pump.fun buy (${solDelta.toFixed(2)} SOL)` };
    if (logBlob.includes('sell')) return { kind: 'token_sell', summary: `pump.fun sell (${solDelta.toFixed(2)} SOL)` };
    return { kind: 'pumpfun_other', summary: 'pump.fun interaction' };
  }
  if (programIds.has(PUMPSWAP_PROGRAM) || programIds.has(RAYDIUM_AMM_V4)) {
    if (solDelta > 0.01) return { kind: 'token_sell', summary: `AMM sell (+${solDelta.toFixed(2)} SOL)` };
    if (solDelta < -0.01) return { kind: 'token_buy', summary: `AMM buy (${solDelta.toFixed(2)} SOL)` };
    return { kind: 'amm_swap', summary: 'AMM swap' };
  }
  if (logBlob.includes('closeaccount') || logBlob.includes('close_account')) {
    return { kind: 'close_account', summary: 'closed token account (drain)' };
  }
  if (Math.abs(solDelta) > 0.01) {
    return { kind: solDelta > 0 ? 'sol_in' : 'sol_out', summary: `SOL ${solDelta > 0 ? 'in' : 'out'} ${solDelta.toFixed(3)}` };
  }
  return { kind: 'misc', summary: 'misc tx' };
}

/**
 * Reconstruct the launch tx: find the earliest pump.fun tx on the dev wallet,
 * then walk inner instructions / account changes to extract every wallet that
 * received tokens of this mint inside the same tx (dev-buy + co-snipers).
 */
async function decodeLaunchTx(creator: string, mint: string): Promise<{
  launch_tx_signature: string | null;
  launch_tx_at: string | null;
  dev_buy_amount_tokens: number | null;
  dev_buy_sol: number | null;
  co_snipers: CoSniper[];
  atomic_snipe_pct: number | null;
}> {
  const empty = {
    launch_tx_signature: null, launch_tx_at: null,
    dev_buy_amount_tokens: null, dev_buy_sol: null,
    co_snipers: [], atomic_snipe_pct: null,
  };
  // Get oldest sigs from creator
  const sigsRes = await heliusRpcFetch('getSignaturesForAddress', [creator, { limit: 1000 }]).catch(() => null);
  const sigs: Array<{ signature: string; blockTime: number | null }> = sigsRes?.result ?? [];
  if (sigs.length === 0) return empty;
  const ordered = [...sigs].sort((a, b) => (a.blockTime ?? 0) - (b.blockTime ?? 0));

  // Walk forward, fetch each tx, find the one that touches the mint and pump.fun program
  for (const s of ordered.slice(0, 50)) {
    const txRes = await heliusRpcFetch('getTransaction', [
      s.signature,
      { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
    ]).catch(() => null);
    const tx = txRes?.result;
    if (!tx) continue;
    const accountKeys: string[] = (tx.transaction?.message?.accountKeys ?? []).map((k: any) => typeof k === 'string' ? k : (k?.pubkey ?? ''));
    const touchesMint = (tx.meta?.postTokenBalances ?? []).some((b: any) => b.mint === mint);
    const ixs = [...(tx.transaction?.message?.instructions ?? []), ...((tx.meta?.innerInstructions ?? []).flatMap((i: any) => i.instructions ?? []))];
    const touchesPump = ixs.some((ix: any) => {
      const pid = typeof ix.programId === 'string' ? ix.programId : (typeof ix.programIdIndex === 'number' ? accountKeys[ix.programIdIndex] : null);
      return pid === PUMPFUN_PROGRAM;
    });
    if (!touchesMint || !touchesPump) continue;

    // This is the launch tx (or first interaction). Decode token deltas per owner.
    const ownerDeltas = new Map<string, number>(); // owner -> uiAmount delta
    const pre = tx.meta?.preTokenBalances ?? [];
    const post = tx.meta?.postTokenBalances ?? [];
    const preMap = new Map<number, any>();
    for (const b of pre) preMap.set(b.accountIndex, b);
    for (const p of post) {
      if (p.mint !== mint) continue;
      const owner = p.owner;
      const postUi = Number(p.uiTokenAmount?.uiAmount ?? 0);
      const preB = preMap.get(p.accountIndex);
      const preUi = Number(preB?.uiTokenAmount?.uiAmount ?? 0);
      const delta = postUi - preUi;
      if (owner) ownerDeltas.set(owner, (ownerDeltas.get(owner) ?? 0) + delta);
    }

    const devDelta = ownerDeltas.get(creator) ?? 0;
    const buyers: CoSniper[] = [];
    let totalBought = 0;
    for (const [owner, delta] of ownerDeltas.entries()) {
      if (delta > 0) {
        totalBought += delta;
        if (owner !== creator) {
          buyers.push({ wallet: owner, amount_tokens: delta, pct_of_curve: null });
        }
      }
    }
    // Compute pct of curve (assume bonding curve = sum of all positive deltas in this tx)
    if (totalBought > 0) {
      for (const b of buyers) b.pct_of_curve = (b.amount_tokens / totalBought) * 100;
    }
    const devBuyPct = totalBought > 0 ? (devDelta / totalBought) * 100 : null;

    // SOL spent by dev in this tx
    const devIdx = accountKeys.indexOf(creator);
    const preBal = devIdx >= 0 ? (tx.meta?.preBalances?.[devIdx] ?? 0) : 0;
    const postBal = devIdx >= 0 ? (tx.meta?.postBalances?.[devIdx] ?? 0) : 0;
    const devSolSpent = (preBal - postBal) / LAMPORTS_PER_SOL;

    // atomic snipe = dev + top sniper combined %
    const topSniper = buyers.sort((a, b) => (b.amount_tokens) - (a.amount_tokens))[0];
    const atomic = devBuyPct !== null && topSniper?.pct_of_curve !== null
      ? (devBuyPct ?? 0) + (topSniper?.pct_of_curve ?? 0)
      : devBuyPct;

    return {
      launch_tx_signature: s.signature,
      launch_tx_at: tsFromBlockTime(s.blockTime ?? tx.blockTime),
      dev_buy_amount_tokens: devDelta > 0 ? devDelta : null,
      dev_buy_sol: devSolSpent > 0 ? devSolSpent : null,
      co_snipers: buyers.slice(0, 5),
      atomic_snipe_pct: atomic,
    };
  }
  return empty;
}

/**
 * Build the dev wallet signature timeline (newest 100), classify each tx.
 */
async function buildDevTimeline(dev: string, limit: number = 60): Promise<DevSig[]> {
  const sigsRes = await heliusRpcFetch('getSignaturesForAddress', [dev, { limit }]).catch(() => null);
  const sigs: Array<{ signature: string; blockTime: number | null; err: any }> = sigsRes?.result ?? [];
  const out: DevSig[] = [];
  // Cap detail-fetch to first 25 to stay inside budget
  const detailed = sigs.slice(0, 25);
  const txMap = new Map<string, any>();
  for (const s of detailed) {
    const txRes = await heliusRpcFetch('getTransaction', [
      s.signature,
      { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' },
    ]).catch(() => null);
    if (txRes?.result) txMap.set(s.signature, txRes.result);
  }
  for (const s of sigs) {
    const tx = txMap.get(s.signature);
    const cls = tx ? classifyDevTx(tx, dev) : { kind: s.err ? 'failed' : 'unknown', summary: '' };
    out.push({
      signature: s.signature,
      block_time: s.blockTime,
      ts: tsFromBlockTime(s.blockTime),
      kind: cls.kind,
      summary: cls.summary,
    });
  }
  return out;
}

/**
 * Detect a dump cascade window in the dev signature timeline: the densest
 * 60-second burst of token_sell / sol_in events.
 */
function detectDumpCascade(timeline: DevSig[]): {
  start_at: string | null;
  end_at: string | null;
  tx_count: number;
  est_sol_out: number | null;
} | null {
  const sells = timeline
    .filter(t => t.kind === 'token_sell' || t.kind === 'sol_in' || t.kind === 'close_account')
    .filter(t => t.block_time)
    .sort((a, b) => (a.block_time ?? 0) - (b.block_time ?? 0));
  if (sells.length < 2) return null;

  let best = { start: 0, end: 0, count: 0 };
  for (let i = 0; i < sells.length; i++) {
    const t0 = sells[i].block_time ?? 0;
    let j = i;
    while (j < sells.length && (sells[j].block_time ?? 0) - t0 <= 60) j++;
    const count = j - i;
    if (count > best.count) best = { start: t0, end: sells[j - 1].block_time ?? t0, count };
  }
  if (best.count < 2) return null;

  // Rough SOL-out estimate from summaries like "(+1.23 SOL)"
  let solOut = 0;
  for (const s of sells) {
    const t = s.block_time ?? 0;
    if (t < best.start || t > best.end) continue;
    const m = s.summary.match(/[+-]?\d+\.\d+/);
    if (m) solOut += Math.abs(Number(m[0]));
  }
  return {
    start_at: tsFromBlockTime(best.start),
    end_at: tsFromBlockTime(best.end),
    tx_count: best.count,
    est_sol_out: solOut > 0 ? solOut : null,
  };
}

function detectUsdcConsolidation(timeline: DevSig[]): boolean {
  // Heuristic: 3+ AMM swaps within 30 min after the cascade
  const swaps = timeline.filter(t => t.kind === 'amm_swap' || t.kind === 'token_sell').length;
  return swaps >= 3;
}

Deno.serve(withRunLog('autopsy-tx-timeline', async (req) => {
  if (!await isFunctionEnabled('autopsy-tx-timeline')) {
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
  const candidateId: string | undefined = body.candidate_id;
  const force: boolean = !!body.force;
  if (!candidateId) {
    return new Response(JSON.stringify({ error: 'candidate_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Skip if recent evidence exists and not forcing
  if (!force) {
    const { data: existing } = await supabase
      .from('autopsy_tx_evidence')
      .select('candidate_id, collected_at')
      .eq('candidate_id', candidateId)
      .maybeSingle();
    if (existing && Date.now() - new Date(existing.collected_at).getTime() < 6 * 3600 * 1000) {
      return new Response(JSON.stringify({ skipped: 'fresh evidence (<6h)', candidate_id: candidateId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  const { data: cand, error: candErr } = await supabase
    .from('autopsy_candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();
  if (candErr || !cand) {
    return new Response(JSON.stringify({ error: 'candidate not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Resolve creator wallet from candidate or pumpfun_watchlist
  let creator: string | null = cand.creator_wallet ?? null;
  if (!creator) {
    const { data: pf } = await supabase.from('pumpfun_watchlist').select('creator_wallet').eq('token_mint', cand.token_mint).maybeSingle();
    creator = pf?.creator_wallet ?? null;
  }
  // Last-resort: trigger an inline mesh hydrate so a manually-added candidate
  // doesn't dead-end here. token-mesh-hydrate resolves creator via Helius/Pump.fun
  // and writes it back onto autopsy_candidates.
  if (!creator) {
    try {
      await supabase.functions.invoke('token-mesh-hydrate', {
        body: { mint: cand.token_mint, candidate_id: candidateId, surface: 'autopsy_tx_timeline_autoresolve', force: true },
      });
      const { data: cand2 } = await supabase
        .from('autopsy_candidates').select('creator_wallet').eq('id', candidateId).maybeSingle();
      creator = cand2?.creator_wallet ?? null;
    } catch (e) {
      console.warn('[autopsy-tx-timeline] inline hydrate failed:', (e as Error).message);
    }
  }
  if (!creator) {
    // Return 200 with skipped reason so the JS client doesn't surface the
    // misleading "Failed to send a request to the Edge Function" message.
    return new Response(JSON.stringify({
      skipped: 'creator_unknown',
      reason: 'Creator wallet unresolved after mesh hydrate. Run Re-Hydrate once the token has at least a Pump.fun or Helius identity.',
      candidate_id: candidateId,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  console.log(`[autopsy-tx-timeline] candidate=${candidateId} mint=${cand.token_mint} creator=${creator}`);

  // Run the four pulls in parallel
  const [launch, devTimeline, fundingResult] = await Promise.all([
    decodeLaunchTx(creator, cand.token_mint),
    buildDevTimeline(creator, 60),
    discoverFunding(creator).catch(() => null),
  ]);

  const dump = detectDumpCascade(devTimeline);
  const usdcConsol = detectUsdcConsolidation(devTimeline);

  // Final dev action = newest classified non-misc sig
  const finalAction = devTimeline.find(t => t.kind !== 'misc' && t.kind !== 'unknown') ?? devTimeline[0] ?? null;

  // Time of death = end of cascade if any, else final action ts
  const tod = dump?.end_at ?? finalAction?.ts ?? null;

  // Funder minutes-before-launch
  let funderMinutesBefore: number | null = null;
  let funderFundedAt: string | null = null;
  if (fundingResult?.funder && launch.launch_tx_at) {
    // Try to read funded_at from reputation_mesh metadata if cached, else null
    try {
      const { data: rmRow } = await supabase
        .from('reputation_mesh')
        .select('metadata')
        .eq('source_type', 'wallet').eq('source_id', creator)
        .eq('relationship', 'funded_by').maybeSingle();
      const fundedAtMs = (rmRow?.metadata as any)?.funded_at_ms;
      if (fundedAtMs) {
        funderFundedAt = new Date(fundedAtMs).toISOString();
        funderMinutesBefore = (new Date(launch.launch_tx_at).getTime() - fundedAtMs) / 60000;
      }
    } catch { /* ignore */ }
  }

  const evidence = {
    candidate_id: candidateId,
    token_mint: cand.token_mint,
    creator_wallet: creator,
    funder_wallet: fundingResult?.funder ?? null,
    funder_funded_amount_sol: fundingResult?.amountSol ?? null,
    funder_funded_at: funderFundedAt,
    funder_minutes_before_launch: funderMinutesBefore,
    launch_tx_signature: launch.launch_tx_signature,
    launch_tx_at: launch.launch_tx_at,
    dev_buy_amount_tokens: launch.dev_buy_amount_tokens,
    dev_buy_sol: launch.dev_buy_sol,
    dev_buy_pct_of_curve: launch.atomic_snipe_pct !== null && launch.co_snipers.length > 0
      ? launch.atomic_snipe_pct - (launch.co_snipers[0]?.pct_of_curve ?? 0)
      : launch.atomic_snipe_pct,
    co_snipers: launch.co_snipers,
    atomic_snipe_pct: launch.atomic_snipe_pct,
    dev_signatures: devTimeline,
    dev_final_action_at: finalAction?.ts ?? null,
    dev_final_action_kind: finalAction?.kind ?? null,
    dev_final_action_signature: finalAction?.signature ?? null,
    dump_cascade: dump,
    post_dump_flow: [],
    usdc_consolidation_observed: usdcConsol,
    time_of_death_at: tod,
    notes: null,
    collected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await assertUpsert(
    supabase.from('autopsy_tx_evidence')
      .upsert(evidence, { onConflict: 'candidate_id' })
      .select('candidate_id').single() as any,
    'autopsy_tx_evidence'
  );

  // Mirror to autopsy_evidence_blobs so the writer's existing reader picks it up
  await supabase.from('autopsy_evidence_blobs').insert({
    candidate_id: candidateId,
    token_mint: cand.token_mint,
    kind: 'tx_timeline',
    payload: evidence,
    captured_at: new Date().toISOString(),
  });

  return new Response(JSON.stringify({
    success: true,
    candidate_id: candidateId,
    summary: {
      launch_tx: launch.launch_tx_signature ? 'found' : 'missing',
      dev_buy_pct: launch.atomic_snipe_pct,
      co_snipers: launch.co_snipers.length,
      dev_sigs: devTimeline.length,
      funder: fundingResult?.funder ? 'resolved' : 'unresolved',
      cascade: dump ? `${dump.tx_count} tx` : 'none',
      time_of_death: tod,
    },
  }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));