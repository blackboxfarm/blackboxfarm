import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BackfillRequest {
  wallet_address: string
  hours?: number
  limit?: number
}

// Global caches
const tokenMetaCache = new Map() // mint -> {name, symbol}
let cachedSolPriceUsd: number | null = null

async function fetchJsonWithRetry(url: string, opts = {}, attempts = 5) {
  let delay = 250;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { ...opts });
    if (res.ok) return res.json();

    const body = await res.text().catch(() => "");
    const retriable = res.status === 429 || res.status >= 500;
    if (!retriable) throw new Error(`Helius ${res.status}: ${body}`);

    await new Promise(r => setTimeout(r, delay + Math.floor(Math.random() * 200)));
    delay = Math.min(2500, delay * 2);
  }
  throw new Error(`Helius retry exhausted: ${url}`);
}

async function getSolPriceUSD(heliusApiKey: string) {
  if (cachedSolPriceUsd != null) return cachedSolPriceUsd;
  try {
    const res = await fetch(`https://api.helius.xyz/v0/tokens/metadata?api-key=${heliusApiKey}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ mintAccounts: ['So11111111111111111111111111111111111111112'] })
    }).then(r => r.json());
    cachedSolPriceUsd = res?.[0]?.price ?? null;
  } catch {}
  return cachedSolPriceUsd;
}

async function getTokenMeta(mint: string, supabase: any) {
  if (tokenMetaCache.has(mint)) return tokenMetaCache.get(mint);
  const { data } = await supabase.from('token_metadata')
    .select('name, symbol')
    .eq('mint_address', mint)
    .single();
  const meta = data ?? {};
  tokenMetaCache.set(mint, meta);
  return meta;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { wallet_address, hours, limit }: BackfillRequest = await req.json()

    // Resolve the caller so we attach inserts to THEIR monitored_wallet
    const authHeader = req.headers.get('Authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined

    let userId: string | null = null
    if (token) {
      const { data: ud, error: ue } = await supabase.auth.getUser(token)
      if (!ue && ud?.user?.id) userId = ud.user.id
    }

    const fallbackPreviewUserId = Deno.env.get('PREVIEW_SUPER_ADMIN_USER_ID') || '00000000-0000-0000-0000-000000000001'
    const targetUserId = userId || fallbackPreviewUserId

    console.log(`Starting backfill for wallet ${wallet_address} for last ${hours} hours`)

    const transactions = await getWalletTransactions(wallet_address, heliusApiKey, hours, limit)
    console.log(`Found ${transactions.length} transactions to analyze`)

    // Process each transaction
    const processedTransactions = []
    const totalTransactions = transactions.length
    for (const txData of transactions) {
      try {
        const results = await processTransaction(txData, wallet_address, supabase, targetUserId)
        if (Array.isArray(results) && results.length) {
          processedTransactions.push(...results)
        }
      } catch (error) {
        console.error(`Error processing transaction ${txData.signature}:`, error)
      }
    }

    // Trigger copy-trades once (or in small batches)
    const monitoredTransactions = processedTransactions.filter(tx => tx.isMonitored)
    if (monitoredTransactions.length) {
      try {
        await triggerCopyTrades(monitoredTransactions, supabase)
      } catch (e) {
        console.error('Batch copy-trade trigger failed:', e)
      }
    }

    console.log(`Successfully processed ${processedTransactions.length} transactions`)

    const errorCount = totalTransactions - processedTransactions.length
    
    return new Response(JSON.stringify({
      success: true,
      wallet_address,
      hours_backfilled: hours,
      transactions_found: transactions.length,
      transactions_processed: processedTransactions.length,
      error_count: errorCount,
      copy_trades_triggered: monitoredTransactions.length,
      monitored_wallet: monitoredTransactions.length > 0,
      message: transactions.length > 0 
        ? `Found ${transactions.length} transactions, processed ${processedTransactions.length} swaps${errorCount > 0 ? ` (${errorCount} parsing errors)` : ''}${monitoredTransactions.length > 0 ? `, triggered ${monitoredTransactions.length} copy trades` : ''}.`
        : 'No transactions found in the specified time period.',
      // Visibility into fetched txs even if not parsed as swaps
      raw_signatures: transactions.map((t: any) => t.signature),
      tx_debug_sample: transactions.slice(-Math.min(10, transactions.length)).map((t: any) => {
        const tts = Array.isArray(t.tokenTransfers) ? t.tokenTransfers : [];
        const by: Record<string, { inRaw: number; outRaw: number; decimals?: number }> = {};
        const getRaw = (x: any) => {
          const v = x?.rawTokenAmount?.tokenAmount ?? x?.tokenAmount ?? x?.amount ?? x?.uiTokenAmount?.amount ?? 0
          return typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : 0)
        }
        for (const tr of tts) {
          const mint = tr.mint || tr.tokenMint;
          if (!mint) continue;
          if (!by[mint]) by[mint] = { inRaw: 0, outRaw: 0, decimals: tr?.rawTokenAmount?.decimals ?? tr?.decimals };
          const raw = getRaw(tr);
          if ((tr.toUserAccount && tr.toUserAccount === wallet_address) || (tr.destinationUserAccount && tr.destinationUserAccount === wallet_address)) by[mint].inRaw += raw;
          if ((tr.fromUserAccount && tr.fromUserAccount === wallet_address) || (tr.sourceUserAccount && tr.sourceUserAccount === wallet_address)) by[mint].outRaw += raw;
          if (by[mint].decimals == null) by[mint].decimals = tr?.rawTokenAmount?.decimals ?? tr?.decimals;
        }
        const token_mints = Object.entries(by).map(([mint, v]) => ({ mint, inRaw: v.inRaw, outRaw: v.outRaw, netRaw: v.inRaw - v.outRaw, decimals: v.decimals }));
        return {
          signature: t.signature,
          has_swap_event: !!t.events?.swap,
          native_transfers: Array.isArray(t.nativeTransfers) ? t.nativeTransfers.length : 0,
          token_transfers: tts.length,
          token_mints,
          timestamp: t.timestamp,
        };
      }),
      transactions_sample: processedTransactions.slice(-Math.min(50, processedTransactions.length)).map((tx: any) => ({
        signature: tx.signature,
        transaction_type: tx.transaction_type,
        token_mint: tx.token_mint,
        token_symbol: tx.token_symbol,
        amount_sol: tx.amount_sol,
        amount_usd: tx.amount_usd,
        timestamp: tx.timestamp,
      }))
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Backfill error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      hint: 'Check HELIUS_API_KEY validity, wallet address, and function logs.'
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function deriveSwapFromTransfers(txData: any, walletAddress: string) {
  try {
    const SOL_MINT = 'So11111111111111111111111111111111111111112'
    const TARGET_TOKEN = '6SVBPAHNQQm4aGMemgMv2WEFTCaXCSqxCyoMucYspump'
    
    const native = Array.isArray(txData.nativeTransfers) ? txData.nativeTransfers : []
    const tokenTransfers = Array.isArray(txData.tokenTransfers) ? txData.tokenTransfers : []

    console.log(`  deriveSwapFromTransfers: ${native.length} native transfers, ${tokenTransfers.length} token transfers`);

    const getLamports = (t: any) => (typeof t.amount === 'number' ? t.amount : (typeof t.lamports === 'number' ? t.lamports : 0))

    const solInNative = native.filter((n: any) => n.toUserAccount === walletAddress).reduce((a: number, n: any) => a + getLamports(n), 0)
    const solOutNative = native.filter((n: any) => n.fromUserAccount === walletAddress).reduce((a: number, n: any) => a + getLamports(n), 0)

    // Track WSOL (SOL_MINT) flows that represent wrapped SOL moving as SPL tokens
    let solInWSOL = 0, solOutWSOL = 0;

    // Group token transfers by mint
    const byMint: Record<string, { inRaw: number; outRaw: number; decimals?: number }> = {}
    const getRaw = (t: any) => {
      const v = t?.rawTokenAmount?.tokenAmount ?? t?.tokenAmount ?? t?.amount ?? t?.uiTokenAmount?.amount ?? 0
      return typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : 0)
    }

    for (const t of tokenTransfers) {
      const mint = t.mint || t.tokenMint
      if (!mint) continue
      const raw = getRaw(t)
      // Capture WSOL flows separately to augment SOL totals
      if (mint === SOL_MINT) {
        if ((t.toUserAccount && t.toUserAccount === walletAddress) || (t.destinationUserAccount && t.destinationUserAccount === walletAddress)) {
          solInWSOL += raw
        }
        if ((t.fromUserAccount && t.fromUserAccount === walletAddress) || (t.sourceUserAccount && t.sourceUserAccount === walletAddress)) {
          solOutWSOL += raw
        }
        continue
      }
      if (!byMint[mint]) byMint[mint] = { inRaw: 0, outRaw: 0, decimals: t?.rawTokenAmount?.decimals ?? t?.decimals }
      if ((t.toUserAccount && t.toUserAccount === walletAddress) || (t.destinationUserAccount && t.destinationUserAccount === walletAddress)) {
        byMint[mint].inRaw += raw
      }
      if ((t.fromUserAccount && t.fromUserAccount === walletAddress) || (t.sourceUserAccount && t.sourceUserAccount === walletAddress)) {
        byMint[mint].outRaw += raw
      }
      if (byMint[mint].decimals == null) byMint[mint].decimals = t?.rawTokenAmount?.decimals ?? t?.decimals
    }

    // Combine native SOL and WSOL token flows
    const solIn = solInNative + solInWSOL
    const solOut = solOutNative + solOutWSOL

    console.log(`  SOL flows (native+WSOL): in=${solIn}, out=${solOut}`);

    console.log(`  Token flows by mint:`, Object.keys(byMint).map(mint => `${mint.slice(0,8)}...: net=${(byMint[mint].inRaw - byMint[mint].outRaw).toFixed(2)}`).join(', '));

    // Prioritize target token if present, otherwise choose the dominant mint by absolute net flow
    let chosenMint: string | null = null
    let netRaw = 0
    let decimals = 9
    
    // First check if target token is involved
    if (byMint[TARGET_TOKEN]) {
      const targetNet = byMint[TARGET_TOKEN].inRaw - byMint[TARGET_TOKEN].outRaw
      if (Math.abs(targetNet) > 0) {
        chosenMint = TARGET_TOKEN
        netRaw = targetNet
        decimals = byMint[TARGET_TOKEN].decimals ?? 6
        console.log(`  Found target token ${TARGET_TOKEN} with net flow: ${targetNet}`)
      }
    }
    
    // If no target token, find the most significant token flow
    if (!chosenMint) {
      for (const mint in byMint) {
        const net = byMint[mint].inRaw - byMint[mint].outRaw
        if (Math.abs(net) > Math.abs(netRaw)) {
          chosenMint = mint
          netRaw = net
          decimals = byMint[mint].decimals ?? 9
        }
      }
    }

    if (!chosenMint || netRaw === 0) {
      console.log(`  No valid mint found or zero net flow`);
      return null;
    }

    // More lenient detection - if we have token movement, assume it's a swap
    let isBuy = false
    let isSell = false
    
    if (netRaw > 0) {
      // Gained tokens = BUY
      isBuy = true
    } else if (netRaw < 0) {
      // Lost tokens = SELL  
      isSell = true
    }
    
    // If we have the target token and any SOL movement, force detection
    if (chosenMint === TARGET_TOKEN && (solIn > 0 || solOut > 0)) {
      if (netRaw > 0 && !isBuy) {
        isBuy = true
        console.log(`  Forced BUY detection for target token`)
      } else if (netRaw < 0 && !isSell) {
        isSell = true
        console.log(`  Forced SELL detection for target token`)
      }
    }

    if (!isBuy && !isSell) {
      console.log(`  No clear buy/sell pattern: solOut=${solOut}, solIn=${solIn}, netRaw=${netRaw}`);
      return null;
    }

    // Use available SOL flow, or estimate if unclear
    let amountSolLamports = 0
    if (isBuy) {
      amountSolLamports = solOut > 0 ? solOut : (solIn > 0 ? solIn : Math.abs(netRaw) / 1000) // rough estimate
    } else {
      amountSolLamports = solIn > 0 ? solIn : (solOut > 0 ? solOut : Math.abs(netRaw) / 1000) // rough estimate
    }
    
    const tokenAmountRaw = Math.abs(netRaw)

    // Build a swap-like event structure compatible with downstream logic
    const event = isBuy
      ? {
          tokenInputs: [{ mint: SOL_MINT, rawTokenAmount: { tokenAmount: String(amountSolLamports), decimals: 9 } }],
          tokenOutputs: [{ mint: chosenMint, rawTokenAmount: { tokenAmount: String(tokenAmountRaw), decimals } }],
        }
      : {
          tokenInputs: [{ mint: chosenMint, rawTokenAmount: { tokenAmount: String(tokenAmountRaw), decimals } }],
          tokenOutputs: [{ mint: SOL_MINT, rawTokenAmount: { tokenAmount: String(amountSolLamports), decimals: 9 } }],
        }

    console.log(`Derived ${isBuy ? 'BUY' : 'SELL'} from transfers for ${txData.signature}: SOL=${amountSolLamports} lamports, token=${chosenMint.slice(0,8)}... raw=${tokenAmountRaw}`)
    return { isBuy, isSell, tokenMint: chosenMint, amountSolLamports, tokenAmountRaw, event }
  } catch (error) {
    console.error('deriveSwapFromTransfers error:', error)
    return null
  }
}

// Fetch enhanced transaction details from Helius for a specific signature
async function hydrateTransaction(signature: string, heliusApiKey: string) {
  try {
    const url = `https://api.helius.xyz/v0/transactions?api-key=${heliusApiKey}`
    const data = await fetchJsonWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [signature] })
    })
    if (Array.isArray(data) && data.length > 0) return data[0]
  } catch (e) {
    console.error('hydrateTransaction error:', e)
  }
  return null
}

