import { createClient } from 'npm:@supabase/supabase-js@2';
import { getHeliusRpcUrl, redactHeliusSecrets } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Known CEX hot wallets — stop tracing, mark as cex_gateway
const CEX_WALLETS: Record<string, string> = {
  '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9': 'Binance',
  '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM': 'Binance',
  'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS': 'Coinbase',
  'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE': 'Coinbase',
  '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S': 'Coinbase',
  'CJsLwbP1iu5DuUikHEJnLfANgKy6stB2uFgvBBHoyxwz': 'Kraken',
  'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2': 'Bybit',
  '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD': 'OKX',
  'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6': 'KuCoin',
};

// Scoring weights
const SCORE = {
  DIRECT_FUNDING: 40,
  CO_MINT: 25,
  PROFIT_RETURN: 20,
  SAME_UPSTREAM: 15,
  TOKEN_TRANSFER: 10,
  EXCHANGE_NOISE: -20,
};

const MAX_RECURSIVE_DEPTH = 3;
const MIN_SOL = 0.05;
const DELAY_MS = 300;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface DiscoveredWallet {
  address: string;
  label: string;
  evidenceScore: number;
  evidences: Evidence[];
}

interface Evidence {
  type: string;
  relatedWallet: string;
  txSignature: string;
  programId?: string;
  mint?: string;
  amountSol?: number;
  timestamp?: string;
  scoreDelta: number;
}

async function fetchSignatures(rpcUrl: string, wallet: string, limit = 100): Promise<any[]> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getSignaturesForAddress',
        params: [wallet, { limit }],
      }),
    });
    const data = await res.json();
    return data?.result || [];
  } catch (e) {
    console.warn(`[FamilyDiscovery] Failed to fetch signatures for ${wallet.slice(0,8)}:`, redactHeliusSecrets(String(e)));
    return [];
  }
}

async function fetchTransaction(rpcUrl: string, sig: string): Promise<any> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1,
        method: 'getTransaction',
        params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
      }),
    });
    const data = await res.json();
    return data?.result || null;
  } catch {
    return null;
  }
}

