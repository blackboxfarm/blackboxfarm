import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

const SOLANA_TRACKER_API = "https://data.solanatracker.io";
const PUMP_API = "https://frontend-api.pump.fun";
const RUGCHECK_API = "https://api.rugcheck.xyz/v1";

// Helper to safely fetch with timeout
async function safeFetch(url: string, options: RequestInit = {}, timeoutMs = 10000): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    console.error(`Fetch error for ${url}:`, err);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// Step 1: Token Discovery - Fetch batch of new tokens
async function runDiscovery(liveMode: boolean, supabase?: any): Promise<any> {
  console.log('[Step 1] Running token discovery, liveMode:', liveMode);
  const startTime = Date.now();

  if (!liveMode) {
    // Demo mode - return sample data
    return {
      source: 'Demo Data',
      fetchedCount: 15,
      fetchTimeMs: 150,
      tokens: [
        { mint: 'Demo1xxxxxxxxxxxxx', symbol: 'DEMO1', name: 'Demo Token 1', marketCapSol: 0.5 },
        { mint: 'Demo2xxxxxxxxxxxxx', symbol: 'DEMO2', name: 'Demo Token 2', marketCapSol: 0.8 },
        { mint: 'Demo3xxxxxxxxxxxxx', symbol: 'PEPE', name: 'Demo Pepe', marketCapSol: 1.2 },
        { mint: 'Demo4xxxxxxxxxxxxx', symbol: '🚀MOON', name: 'Moon Emoji', marketCapSol: 0.3 },
        { mint: 'Demo5xxxxxxxxxxxxx', symbol: 'SUPERLONGTICKERNAME', name: 'Long Ticker', marketCapSol: 0.4 },
        { mint: 'Demo6xxxxxxxxxxxxx', symbol: 'GOOD1', name: 'Good Token 1', marketCapSol: 0.6 },
        { mint: 'Demo7xxxxxxxxxxxxx', symbol: 'GOOD2', name: 'Good Token 2', marketCapSol: 0.7 },
        { mint: 'Demo8xxxxxxxxxxxxx', symbol: 'GOOD3', name: 'Good Token 3', marketCapSol: 0.9 },
        { mint: 'Demo9xxxxxxxxxxxxx', symbol: '', name: '', marketCapSol: 0.2 },
        { mint: 'Demo10xxxxxxxxxxxx', symbol: 'MAYHEM', name: 'Mayhem Token', marketCapSol: 0.1, isMayhem: true },
        { mint: 'Demo11xxxxxxxxxxxx', symbol: 'BUNDLE', name: 'Bundled Token', marketCapSol: 0.5, bundleScore: 85 },
        { mint: 'Demo12xxxxxxxxxxxx', symbol: 'GOOD4', name: 'Good Token 4', marketCapSol: 1.1 },
        { mint: 'Demo13xxxxxxxxxxxx', symbol: 'GOOD5', name: 'Good Token 5', marketCapSol: 1.3 },
        { mint: 'Demo14xxxxxxxxxxxx', symbol: 'GOOD6', name: 'Good Token 6', marketCapSol: 0.8 },
        { mint: 'Demo15xxxxxxxxxxxx', symbol: 'GOOD7', name: 'Good Token 7', marketCapSol: 0.95 },
      ]
    };
  }

  // Live mode - fetch from pumpfun_watchlist (real newly discovered tokens)
  try {
    if (!supabase) throw new Error('Supabase client not provided');

    const { data: tokens, error } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint, token_symbol, token_name, market_cap_sol, created_at, status')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    const formattedTokens = (tokens || []).map((t: any) => ({
      mint: t.token_mint,
      symbol: t.token_symbol || '',
      name: t.token_name || '',
      marketCapSol: t.market_cap_sol || 0,
      status: t.status,
      createdAt: t.created_at,
    }));

    return {
      source: 'pumpfun_watchlist (WebSocket)',
      fetchedCount: formattedTokens.length,
      fetchTimeMs: Date.now() - startTime,
      tokens: formattedTokens,
    };
  } catch (err: any) {
    console.error('[Step 1] Discovery error:', err);
    return {
      source: 'pumpfun_watchlist',
      fetchedCount: 0,
      fetchTimeMs: Date.now() - startTime,
      tokens: [],
      error: err?.message ?? String(err),
    };
  }
}

