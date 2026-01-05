import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * PUMPFUN EARLY TRADE ANALYZER
 * 
 * Purpose: Analyze first 10-20 trades to detect dev behavior patterns
 * 
 * Patterns Detected:
 * - diamond_dev: Dev holds through bonding curve
 * - hidden_whale: Dev has secondary wallets buying large amounts
 * - wash_bundler: Multiple wallets buy simultaneously (bundling)
 * - buyback_dev: Dev recycles creator rewards as buybacks
 * - wallet_washer: Dev sells to own wallets
 * - spike_kill: Dev spikes price then dumps
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const errorResponse = (message: string, status = 400) =>
  jsonResponse({ success: false, error: message }, status);

// Pattern definitions with detection logic
const PATTERN_DEFINITIONS = {
  diamond_dev: {
    description: 'Dev holds through bonding curve graduation',
    signal_boost: 25,
  },
  hidden_whale: {
    description: 'Dev has secondary wallet(s) with large holdings',
    signal_boost: 10, // Can be positive if dev is known good
    signal_penalty: -15, // Negative if unknown dev
  },
  wash_bundler: {
    description: 'Multiple wallets buy simultaneously (bundling detected)',
    signal_penalty: -10,
  },
  buyback_dev: {
    description: 'Dev recycles creator rewards as buybacks',
    signal_boost: 20,
  },
  wallet_washer: {
    description: 'Dev sells to own wallets (fake volume)',
    signal_penalty: -15,
  },
  spike_kill: {
    description: 'Dev/insiders spike price then dump',
    signal_penalty: -30,
    blacklist: true,
  },
};

// Fetch early trades from Helius
async function fetchEarlyTrades(tokenMint: string, heliusApiKey: string, limit = 20): Promise<any[]> {
  console.log(`[Early Trade Analyzer] Fetching first ${limit} trades for ${tokenMint}`);
  
  try {
    const url = `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${heliusApiKey}&limit=${limit}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[Early Trade Analyzer] Helius API error: ${response.status}`);
      return [];
    }
    
    const transactions = await response.json();
    return transactions || [];
  } catch (err) {
    console.error('[Early Trade Analyzer] Fetch error:', err);
    return [];
  }
}

