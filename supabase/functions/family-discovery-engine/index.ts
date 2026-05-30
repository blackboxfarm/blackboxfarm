import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getHeliusRpcUrl, redactHeliusSecrets } from '../_shared/helius-client.ts';
import { isFunctionEnabled } from '../_shared/function-toggle.ts';

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

const SCORE = {
  DIRECT_FUNDING: 40, CO_MINT: 25, PROFIT_RETURN: 20,
  SAME_UPSTREAM: 15, TOKEN_TRANSFER: 10, EXCHANGE_NOISE: -20,
};

const MAX_RECURSIVE_DEPTH = 3;
const MIN_SOL = 0.05;
const DELAY_MS = 300;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface Evidence {
  type: string; relatedWallet: string; txSignature: string;
  programId?: string; mint?: string; amountSol?: number;
  timestamp?: string; scoreDelta: number;
}

async function fetchSignatures(rpcUrl: string, wallet: string, limit = 100): Promise<any[]> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [wallet, { limit }] }),
    });
    return (await res.json())?.result || [];
  } catch (e) {
    console.warn(`[FamilyDiscovery] Sigs failed ${wallet.slice(0,8)}:`, redactHeliusSecrets(String(e)));
    return [];
  }
}

async function fetchTransaction(rpcUrl: string, sig: string): Promise<any> {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTransaction', params: [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }] }),
    });
    return (await res.json())?.result || null;
  } catch { return null; }
}

function analyzeTransaction(tx: any, seedWallet: string): Evidence[] {
  const evidences: Evidence[] = [];
  if (!tx?.meta || !tx?.transaction) return evidences;
  const sig = tx.transaction.signatures?.[0] || '';
  const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined;
  const instructions = tx.transaction.message?.instructions || [];
  const accountKeys = tx.transaction.message?.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];
  const preBalances = tx.meta.preBalances || [];
  const postBalances = tx.meta.postBalances || [];

  for (let i = 0; i < accountKeys.length; i++) {
    const addr = accountKeys[i];
    if (addr === seedWallet) continue;
    const diff = ((postBalances[i] || 0) - (preBalances[i] || 0)) / 1e9;
    if (diff < -MIN_SOL && accountKeys.includes(seedWallet)) {
      const seedIdx = accountKeys.indexOf(seedWallet);
      const seedDiff = ((postBalances[seedIdx] || 0) - (preBalances[seedIdx] || 0)) / 1e9;
      if (seedDiff > MIN_SOL) {
        evidences.push({ type: 'DIRECT_FUNDING', relatedWallet: addr, txSignature: sig, amountSol: Math.abs(diff), timestamp: blockTime, scoreDelta: CEX_WALLETS[addr] ? SCORE.EXCHANGE_NOISE : SCORE.DIRECT_FUNDING });
      }
    }
    if (diff > MIN_SOL) {
      const seedIdx = accountKeys.indexOf(seedWallet);
      if (seedIdx >= 0 && ((postBalances[seedIdx] || 0) - (preBalances[seedIdx] || 0)) / 1e9 < -MIN_SOL) {
        evidences.push({ type: 'FUNDS_TO', relatedWallet: addr, txSignature: sig, amountSol: diff, timestamp: blockTime, scoreDelta: SCORE.DIRECT_FUNDING });
      }
    }
  }

  const innerInstructions = tx.meta.innerInstructions || [];
  for (const inner of innerInstructions) {
    for (const ix of (inner.instructions || [])) {
      if (ix.parsed?.type === 'transfer' && ix.program === 'spl-token') {
        const info = ix.parsed.info;
        if (info) {
          const src = info.source || info.authority;
          const dst = info.destination;
          if (src && dst && (src === seedWallet || dst === seedWallet)) {
            evidences.push({ type: 'TOKEN_TRANSFER', relatedWallet: src === seedWallet ? dst : src, txSignature: sig, mint: info.mint, timestamp: blockTime, scoreDelta: SCORE.TOKEN_TRANSFER });
          }
        }
      }
    }
  }

  for (const ix of instructions) {
    if (ix.parsed?.type === 'initializeMint' || ix.parsed?.type === 'initializeMint2') {
      for (const addr of accountKeys) {
        if (addr !== seedWallet && !CEX_WALLETS[addr]) {
          evidences.push({ type: 'CO_MINT', relatedWallet: addr, txSignature: sig, mint: ix.parsed?.info?.mint, programId: ix.programId, timestamp: blockTime, scoreDelta: SCORE.CO_MINT });
        }
      }
    }
  }
  return evidences;
}

