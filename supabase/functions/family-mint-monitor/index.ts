import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { getHeliusRpcUrl, redactHeliusSecrets } from '../_shared/helius-client.ts';
import { sendAdminSms } from '../_shared/sms-notify.ts';

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
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params }),
    });
    return (await res.json())?.result || [];
  } catch { return []; }
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

interface MintDetection {
  mintAddress: string; txSignature: string; eventType: string;
  launchpad?: string; timestamp?: string;
}

function detectMintEvents(tx: any, wallet: string): MintDetection[] {
  const detections: MintDetection[] = [];
  if (!tx?.transaction?.message?.instructions) return detections;
  const sig = tx.transaction.signatures?.[0] || '';
  const blockTime = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : undefined;
  const instructions = tx.transaction.message.instructions || [];
  const accountKeys = tx.transaction.message.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];

  for (const ix of instructions) {
    if (ix.parsed?.type === 'initializeMint' || ix.parsed?.type === 'initializeMint2') {
      detections.push({
        mintAddress: ix.parsed.info?.mint || '', txSignature: sig,
        eventType: accountKeys[0] === wallet ? 'DIRECT_DEV_MINT' : 'FAMILY_EARLY_ENTRY', timestamp: blockTime,
      });
    }
    if (ix.programId === PUMPFUN_PROGRAM) {
      const ixAccounts = ix.accounts || [];
      for (const acc of ixAccounts) {
        if (acc && acc !== wallet && acc !== PUMPFUN_PROGRAM && acc !== TOKEN_PROGRAM) {
          detections.push({ mintAddress: acc, txSignature: sig, eventType: 'PROBABLE_DEV_ASSOCIATED_MINT', launchpad: 'pump.fun', timestamp: blockTime });
          break;
        }
      }
    }
  }

  for (const inner of (tx.meta?.innerInstructions || [])) {
    for (const ix of (inner.instructions || [])) {
      if (ix.parsed?.type === 'initializeMint' || ix.parsed?.type === 'initializeMint2') {
        const mint = ix.parsed.info?.mint;
        if (mint && !detections.some(d => d.mintAddress === mint)) {
          detections.push({ mintAddress: mint, txSignature: sig, eventType: 'SIBLING_WALLET_MINT', timestamp: blockTime });
        }
      }
    }
  }
  return detections;
}

