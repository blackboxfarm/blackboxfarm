import { createClient } from 'npm:@supabase/supabase-js@2';
import { getHeliusRpcUrl, redactHeliusSecrets } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const DELAY_MS = 300;

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function fetchNewSignatures(rpcUrl: string, wallet: string, lastSig?: string): Promise<any[]> {
  try {
    const params: any = [wallet, { limit: 25 }];
    if (lastSig) params[1].until = lastSig;
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params }),
    });
    const data = await res.json();
    return data?.result || [];
  } catch { return []; }
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
  } catch { return null; }
}

interface MintDetection {
  mintAddress: string;
  txSignature: string;
  eventType: string;
  launchpad?: string;
  timestamp?: string;
}

function detectMintEvents(tx: any, wallet: string): MintDetection[] {
  const detections: MintDetection[] = [];
  if (!tx?.transaction?.message?.instructions) return detections;

  const sig = tx.transaction.signatures?.[0] || '';
  const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined;
  const instructions = tx.transaction.message.instructions || [];
  const accountKeys = tx.transaction.message.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];

  for (const ix of instructions) {
    // Direct initializeMint
    if (ix.parsed?.type === 'initializeMint' || ix.parsed?.type === 'initializeMint2') {
      detections.push({
        mintAddress: ix.parsed.info?.mint || '',
        txSignature: sig,
        eventType: accountKeys[0] === wallet ? 'DIRECT_DEV_MINT' : 'FAMILY_EARLY_ENTRY',
        timestamp: blockTime,
      });
    }

    // Pump.fun launch program interaction
    if (ix.programId === PUMPFUN_PROGRAM) {
      // Look for new mint in the accounts
      const ixAccounts = ix.accounts || [];
      for (const acc of ixAccounts) {
        if (acc && acc !== wallet && acc !== PUMPFUN_PROGRAM && acc !== TOKEN_PROGRAM) {
          detections.push({
            mintAddress: acc,
            txSignature: sig,
            eventType: 'PROBABLE_DEV_ASSOCIATED_MINT',
            launchpad: 'pump.fun',
            timestamp: blockTime,
          });
          break; // Only first candidate
        }
      }
    }
  }

  // Also check inner instructions for token mint patterns
  const innerInstructions = tx.meta?.innerInstructions || [];
  for (const inner of innerInstructions) {
    for (const ix of (inner.instructions || [])) {
      if (ix.parsed?.type === 'initializeMint' || ix.parsed?.type === 'initializeMint2') {
        const mint = ix.parsed.info?.mint;
        if (mint && !detections.some(d => d.mintAddress === mint)) {
          detections.push({
            mintAddress: mint,
            txSignature: sig,
            eventType: 'SIBLING_WALLET_MINT',
            timestamp: blockTime,
          });
        }
      }
    }
  }

  return detections;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const rpcUrl = getHeliusRpcUrl();

    const body = await req.json().catch(() => ({}));
    const targetPriority = body.priority || 'all'; // 'P1', 'P2', 'all'
    const batchSize = body.batchSize || 10;

    const now = new Date();

    // Get wallets due for polling
    let query = supabase
      .from('wallet_family_poll_queue')
      .select('*, wallet_family_members!inner(family_id, label, tier)')
      .lte('next_poll_at', now.toISOString())
      .order('next_poll_at', { ascending: true })
      .limit(batchSize);

    if (targetPriority !== 'all') {
      query = query.eq('priority', targetPriority);
    }

    const { data: queue, error: qErr } = await query;
    if (qErr) throw qErr;

    if (!queue?.length) {
      return new Response(JSON.stringify({ status: 'ok', message: 'No wallets due for polling', polled: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[FamilyMintMonitor] Polling ${queue.length} wallets (priority=${targetPriority})`);

    let totalMintsDetected = 0;

    for (const item of queue) {
      await sleep(DELAY_MS);

      const sigs = await fetchNewSignatures(rpcUrl, item.wallet_address, item.last_signature || undefined);
      
      // Update poll tracking
      const nextPoll = new Date(now.getTime() + item.poll_interval_sec * 1000);
      
      // Check burst mode
      const inBurst = item.burst_mode_until && new Date(item.burst_mode_until) > now;
      const effectiveNext = inBurst ? new Date(now.getTime() + 60000) : nextPoll;

      if (!sigs.length) {
        await supabase.from('wallet_family_poll_queue').update({
          last_polled_at: now.toISOString(),
          next_poll_at: effectiveNext.toISOString(),
          last_result: 'no_new_sigs',
          fail_count: 0,
        }).eq('id', item.id);
        continue;
      }

      let mintsFound = 0;
      const newestSig = sigs[0]?.signature;

      for (const sigInfo of sigs.slice(0, 10)) {
        await sleep(DELAY_MS);
        const tx = await fetchTransaction(rpcUrl, sigInfo.signature);
        if (!tx) continue;

        const detections = detectMintEvents(tx, item.wallet_address);
        for (const det of detections) {
          if (!det.mintAddress) continue;

          // Check if already recorded
          const { data: existing } = await supabase
            .from('wallet_family_mint_events')
            .select('id')
            .eq('mint_address', det.mintAddress)
            .eq('family_id', item.family_id)
            .single();

          if (existing) continue;

          // Insert mint event
          await supabase.from('wallet_family_mint_events').insert({
            family_id: item.family_id,
            mint_address: det.mintAddress,
            detected_by_wallet: item.wallet_address,
            event_type: det.eventType,
            confidence: det.eventType === 'DIRECT_DEV_MINT' ? 95 : det.eventType === 'PROBABLE_DEV_ASSOCIATED_MINT' ? 75 : 50,
            tx_signature: det.txSignature,
            launchpad: det.launchpad,
          });

          // Cross-post to allstar_mint_alerts
          const { data: familyData } = await supabase
            .from('wallet_families')
            .select('allstar_id, seed_wallet')
            .eq('id', item.family_id)
            .single();

          if (familyData?.allstar_id) {
            await supabase.from('allstar_mint_alerts').insert({
              allstar_id: familyData.allstar_id,
              creator_wallet: familyData.seed_wallet,
              detecting_wallet: item.wallet_address,
              token_mint: det.mintAddress,
              launchpad: det.launchpad,
              alert_level: det.eventType === 'DIRECT_DEV_MINT' ? 'critical' : 'high',
              metadata: { source: 'family_mint_monitor', event_type: det.eventType },
            });
          }

          mintsFound++;
          totalMintsDetected++;
          console.log(`[FamilyMintMonitor] 🚨 MINT DETECTED: ${det.mintAddress.slice(0,8)} by ${item.wallet_address.slice(0,8)} (${det.eventType})`);
        }
      }

      // Update poll queue
      const burstUntil = mintsFound > 0 ? new Date(now.getTime() + 10 * 60 * 1000).toISOString() : item.burst_mode_until;
      await supabase.from('wallet_family_poll_queue').update({
        last_polled_at: now.toISOString(),
        next_poll_at: mintsFound > 0 ? new Date(now.getTime() + 60000).toISOString() : effectiveNext.toISOString(),
        last_result: mintsFound > 0 ? `${mintsFound}_mints_detected` : 'scanned_clean',
        last_signature: newestSig || item.last_signature,
        burst_mode_until: burstUntil,
        fail_count: 0,
      }).eq('id', item.id);

      // If mint found, trigger burst mode for all family members
      if (mintsFound > 0) {
        await supabase.from('wallet_family_poll_queue')
          .update({
            burst_mode_until: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
            next_poll_at: new Date(now.getTime() + 60000).toISOString(),
          })
          .eq('family_id', item.family_id);

        // Update family mint count
        await supabase.rpc('increment_family_mints', { p_family_id: item.family_id, p_count: mintsFound }).catch(() => {
          // Fallback if RPC doesn't exist
          supabase.from('wallet_families').update({
            total_mints_detected: (item.total_mints_detected || 0) + mintsFound,
            updated_at: now.toISOString(),
          }).eq('id', item.family_id);
        });
      }

      // Backoff: check if wallet has been dormant
      if (!mintsFound && !inBurst) {
        const member = await supabase
          .from('wallet_family_members')
          .select('last_activity_at')
          .eq('wallet_address', item.wallet_address)
          .eq('family_id', item.family_id)
          .single();

        if (member.data?.last_activity_at) {
          const lastActivity = new Date(member.data.last_activity_at);
          const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceActivity > 7) {
            await supabase.from('wallet_family_poll_queue').update({
              priority: 'P4',
              poll_interval_sec: 3600,
            }).eq('id', item.id);

            await supabase.from('wallet_family_members').update({
              status: 'dormant',
            }).eq('wallet_address', item.wallet_address).eq('family_id', item.family_id);
          }
        }
      }
    }

    const summary = {
      status: 'ok',
      walletsPolled: queue.length,
      mintsDetected: totalMintsDetected,
      priority: targetPriority,
      timestamp: now.toISOString(),
    };
    console.log(`[FamilyMintMonitor] Complete:`, summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[FamilyMintMonitor] Fatal error:', redactHeliusSecrets(String(err)));
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