function analyzeTransaction(tx: any, seedWallet: string): Evidence[] {
  const evidences: Evidence[] = [];
  if (!tx?.meta || !tx?.transaction) return evidences;

  const sig = tx.transaction.signatures?.[0] || '';
  const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined;
  const instructions = tx.transaction.message?.instructions || [];

  // Check SOL balance changes (pre/post balances)
  const accountKeys = tx.transaction.message?.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];
  const preBalances = tx.meta.preBalances || [];
  const postBalances = tx.meta.postBalances || [];

  for (let i = 0; i < accountKeys.length; i++) {
    const addr = accountKeys[i];
    if (addr === seedWallet) continue;
    const diff = ((postBalances[i] || 0) - (preBalances[i] || 0)) / 1e9;

    // Someone sent SOL to the seed wallet (funder)
    if (diff < -MIN_SOL && accountKeys.includes(seedWallet)) {
      const seedIdx = accountKeys.indexOf(seedWallet);
      const seedDiff = ((postBalances[seedIdx] || 0) - (preBalances[seedIdx] || 0)) / 1e9;
      if (seedDiff > MIN_SOL) {
        const isCex = !!CEX_WALLETS[addr];
        evidences.push({
          type: 'DIRECT_FUNDING',
          relatedWallet: addr,
          txSignature: sig,
          amountSol: Math.abs(diff),
          timestamp: blockTime,
          scoreDelta: isCex ? SCORE.EXCHANGE_NOISE : SCORE.DIRECT_FUNDING,
        });
      }
    }

    // Seed wallet sent SOL to someone (child/sibling)
    if (diff > MIN_SOL) {
      const seedIdx = accountKeys.indexOf(seedWallet);
      if (seedIdx >= 0) {
        const seedDiff = ((postBalances[seedIdx] || 0) - (preBalances[seedIdx] || 0)) / 1e9;
        if (seedDiff < -MIN_SOL) {
          evidences.push({
            type: 'FUNDS_TO',
            relatedWallet: addr,
            txSignature: sig,
            amountSol: diff,
            timestamp: blockTime,
            scoreDelta: SCORE.DIRECT_FUNDING,
          });
        }
      }
    }
  }

  // Check for token transfers via inner instructions
  const innerInstructions = tx.meta.innerInstructions || [];
  for (const inner of innerInstructions) {
    for (const ix of (inner.instructions || [])) {
      if (ix.parsed?.type === 'transfer' && ix.program === 'spl-token') {
        const info = ix.parsed.info;
        if (info) {
          const src = info.source || info.authority;
          const dst = info.destination;
          if (src && dst && (src === seedWallet || dst === seedWallet)) {
            const other = src === seedWallet ? dst : src;
            evidences.push({
              type: 'TOKEN_TRANSFER',
              relatedWallet: other,
              txSignature: sig,
              mint: info.mint,
              timestamp: blockTime,
              scoreDelta: SCORE.TOKEN_TRANSFER,
            });
          }
        }
      }
    }
  }

  // Check for co-mint (initializeMint instructions)
  for (const ix of instructions) {
    if (ix.parsed?.type === 'initializeMint' || ix.parsed?.type === 'initializeMint2') {
      for (const addr of accountKeys) {
        if (addr !== seedWallet && !CEX_WALLETS[addr]) {
          evidences.push({
            type: 'CO_MINT',
            relatedWallet: addr,
            txSignature: sig,
            mint: ix.parsed?.info?.mint,
            programId: ix.programId,
            timestamp: blockTime,
            scoreDelta: SCORE.CO_MINT,
          });
        }
      }
    }
  }

  return evidences;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const rpcUrl = getHeliusRpcUrl();

    const body = await req.json().catch(() => ({}));
    const maxSeeds = body.maxSeeds || 5;
    const maxTxPerWallet = body.maxTxPerWallet || 50;

    console.log(`[FamilyDiscovery] Starting discovery run, maxSeeds=${maxSeeds}`);

    // 1. Get seed wallets from allstar_dev_registry
    const { data: allstars, error: allstarErr } = await supabase
      .from('allstar_dev_registry')
      .select('id, master_wallet, family_wallets, twitter_handle, best_tier')
      .eq('status', 'active')
      .order('updated_at', { ascending: true })
      .limit(maxSeeds);

    if (allstarErr) throw allstarErr;
    if (!allstars?.length) {
      return new Response(JSON.stringify({ status: 'ok', message: 'No active allstars found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let totalFamiliesProcessed = 0;
    let totalWalletsDiscovered = 0;

    for (const allstar of allstars) {
      const seedWallet = allstar.master_wallet;
      if (!seedWallet) continue;

      console.log(`[FamilyDiscovery] Processing seed: ${seedWallet.slice(0, 8)}... (allstar ${allstar.id.slice(0, 8)})`);

      // Upsert family
      const { data: family, error: famErr } = await supabase
        .from('wallet_families')
        .upsert({
          seed_wallet: seedWallet,
          family_name: allstar.twitter_handle ? `@${allstar.twitter_handle}` : `Dev-${seedWallet.slice(0, 6)}`,
          allstar_id: allstar.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'seed_wallet' })
        .select('id')
        .single();

      if (famErr || !family) {
        console.error(`[FamilyDiscovery] Failed to upsert family for ${seedWallet.slice(0,8)}:`, famErr);
        continue;
      }
      const familyId = family.id;

      // Upsert seed as member
      await supabase.from('wallet_family_members').upsert({
        family_id: familyId,
        wallet_address: seedWallet,
        label: 'seed',
        tier: 'A',
        confidence_score: 100,
        status: 'active',
        first_seen_at: new Date().toISOString(),
      }, { onConflict: 'family_id,wallet_address' });

      // Also add known family_wallets from allstar registry
      const existingFamilyWallets: string[] = Array.isArray(allstar.family_wallets) ? allstar.family_wallets : [];
      for (const fw of existingFamilyWallets) {
        if (typeof fw === 'string' && fw.length > 30) {
          await supabase.from('wallet_family_members').upsert({
            family_id: familyId,
            wallet_address: fw,
            label: 'sibling',
            tier: 'B',
            confidence_score: 60,
            status: 'active',
          }, { onConflict: 'family_id,wallet_address' });
        }
      }

      // Discover new wallets via transaction analysis
      const walletsToScan = [seedWallet];
      const scanned = new Set<string>();
      const candidateScores: Record<string, { score: number; label: string; evidences: Evidence[] }> = {};
      let depth = 0;

      while (walletsToScan.length > 0 && depth < MAX_RECURSIVE_DEPTH) {
        const current = walletsToScan.shift()!;
        if (scanned.has(current)) continue;
        scanned.add(current);

        await sleep(DELAY_MS);
        const sigs = await fetchSignatures(rpcUrl, current, maxTxPerWallet);
        console.log(`[FamilyDiscovery] Wallet ${current.slice(0,8)} depth=${depth}: ${sigs.length} sigs`);

        for (const sigInfo of sigs.slice(0, 20)) {
          await sleep(DELAY_MS);
          const tx = await fetchTransaction(rpcUrl, sigInfo.signature);
          if (!tx) continue;

          const evidences = analyzeTransaction(tx, current);
          for (const ev of evidences) {
            if (ev.relatedWallet === current) continue;
            if (!candidateScores[ev.relatedWallet]) {
              candidateScores[ev.relatedWallet] = { score: 0, label: 'unknown', evidences: [] };
            }
            candidateScores[ev.relatedWallet].score += ev.scoreDelta;
            candidateScores[ev.relatedWallet].evidences.push(ev);

            // Determine label
            if (CEX_WALLETS[ev.relatedWallet]) {
              candidateScores[ev.relatedWallet].label = 'cex_gateway';
            } else if (ev.type === 'DIRECT_FUNDING') {
              candidateScores[ev.relatedWallet].label = 'parent';
            } else if (ev.type === 'FUNDS_TO') {
              candidateScores[ev.relatedWallet].label = 'child';
            } else if (ev.type === 'CO_MINT') {
              candidateScores[ev.relatedWallet].label = 'sibling';
            }

            // Store evidence
            await supabase.from('wallet_family_evidence').insert({
              family_id: familyId,
              wallet: current,
              related_wallet: ev.relatedWallet,
              evidence_type: ev.type,
              tx_signature: ev.txSignature,
              program_id: ev.programId,
              mint: ev.mint,
              amount_sol: ev.amountSol,
              timestamp: ev.timestamp,
              score_delta: ev.scoreDelta,
            });
          }
        }

        // Queue high-confidence candidates for recursive scan
        for (const [addr, data] of Object.entries(candidateScores)) {
          if (!scanned.has(addr) && data.score >= 45 && !CEX_WALLETS[addr]) {
            walletsToScan.push(addr);
          }
        }
        depth++;
      }

      // Persist discovered members with tiers
      let discoveredCount = 0;
      for (const [addr, data] of Object.entries(candidateScores)) {
        let tier: string;
        if (data.score >= 70) tier = 'A';
        else if (data.score >= 45) tier = 'B';
        else if (data.score >= 25) tier = 'C';
        else tier = 'X';

        if (tier === 'X') continue; // Skip low-confidence

        await supabase.from('wallet_family_members').upsert({
          family_id: familyId,
          wallet_address: addr,
          label: data.label,
          tier,
          confidence_score: Math.min(data.score, 100),
          status: 'active',
        }, { onConflict: 'family_id,wallet_address' });

        // Upsert edges
        for (const ev of data.evidences) {
          const edgeType = ev.type === 'DIRECT_FUNDING' ? 'FUNDED_BY'
            : ev.type === 'FUNDS_TO' ? 'FUNDS_TO'
            : ev.type === 'CO_MINT' ? 'CO_MINTED_WITH'
            : ev.type === 'TOKEN_TRANSFER' ? 'TOKEN_TRANSFER_TO'
            : ev.type === 'PROFIT_RETURN' ? 'PROFIT_RETURN_PATH'
            : 'SAME_UPSTREAM_SOURCE';

          await supabase.from('wallet_family_edges').upsert({
            family_id: familyId,
            from_wallet: ev.relatedWallet,
            to_wallet: addr === ev.relatedWallet ? seedWallet : addr,
            edge_type: edgeType,
            weight: ev.scoreDelta,
            confidence: data.score,
            evidence_count: 1,
          }, { onConflict: 'family_id,from_wallet,to_wallet,edge_type' });
        }

        // Add to poll queue
        const priority = tier === 'A' ? 'P1' : tier === 'B' ? 'P2' : 'P3';
        const interval = tier === 'A' ? 300 : tier === 'B' ? 600 : 900;
        await supabase.from('wallet_family_poll_queue').upsert({
          wallet_address: addr,
          family_id: familyId,
          priority,
          poll_interval_sec: interval,
          next_poll_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' });

        discoveredCount++;
      }

      // Update family stats
      const { count } = await supabase
        .from('wallet_family_members')
        .select('*', { count: 'exact', head: true })
        .eq('family_id', familyId);

      await supabase.from('wallet_families').update({
        total_wallets: count || 0,
        last_rescored_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', familyId);

      totalFamiliesProcessed++;
      totalWalletsDiscovered += discoveredCount;
      console.log(`[FamilyDiscovery] Family ${familyId.slice(0,8)}: ${discoveredCount} wallets discovered, ${count} total members`);
    }

    const summary = {
      status: 'ok',
      familiesProcessed: totalFamiliesProcessed,
      walletsDiscovered: totalWalletsDiscovered,
      timestamp: new Date().toISOString(),
    };
    console.log(`[FamilyDiscovery] Complete:`, summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[FamilyDiscovery] Fatal error:', redactHeliusSecrets(String(err)));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