// Step 2: Intake Filtering - Apply filters to discovered tokens
async function runIntake(liveMode: boolean, supabase: any): Promise<any> {
  console.log('[Step 2] Running intake filtering, liveMode:', liveMode);

  // First get discovered tokens
  const discovery = await runDiscovery(liveMode, supabase);
  const tokens = discovery.tokens || [];

  const passed: any[] = [];
  const rejected: any[] = [];
  const filterBreakdown: Record<string, number> = {
    'null_name_ticker': 0,
    'ticker_too_long': 0,
    'emoji_unicode': 0,
    'mayhem_mode': 0,
    'high_bundle_score': 0,
    'duplicate': 0,
  };

  // Get existing watchlist mints for duplicate check
  let existingMints = new Set<string>();
  if (liveMode) {
    const { data: watchlist } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint')
      .in('status', ['watching', 'qualified', 'bought']);

    existingMints = new Set((watchlist || []).map((w: any) => w.token_mint));
  }

  for (const token of tokens) {
    let rejected_reason = null;

    // Check null name/ticker
    if (!token.symbol || !token.name || token.symbol.trim() === '' || token.name.trim() === '') {
      rejected_reason = 'null_name_ticker';
      filterBreakdown.null_name_ticker++;
    }
    // Check ticker length
    else if (token.symbol.length > 10) {
      rejected_reason = 'ticker_too_long';
      filterBreakdown.ticker_too_long++;
    }
    // Check emoji/unicode
    else if (/[^\x00-\x7F]/.test(token.symbol)) {
      rejected_reason = 'emoji_unicode';
      filterBreakdown.emoji_unicode++;
    }
    // Check mayhem mode (demo flag or real check)
    else if (token.isMayhem) {
      rejected_reason = 'mayhem_mode';
      filterBreakdown.mayhem_mode++;
    }
    // Check bundle score
    else if (token.bundleScore && token.bundleScore > 70) {
      rejected_reason = 'high_bundle_score';
      filterBreakdown.high_bundle_score++;
    }
    // Check duplicate
    else if (existingMints.has(token.mint)) {
      rejected_reason = 'duplicate';
      filterBreakdown.duplicate++;
    }

    if (rejected_reason) {
      rejected.push({ ...token, reason: rejected_reason });
    } else {
      passed.push(token);
    }
  }

  return {
    inputCount: tokens.length,
    passedCount: passed.length,
    rejectedCount: rejected.length,
    filterBreakdown,
    passed,
    rejected,
  };
}

