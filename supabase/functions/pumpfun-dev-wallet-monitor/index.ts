import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Fetch with exponential backoff
async function fetchWithBackoff(url: string, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
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

// Check if dev wallet has sold tokens of a specific mint
async function checkDevSold(devWallet: string, tokenMint: string): Promise<boolean> {
  try {
    // Use Helius or Solscan to check for sell transactions
    const heliusKey = Deno.env.get('HELIUS_API_KEY');
    
    if (heliusKey) {
      // Use Helius to get transaction history
      const response = await fetchWithBackoff(
        `https://api.helius.xyz/v0/addresses/${devWallet}/transactions?api-key=${heliusKey}&type=SWAP&limit=50`
      );
      
      if (response.ok) {
        const txs = await response.json();
        
        // Look for any swap where the dev is selling (token goes out, SOL comes in)
        for (const tx of txs) {
          const tokenTransfers = tx.tokenTransfers || [];
          
          // Check if dev sent out this specific token
          const soldToken = tokenTransfers.some((t: any) => 
            t.mint === tokenMint && 
            t.fromUserAccount === devWallet &&
            t.tokenAmount > 0
          );
          
          if (soldToken) {
            console.log(`🚨 Dev ${devWallet.slice(0, 8)} SOLD ${tokenMint.slice(0, 8)}`);
            return true;
          }
        }
      }
    }
    
    // Fallback: Check Solscan for recent transactions
    const solscanResponse = await fetchWithBackoff(
      `https://api.solscan.io/v2/account/transfer?address=${devWallet}&token=${tokenMint}&page=1&page_size=20`
    );
    
    if (solscanResponse.ok) {
      const data = await solscanResponse.json();
      const transfers = data.data || [];
      
      // Look for outgoing transfers of this token
      for (const transfer of transfers) {
        if (transfer.src === devWallet && transfer.token_address === tokenMint) {
          // Dev sent tokens out - likely a sell
          console.log(`🚨 Dev ${devWallet.slice(0, 8)} transferred out ${tokenMint.slice(0, 8)}`);
          return true;
        }
      }
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking dev sell for ${devWallet}:`, error);
    return false;
  }
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

        // Check for dev sell
        const hasSold = await checkDevSold(devWallet, token.token_mint);
        
        // Check for new token launch (only if not already sold)
        const hasLaunchedNew = !hasSold && await checkDevLaunchedNew(
          devWallet, 
          token.token_mint, 
          token.first_seen_at
        );

        if (hasSold || hasLaunchedNew) {
          const updates: any = {
            last_dev_check_at: new Date().toISOString(),
          };

          if (hasSold) {
            updates.dev_sold = true;
            stats.devSellsDetected++;
            stats.details.push({
              wallet: devWallet,
              type: 'dev_sold',
              token: token.token_symbol || token.token_mint.slice(0, 8),
            });
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
          console.log(`⚠️ Updated ${token.token_symbol}: dev_sold=${hasSold}, dev_launched_new=${hasLaunchedNew}`);
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
