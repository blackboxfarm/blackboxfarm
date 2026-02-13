import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusApiKey, getHeliusRpcUrl, getHeliusRestUrl } from '../_shared/helius-client.ts';
/**
 * PUMPFUN DEV WALLET MONITOR
 * 
 * Purpose: Monitor developer wallets for suspicious behavior
 * Schedule: Every 2-3 minutes via cron
 * 
 * Checks for:
 * 1. DEV SELL: Developer sold tokens of their own creation
 * 2. DEV LAUNCHED NEW: Developer created a new token (abandonment signal)
 * 
 * When detected:
 * - Sets dev_sold=true or dev_launched_new=true on the token record
 * - Watchlist monitor will then permanently reject these tokens
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

// Rate limiting config
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 1500;
const WALLETS_PER_RUN = 20;

interface MonitorStats {
  walletsChecked: number;
  devSellsDetected: number;
  devNewLaunchesDetected: number;
  tokensAffected: number;
  errors: number;
  durationMs: number;
  details: Array<{ wallet: string; type: string; token: string }>;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with exponential backoff - supports both GET and POST
async function fetchWithBackoff(url: string, maxRetries = 3, options?: RequestInit): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
        ...options
      });
      
      if (response.status === 429) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, backing off ${backoffMs}ms`);
        await delay(backoffMs);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      const backoffMs = Math.pow(2, attempt) * 1000;
      await delay(backoffMs);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Enhanced dev wallet check - returns selling info and current holding
interface DevWalletStatus {
  hasSold: boolean;
  hasBoughtBack: boolean;
  holdingPct: number | null;  // null if unable to check, 0-100 otherwise
  isFullExit: boolean;        // true if wallet is now empty (0% holding)
  sellCount: number;          // number of sell transactions detected
}

async function getDevWalletStatus(devWallet: string, tokenMint: string): Promise<DevWalletStatus> {
  const status: DevWalletStatus = {
    hasSold: false,
    hasBoughtBack: false,
    holdingPct: null,
    isFullExit: false,
    sellCount: 0,
  };

  try {
    const heliusKey = getHeliusApiKey();
    
    if (!heliusKey) {
      console.log('⚠️ No Helius API key - skipping detailed dev check');
      return status;
    }

    // 1. Check current token balance in dev wallet
    try {
      const balanceResponse = await fetchWithBackoff(
        getHeliusRpcUrl(heliusKey),
        3,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'dev-balance',
            method: 'getTokenAccountsByOwner',
            params: [
              devWallet,
              { mint: tokenMint },
              { encoding: 'jsonParsed' }
            ]
          })
        }
      );

      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        const accounts = balanceData.result?.value || [];
        
        if (accounts.length > 0) {
          const tokenAccount = accounts[0];
          const balance = tokenAccount?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
          
          // Pump.fun tokens have 1 billion total supply
          const TOTAL_SUPPLY = 1_000_000_000;
          status.holdingPct = (balance / TOTAL_SUPPLY) * 100;
          
          console.log(`💰 Dev ${devWallet.slice(0, 8)} holds ${status.holdingPct.toFixed(2)}% of ${tokenMint.slice(0, 8)}`);
        } else {
          // No token account = 0 balance
          status.holdingPct = 0;
          console.log(`💀 Dev ${devWallet.slice(0, 8)} has 0% of ${tokenMint.slice(0, 8)} (no token account)`);
        }
      }
    } catch (balanceError) {
      console.error(`Error checking dev balance:`, balanceError);
    }

    // 2. Check transaction history for sells and buybacks
    const response = await fetchWithBackoff(
      `${getHeliusRestUrl(`/v0/addresses/${devWallet}/transactions`, { type: 'SWAP', limit: '100' })}`
    );
    
    if (response.ok) {
      const txs = await response.json();
      
      for (const tx of txs) {
        const tokenTransfers = tx.tokenTransfers || [];
        
        // Check if dev sent out this specific token (SELL)
        const soldToken = tokenTransfers.some((t: any) => 
          t.mint === tokenMint && 
          t.fromUserAccount === devWallet &&
          t.tokenAmount > 0
        );
        
        // Check if dev received this specific token (BUY/REBUY)
        const boughtToken = tokenTransfers.some((t: any) => 
          t.mint === tokenMint && 
          t.toUserAccount === devWallet &&
          t.tokenAmount > 0
        );
        
        if (soldToken) {
          status.hasSold = true;
          status.sellCount++;
        }
        
        if (boughtToken && status.hasSold) {
          // Bought back AFTER selling = potential recovery
          status.hasBoughtBack = true;
        }
      }
    }

    // 3. Determine if this is a full exit
    // Full exit = sold tokens AND wallet is now empty (or nearly empty < 0.1%)
    if (status.hasSold && status.holdingPct !== null && status.holdingPct < 0.1) {
      status.isFullExit = true;
      console.log(`🚨 DEV FULL EXIT: ${devWallet.slice(0, 8)} emptied ${tokenMint.slice(0, 8)}`);
    }

    if (status.hasSold) {
      console.log(`🚨 Dev ${devWallet.slice(0, 8)} SOLD ${tokenMint.slice(0, 8)} (${status.sellCount} sells, holding: ${status.holdingPct?.toFixed(2) ?? 'unknown'}%, fullExit: ${status.isFullExit}, rebuy: ${status.hasBoughtBack})`);
    }

    return status;
  } catch (error) {
    console.error(`Error checking dev wallet status for ${devWallet}:`, error);
    return status;
  }
}

// Wrapper for backward compatibility - still returns boolean for simple sold check
async function checkDevSold(devWallet: string, tokenMint: string): Promise<boolean> {
  const status = await getDevWalletStatus(devWallet, tokenMint);
  return status.hasSold;
}

// Check if dev wallet has launched a new token after this one
async function checkDevLaunchedNew(devWallet: string, tokenMint: string, tokenCreatedAt: string): Promise<boolean> {
  try {
    // Query pump.fun for tokens created by this wallet after the current token
    const response = await fetchWithBackoff(
      `https://frontend-api.pump.fun/coins/user-created-coins/${devWallet}?limit=10`
    );
    
    if (!response.ok) {
      return false;
    }
    
    const coins = await response.json();
    
    if (!Array.isArray(coins) || coins.length === 0) {
      return false;
    }
    
    const currentTokenTime = new Date(tokenCreatedAt).getTime();
    
    // Check if dev created any tokens AFTER the current one
    for (const coin of coins) {
      if (coin.mint === tokenMint) continue; // Skip the current token
      
      const coinCreatedAt = coin.created_timestamp || 0;
      if (coinCreatedAt > currentTokenTime) {
        console.log(`🚨 Dev ${devWallet.slice(0, 8)} launched NEW token ${coin.mint?.slice(0, 8)} after ${tokenMint.slice(0, 8)}`);
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking dev new launch for ${devWallet}:`, error);
    return false;
  }
}

// Main monitoring function
async function monitorDevWallets(supabase: any): Promise<MonitorStats> {
  const startTime = Date.now();
  const stats: MonitorStats = {
    walletsChecked: 0,
    devSellsDetected: 0,
    devNewLaunchesDetected: 0,
    tokensAffected: 0,
    errors: 0,
    durationMs: 0,
    details: [],
  };

  console.log('🔍 DEV WALLET MONITOR: Starting...');

  // Check if monitor is enabled
  const { data: config } = await supabase
    .from('pumpfun_monitor_config')
    .select('is_enabled')
    .limit(1)
    .single();

  if (!config?.is_enabled) {
    console.log('⏸️ Monitor disabled, skipping');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  // Get watching/qualified tokens with creator wallets
  // Prioritize recently active tokens
  const { data: tokens, error } = await supabase
    .from('pumpfun_watchlist')
    .select('id, token_mint, token_symbol, creator_wallet, first_seen_at, dev_sold, dev_launched_new')
    .in('status', ['watching', 'qualified'])
    .not('creator_wallet', 'is', null)
    .eq('dev_sold', false)
    .eq('dev_launched_new', false)
    .order('last_checked_at', { ascending: false })
    .limit(WALLETS_PER_RUN);

  if (error) {
    console.error('Error fetching tokens:', error);
    stats.errors++;
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  if (!tokens || tokens.length === 0) {
    console.log('No tokens to check');
    stats.durationMs = Date.now() - startTime;
    return stats;
  }

  console.log(`📋 Checking ${tokens.length} dev wallets`);

  // Process in batches
  for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
    const batch = tokens.slice(i, i + BATCH_SIZE);
    
    for (const token of batch) {
      try {
        stats.walletsChecked++;
        const devWallet = token.creator_wallet;

        // Get comprehensive dev wallet status
        const devStatus = await getDevWalletStatus(devWallet, token.token_mint);
        
        // Check for new token launch (only if not already sold)
        const hasLaunchedNew = !devStatus.hasSold && await checkDevLaunchedNew(
          devWallet, 
          token.token_mint, 
          token.first_seen_at
        );

        // Calculate token age in minutes
        const tokenAgeMinutes = (Date.now() - new Date(token.first_seen_at).getTime()) / 60000;

        if (devStatus.hasSold || hasLaunchedNew || devStatus.holdingPct !== null) {
          const updates: any = {
            last_dev_check_at: new Date().toISOString(),
          };

          // Update dev holding percentage if we got it
          if (devStatus.holdingPct !== null) {
            updates.dev_holding_pct = devStatus.holdingPct;
          }

          if (devStatus.hasSold) {
            updates.dev_sold = true;
            stats.devSellsDetected++;
            stats.details.push({
              wallet: devWallet,
              type: devStatus.isFullExit ? 'dev_full_exit' : 'dev_sold',
              token: token.token_symbol || token.token_mint.slice(0, 8),
            });

            // Track if dev bought back
            if (devStatus.hasBoughtBack) {
              updates.dev_bought_back = true;
            }

            // If full exit on young token (<30 min) without rebuy - this is a rug signal
            if (devStatus.isFullExit && tokenAgeMinutes < 30 && !devStatus.hasBoughtBack) {
              console.log(`💀 DEV EXITED & RAN: ${token.token_symbol} (${tokenAgeMinutes.toFixed(0)}m old, 0% holding, no rebuy)`);
            }
          }

          if (hasLaunchedNew) {
            updates.dev_launched_new = true;
            stats.devNewLaunchesDetected++;
            stats.details.push({
              wallet: devWallet,
              type: 'dev_launched_new',
              token: token.token_symbol || token.token_mint.slice(0, 8),
            });
          }

          // Update the token record
          await supabase
            .from('pumpfun_watchlist')
            .update(updates)
            .eq('id', token.id);

          stats.tokensAffected++;
          console.log(`⚠️ Updated ${token.token_symbol}: dev_sold=${devStatus.hasSold}, holdingPct=${devStatus.holdingPct?.toFixed(2) ?? 'unknown'}%, fullExit=${devStatus.isFullExit}, rebuy=${devStatus.hasBoughtBack}`);
        }

        await delay(200); // Small delay between checks
      } catch (error) {
        console.error(`Error checking ${token.token_symbol}:`, error);
        stats.errors++;
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < tokens.length) {
      await delay(BATCH_DELAY_MS);
    }
  }

  stats.durationMs = Date.now() - startTime;
  console.log(`📊 DEV MONITOR COMPLETE: ${stats.walletsChecked} checked, ${stats.devSellsDetected} sells, ${stats.devNewLaunchesDetected} new launches (${stats.durationMs}ms)`);

  return stats;
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

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'monitor';

    console.log(`🎯 pumpfun-dev-wallet-monitor action: ${action}`);

    switch (action) {
      case 'monitor': {
        const stats = await monitorDevWallets(supabase);
        return jsonResponse({ success: true, stats });
      }

      case 'status': {
        const { count: devSoldCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('dev_sold', true);

        const { count: devLaunchedCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .eq('dev_launched_new', true);

        const { count: watchingCount } = await supabase
          .from('pumpfun_watchlist')
          .select('id', { count: 'exact', head: true })
          .in('status', ['watching', 'qualified'])
          .eq('dev_sold', false)
          .eq('dev_launched_new', false);

        return jsonResponse({
          success: true,
          stats: {
            devSoldCount,
            devLaunchedNewCount: devLaunchedCount,
            cleanWatchingCount: watchingCount,
          }
        });
      }

      case 'check-wallet': {
        // Manual check for a specific wallet
        const body = await req.json();
        const { wallet, mint, createdAt } = body;
        
        if (!wallet || !mint) {
          return jsonResponse({ error: 'wallet and mint required' }, 400);
        }

        const hasSold = await checkDevSold(wallet, mint);
        const hasLaunchedNew = await checkDevLaunchedNew(wallet, mint, createdAt || new Date().toISOString());

        return jsonResponse({
          success: true,
          wallet,
          mint,
          devSold: hasSold,
          devLaunchedNew: hasLaunchedNew,
        });
      }

      default:
        return jsonResponse({ error: 'Unknown action', validActions: ['monitor', 'status', 'check-wallet'] }, 400);
    }
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});