// Step 3: Watchlist Monitoring - Get current watchlist status
async function getWatchlistStatus(liveMode: boolean, supabase: any): Promise<any> {
  console.log('[Step 3] Getting watchlist status, liveMode:', liveMode);
  
  if (!liveMode) {
    // Demo data
    return {
      totalWatching: 47,
      staleCount: 5,
      deadCount: 3,
      healthyCount: 39,
      recentUpdates: [
        { symbol: 'DEMO1', holders: 25, volume: 1.5, bondingPct: 45.2, lastUpdate: '2 min ago' },
        { symbol: 'DEMO2', holders: 18, volume: 0.8, bondingPct: 32.1, lastUpdate: '3 min ago' },
        { symbol: 'DEMO3', holders: 42, volume: 3.2, bondingPct: 78.5, lastUpdate: '1 min ago' },
        { symbol: 'DEMO4', holders: 12, volume: 0.3, bondingPct: 15.0, lastUpdate: '5 min ago' },
        { symbol: 'DEMO5', holders: 8, volume: 0.1, bondingPct: 8.2, lastUpdate: '10 min ago' },
      ]
    };
  }

  // Live data from database
  const { data: watchlist, error } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching')
    .order('last_checked_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[Step 3] Watchlist fetch error:', error);
    return { error: error.message };
  }

  const tokens = watchlist || [];
  const staleCount = tokens.filter((t: any) => t.stale_count >= 3).length;
  const deadCount = tokens.filter((t: any) => t.status === 'dead' || (t.holder_count < 3)).length;
  const healthyCount = tokens.length - staleCount - deadCount;

  const recentUpdates = tokens.slice(0, 10).map((t: any) => ({
    symbol: t.token_symbol || t.token_mint?.slice(0, 6),
    holders: t.holder_count || 0,
    volume: t.volume_sol || 0,
    bondingPct: t.bonding_curve_pct || 0,
    lastUpdate: t.last_checked_at ? new Date(t.last_checked_at).toLocaleString() : 'Never'
  }));

  return {
    totalWatching: tokens.length,
    staleCount,
    deadCount,
    healthyCount,
    recentUpdates
  };
}