Deno.serve(withRunLog('family-mint-monitor', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const rpcUrl = getHeliusRpcUrl();

    const body = await req.json().catch(() => ({}));
    const targetPriority = body.priority || 'all';
    const batchSize = body.batchSize || 10;
    const now = new Date();

    let query = supabase
      .from('wallet_family_poll_queue')
      .select('*')
      .lte('next_poll_at', now.toISOString())
      .order('next_poll_at', { ascending: true })
      .limit(batchSize);

    if (targetPriority !== 'all') query = query.eq('priority', targetPriority);

    const { data: queue, error: qErr } = await query;
    if (qErr) throw qErr;
    if (!queue?.length) {
      return new Response(JSON.stringify({ status: 'ok', message: 'No wallets due', polled: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[FamilyMintMonitor] Polling ${queue.length} wallets (priority=${targetPriority})`);
    let totalMintsDetected = 0;

    // ═══ TIER 2: Check predictive burst mode flag ═══
    let predictiveBurstEnabled = false;
    let smsAlertsEnabled = false;
    try {
      const { data: burstFlag } = await supabase
        .from('intelligence_feature_flags')
        .select('enabled')
        .eq('feature_name', 'predictive_burst_mode')
        .single();
      predictiveBurstEnabled = burstFlag?.enabled ?? false;
    } catch { /* flag table may not exist yet */ }
    try {
      const { data: smsFlag } = await supabase
        .from('intelligence_feature_flags')
        .select('enabled')
        .eq('feature_name', 'allstar_mint_sms_alerts')
        .single();
      smsAlertsEnabled = smsFlag?.enabled ?? false;
    } catch { /* flag may not exist */ }

    for (const item of queue) {
      await sleep(DELAY_MS);
      const sigs = await fetchNewSignatures(rpcUrl, item.wallet_address, item.last_signature || undefined);

      const nextPoll = new Date(now.getTime() + item.poll_interval_sec * 1000);
      const inBurst = item.burst_mode_until && new Date(item.burst_mode_until) > now;
      const effectiveNext = inBurst ? new Date(now.getTime() + 60000) : nextPoll;

      if (!sigs.length) {
        await supabase.from('wallet_family_poll_queue').update({
          last_polled_at: now.toISOString(), next_poll_at: effectiveNext.toISOString(), last_result: 'no_new_sigs', fail_count: 0,
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

          const { data: existing } = await supabase
            .from('wallet_family_mint_events').select('id')
            .eq('mint_address', det.mintAddress).eq('family_id', item.family_id).maybeSingle();
          if (existing) continue;

          const confidence = det.eventType === 'DIRECT_DEV_MINT' ? 95 : det.eventType === 'PROBABLE_DEV_ASSOCIATED_MINT' ? 75 : 50;

          // Insert mint event
          await supabase.from('wallet_family_mint_events').insert({
            family_id: item.family_id, mint_address: det.mintAddress, detected_by_wallet: item.wallet_address,
            event_type: det.eventType, confidence, tx_signature: det.txSignature, launchpad: det.launchpad,
          });

          // Get family context
          const { data: familyData } = await supabase
            .from('wallet_families').select('allstar_id, seed_wallet, family_name')
            .eq('id', item.family_id).single();

          // ═══ CROSS-FEED: allstar_mint_alerts ═══
          if (familyData?.allstar_id) {
            await supabase.from('allstar_mint_alerts').insert({
              allstar_id: familyData.allstar_id, creator_wallet: familyData.seed_wallet,
              detecting_wallet: item.wallet_address, token_mint: det.mintAddress,
              launchpad: det.launchpad, alert_level: det.eventType === 'DIRECT_DEV_MINT' ? 'critical' : 'high',
              metadata: { source: 'family_mint_monitor', event_type: det.eventType },
            });

            // ═══ SMS hop: 1 per allstar dev per 6h, only if flag enabled ═══
            if (smsAlertsEnabled && familyData.seed_wallet) {
              try {
                const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString();
                const { data: throttle } = await supabase
                  .from('allstar_sms_throttle')
                  .select('last_sent_at, total_sent')
                  .eq('master_wallet', familyData.seed_wallet)
                  .maybeSingle();

                const recentlySent = throttle?.last_sent_at && throttle.last_sent_at > sixHoursAgo;
                if (!recentlySent) {
                  const smsBody = [
                    `🚨 ALLSTAR MINT`,
                    `Dev: ${(familyData.family_name || familyData.seed_wallet.slice(0,8))}`,
                    `New token: ${det.mintAddress.slice(0,8)}…${det.mintAddress.slice(-4)}`,
                    `Via: ${det.launchpad || 'unknown'} (${det.eventType})`,
                    `https://solscan.io/token/${det.mintAddress}`,
                  ].join('\n');
                  const sent = await sendAdminSms(smsBody);
                  if (sent) {
                    await supabase.from('allstar_sms_throttle').upsert({
                      master_wallet: familyData.seed_wallet,
                      last_sent_at: new Date().toISOString(),
                      total_sent: (throttle?.total_sent || 0) + 1,
                    });
                  }
                } else {
                  console.log(`[FamilyMintMonitor] SMS throttled for ${familyData.seed_wallet.slice(0,8)} (sent in last 6h)`);
                }
              } catch (smsErr) {
                console.warn('[FamilyMintMonitor] SMS hop failed (non-fatal):', smsErr);
              }
            }
          }

          // ═══ CROSS-FEED 2: Auto-add to pumpfun_watchlist (Master DB pipeline) ═══
          const { data: existingToken } = await supabase
            .from('pumpfun_watchlist').select('id').eq('token_mint', det.mintAddress).maybeSingle();

          if (!existingToken) {
            await supabase.from('pumpfun_watchlist').insert({
              token_mint: det.mintAddress, token_name: det.mintAddress.slice(0, 8),
              creator_wallet: item.wallet_address, status: 'pending_triage',
              first_seen_at: det.timestamp || now.toISOString(),
              detected_dev_pattern: `family_${det.eventType.toLowerCase()}`,
              metadata: {
                source: 'family_mint_monitor', family_id: item.family_id,
                family_name: familyData?.family_name, detection_confidence: confidence, launchpad: det.launchpad,
              },
            }).then(r => {
              if (!r.error) console.log(`[FamilyMintMonitor] ✅ Token ${det.mintAddress.slice(0,8)} auto-added to Master DB pipeline`);
            });

            // Feed token → reputation_mesh
            await supabase.from('reputation_mesh').upsert({
              source_id: item.wallet_address, source_type: 'wallet', linked_id: det.mintAddress, linked_type: 'token',
              relationship: 'created', confidence, discovered_via: 'family_mint_monitor',
              evidence: { event_type: det.eventType, tx_signature: det.txSignature, family_id: item.family_id, launchpad: det.launchpad },
            }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
          }

          // ═══ CROSS-FEED 5: Admin alert + TG Broadcast for mint ═══
          const mintAlertTitle = `🚨 Family Mint: ${det.eventType.replace(/_/g, ' ')}`;
          const mintAlertMsg = `Wallet ${item.wallet_address.slice(0,8)}... from family "${familyData?.family_name || 'Unknown'}" minted ${det.mintAddress.slice(0,8)}... via ${det.launchpad || 'unknown'}. Auto-added to Master DB. Burst mode activated.`;
          const mintAlertMeta = {
            mint_address: det.mintAddress, detecting_wallet: item.wallet_address,
            family_id: item.family_id, family_name: familyData?.family_name,
            event_type: det.eventType, confidence, launchpad: det.launchpad, tx_signature: det.txSignature,
          };

          await supabase.from('admin_notifications').insert({
            notification_type: 'family_mint_detected', title: mintAlertTitle, message: mintAlertMsg, metadata: mintAlertMeta,
          });

          // ═══ Telegram BlackBox Broadcast ═══
          const eventLabel = det.eventType.replace(/_/g, ' ').toLowerCase();
          const confidenceEmoji = confidence >= 90 ? '🔴' : confidence >= 70 ? '🟠' : '🟡';
          const tgMintMessage = [
            `🚨 *FAMILY MINT ALERT — ${eventLabel.toUpperCase()}*`,
            ``,
            `🪙 *Token:* \`${det.mintAddress}\``,
            `👛 *Detecting Wallet:* \`${item.wallet_address.slice(0, 8)}…${item.wallet_address.slice(-4)}\``,
            `🏠 *Family:* ${familyData?.family_name || 'Unknown'} (\`${item.family_id.slice(0, 8)}\`)`,
            `🌐 *Launchpad:* ${det.launchpad || 'Unknown'}`,
            `${confidenceEmoji} *Confidence:* ${confidence}%`,
            `📋 *Event:* ${eventLabel}`,
            ``,
            `🔗 *TX:* \`${det.txSignature.slice(0, 20)}…\``,
            ``,
            `✅ Auto-added to Master DB pipeline (\`pending_triage\`)`,
            `⚡ Burst mode active — all family wallets polling every 60s for 10min`,
            `⏰ ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`,
          ].join('\n');

          try {
            const { data: tgTargets } = await supabase
              .from('telegram_message_targets').select('id, chat_id, label, resolved_name').eq('label', 'BLACKBOX');
            for (const target of (tgTargets || [])) {
              await supabase.functions.invoke('telegram-mtproto-auth', {
                body: { action: 'send_message', chatId: Number(target.chat_id), message: tgMintMessage },
              });
              await supabase.from('telegram_message_targets').update({ last_used_at: new Date().toISOString() }).eq('id', target.id);
            }
          } catch (tgErr) {
            console.warn('[FamilyMintMonitor] TG broadcast failed:', tgErr);
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
        last_signature: newestSig || item.last_signature, burst_mode_until: burstUntil, fail_count: 0,
      }).eq('id', item.id);

      // Burst mode for all family members on mint detection
      if (mintsFound > 0) {
        await supabase.from('wallet_family_poll_queue').update({
          burst_mode_until: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
          next_poll_at: new Date(now.getTime() + 60000).toISOString(),
        }).eq('family_id', item.family_id);
      }

      // ═══ TIER 2: Predictive Burst Mode — detect SOL inflows as pre-mint signal ═══
      if (predictiveBurstEnabled && !mintsFound && sigs.length > 0) {
        try {
          for (const sigInfo of sigs.slice(0, 5)) {
            const tx = await fetchTransaction(rpcUrl, sigInfo.signature);
            if (!tx?.meta?.preBalances || !tx?.meta?.postBalances) continue;
            const accountKeys = tx.transaction?.message?.accountKeys?.map((k: any) => typeof k === 'string' ? k : k.pubkey) || [];
            const walletIdx = accountKeys.indexOf(item.wallet_address);
            if (walletIdx === -1) continue;
            const preBal = (tx.meta.preBalances[walletIdx] || 0) / 1e9;
            const postBal = (tx.meta.postBalances[walletIdx] || 0) / 1e9;
            const inflow = postBal - preBal;
            if (inflow >= 0.5) {
              console.log(`[FamilyMintMonitor] ⚡ PREDICTIVE: ${item.wallet_address.slice(0,8)} received ${inflow.toFixed(2)} SOL — activating burst mode`);
              await supabase.from('wallet_family_poll_queue').update({
                burst_mode_until: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
                next_poll_at: new Date(now.getTime() + 60000).toISOString(),
              }).eq('family_id', item.family_id);
              await supabase.from('admin_notifications').insert({
                notification_type: 'predictive_burst_triggered',
                title: '⚡ Predictive Burst: SOL Inflow Detected',
                message: `Wallet ${item.wallet_address.slice(0,8)}... received ${inflow.toFixed(2)} SOL. Burst mode activated for family.`,
                metadata: { wallet: item.wallet_address, inflow_sol: inflow, family_id: item.family_id },
              });
              break;
            }
          }
        } catch (predErr) {
          console.warn('[FamilyMintMonitor] Predictive burst check failed:', predErr);
        }
      }

      // Backoff for dormant wallets
      if (!mintsFound && !inBurst) {
        const member = await supabase.from('wallet_family_members')
          .select('last_activity_at').eq('wallet_address', item.wallet_address).eq('family_id', item.family_id).maybeSingle();
        if (member.data?.last_activity_at) {
          const daysSince = (now.getTime() - new Date(member.data.last_activity_at).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSince > 7) {
            await supabase.from('wallet_family_poll_queue').update({ priority: 'P4', poll_interval_sec: 3600 }).eq('id', item.id);
            await supabase.from('wallet_family_members').update({ status: 'dormant' }).eq('wallet_address', item.wallet_address).eq('family_id', item.family_id);
          }
        }
      }
    }

    const summary = { status: 'ok', walletsPolled: queue.length, mintsDetected: totalMintsDetected, priority: targetPriority, timestamp: now.toISOString() };
    console.log(`[FamilyMintMonitor] Complete:`, summary);
    return new Response(JSON.stringify(summary), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('[FamilyMintMonitor] Fatal error:', redactHeliusSecrets(String(err)));
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));