Deno.serve(withRunLog('family-discovery-engine', async (req) => {
  if (!await isFunctionEnabled('family-discovery-engine')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
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

    const { data: allstars, error: allstarErr } = await supabase
      .from('allstar_dev_registry')
      .select('id, master_wallet, family_wallets, twitter_handle, best_tier')
      .eq('status', 'active')
      .order('updated_at', { ascending: true })
      .limit(maxSeeds);

    if (allstarErr) throw allstarErr;
    if (!allstars?.length) {
      return new Response(JSON.stringify({ status: 'ok', message: 'No active allstars found' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let totalFamiliesProcessed = 0;
    let totalWalletsDiscovered = 0;

    for (const allstar of allstars) {
      const seedWallet = allstar.master_wallet;
      if (!seedWallet) continue;

      console.log(`[FamilyDiscovery] Processing seed: ${seedWallet.slice(0, 8)}...`);

      const { data: family, error: famErr } = await supabase
        .from('wallet_families')
        .upsert({
          seed_wallet: seedWallet,
          family_name: allstar.twitter_handle ? `@${allstar.twitter_handle}` : `Dev-${seedWallet.slice(0, 6)}`,
          allstar_id: allstar.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'seed_wallet' })
        .select('id').single();

      if (famErr || !family) { console.error(`[FamilyDiscovery] Family upsert failed:`, famErr); continue; }
      const familyId = family.id;

      await supabase.from('wallet_family_members').upsert({
        family_id: familyId, wallet_address: seedWallet, label: 'seed', tier: 'A',
        confidence_score: 100, status: 'active', first_seen_at: new Date().toISOString(),
      }, { onConflict: 'family_id,wallet_address' });

      const existingFamilyWallets: string[] = Array.isArray(allstar.family_wallets) ? allstar.family_wallets : [];
      for (const fw of existingFamilyWallets) {
        if (typeof fw === 'string' && fw.length > 30) {
          await supabase.from('wallet_family_members').upsert({
            family_id: familyId, wallet_address: fw, label: 'sibling', tier: 'B', confidence_score: 60, status: 'active',
          }, { onConflict: 'family_id,wallet_address' });
        }
      }

      // Transaction analysis
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

        for (const sigInfo of sigs.slice(0, 20)) {
          await sleep(DELAY_MS);
          const tx = await fetchTransaction(rpcUrl, sigInfo.signature);
          if (!tx) continue;
          const evidences = analyzeTransaction(tx, current);
          for (const ev of evidences) {
            if (ev.relatedWallet === current) continue;
            if (!candidateScores[ev.relatedWallet]) candidateScores[ev.relatedWallet] = { score: 0, label: 'unknown', evidences: [] };
            candidateScores[ev.relatedWallet].score += ev.scoreDelta;
            candidateScores[ev.relatedWallet].evidences.push(ev);
            if (CEX_WALLETS[ev.relatedWallet]) candidateScores[ev.relatedWallet].label = 'cex_gateway';
            else if (ev.type === 'DIRECT_FUNDING') candidateScores[ev.relatedWallet].label = 'parent';
            else if (ev.type === 'FUNDS_TO') candidateScores[ev.relatedWallet].label = 'child';
            else if (ev.type === 'CO_MINT') candidateScores[ev.relatedWallet].label = 'sibling';

            await supabase.from('wallet_family_evidence').insert({
              family_id: familyId, wallet: current, related_wallet: ev.relatedWallet,
              evidence_type: ev.type, tx_signature: ev.txSignature, program_id: ev.programId,
              mint: ev.mint, amount_sol: ev.amountSol, timestamp: ev.timestamp, score_delta: ev.scoreDelta,
            });
          }
        }
        for (const [addr, data] of Object.entries(candidateScores)) {
          if (!scanned.has(addr) && data.score >= 45 && !CEX_WALLETS[addr]) walletsToScan.push(addr);
        }
        depth++;
      }

      // ══════════════════════════════════════════════════════════
      // PERSIST + ALL CROSS-FEED INTEGRATIONS
      // ══════════════════════════════════════════════════════════
      let discoveredCount = 0;
      const newWalletAddresses: string[] = [];

      for (const [addr, data] of Object.entries(candidateScores)) {
        let tier: string;
        if (data.score >= 70) tier = 'A';
        else if (data.score >= 45) tier = 'B';
        else if (data.score >= 25) tier = 'C';
        else continue; // X tier — skip

        await supabase.from('wallet_family_members').upsert({
          family_id: familyId, wallet_address: addr, label: data.label,
          tier, confidence_score: Math.min(data.score, 100), status: 'active',
        }, { onConflict: 'family_id,wallet_address' });

        for (const ev of data.evidences) {
          const edgeType = ev.type === 'DIRECT_FUNDING' ? 'FUNDED_BY' : ev.type === 'FUNDS_TO' ? 'FUNDS_TO'
            : ev.type === 'CO_MINT' ? 'CO_MINTED_WITH' : ev.type === 'TOKEN_TRANSFER' ? 'TOKEN_TRANSFER_TO'
            : ev.type === 'PROFIT_RETURN' ? 'PROFIT_RETURN_PATH' : 'SAME_UPSTREAM_SOURCE';
          await supabase.from('wallet_family_edges').upsert({
            family_id: familyId, from_wallet: ev.relatedWallet,
            to_wallet: addr === ev.relatedWallet ? seedWallet : addr,
            edge_type: edgeType, weight: ev.scoreDelta, confidence: data.score, evidence_count: 1,
          }, { onConflict: 'family_id,from_wallet,to_wallet,edge_type' });
        }

        const priority = tier === 'A' ? 'P1' : tier === 'B' ? 'P2' : 'P3';
        const interval = tier === 'A' ? 300 : tier === 'B' ? 600 : 900;
        await supabase.from('wallet_family_poll_queue').upsert({
          wallet_address: addr, family_id: familyId, priority,
          poll_interval_sec: interval, next_poll_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' });

        newWalletAddresses.push(addr);
        discoveredCount++;

        // ═══ CROSS-FEED 1: reputation_mesh ═══
        const relationship = data.label === 'parent' ? 'funded_by' : data.label === 'child' ? 'funds'
          : data.label === 'sibling' ? 'sibling_wallet' : data.label === 'cex_gateway' ? 'cex_gateway' : 'family_member';

        await supabase.from('reputation_mesh').upsert({
          source_id: seedWallet, source_type: 'wallet', linked_id: addr, linked_type: 'wallet',
          relationship, confidence: Math.min(data.score, 100), discovered_via: 'family_scanner',
          evidence: {
            family_id: familyId, tier, label: data.label, evidence_count: data.evidences.length,
            top_evidence: data.evidences.slice(0, 3).map(e => ({ type: e.type, tx: e.txSignature?.slice(0, 16) })),
          },
        }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });

        // ═══ CROSS-FEED 4: developer_profiles linking ═══
        if (tier === 'A' || tier === 'B') {
          const { data: devProfile } = await supabase
            .from('developer_profiles').select('id').eq('master_wallet_address', seedWallet).maybeSingle();
          if (devProfile) {
            await supabase.from('reputation_mesh').upsert({
              source_id: devProfile.id, source_type: 'developer', linked_id: addr, linked_type: 'wallet',
              relationship: 'family_wallet', confidence: Math.min(data.score, 100), discovered_via: 'family_scanner',
              evidence: { tier, label: data.label, family_id: familyId },
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
          }
        }
      }

      // ═══ CROSS-FEED 3: Push wallets back to allstar_dev_registry.family_wallets ═══
      if (newWalletAddresses.length > 0) {
        const mergedWallets = [...new Set([...existingFamilyWallets, ...newWalletAddresses])];
        await supabase.from('allstar_dev_registry').update({
          family_wallets: mergedWallets, total_wallet_family_size: mergedWallets.length, updated_at: new Date().toISOString(),
        }).eq('id', allstar.id);

        // ═══ CROSS-FEED 3b: Fuse newly-discovered family wallets into the unified Creator Profile ═══
        try {
          const { fuseAndAudit } = await import('../_shared/fuse-and-audit.ts');
          await fuseAndAudit(
            {
              devWallet: seedWallet,
              sisterWallets: newWalletAddresses,
              xHandle: allstar.twitter_handle || null,
              source: 'family-discovery-engine',
            },
            supabase,
          );
        } catch (_) { /* audited internally */ }
      }

      // Update family stats
      const { count } = await supabase.from('wallet_family_members').select('*', { count: 'exact', head: true }).eq('family_id', familyId);
      await supabase.from('wallet_families').update({
        total_wallets: count || 0, last_rescored_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('id', familyId);

      // ═══ CROSS-FEED 5: Admin alert + TG Broadcast ═══
      if (discoveredCount > 0) {
        const alertTitle = `🕸️ Family Discovery: ${discoveredCount} wallets found`;
        const alertMsg = `Family "${allstar.twitter_handle || seedWallet.slice(0, 8)}" expanded by ${discoveredCount} wallets (${count} total). Synced to reputation mesh + allstar registry.`;
        const alertMeta = {
          family_id: familyId, seed_wallet: seedWallet, allstar_id: allstar.id,
          discovered_count: discoveredCount, total_members: count, new_wallets: newWalletAddresses.slice(0, 10),
        };

        await supabase.from('admin_notifications').insert({
          notification_type: 'family_discovery', title: alertTitle, message: alertMsg, metadata: alertMeta,
        });

        // ═══ Telegram BlackBox Broadcast ═══
        const walletList = newWalletAddresses.slice(0, 5).map(w => `  └ \`${w.slice(0, 8)}…${w.slice(-4)}\``).join('\n');
        const tgMessage = [
          `🕸️ *FAMILY INTEL — New Wallets Discovered*`,
          ``,
          `👤 *Dev:* ${allstar.twitter_handle ? `@${allstar.twitter_handle}` : `\`${seedWallet.slice(0, 8)}…\``}`,
          `🏠 *Family:* \`${familyId.slice(0, 8)}\``,
          `📊 *New Wallets:* ${discoveredCount} | *Total Family:* ${count}`,
          ``,
          `🔗 *Discovered Wallets:*`,
          walletList,
          newWalletAddresses.length > 5 ? `  └ …and ${newWalletAddresses.length - 5} more` : '',
          ``,
          `✅ Auto-synced → Reputation Mesh + Allstar Registry`,
          `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`,
        ].filter(Boolean).join('\n');

        console.warn('[FamilyDiscovery] BLACKBOX Telegram muted — family intel alert logged only', { preview: tgMessage.slice(0, 200) });
      }

      totalFamiliesProcessed++;
      totalWalletsDiscovered += discoveredCount;
      console.log(`[FamilyDiscovery] Family ${familyId.slice(0,8)}: ${discoveredCount} discovered, ${count} total`);
    }

    const summary = { status: 'ok', familiesProcessed: totalFamiliesProcessed, walletsDiscovered: totalWalletsDiscovered, timestamp: new Date().toISOString() };
    console.log(`[FamilyDiscovery] Complete:`, summary);
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[FamilyDiscovery] Fatal error:', redactHeliusSecrets(String(err)));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));

