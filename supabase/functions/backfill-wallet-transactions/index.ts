import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BackfillRequest {
  wallet_address: string
  hours: number
}

// Global caches
const tokenMetaCache = new Map() // mint -> {name, symbol}
let cachedSolPriceUsd = null

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

    const { wallet_address, hours }: BackfillRequest = await req.json()

    console.log(`Starting backfill for wallet ${wallet_address} for last ${hours} hours`)

    const transactions = await getWalletTransactions(wallet_address, hours, heliusApiKey)
    console.log(`Found ${transactions.length} transactions to analyze`)

    // Process each transaction
    const processedTransactions = []
    const totalTransactions = transactions.length
    for (const txData of transactions) {
      try {
        const results = await processTransaction(txData, wallet_address, supabase)
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
      // Return only a small sample to avoid oversized responses
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
      error: error?.message || String(error),
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
    const native = Array.isArray(txData.nativeTransfers) ? txData.nativeTransfers : []
    const tokenTransfers = Array.isArray(txData.tokenTransfers) ? txData.tokenTransfers : []

    const getLamports = (t: any) => (typeof t.amount === 'number' ? t.amount : (typeof t.lamports === 'number' ? t.lamports : 0))

    const solIn = native.filter((n: any) => n.toUserAccount === walletAddress).reduce((a: number, n: any) => a + getLamports(n), 0)
    const solOut = native.filter((n: any) => n.fromUserAccount === walletAddress).reduce((a: number, n: any) => a + getLamports(n), 0)

    // Group token transfers by mint
    const byMint: Record<string, { inRaw: number; outRaw: number; decimals?: number }> = {}
    const getRaw = (t: any) => {
      const v = t?.rawTokenAmount?.tokenAmount ?? t?.tokenAmount ?? t?.amount ?? t?.uiTokenAmount?.amount ?? 0
      return typeof v === 'string' ? parseFloat(v) : (typeof v === 'number' ? v : 0)
    }

    for (const t of tokenTransfers) {
      const mint = t.mint || t.tokenMint
      if (!mint || mint === SOL_MINT) continue
      if (!byMint[mint]) byMint[mint] = { inRaw: 0, outRaw: 0, decimals: t?.rawTokenAmount?.decimals ?? t?.decimals }
      const raw = getRaw(t)
      if ((t.toUserAccount && t.toUserAccount === walletAddress) || (t.destinationUserAccount && t.destinationUserAccount === walletAddress)) {
        byMint[mint].inRaw += raw
      }
      if ((t.fromUserAccount && t.fromUserAccount === walletAddress) || (t.sourceUserAccount && t.sourceUserAccount === walletAddress)) {
        byMint[mint].outRaw += raw
      }
      if (byMint[mint].decimals == null) byMint[mint].decimals = t?.rawTokenAmount?.decimals ?? t?.decimals
    }

    // Choose the dominant mint by absolute net flow
    let chosenMint: string | null = null
    let netRaw = 0
    let decimals = 9
    for (const mint in byMint) {
      const net = byMint[mint].inRaw - byMint[mint].outRaw
      if (Math.abs(net) > Math.abs(netRaw)) {
        chosenMint = mint
        netRaw = net
        decimals = byMint[mint].decimals ?? 9
      }
    }

    if (!chosenMint || netRaw === 0) return null

    const isBuy = solOut > 0 && netRaw > 0
    const isSell = solIn > 0 && netRaw < 0
    if (!isBuy && !isSell) return null

    const amountSolLamports = isBuy ? solOut : solIn
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

    console.log(`Derived ${isBuy ? 'BUY' : 'SELL'} from transfers for ${txData.signature}: SOL=${amountSolLamports} lamports, token=${chosenMint} raw=${tokenAmountRaw}`)
    return { isBuy, isSell, tokenMint: chosenMint, amountSolLamports, tokenAmountRaw, event }
  } catch (error) {
    console.error('deriveSwapFromTransfers error:', error)
    return null
  }
}

async function getWalletTransactions(address: string, hours: number, heliusApiKey: string) {
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

  const seen = new Set();
  const results = [];
  let before = null;

  // Use a sane limit (Helius supports higher; 100 is safe).
  const LIMIT = '100';

  while (true) {
    const params = new URLSearchParams({ 'api-key': heliusApiKey, limit: LIMIT });
    if (before) params.set('before', before);

    const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?${params.toString()}`;
    const data = await fetchJsonWithRetry(url, { method: 'GET', headers: { 'Content-Type': 'application/json' } });

    if (!Array.isArray(data) || data.length === 0) break;

    // Keep what's in window; stop when we've paged past the window
    let inWindow = 0;
    for (const tx of data) {
      const ts = new Date(tx.timestamp * 1000);
      if (ts >= startTime && ts <= endTime) {
        if (!seen.has(tx.signature)) {
          results.push(tx);
          seen.add(tx.signature);
          inWindow++;
        }
      }
    }

    const oldest = data[data.length - 1];
    if (!oldest?.timestamp) break;
    const oldestTime = new Date(oldest.timestamp * 1000);

    // If oldest page item is older than our window, we're done
    if (oldestTime < startTime) break;

    // Advance cursor; protect against stuck cursors
    const nextBefore = oldest.signature;
    if (!nextBefore || nextBefore === before) break;
    before = nextBefore;

    console.log(`Fetched page with ${data.length} txs, ${inWindow} in window, oldest: ${oldestTime.toISOString()}`);
  }

  // Return chronological for UI
  results.sort((a, b) => a.timestamp - b.timestamp);
  return results;
}

// returns ARRAY of processed trades (could be empty)
async function processTransaction(txData: any, walletAddress: string, supabase: any) {
  const signature = txData.signature;
  const timestamp = new Date(txData.timestamp * 1000).toISOString();

  // normalize swap events; derive if missing
  let swaps = txData.events?.swap;
  if (!swaps) {
    const derived = deriveSwapFromTransfers(txData, walletAddress);
    if (derived?.event) swaps = [derived.event];
  }
  if (!swaps) return [];

  const events = Array.isArray(swaps) ? swaps : [swaps];
  if (events.length === 0) return [];

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const isSol = (m: string) => m === SOL_MINT;

  const processed = [];
  const solPriceUsd = await getSolPriceUSD(Deno.env.get('HELIUS_API_KEY')!);

  for (const swapEvent of events) {
    const inArr  = Array.isArray(swapEvent.tokenInputs)  ? swapEvent.tokenInputs  : (swapEvent.tokenInputs  ? [swapEvent.tokenInputs]  : []);
    const outArr = Array.isArray(swapEvent.tokenOutputs) ? swapEvent.tokenOutputs : (swapEvent.tokenOutputs ? [swapEvent.tokenOutputs] : []);
    if (inArr.length === 0 && outArr.length === 0) continue;

    const isBuy  = inArr.some(x => isSol(x.mint));
    const isSell = outArr.some(x => isSol(x.mint));
    if (!isBuy && !isSell) continue;

    const nonSolOut = outArr.find(x => !isSol(x.mint));
    const nonSolIn  = inArr.find(x => !isSol(x.mint));
    const tokenMint = isBuy ? nonSolOut?.mint : nonSolIn?.mint;
    if (!tokenMint) continue;

    const solLeg = (isBuy ? inArr : outArr).find(x => isSol(x.mint));
    const tokLeg = (isBuy ? outArr : inArr).find(x => !isSol(x.mint));

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
    .eq('wallet_address', walletAddress).eq('is_active', true).single();

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