// Detect wallet funding sources to find linked wallets
async function getWalletFundingSource(walletAddress: string, heliusApiKey: string): Promise<string | null> {
  try {
    const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=10&type=TRANSFER`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const transactions = await response.json();
    
    // Find first SOL transfer IN (funding source)
    for (const tx of transactions || []) {
      if (tx.type === 'TRANSFER' && tx.nativeTransfers) {
        for (const transfer of tx.nativeTransfers) {
          if (transfer.toUserAccount === walletAddress && transfer.amount > 0.01) {
            return transfer.fromUserAccount;
          }
        }
      }
    }
    
    return null;
  } catch (err) {
    console.error('[Early Trade Analyzer] Funding source error:', err);
    return null;
  }
}

// Analyze trades to detect patterns
async function analyzeEarlyTrades(
  supabase: any,
  tokenMint: string,
  creatorWallet: string
): Promise<any> {
  console.log(`[Early Trade Analyzer] Analyzing token: ${tokenMint}, creator: ${creatorWallet}`);
  
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
  if (!heliusApiKey) {
    return { error: 'HELIUS_API_KEY not configured' };
  }
  
  // Check if already analyzed
  const { data: existing } = await supabase
    .from('token_early_trades')
    .select('id')
    .eq('token_mint', tokenMint)
    .limit(1);
  
  if (existing && existing.length > 0) {
    console.log('[Early Trade Analyzer] Token already analyzed');
    return { alreadyAnalyzed: true };
  }
  
  // Fetch early transactions
  const transactions = await fetchEarlyTrades(tokenMint, heliusApiKey, 30);
  
  if (transactions.length === 0) {
    return { error: 'No transactions found' };
  }
  
  // Parse trades
  const trades: any[] = [];
  const walletBuys = new Map<string, { solAmount: number; pctSupply: number; timestamp: Date }[]>();
  let tradeIndex = 0;
  
  for (const tx of transactions) {
    // Skip non-swap transactions
    if (tx.type !== 'SWAP') continue;
    
    const timestamp = new Date(tx.timestamp * 1000);
    
    // Parse swap details
    for (const swap of tx.events?.swap || []) {
      if (swap.tokenOutputs?.[0]?.mint === tokenMint) {
        // This is a BUY
        const buyer = tx.feePayer;
        const solAmount = (swap.nativeInput?.amount || 0) / 1e9;
        const tokenAmount = swap.tokenOutputs?.[0]?.rawTokenAmount?.tokenAmount || 0;
        
        tradeIndex++;
        const trade = {
          token_mint: tokenMint,
          trade_index: tradeIndex,
          wallet_address: buyer,
          trade_type: 'buy',
          sol_amount: solAmount,
          token_amount: tokenAmount,
          timestamp: timestamp.toISOString(),
          is_creator: buyer === creatorWallet,
          signature: tx.signature,
        };
        trades.push(trade);
        
        // Track wallet buys
        if (!walletBuys.has(buyer)) {
          walletBuys.set(buyer, []);
        }
        walletBuys.get(buyer)!.push({ solAmount, pctSupply: 0, timestamp });
      }
      
      if (swap.tokenInputs?.[0]?.mint === tokenMint) {
        // This is a SELL
        const seller = tx.feePayer;
        const solAmount = (swap.nativeOutput?.amount || 0) / 1e9;
        const tokenAmount = swap.tokenInputs?.[0]?.rawTokenAmount?.tokenAmount || 0;
        
        tradeIndex++;
        trades.push({
          token_mint: tokenMint,
          trade_index: tradeIndex,
          wallet_address: seller,
          trade_type: 'sell',
          sol_amount: solAmount,
          token_amount: tokenAmount,
          timestamp: timestamp.toISOString(),
          is_creator: seller === creatorWallet,
          signature: tx.signature,
        });
      }
    }
    
    if (tradeIndex >= 20) break;
  }
  
  // Pattern Detection
  const detectedPatterns: string[] = [];
  const linkedWallets: string[] = [];
  let insiderPct = 0;
  
  // Get creator's funding source
  const creatorFunding = await getWalletFundingSource(creatorWallet, heliusApiKey);
  
  // Analyze first 10 buyers for linked wallets
  const first10Buyers = Array.from(walletBuys.entries()).slice(0, 10);
  
  for (const [wallet, buys] of first10Buyers) {
    if (wallet === creatorWallet) continue;
    
    // Check if wallet shares funding source with creator
    const buyerFunding = await getWalletFundingSource(wallet, heliusApiKey);
    
    if (buyerFunding && (buyerFunding === creatorFunding || buyerFunding === creatorWallet)) {
      linkedWallets.push(wallet);
      
      // Mark trades as linked
      for (const trade of trades) {
        if (trade.wallet_address === wallet) {
          trade.is_linked_to_creator = true;
          trade.funding_source = buyerFunding;
        }
      }
    }
  }
  
  // Calculate insider percentage
  const totalBuySol = trades.filter(t => t.trade_type === 'buy').reduce((sum, t) => sum + (t.sol_amount || 0), 0);
  const insiderBuySol = trades.filter(t => t.trade_type === 'buy' && (t.is_creator || t.is_linked_to_creator))
    .reduce((sum, t) => sum + (t.sol_amount || 0), 0);
  insiderPct = totalBuySol > 0 ? (insiderBuySol / totalBuySol) * 100 : 0;
  
  // Pattern: Hidden Whale - large non-creator buy in first 5 that's linked
  const first5Trades = trades.filter(t => t.trade_index <= 5 && t.trade_type === 'buy');
  const hiddenWhale = first5Trades.find(t => !t.is_creator && t.is_linked_to_creator && t.sol_amount >= 0.5);
  if (hiddenWhale) {
    detectedPatterns.push('hidden_whale');
  }
  
  // Pattern: Wash Bundler - multiple buys within 2 seconds
  const buyTimestamps = trades.filter(t => t.trade_type === 'buy').map(t => new Date(t.timestamp).getTime());
  for (let i = 0; i < buyTimestamps.length - 2; i++) {
    const window = buyTimestamps.slice(i, i + 3);
    if (window[2] - window[0] < 2000) { // 3 buys within 2 seconds
      detectedPatterns.push('wash_bundler');
      break;
    }
  }
  
  // Pattern: Wallet Washer - creator sells then linked wallet buys
  const creatorSells = trades.filter(t => t.is_creator && t.trade_type === 'sell');
  const linkedBuysAfterSell = trades.filter(t => 
    t.is_linked_to_creator && 
    t.trade_type === 'buy' &&
    creatorSells.some(s => new Date(t.timestamp) > new Date(s.timestamp))
  );
  if (creatorSells.length > 0 && linkedBuysAfterSell.length > 0) {
    detectedPatterns.push('wallet_washer');
  }
  
  // Pattern: Buyback Dev - creator has multiple small buys after initial
  const creatorBuys = trades.filter(t => t.is_creator && t.trade_type === 'buy');
  if (creatorBuys.length > 2 && creatorBuys.some(b => b.trade_index > 10)) {
    detectedPatterns.push('buyback_dev');
  }
  
  // Pattern: Diamond Dev - check if creator hasn't sold (need to check later in lifecycle)
  const creatorHasSold = creatorSells.length > 0;
  if (!creatorHasSold) {
    // Will confirm diamond_dev later if token graduates
    detectedPatterns.push('potential_diamond_dev');
  }
  
  // Insert trades into database
  if (trades.length > 0) {
    const { error } = await supabase
      .from('token_early_trades')
      .upsert(trades, { onConflict: 'token_mint,trade_index' });
    
    if (error) {
      console.error('[Early Trade Analyzer] Insert error:', error);
    }
  }
  
  // Update pumpfun_watchlist with analysis results
  await supabase
    .from('pumpfun_watchlist')
    .update({
      first_10_buys_analyzed: true,
      insider_pct: insiderPct,
      dev_secondary_wallets: linkedWallets,
      detected_dev_pattern: detectedPatterns.length > 0 ? detectedPatterns[0] : null,
    })
    .eq('token_mint', tokenMint);
  
  // Update dev_wallet_reputation with pattern counts
  if (detectedPatterns.length > 0) {
    const { data: devRep } = await supabase
      .from('dev_wallet_reputation')
      .select('*')
      .eq('wallet_address', creatorWallet)
      .single();
    
    const updates: any = {
      wallet_address: creatorWallet,
      linked_wallets: linkedWallets,
      avg_insider_pct: insiderPct,
      updated_at: new Date().toISOString(),
    };
    
    if (detectedPatterns.includes('hidden_whale')) {
      updates.pattern_hidden_whale = (devRep?.pattern_hidden_whale || 0) + 1;
    }
    if (detectedPatterns.includes('wash_bundler')) {
      updates.pattern_wash_bundler = (devRep?.pattern_wash_bundler || 0) + 1;
    }
    if (detectedPatterns.includes('wallet_washer')) {
      updates.pattern_wallet_washer = (devRep?.pattern_wallet_washer || 0) + 1;
    }
    if (detectedPatterns.includes('buyback_dev')) {
      updates.pattern_buyback_dev = (devRep?.pattern_buyback_dev || 0) + 1;
    }
    
    await supabase
      .from('dev_wallet_reputation')
      .upsert(updates, { onConflict: 'wallet_address' });
  }
  
  return {
    success: true,
    tokenMint,
    creatorWallet,
    tradesAnalyzed: trades.length,
    detectedPatterns,
    linkedWallets,
    insiderPct: insiderPct.toFixed(1),
    patternDefinitions: PATTERN_DEFINITIONS,
  };
}

// Detect spike and kill pattern
async function detectSpikeKill(
  supabase: any,
  tokenMint: string
): Promise<any> {
  console.log(`[Early Trade Analyzer] Checking spike/kill for: ${tokenMint}`);
  
  // Get token data
  const { data: token } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('token_mint', tokenMint)
    .single();
  
  if (!token) {
    return { error: 'Token not found' };
  }
  
  const priceAtMint = token.price_at_mint || token.price_usd;
  const pricePeak = token.price_peak || token.price_usd;
  const priceCurrent = token.price_usd || 0;
  const createdAt = new Date(token.created_at_blockchain || token.created_at);
  const now = new Date();
  const ageMinutes = (now.getTime() - createdAt.getTime()) / 60000;
  
  // Detect spike: >5x from mint within 5 minutes
  const spikeRatio = priceAtMint > 0 ? pricePeak / priceAtMint : 1;
  const isSpiked = spikeRatio >= 5 && token.time_to_peak_mins && token.time_to_peak_mins <= 5;
  
  // Detect crash: >60% down from peak
  const crashRatio = pricePeak > 0 ? priceCurrent / pricePeak : 1;
  const isCrashed = crashRatio < 0.4;
  
  const isSpikeAndKill = isSpiked && isCrashed;
  
  if (isSpikeAndKill) {
    // Update watchlist
    await supabase
      .from('pumpfun_watchlist')
      .update({
        was_spiked_and_killed: true,
        detected_dev_pattern: 'spike_kill',
        crash_detected_at: new Date().toISOString(),
      })
      .eq('token_mint', tokenMint);
    
    // Update dev reputation
    if (token.creator_wallet) {
      const { data: devRep } = await supabase
        .from('dev_wallet_reputation')
        .select('pattern_spike_kill')
        .eq('wallet_address', token.creator_wallet)
        .single();
      
      await supabase
        .from('dev_wallet_reputation')
        .upsert({
          wallet_address: token.creator_wallet,
          pattern_spike_kill: (devRep?.pattern_spike_kill || 0) + 1,
          trust_level: 'blacklisted', // Spike & kill = blacklist
          updated_at: new Date().toISOString(),
        }, { onConflict: 'wallet_address' });
    }
  }
  
  return {
    success: true,
    tokenMint,
    analysis: {
      priceAtMint,
      pricePeak,
      priceCurrent,
      spikeRatio: spikeRatio.toFixed(2),
      crashRatio: crashRatio.toFixed(2),
      ageMinutes: ageMinutes.toFixed(1),
      isSpiked,
      isCrashed,
      isSpikeAndKill,
    }
  };
}

// Get early trade analysis for a token
async function getEarlyTradeAnalysis(supabase: any, tokenMint: string): Promise<any> {
  const { data: trades, error } = await supabase
    .from('token_early_trades')
    .select('*')
    .eq('token_mint', tokenMint)
    .order('trade_index', { ascending: true });
  
  if (error) {
    return { error: error.message };
  }
  
  const { data: token } = await supabase
    .from('pumpfun_watchlist')
    .select('detected_dev_pattern, insider_pct, dev_secondary_wallets, first_10_buys_analyzed')
    .eq('token_mint', tokenMint)
    .single();
  
  return {
    tokenMint,
    analyzed: token?.first_10_buys_analyzed || false,
    detectedPattern: token?.detected_dev_pattern,
    insiderPct: token?.insider_pct,
    linkedWallets: token?.dev_secondary_wallets || [],
    trades: trades || [],
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, tokenMint, creatorWallet } = await req.json();
    console.log(`[Early Trade Analyzer] Action: ${action}`);

    let result;
    switch (action) {
      case 'analyze_early_trades':
        if (!tokenMint || !creatorWallet) return errorResponse('Missing tokenMint or creatorWallet');
        result = await analyzeEarlyTrades(supabase, tokenMint, creatorWallet);
        break;

      case 'detect_spike_kill':
        if (!tokenMint) return errorResponse('Missing tokenMint');
        result = await detectSpikeKill(supabase, tokenMint);
        break;

      case 'get_analysis':
        if (!tokenMint) return errorResponse('Missing tokenMint');
        result = await getEarlyTradeAnalysis(supabase, tokenMint);
        break;

      default:
        return errorResponse(`Unknown action: ${action}`);
    }

    return jsonResponse({ success: true, ...result });
  } catch (error) {
    console.error('[Early Trade Analyzer] Error:', error);
    return errorResponse(String(error), 500);
  }
});