async function getWalletTransactions(address: string, heliusApiKey: string, hours?: number, limit?: number) {
  const endTime = new Date();
  const startTime = typeof hours === 'number' && hours > 0
    ? new Date(endTime.getTime() - hours * 60 * 60 * 1000)
    : null;

  const seen = new Set();
  const results: any[] = [];
  let before: string | null = null;

  let remaining: number | null = (typeof limit === 'number' && limit > 0) ? Math.max(limit, 500) : 500;

  while (true) {
    const pageLimit = remaining != null ? Math.min(100, remaining) : 100;
    const params = new URLSearchParams({ 'api-key': heliusApiKey, limit: String(pageLimit) });
    if (before) params.set('before', before);

    const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?${params.toString()}`;
    const data = await fetchJsonWithRetry(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });

    if (!Array.isArray(data) || data.length === 0) break;

    let added = 0;
    for (const tx of data) {
      if (seen.has(tx.signature)) continue;
      if (startTime) {
        const ts = new Date(tx.timestamp * 1000);
        if (ts < startTime || ts > endTime) continue;
      }
      results.push(tx);
      seen.add(tx.signature);
      added++;
      if (remaining != null) {
        remaining--;
        if (remaining <= 0) break;
      }
    }

    if (remaining != null && remaining <= 0) break;

    const oldest = data[data.length - 1];
    if (!oldest?.timestamp) break;
    const oldestTime = new Date(oldest.timestamp * 1000);

    if (startTime && oldestTime < startTime) break;

    const nextBefore = oldest.signature;
    if (!nextBefore || nextBefore === before) break;
    before = nextBefore;

    console.log(`Fetched page with ${data.length} txs, added ${added}, oldest: ${oldestTime.toISOString()}`);
  }

  results.sort((a, b) => a.timestamp - b.timestamp);
  return results;
}

// returns ARRAY of processed trades (could be empty)
async function processTransaction(txData: any, walletAddress: string, supabase: any, targetUserId: string) {
  const signature = txData.signature;
  const timestamp = new Date(txData.timestamp * 1000).toISOString();

  console.log(`Processing tx ${signature}: has events.swap=${!!txData.events?.swap}, nativeTransfers=${txData.nativeTransfers?.length || 0}, tokenTransfers=${txData.tokenTransfers?.length || 0}`);

  // normalize swap events; derive if missing
  let swaps = txData.events?.swap;
  if (!swaps) {
    console.log(`No swap events found for ${signature}, attempting to derive from transfers...`);
    const derived = deriveSwapFromTransfers(txData, walletAddress);
    if (derived?.event) {
      swaps = [derived.event];
      console.log(`Successfully derived swap for ${signature}: ${derived.isBuy ? 'BUY' : 'SELL'}`);
    } else {
      console.log(`Failed to derive swap from transfers for ${signature}`);
    }
  }
  // Hydration fallback: fetch enhanced tx if still no swaps
  if (!swaps) {
    try {
      console.log(`Hydrating ${signature} via Helius /v0/transactions...`);
      const heliusApiKeyLocal = Deno.env.get('HELIUS_API_KEY')!;
      const hydrated = await hydrateTransaction(signature, heliusApiKeyLocal);
      if (hydrated) {
        // Try events.swap from hydrated
        swaps = hydrated.events?.swap;
        if (!swaps) {
          const derived2 = deriveSwapFromTransfers(hydrated, walletAddress);
          if (derived2?.event) {
            swaps = [derived2.event];
            console.log(`Derived swap after hydration for ${signature}: ${derived2.isBuy ? 'BUY' : 'SELL'}`);
          } else {
            console.log(`Hydration still no swap derivation for ${signature}`);
          }
        } else {
          console.log(`Found swap event after hydration for ${signature}`);
        }
      } else {
        console.log(`Hydration returned no data for ${signature}`);
      }
    } catch (e) {
      console.error('Hydration fallback error:', e);
    }
  }
  if (!swaps) {
    console.log(`No swaps found for ${signature}, skipping`);
    return [];
  }

  const events = Array.isArray(swaps) ? swaps : [swaps];
  if (events.length === 0) return [];

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const isSol = (m: string) => m === SOL_MINT;

  const processed = [];
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!;
  const solPriceUsd = await getSolPriceUSD(heliusApiKey);

  for (const swapEvent of events) {
    const inArr  = Array.isArray(swapEvent.tokenInputs)  ? swapEvent.tokenInputs  : (swapEvent.tokenInputs  ? [swapEvent.tokenInputs]  : []);
    const outArr = Array.isArray(swapEvent.tokenOutputs) ? swapEvent.tokenOutputs : (swapEvent.tokenOutputs ? [swapEvent.tokenOutputs] : []);
    if (inArr.length === 0 && outArr.length === 0) continue;

    const isBuy  = inArr.some((x: any) => isSol(x.mint));
    const isSell = outArr.some((x: any) => isSol(x.mint));
    if (!isBuy && !isSell) continue;

    const nonSolOut = outArr.find((x: any) => !isSol(x.mint));
    const nonSolIn  = inArr.find((x: any) => !isSol(x.mint));
    const tokenMint = isBuy ? nonSolOut?.mint : nonSolIn?.mint;
    if (!tokenMint) continue;

    const solLeg = (isBuy ? inArr : outArr).find((x: any) => isSol(x.mint));
    const tokLeg = (isBuy ? outArr : inArr).find((x: any) => !isSol(x.mint));

    const solLamportsStr = solLeg?.rawTokenAmount?.tokenAmount ?? '0';
    const tokenRawStr    = tokLeg?.rawTokenAmount?.tokenAmount ?? '0';
    const solLamports = Number(solLamportsStr);
    const tokenRaw    = Number(tokenRawStr);

    const meta = await getTokenMeta(tokenMint, supabase);

    // position update
    await updateWalletPosition(tokenMint, walletAddress, tokenRawStr, isBuy, supabase);

    // pull balance to decide "new_buy / add_buy / sell"
    const { data: position } = await supabase.from('wallet_positions')
      .select('balance, first_purchase_at')
      .eq('wallet_address', walletAddress)
      .eq('token_mint', tokenMint)
      .single();

    const isFirstPurchase = isBuy && (!position || Number(position.balance) === 0);
    const amountSol = solLamports / 1e9;
    const amountUsd = solPriceUsd ? amountSol * solPriceUsd : null;

    const platform = detectPlatform(signature); // still your placeholder

    processed.push({
      monitored_wallet_id: null,
      signature,
      transaction_type: isBuy ? 'buy' : 'sell',
      token_mint: tokenMint,
      token_symbol: meta?.symbol,
      token_name: meta?.name,
      amount_sol: amountSol,
      amount_usd: amountUsd ?? undefined,
      is_first_purchase: isFirstPurchase,
      meets_criteria: true,
      timestamp,
      platform
    });
  }

  // Insert all (if monitored)
  const { data: monitoredWallet } = await supabase
    .from('monitored_wallets').select('id')
    .eq('wallet_address', walletAddress).eq('is_active', true).eq('user_id', targetUserId).single();

  if (monitoredWallet && processed.length) {
    for (const row of processed) row.monitored_wallet_id = monitoredWallet.id;
    const { error } = await supabase.from('wallet_transactions').insert(processed);
    if (error) console.error('Error inserting transactions:', error);
  }

  // decorate with flags for the response
  return processed.map(p => ({
    ...p,
    trade_type: p.transaction_type === 'sell' ? 'sell' : (p.is_first_purchase ? 'new_buy' : 'add_buy'),
    wallet_address: walletAddress,
    isMonitored: !!monitoredWallet
  }));
}

async function updateWalletPosition(tokenMint: string, walletAddress: string, tokenAmount: string, isBuy: boolean, supabase: any) {
  const amount = parseFloat(tokenAmount) / 1e9 // Convert from raw amount

  await supabase.rpc('upsert_wallet_position', {
    p_wallet_address: walletAddress,
    p_token_mint: tokenMint,
    p_balance_change: isBuy ? amount : -amount,
    p_is_first_purchase: isBuy
  })
}

function detectPlatform(signature: string): string {
  // Placeholder - could analyze transaction to detect DEX
  return 'unknown'
}

async function triggerCopyTrades(transactions: any[], supabase: any) {
  try {
    for (const tx of transactions) {
      const { error } = await supabase.functions.invoke('execute-copy-trade', {
        body: tx
      })
      
      if (error) {
        console.error('Error triggering copy trade:', error)
      } else {
        console.log('Copy trade triggered successfully for transaction:', tx.signature)
      }
    }
  } catch (error) {
    console.error('Error in triggerCopyTrades:', error)
  }
}