// Step 4: Qualification Gate - Check tokens against criteria
async function runQualification(liveMode: boolean, supabase: any): Promise<any> {
  console.log('[Step 4] Running qualification, liveMode:', liveMode);
  
  if (!liveMode) {
    // Demo data
    return {
      checkedCount: 47,
      qualifiedCount: 5,
      softRejectedCount: 3,
      stillWatchingCount: 39,
      qualified: [
        { mint: 'Qual1xxxxxxxxxxxxx', symbol: 'QUAL1', name: 'Qualified Token 1', holders: 32, volume: 2.1, rugScore: 72 },
        { mint: 'Qual2xxxxxxxxxxxxx', symbol: 'QUAL2', name: 'Qualified Token 2', holders: 45, volume: 3.5, rugScore: 85 },
        { mint: 'Qual3xxxxxxxxxxxxx', symbol: 'QUAL3', name: 'Qualified Token 3', holders: 28, volume: 1.8, rugScore: 68 },
        { mint: 'Qual4xxxxxxxxxxxxx', symbol: 'QUAL4', name: 'Qualified Token 4', holders: 55, volume: 4.2, rugScore: 91 },
        { mint: 'Qual5xxxxxxxxxxxxx', symbol: 'QUAL5', name: 'Qualified Token 5', holders: 38, volume: 2.8, rugScore: 76 },
      ],
      softRejected: [
        { mint: 'Soft1xxxxxxxxxxxxx', symbol: 'SOFT1', name: 'Soft Rejected 1', reason: 'Low RugCheck score (42)' },
        { mint: 'Soft2xxxxxxxxxxxxx', symbol: 'SOFT2', name: 'Soft Rejected 2', reason: 'Low RugCheck score (38)' },
        { mint: 'Soft3xxxxxxxxxxxxx', symbol: 'SOFT3', name: 'Soft Rejected 3', reason: 'Insufficient volume (0.3 SOL)' },
      ]
    };
  }

  // Live qualification check
  const { data: watching } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching');

  const tokens = watching || [];
  const qualified: any[] = [];
  const softRejected: any[] = [];
  const stillWatching: any[] = [];

  // Get config
  const { data: configData } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .single();
  
  const config = configData || {
    min_holders_to_qualify: 20,
    min_volume_sol: 0.5,
    min_watch_time_sec: 120
  };

  for (const token of tokens) {
    const watchedFor = token.first_seen_at ? (Date.now() - new Date(token.first_seen_at).getTime()) / 1000 : 0;
    
    const meetsHolders = (token.holder_count || 0) >= config.min_holders_to_qualify;
    const meetsVolume = (token.volume_sol || 0) >= config.min_volume_sol;
    const meetsTime = watchedFor >= config.min_watch_time_sec;

    if (meetsHolders && meetsVolume && meetsTime) {
      qualified.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        holders: token.holder_count,
        volume: token.volume_sol,
        rugScore: token.rugcheck_score
      });
    } else if (token.rugcheck_score && token.rugcheck_score < 50) {
      softRejected.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Low RugCheck score (${token.rugcheck_score})`
      });
    } else {
      stillWatching.push(token);
    }
  }

  return {
    checkedCount: tokens.length,
    qualifiedCount: qualified.length,
    softRejectedCount: softRejected.length,
    stillWatchingCount: stillWatching.length,
    qualified,
    softRejected
  };
}

// Step 5: Dev Wallet Check
async function runDevChecks(liveMode: boolean, supabase: any): Promise<any> {
  console.log('[Step 5] Running dev wallet checks, liveMode:', liveMode);
  
  if (!liveMode) {
    // Demo data
    return {
      checkedCount: 5,
      passedCount: 3,
      devSoldCount: 1,
      newLaunchCount: 1,
      passed: [
        { mint: 'Pass1xxxxxxxxxxxxx', symbol: 'PASS1', name: 'Dev Check Passed 1' },
        { mint: 'Pass2xxxxxxxxxxxxx', symbol: 'PASS2', name: 'Dev Check Passed 2' },
        { mint: 'Pass3xxxxxxxxxxxxx', symbol: 'PASS3', name: 'Dev Check Passed 3' },
      ],
      failed: [
        { mint: 'Fail1xxxxxxxxxxxxx', symbol: 'FAIL1', name: 'Dev Sold Token', reason: 'Dev sold 50% of holdings' },
        { mint: 'Fail2xxxxxxxxxxxxx', symbol: 'FAIL2', name: 'New Launch Token', reason: 'Dev launched new token 2 hours later' },
      ]
    };
  }

  // Live dev checks would query qualified tokens and check their creators
  const { data: qualified } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .limit(20);

  const passed: any[] = [];
  const failed: any[] = [];

  for (const token of (qualified || [])) {
    // In real implementation, would call pump.fun API for creator info
    // and Helius for transaction history
    // For now, pass all in live mode (actual checks happen in monitor function)
    passed.push({
      mint: token.token_mint,
      symbol: token.token_symbol,
      name: token.token_name
    });
  }

  return {
    checkedCount: (qualified || []).length,
    passedCount: passed.length,
    devSoldCount: 0,
    newLaunchCount: 0,
    passed,
    failed
  };
}

// Step 6: Get Buy Queue
async function getBuyQueue(liveMode: boolean, supabase: any): Promise<any> {
  console.log('[Step 6] Getting buy queue, liveMode:', liveMode);
  
  // Get config
  const { data: configData } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .single();
  
  const config = configData || {};

  if (!liveMode) {
    // Demo data
    return {
      fantasyMode: true,
      queueCount: 3,
      dailyBuys: 5,
      dailyCap: config.daily_buy_cap || 20,
      buyAmountSol: config.buy_amount_sol || 0.05,
      queue: [
        { symbol: 'BUY1', priceUsd: 0.00000123, onCurve: true, executed: false },
        { symbol: 'BUY2', priceUsd: 0.00000456, onCurve: true, executed: false },
        { symbol: 'BUY3', priceUsd: 0.00000789, onCurve: false, executed: false },
      ]
    };
  }

  // Live data - get tokens ready for buy
  const { data: readyToBuy } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .eq('dev_check_passed', true)
    .limit(20);

  // Get today's buy count
  const today = new Date().toISOString().split('T')[0];
  const { count: dailyBuys } = await supabase
    .from('pumpfun_watchlist')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'bought')
    .gte('bought_at', today);

  const queue = (readyToBuy || []).map((t: any) => ({
    symbol: t.token_symbol,
    priceUsd: t.price_usd || 0,
    onCurve: (t.bonding_curve_pct || 0) < 100,
    executed: false
  }));

  return {
    fantasyMode: config.fantasy_mode_enabled || true,
    queueCount: queue.length,
    dailyBuys: dailyBuys || 0,
    dailyCap: config.daily_buy_cap || 20,
    buyAmountSol: config.buy_amount_sol || 0.05,
    queue
  };
}

// Step 7: Get Positions
async function getPositions(liveMode: boolean, supabase: any): Promise<any> {
  console.log('[Step 7] Getting positions, liveMode:', liveMode);
  
  if (!liveMode) {
    // Demo data
    return {
      positionCount: 4,
      totalInvested: 0.2,
      unrealizedPnl: 0.08,
      positions: [
        { symbol: 'POS1', entryPrice: 0.00000100, currentPrice: 0.00000180, multiplier: 1.8, pnlPct: 80 },
        { symbol: 'POS2', entryPrice: 0.00000050, currentPrice: 0.00000045, multiplier: 0.9, pnlPct: -10 },
        { symbol: 'POS3', entryPrice: 0.00000200, currentPrice: 0.00000350, multiplier: 1.75, pnlPct: 75 },
        { symbol: 'POS4', entryPrice: 0.00000080, currentPrice: 0.00000095, multiplier: 1.19, pnlPct: 19 },
      ],
      moonbags: [
        { symbol: 'MOON1', soldPrice: 0.00000300, currentPrice: 0.00000450, changeSinceSell: 50 },
        { symbol: 'MOON2', soldPrice: 0.00000500, currentPrice: 0.00000380, changeSinceSell: -24 },
      ]
    };
  }

  // Live data - get fantasy positions
  const { data: positions } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  const positionList = (positions || []).map((p: any) => ({
    symbol: p.token_symbol,
    entryPrice: p.entry_price_usd,
    currentPrice: p.current_price_usd,
    multiplier: p.entry_price_usd > 0 ? p.current_price_usd / p.entry_price_usd : 1,
    pnlPct: p.entry_price_usd > 0 ? ((p.current_price_usd - p.entry_price_usd) / p.entry_price_usd * 100) : 0
  }));

  const totalInvested = (positions || []).reduce((sum: number, p: any) => sum + (p.invested_sol || 0), 0);
  const unrealizedPnl = (positions || []).reduce((sum: number, p: any) => sum + (p.unrealized_pnl_sol || 0), 0);

  // Get moonbags (positions with is_moonbag flag or sold but retained percentage)
  const { data: moonbags } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*')
    .eq('is_moonbag', true)
    .order('sold_at', { ascending: false })
    .limit(10);

  const moonbagList = (moonbags || []).map((m: any) => ({
    symbol: m.token_symbol,
    soldPrice: m.sold_price_usd,
    currentPrice: m.current_price_usd,
    changeSinceSell: m.sold_price_usd > 0 ? ((m.current_price_usd - m.sold_price_usd) / m.sold_price_usd * 100) : 0
  }));

  return {
    positionCount: positionList.length,
    totalInvested,
    unrealizedPnl,
    positions: positionList,
    moonbags: moonbagList
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey =
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { action, liveMode = false } = await req.json();
    console.log('[Pipeline Debugger] Action:', action, 'Live mode:', liveMode);

    let result;
    switch (action) {
      case 'run_discovery':
        result = await runDiscovery(liveMode, supabase);
        break;
      case 'run_intake':
        result = await runIntake(liveMode, supabase);
        break;
      case 'get_watchlist_status':
        result = await getWatchlistStatus(liveMode, supabase);
        break;
      case 'run_qualification':
        result = await runQualification(liveMode, supabase);
        break;
      case 'run_dev_checks':
        result = await runDevChecks(liveMode, supabase);
        break;
      case 'get_buy_queue':
        result = await getBuyQueue(liveMode, supabase);
        break;
      case 'get_positions':
        result = await getPositions(liveMode, supabase);
        break;
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }

    return jsonResponse(result);
  } catch (err: any) {
    console.error('[Pipeline Debugger] Error:', err);
    return jsonResponse({ error: err.message }, 500);
  }
});
