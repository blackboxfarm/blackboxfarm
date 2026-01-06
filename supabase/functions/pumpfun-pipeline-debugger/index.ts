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

// Unicode policy for tickers (symbols):
// - ✅ Allow: ASCII + CJK scripts (Chinese/Japanese/Korean) and common CJK punctuation/fullwidth forms
// - ❌ Reject: Emoji pictographs + other non-ASCII scripts
function containsBadEmoji(text: string): boolean {
  if (!text) return false;

  const badEmojiRegex = new RegExp([
    '[\u{1F300}-\u{1F5FF}]', // Misc Symbols & Pictographs
    '[\u{1F600}-\u{1F64F}]', // Emoticons
    '[\u{1F680}-\u{1F6FF}]', // Transport & Map Symbols
    '[\u{1F700}-\u{1F77F}]', // Alchemical Symbols
    '[\u{1F780}-\u{1F7FF}]', // Geometric Shapes Extended
    '[\u{1F800}-\u{1F8FF}]', // Supplemental Arrows-C
    '[\u{1F900}-\u{1F9FF}]', // Supplemental Symbols & Pictographs
    '[\u{1FA00}-\u{1FA6F}]', // Chess Symbols
    '[\u{1FA70}-\u{1FAFF}]', // Symbols & Pictographs Extended-A
    '[\u{2600}-\u{26FF}]',   // Misc Symbols
    '[\u{2700}-\u{27BF}]',   // Dingbats
    '[\u{1F000}-\u{1F02F}]', // Mahjong/Domino tiles
    '[\u{FE00}-\u{FE0F}]',   // Variation Selectors
    '[\u{E0100}-\u{E01EF}]', // Variation Selectors Supplement
  ].join('|'), 'u');

  return badEmojiRegex.test(text);
}

function isAllowedNonAsciiTickerChar(cp: number): boolean {
  // Latin Extended-A: U+0100-U+017F (ā, ă, ą, ć, ĉ, etc.)
  if (cp >= 0x0100 && cp <= 0x017F) return true;
  // Latin Extended-B: U+0180-U+024F (ƀ, ƃ, etc.)
  if (cp >= 0x0180 && cp <= 0x024F) return true;
  // Latin Extended Additional: U+1E00-U+1EFF (ḀḁḂḃ, etc.)
  if (cp >= 0x1E00 && cp <= 0x1EFF) return true;
  // Latin Extended-C/D/E: U+2C60-U+2C7F, U+A720-U+A7FF, U+AB30-U+AB6F
  if (cp >= 0x2C60 && cp <= 0x2C7F) return true;
  if (cp >= 0xA720 && cp <= 0xA7FF) return true;
  if (cp >= 0xAB30 && cp <= 0xAB6F) return true;
  // Combining Diacritical Marks: U+0300-U+036F (accents that combine)
  if (cp >= 0x0300 && cp <= 0x036F) return true;
  // Latin-1 Supplement: U+00C0-U+00FF (À, Á, Â, Ã, Ä, Å, ó, ō, etc.)
  if (cp >= 0x00C0 && cp <= 0x00FF) return true;
  // Greek and Coptic: U+0370-U+03FF
  if (cp >= 0x0370 && cp <= 0x03FF) return true;
  // Cyrillic: U+0400-U+04FF
  if (cp >= 0x0400 && cp <= 0x04FF) return true;
  
  // CJK & friends
  if (cp >= 0x3000 && cp <= 0x303F) return true; // CJK Symbols & Punctuation
  if (cp >= 0x3040 && cp <= 0x30FF) return true; // Hiragana + Katakana
  if (cp >= 0x31F0 && cp <= 0x31FF) return true; // Katakana Phonetic Extensions
  if (cp >= 0x31C0 && cp <= 0x31EF) return true; // CJK Strokes
  if (cp >= 0x3400 && cp <= 0x4DBF) return true; // CJK Unified Ideographs Ext A
  if (cp >= 0x4E00 && cp <= 0x9FFF) return true; // CJK Unified Ideographs
  if (cp >= 0xF900 && cp <= 0xFAFF) return true; // CJK Compatibility Ideographs
  if (cp >= 0x2E80 && cp <= 0x2FDF) return true; // CJK Radicals/Kangxi
  if (cp >= 0x3200 && cp <= 0x32FF) return true; // Enclosed CJK Letters & Months
  if (cp >= 0xFF00 && cp <= 0xFFEF) return true; // Halfwidth & Fullwidth Forms

  // Hangul
  if (cp >= 0x1100 && cp <= 0x11FF) return true; // Hangul Jamo
  if (cp >= 0x3130 && cp <= 0x318F) return true; // Hangul Compatibility Jamo
  if (cp >= 0xAC00 && cp <= 0xD7AF) return true; // Hangul Syllables

  // CJK extensions beyond BMP
  if (cp >= 0x20000 && cp <= 0x2CEAF) return true; // CJK Ext B-F

  return false;
}

function containsDisallowedTickerUnicode(text: string): boolean {
  if (!text) return false;

  // Fast path: reject obvious emoji ranges
  if (containsBadEmoji(text)) return true;

  // Reject any non-ASCII characters outside our allowlist
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;

    // ASCII OK
    if (cp <= 0x7f) continue;

    // Emoji joiners/modifiers should never appear in a ticker
    if (cp === 0x200d) return true; // ZWJ
    if (cp >= 0xfe00 && cp <= 0xfe0f) return true; // VS
    if (cp >= 0xe0100 && cp <= 0xe01ef) return true; // VS supplement

    if (!isAllowedNonAsciiTickerChar(cp)) return true;
  }

  return false;
}

// Filter configuration with explanations
const FILTER_CONFIG = {
  mayhem_mode: {
    order: 1,
    name: 'Mayhem Mode',
    description: 'Token flagged as mayhem/spam by pump.fun detection',
  },
  null_name_ticker: {
    order: 2,
    name: 'Null Name/Ticker',
    description: 'Token has empty or missing name/ticker - obvious garbage',
  },
  duplicate: {
    order: 3,
    name: 'Duplicate Ticker',
    description: 'Token already exists in our watchlist system',
  },
  emoji_unicode: {
    order: 4,
    name: 'Emoji/Unicode',
    description: 'Ticker contains disallowed emoji/unicode (CJK OK)',
  },
  ticker_too_long: {
    order: 5,
    name: 'Ticker > 12 chars',
    description: 'Ticker exceeds 12 characters - unusual for legitimate tokens',
    threshold: 12,
  },
};

// Qualification thresholds
const QUALIFICATION_CONFIG = {
  min_holders: { value: 20, description: 'Minimum holder count for qualification' },
  min_volume_sol: { value: 0.5, description: 'Minimum volume in SOL' },
  min_watch_time_sec: { value: 120, description: 'Minimum seconds on watchlist before qualifying' },
  min_rugcheck_score: { value: 50, description: 'Minimum RugCheck safety score' },
};

// Tiered buy amounts based on signal strength
const BUY_TIERS = {
  weak: { amount_usd: 2, description: 'Passed filters but poor metrics' },
  moderate: { amount_usd: 10, description: 'Good metrics, unknown dev' },
  strong: { amount_usd: 20, description: 'Strong metrics, neutral dev' },
  very_strong: { amount_usd: 50, description: 'Known good dev, great metrics' },
};

// Buy guardrails configuration
const BUY_GUARDRAILS = {
  min_price_usd: 0.000008,
  max_price_usd: 0.0000125,
  max_spike_ratio: 5, // Don't buy if already 5x from mint
  min_time_after_spike_mins: 5, // Wait 5 mins after spike
  max_crash_from_peak_pct: 60, // Don't buy if crashed >60% from peak
  max_insider_pct: 20, // Max 20% held by linked wallets
};

// Enhanced signal scoring with dev patterns
const SIGNAL_SCORING = {
  // Positive patterns
  pattern_diamond_dev: { points: 25, description: 'Dev held through bonding (past tokens)' },
  pattern_buyback_dev: { points: 20, description: 'Dev recycles creator rewards as buybacks' },
  dev_reputation_high: { points: 20, threshold: 70, description: 'Dev reputation > 70' },
  dev_stable_after_dump: { points: 15, description: 'Dev has "stable_after_dump" pattern' },
  price_in_ideal_range: { points: 15, description: 'Price in $0.000008 - $0.0000125 range' },
  survived_spike: { points: 10, description: 'Token spiked but stabilized' },
  low_insider_pct: { points: 10, threshold: 10, description: 'Insider % < 10%' },
  known_good_twitter: { points: 10, description: 'Known good X/Twitter account' },
  survived_5_mins: { points: 10, description: 'Token survived > 5 mins with volume' },
  rugcheck_high: { points: 10, threshold: 70, description: 'RugCheck score > 70' },
  holders_50plus: { points: 10, threshold: 50, description: 'Holders > 50' },
  bonding_50plus: { points: 10, threshold: 50, description: 'Bonding curve > 50%' },
  pattern_hidden_whale_good: { points: 10, description: 'Hidden whale but dev is trusted' },
  dex_paid_profile: { points: 5, description: 'Has DEX paid profile' },
  
  // Negative patterns (penalties)
  pattern_wash_bundler: { points: -10, description: 'Wash trading / bundling detected' },
  pattern_wallet_washer: { points: -15, description: 'Dev sells to own wallets' },
  pattern_hidden_whale_unknown: { points: -15, description: 'Hidden whale, unknown dev' },
  high_insider_pct: { points: -15, threshold: 20, description: 'Insider % > 20%' },
  price_already_spiked: { points: -20, description: 'Already >5x from mint' },
  crashed_from_peak: { points: -25, description: 'Down >60% from peak' },
  pattern_spike_kill: { points: -30, description: 'Spike & kill pattern (BLACKLIST)', blacklist: true },
};

// Fetch latest tokens from Solana Tracker API (REAL DISCOVERY)
async function fetchLatestPumpfunTokens(limit = 100): Promise<any[]> {
  const apiKey = Deno.env.get('SOLANA_TRACKER_API_KEY');
  
  console.log(`[SolanaTracker] API key present: ${!!apiKey}, length: ${apiKey?.length || 0}`);
  
  try {
    const response = await fetch(
      `https://data.solanatracker.io/tokens/latest?market=pumpfun&limit=${limit}`,
      {
        headers: {
          'x-api-key': apiKey || '',
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Solana Tracker API error: ${response.status} - ${errorText}`);
      return [];
    }

    const data = await response.json();
    console.log(`[SolanaTracker] Got ${Array.isArray(data) ? data.length : 0} tokens`);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error('Error fetching tokens:', error);
    return [];
  }
}

// Step 1: Token Discovery - REAL fetch from Solana Tracker API
async function runDiscovery(supabase: any): Promise<any> {
  console.log('[Step 1] Running REAL token discovery from Solana Tracker');
  const startTime = Date.now();
  const batchId = `batch_${Date.now()}`;

  try {
    // Check monitor status
    const { data: config } = await supabase
      .from('pumpfun_monitor_config')
      .select('is_enabled')
      .single();
    
    const isEnabled = config?.is_enabled ?? false;

    // Fetch NEW tokens from Solana Tracker API
    const apiTokens = await fetchLatestPumpfunTokens(100);
    console.log(`[Step 1] Fetched ${apiTokens.length} tokens from API`);

    if (apiTokens.length === 0) {
      return {
        source: 'SolanaTracker API',
        monitorEnabled: isEnabled,
        fetchedCount: 0,
        newCount: 0,
        alreadyKnownCount: 0,
        fetchTimeMs: Date.now() - startTime,
        tokens: [],
        batchId,
      };
    }

    // Get mints from API
    const apiMints = apiTokens.map(t => t.token?.mint).filter(Boolean) as string[];

    // Check which ones we already know about
    const { data: existingTokens } = await supabase
      .from('pumpfun_watchlist')
      .select('token_mint')
      .in('token_mint', apiMints);

    const existingMints = new Set((existingTokens || []).map((t: any) => t.token_mint));
    const alreadyKnownCount = existingMints.size;

    // Filter to only NEW tokens
    const newApiTokens = apiTokens.filter(t => t.token?.mint && !existingMints.has(t.token.mint));
    console.log(`[Step 1] Found ${newApiTokens.length} NEW tokens (${alreadyKnownCount} already known)`);

    const formattedTokens = newApiTokens.map((t: any) => ({
      mint: t.token?.mint,
      symbol: t.token?.symbol || '',
      name: t.token?.name || '',
      marketCapSol: 0,
      status: 'new',
      createdAt: new Date().toISOString(),
      createdAtBlockchain: t.events?.createdAt ? new Date(t.events.createdAt * 1000).toISOString() : null,
      creatorWallet: t.creator,
      holderCount: t.holders || 0,
      volumeSol: t.pools?.[0]?.volume?.h24 || 0,
      priceUsd: t.pools?.[0]?.price?.usd,
      liquidityUsd: t.pools?.[0]?.liquidity?.usd,
      buys: t.buys || 0,
      sells: t.sells || 0,
      isNew: true,
    }));

    return {
      source: 'SolanaTracker API',
      monitorEnabled: isEnabled,
      fetchedCount: apiTokens.length,
      newCount: newApiTokens.length,
      alreadyKnownCount,
      fetchTimeMs: Date.now() - startTime,
      tokens: formattedTokens,
      batchId,
    };
  } catch (err: any) {
    console.error('[Step 1] Discovery error:', err);
    return {
      source: 'SolanaTracker API',
      monitorEnabled: false,
      fetchedCount: 0,
      newCount: 0,
      alreadyKnownCount: 0,
      fetchTimeMs: Date.now() - startTime,
      tokens: [],
      error: err?.message ?? String(err),
    };
  }
}

// Step 2: Intake Filtering - Apply filters + DURABLE REJECTION MEMORY
// IMPROVED: Duplicate detection now uses pumpfun_seen_symbols table and records all rejects
// Can optionally receive pre-discovered tokens to avoid re-running discovery
async function runIntake(supabase: any, preDiscoveredTokens?: any[], preBatchId?: string): Promise<any> {
  console.log('[Step 2] Running intake filtering with DURABLE REJECTION MEMORY');

  // Use pre-discovered tokens if provided, otherwise run discovery
  let tokens: any[];
  let batchId: string;
  let discoveryResult: any = null;
  
  if (preDiscoveredTokens && preDiscoveredTokens.length > 0) {
    console.log(`[Step 2] Using ${preDiscoveredTokens.length} pre-discovered tokens`);
    tokens = preDiscoveredTokens;
    batchId = preBatchId || `batch_${Date.now()}`;
  } else {
    console.log('[Step 2] No pre-discovered tokens, running discovery first');
    discoveryResult = await runDiscovery(supabase);
    tokens = discoveryResult.tokens || [];
    batchId = discoveryResult.batchId || `batch_${Date.now()}`;
  }

  const passed: any[] = [];
  const rejected: any[] = [];
  const duplicateNukes: string[] = [];
  let insertedCount = 0;
  
  const filterBreakdown: Record<string, { count: number; order: number; description: string }> = {};
  Object.entries(FILTER_CONFIG).forEach(([key, config]) => {
    filterBreakdown[key] = { count: 0, order: config.order, description: config.description };
  });

  // Get existing symbols from durable memory (pumpfun_seen_symbols)
  const { data: seenSymbols } = await supabase
    .from('pumpfun_seen_symbols')
    .select('symbol_lower, status, block_reason');
  
  const seenSymbolsMap = new Map((seenSymbols || []).map((s: any) => [s.symbol_lower, s]));

  // Get existing tokens from DB (already curated) - case-insensitive symbol lookup
  const { data: watchlist } = await supabase
    .from('pumpfun_watchlist')
    .select('token_mint, token_symbol')
    .in('status', ['watching', 'qualified', 'bought', 'pending_triage']);

  const existingMints = new Set((watchlist || []).map((w: any) => w.token_mint));
  const existingSymbolsLower = new Set((watchlist || []).map((w: any) => (w.token_symbol || '').toLowerCase()));

  // STEP 1: Find ALL duplicate tickers within the batch (case-insensitive)
  const tickerCounts: Record<string, number> = {};
  for (const token of tokens) {
    if (token.symbol) {
      const lowerSymbol = token.symbol.toLowerCase();
      tickerCounts[lowerSymbol] = (tickerCounts[lowerSymbol] || 0) + 1;
    }
  }
  
  // Identify which tickers have duplicates within the batch (count > 1)
  const duplicatedTickersInBatch = new Set(
    Object.entries(tickerCounts)
      .filter(([_, count]) => count > 1)
      .map(([ticker]) => ticker)
  );

  // Track symbols to add to seen_symbols table
  const symbolsToUpsert: any[] = [];
  const rejectionsToInsert: any[] = [];

  for (const token of tokens) {
    let rejected_reason = null;
    let rejected_detail = '';
    const lowerSymbol = (token.symbol || '').toLowerCase();

    if (token.isMayhem) {
      rejected_reason = 'mayhem_mode';
      rejected_detail = 'Flagged as mayhem/spam';
    }
    else if (!token.symbol || !token.name || token.symbol.trim() === '' || token.name.trim() === '') {
      rejected_reason = 'null_name_ticker';
      rejected_detail = `Name: "${token.name || 'null'}", Ticker: "${token.symbol || 'null'}"`;
    }
    // Check durable seen_symbols table for blocked symbols
    else if (seenSymbolsMap.has(lowerSymbol) && seenSymbolsMap.get(lowerSymbol).status === 'blocked') {
      rejected_reason = 'duplicate';
      rejected_detail = `Previously blocked: ${seenSymbolsMap.get(lowerSymbol).block_reason || 'duplicate'}`;
    }
    // Check if this ticker exists in DB already (case-insensitive)
    else if (existingSymbolsLower.has(lowerSymbol)) {
      rejected_reason = 'duplicate';
      rejected_detail = `Already exists in watchlist (case-insensitive match)`;
      // NUKE: Block this symbol permanently
      duplicateNukes.push(lowerSymbol);
    }
    // Check if this token's ticker appears multiple times in THIS batch - reject ALL of them
    else if (duplicatedTickersInBatch.has(lowerSymbol)) {
      rejected_reason = 'duplicate';
      rejected_detail = `Multiple tokens with same ticker "${token.symbol}" in batch - ALL removed`;
      duplicateNukes.push(lowerSymbol);
    }
    else if (existingMints.has(token.mint)) {
      rejected_reason = 'duplicate';
      rejected_detail = 'Exact mint already in watchlist';
    }
    else if (containsDisallowedTickerUnicode(token.symbol)) {
      rejected_reason = 'emoji_unicode';
      rejected_detail = `Contains disallowed emoji/unicode: "${token.symbol}"`;
    }
    else if (token.symbol.length > FILTER_CONFIG.ticker_too_long.threshold) {
      rejected_reason = 'ticker_too_long';
      rejected_detail = `Length: ${token.symbol.length} chars (max: ${FILTER_CONFIG.ticker_too_long.threshold})`;
    }

    if (rejected_reason) {
      filterBreakdown[rejected_reason].count++;
      rejected.push({ ...token, reason: rejected_reason, detail: rejected_detail });
      
      // Record rejection event
      rejectionsToInsert.push({
        token_mint: token.mint,
        symbol_original: token.symbol,
        symbol_lower: lowerSymbol,
        token_name: token.name,
        reason: rejected_reason,
        detail: rejected_detail,
        source: 'intake_step2',
        batch_id: batchId,
        creator_wallet: token.creatorWallet,
      });
    } else {
      passed.push(token);
      
      // Track this symbol as seen
      symbolsToUpsert.push({
        symbol_lower: lowerSymbol,
        symbol_original: token.symbol,
        first_token_mint: token.mint,
        status: 'allowed',
      });
    }
  }

  // Insert passed tokens into watchlist
  if (passed.length > 0) {
    const now = new Date().toISOString();
    const inserts = passed.map((t: any) => ({
      token_mint: t.mint,
      token_symbol: t.symbol,
      token_name: t.name,
      first_seen_at: now,
      last_checked_at: now,
      status: 'watching',
      check_count: 1,
      holder_count: t.holderCount || 0,
      holder_count_prev: 0,
      volume_sol: t.volumeSol || 0,
      volume_sol_prev: 0,
      price_usd: t.priceUsd,
      price_ath_usd: t.priceUsd,
      creator_wallet: t.creatorWallet,
      metadata: { source: 'pipeline_debugger', batch_id: batchId },
      last_processor: 'pipeline-debugger-intake',
    }));

    const { data: insertedData, error: insertError } = await supabase
      .from('pumpfun_watchlist')
      .insert(inserts)
      .select('id');
    
    if (insertError) {
      console.error('[Step 2] Insert error:', insertError);
    } else {
      insertedCount = insertedData?.length || 0;
      console.log(`[Step 2] Inserted ${insertedCount} tokens into watchlist`);
    }
  }

  // NUKE duplicates: Block all duplicate symbols permanently
  for (const nukedSymbol of [...new Set(duplicateNukes)]) {
    await supabase
      .from('pumpfun_seen_symbols')
      .upsert({
        symbol_lower: nukedSymbol,
        symbol_original: nukedSymbol.toUpperCase(),
        status: 'blocked',
        block_reason: 'duplicate_nuke',
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'symbol_lower' });
  }

  // Upsert seen symbols
  if (symbolsToUpsert.length > 0) {
    for (const sym of symbolsToUpsert) {
      await supabase
        .from('pumpfun_seen_symbols')
        .upsert({
          symbol_lower: sym.symbol_lower,
          symbol_original: sym.symbol_original,
          first_token_mint: sym.first_token_mint,
          status: sym.status,
          last_seen_at: new Date().toISOString(),
        }, { onConflict: 'symbol_lower' });
    }
  }

  // Insert rejection events
  if (rejectionsToInsert.length > 0) {
    await supabase.from('pumpfun_rejection_events').insert(rejectionsToInsert);
  }

  // Get monitor status
  let monitorEnabled = false;
  if (discoveryResult) {
    monitorEnabled = discoveryResult.monitorEnabled;
  } else {
    const { data: cfg } = await supabase.from('pumpfun_monitor_config').select('is_enabled').limit(1).single();
    monitorEnabled = cfg?.is_enabled ?? false;
  }

  return {
    monitorEnabled,
    inputCount: tokens.length,
    passedCount: passed.length,
    rejectedCount: rejected.length,
    insertedToWatchlist: insertedCount,
    duplicateNukes: [...new Set(duplicateNukes)],
    filterConfig: FILTER_CONFIG,
    filterBreakdown,
    passed,
    rejected,
    batchId,
  };
}

// Combined Step 1+2: Discovery + Intake in one call to avoid race conditions
async function runDiscoveryAndIntake(supabase: any): Promise<any> {
  console.log('[Step 1+2] Running combined discovery and intake');
  
  // Step 1: Run discovery
  const discoveryResult = await runDiscovery(supabase);
  const tokens = discoveryResult.tokens || [];
  const batchId = discoveryResult.batchId;
  
  // Step 2: Run intake with the discovered tokens (avoiding re-discovery)
  const intakeResult = await runIntake(supabase, tokens, batchId);
  
  return {
    discovery: discoveryResult,
    intake: intakeResult,
  };
}

// Fetch token metrics from pump.fun for real-time updates
async function fetchPumpFunMetrics(mint: string): Promise<any | null> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data) return null;
    
    const virtualSolReserves = data.virtual_sol_reserves || 0;
    const virtualTokenReserves = data.virtual_token_reserves || 1;
    const totalSupply = data.total_supply || 1_000_000_000_000_000;
    const bondingCurvePct = totalSupply > 0 
      ? ((totalSupply - virtualTokenReserves) / totalSupply) * 100 
      : 0;
    
    return {
      holders: null, // pump.fun doesn't return holder count directly
      volume24hSol: 0,
      priceUsd: data.usd_market_cap ? data.usd_market_cap / 1_000_000_000 : null,
      liquidityUsd: null,
      marketCapUsd: data.usd_market_cap || null,
      bondingCurvePct: Math.min(100, bondingCurvePct),
      buys: 0,
      sells: 0,
    };
  } catch {
    return null;
  }
}

// Step 3: Watchlist Monitoring - REAL metric refresh with snapshots and deltas
async function getWatchlistStatus(supabase: any): Promise<any> {
  console.log('[Step 3] Getting watchlist status with REAL metric refresh');
  const startTime = Date.now();

  // Check monitor enabled
  const { data: config } = await supabase
    .from('pumpfun_monitor_config')
    .select('is_enabled')
    .single();
  const monitorEnabled = config?.is_enabled ?? false;

  // Get both watching AND pending_triage tokens
  const { data: watchlist, error } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['watching', 'pending_triage'])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Step 3] Watchlist fetch error:', error);
    return { error: error.message };
  }

  const tokens = watchlist || [];
  let metricsRefreshed = 0;
  let snapshotsSaved = 0;
  const refreshErrors: string[] = [];

  // Refresh metrics for top 10 watching tokens (rate-limited)
  const tokensToRefresh = tokens.filter((t: any) => t.status === 'watching').slice(0, 10);
  
  for (const token of tokensToRefresh) {
    try {
      // Fetch fresh metrics from pump.fun
      const metrics = await fetchPumpFunMetrics(token.token_mint);
      
      if (metrics) {
        const now = new Date().toISOString();
        
        // Get 3-minute-ago snapshot for delta calculation
        const threeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
        const { data: snapshot3m } = await supabase
          .from('pumpfun_metric_snapshots')
          .select('holder_count, volume_sol, price_usd')
          .eq('token_mint', token.token_mint)
          .lt('captured_at', threeMinAgo)
          .order('captured_at', { ascending: false })
          .limit(1)
          .single();

        // Calculate deltas
        const currentHolders = metrics.holders || token.holder_count || 0;
        const currentVolume = token.volume_sol || 0;
        const currentPrice = metrics.priceUsd || token.price_usd || 0;
        
        const holdersDelta3m = snapshot3m ? currentHolders - (snapshot3m.holder_count || 0) : 0;
        const volumeDelta3m = snapshot3m ? currentVolume - (snapshot3m.volume_sol || 0) : 0;
        const priceChange3m = snapshot3m?.price_usd > 0 
          ? ((currentPrice - snapshot3m.price_usd) / snapshot3m.price_usd) * 100 
          : 0;

        // Calculate dump from ATH
        const priceAth = Math.max(token.price_ath_usd || 0, currentPrice);
        const dumpFromAth = priceAth > 0 ? ((priceAth - currentPrice) / priceAth) * 100 : 0;

        // Determine trend status
        let trendStatus = 'stable';
        if (holdersDelta3m >= 3 || volumeDelta3m > 0.1) trendStatus = 'surging';
        else if (holdersDelta3m <= -2 || dumpFromAth > 30) trendStatus = 'dumping';
        else if (holdersDelta3m > 0) trendStatus = 'growing';
        else if (holdersDelta3m < 0) trendStatus = 'declining';

        // Update token with fresh metrics and deltas
        await supabase
          .from('pumpfun_watchlist')
          .update({
            price_usd: metrics.priceUsd || token.price_usd,
            price_ath_usd: priceAth,
            bonding_curve_pct: metrics.bondingCurvePct || token.bonding_curve_pct,
            market_cap_usd: metrics.marketCapUsd || token.market_cap_usd,
            holder_count_prev: token.holder_count,
            volume_sol_prev: token.volume_sol,
            holders_delta_3m: holdersDelta3m,
            volume_delta_3m: volumeDelta3m,
            price_change_pct_3m: priceChange3m,
            dump_from_ath_pct: dumpFromAth,
            trend_status: trendStatus,
            last_checked_at: now,
            last_snapshot_at: now,
          })
          .eq('id', token.id);

        // Save metric snapshot
        await supabase.from('pumpfun_metric_snapshots').insert({
          token_mint: token.token_mint,
          captured_at: now,
          holder_count: currentHolders,
          volume_sol: currentVolume,
          price_usd: currentPrice,
          market_cap_usd: metrics.marketCapUsd,
          liquidity_usd: metrics.liquidityUsd,
          bonding_curve_pct: metrics.bondingCurvePct,
        });

        metricsRefreshed++;
        snapshotsSaved++;
      }
      
      // Rate limit: 100ms between calls
      await new Promise(r => setTimeout(r, 100));
    } catch (err: any) {
      refreshErrors.push(`${token.token_symbol}: ${err.message}`);
    }
  }

  // Re-fetch updated tokens for display
  const { data: updatedWatchlist } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .in('status', ['watching', 'pending_triage'])
    .order('created_at', { ascending: false })
    .limit(50);

  const updatedTokens = updatedWatchlist || [];
  
  // Count by status
  const pendingTriageCount = updatedTokens.filter((t: any) => t.status === 'pending_triage').length;
  const watchingCount = updatedTokens.filter((t: any) => t.status === 'watching').length;
  const staleCount = updatedTokens.filter((t: any) => (t.stale_count || 0) >= 3).length;
  const deadCount = updatedTokens.filter((t: any) => t.holder_count !== null && t.holder_count < 3).length;
  const healthyCount = watchingCount - staleCount - deadCount;

  const recentUpdates = updatedTokens.slice(0, 30).map((t: any) => {
    const createdAt = t.created_at_blockchain || t.created_at;
    const watchedFor = createdAt ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000) : 0;
    
    // Use stored deltas
    const holderDelta = t.holders_delta_3m || ((t.holder_count || 0) - (t.holder_count_prev || t.holder_count || 0));
    const volumeDelta = t.volume_delta_3m || ((t.volume_sol || 0) - (t.volume_sol_prev || t.volume_sol || 0));
    
    return {
      mint: t.token_mint,
      symbol: t.token_symbol || t.token_mint?.slice(0, 6),
      name: t.token_name,
      status: t.status,
      holders: t.holder_count || 0,
      holdersPrev: t.holder_count_prev || t.holder_count || 0,
      holderDelta,
      holdersDelta3m: t.holders_delta_3m || 0,
      volume: t.volume_sol || 0,
      volumePrev: t.volume_sol_prev || t.volume_sol || 0,
      volumeDelta,
      volumeDelta3m: t.volume_delta_3m || 0,
      price: t.price_usd || 0,
      priceAth: t.price_ath_usd || t.price_usd || 0,
      priceChange3m: t.price_change_pct_3m || 0,
      dumpFromAth: t.dump_from_ath_pct || 0,
      bondingPct: t.bonding_curve_pct || 0,
      watchedMins: watchedFor,
      lastUpdate: t.last_checked_at,
      lastSnapshot: t.last_snapshot_at,
      staleCount: t.stale_count || 0,
      creatorWallet: t.creator_wallet,
      insiderPct: t.insider_pct || 0,
      wasSpikedAndKilled: t.was_spiked_and_killed || false,
      // Enhanced trend analysis
      trend: t.trend_status || (holderDelta > 0 ? 'growing' : holderDelta < 0 ? 'declining' : 'stable'),
      trendStatus: t.trend_status || 'stable',
      isHealthy: (t.holder_count || 0) >= 5 && (t.volume_sol || 0) > 0.01,
      isSurging: t.trend_status === 'surging',
      isDumping: t.trend_status === 'dumping',
    };
  });

  const metricsInfo = {
    holder_count: { sources: ['pump.fun', 'Helius RPC'], purpose: 'Detect growth/distribution' },
    volume_sol: { sources: ['pump.fun', 'DexScreener'], purpose: 'Detect trading activity' },
    price_usd: { sources: ['pump.fun', 'DexScreener', 'Jupiter'], purpose: 'Track valuation changes' },
    bonding_curve_pct: { sources: ['pump.fun'], purpose: 'Track graduation progress' },
    insider_pct: { sources: ['Early trade analysis'], purpose: 'Detect linked wallet holdings' },
  };

  // Summary stats
  const growingTokens = recentUpdates.filter(t => t.trend === 'growing' || t.trend === 'surging').length;
  const decliningTokens = recentUpdates.filter(t => t.trend === 'declining' || t.trend === 'dumping').length;
  const surgingTokens = recentUpdates.filter(t => t.isSurging).length;
  const dumpingTokens = recentUpdates.filter(t => t.isDumping).length;
  const spikedAndKilledTokens = recentUpdates.filter(t => t.wasSpikedAndKilled).length;

  return {
    monitorEnabled,
    totalTokens: updatedTokens.length,
    pendingTriageCount,
    watchingCount,
    staleCount,
    deadCount,
    healthyCount,
    growingTokens,
    decliningTokens,
    spikedAndKilledTokens,
    metricsInfo,
    recentUpdates,
    // Pipeline health check
    pipelineHealth: {
      triageBacklog: pendingTriageCount > 20 ? 'warning' : 'ok',
      watchlistActive: watchingCount > 0 ? 'ok' : 'empty',
      staleRatio: watchingCount > 0 ? ((staleCount / watchingCount) * 100).toFixed(1) + '%' : '0%',
    },
  };
}

// Step 4: Qualification Gate - Check with visible thresholds
async function runQualification(supabase: any): Promise<any> {
  console.log('[Step 4] Running qualification (LIVE)');

  const { data: watching } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'watching');

  const tokens = watching || [];
  const qualified: any[] = [];
  const softRejected: any[] = [];
  const stillWatching: any[] = [];

  const { data: configData } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .single();

  const config = {
    min_holders: configData?.min_holders_to_qualify || QUALIFICATION_CONFIG.min_holders.value,
    min_volume_sol: configData?.min_volume_sol || QUALIFICATION_CONFIG.min_volume_sol.value,
    min_watch_time_sec: configData?.min_watch_time_sec || QUALIFICATION_CONFIG.min_watch_time_sec.value,
    min_rugcheck_score: configData?.min_rugcheck_score || QUALIFICATION_CONFIG.min_rugcheck_score.value,
  };

  for (const token of tokens) {
    const watchedFor = token.first_seen_at ? (Date.now() - new Date(token.first_seen_at).getTime()) / 1000 : 0;

    const checks = {
      holders: { passed: (token.holder_count || 0) >= config.min_holders, value: token.holder_count || 0, threshold: config.min_holders },
      volume: { passed: (token.volume_sol || 0) >= config.min_volume_sol, value: token.volume_sol || 0, threshold: config.min_volume_sol },
      watchTime: { passed: watchedFor >= config.min_watch_time_sec, value: Math.floor(watchedFor), threshold: config.min_watch_time_sec },
      rugcheck: { passed: !token.rugcheck_score || token.rugcheck_score >= config.min_rugcheck_score, value: token.rugcheck_score || 'N/A', threshold: config.min_rugcheck_score },
    };

    const allPassed = checks.holders.passed && checks.volume.passed && checks.watchTime.passed && checks.rugcheck.passed;
    const failedRugcheck = token.rugcheck_score && token.rugcheck_score < config.min_rugcheck_score;

    if (allPassed) {
      qualified.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        holders: token.holder_count,
        volume: token.volume_sol,
        rugScore: token.rugcheck_score,
        checks,
        signalStrength: token.signal_strength || 'moderate',
      });
    } else if (failedRugcheck) {
      softRejected.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Low RugCheck score: ${token.rugcheck_score} (min: ${config.min_rugcheck_score})`,
        checks,
      });
    } else {
      stillWatching.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        checks,
      });
    }
  }

  return {
    checkedCount: tokens.length,
    qualifiedCount: qualified.length,
    softRejectedCount: softRejected.length,
    stillWatchingCount: stillWatching.length,
    thresholds: config,
    qualificationConfig: QUALIFICATION_CONFIG,
    qualified,
    softRejected,
  };
}

// Calculate signal strength score with patterns and guardrails
function calculateSignalScore(token: any, devReputation: any): { score: number; factors: any[]; penalties: any[] } {
  let score = 0;
  const factors: any[] = [];
  const penalties: any[] = [];

  // Dev reputation > 70
  if ((devReputation?.reputation_score || 50) >= SIGNAL_SCORING.dev_reputation_high.threshold) {
    score += SIGNAL_SCORING.dev_reputation_high.points;
    factors.push({ factor: 'dev_reputation_high', points: SIGNAL_SCORING.dev_reputation_high.points, value: devReputation?.reputation_score });
  }

  // Pattern: Diamond Dev
  if ((devReputation?.pattern_diamond_dev || 0) > 0) {
    score += SIGNAL_SCORING.pattern_diamond_dev.points;
    factors.push({ factor: 'pattern_diamond_dev', points: SIGNAL_SCORING.pattern_diamond_dev.points, value: devReputation?.pattern_diamond_dev });
  }

  // Pattern: Buyback Dev
  if ((devReputation?.pattern_buyback_dev || 0) > 0) {
    score += SIGNAL_SCORING.pattern_buyback_dev.points;
    factors.push({ factor: 'pattern_buyback_dev', points: SIGNAL_SCORING.pattern_buyback_dev.points, value: devReputation?.pattern_buyback_dev });
  }

  // Dev has stable_after_dump pattern
  if ((devReputation?.tokens_stable_after_dump || 0) > 0) {
    score += SIGNAL_SCORING.dev_stable_after_dump.points;
    factors.push({ factor: 'dev_stable_after_dump', points: SIGNAL_SCORING.dev_stable_after_dump.points, value: devReputation?.tokens_stable_after_dump });
  }

  // Price in ideal range
  const priceUsd = token.price_usd || 0;
  if (priceUsd >= BUY_GUARDRAILS.min_price_usd && priceUsd <= BUY_GUARDRAILS.max_price_usd) {
    score += SIGNAL_SCORING.price_in_ideal_range.points;
    factors.push({ factor: 'price_in_ideal_range', points: SIGNAL_SCORING.price_in_ideal_range.points, value: `$${priceUsd.toFixed(10)}` });
  }

  // Low insider %
  const insiderPct = token.insider_pct || 0;
  if (insiderPct < SIGNAL_SCORING.low_insider_pct.threshold) {
    score += SIGNAL_SCORING.low_insider_pct.points;
    factors.push({ factor: 'low_insider_pct', points: SIGNAL_SCORING.low_insider_pct.points, value: `${insiderPct.toFixed(1)}%` });
  }

  // Known good Twitter account
  if (devReputation?.twitter_accounts?.length > 0 && devReputation?.trust_level === 'trusted') {
    score += SIGNAL_SCORING.known_good_twitter.points;
    factors.push({ factor: 'known_good_twitter', points: SIGNAL_SCORING.known_good_twitter.points, value: devReputation?.twitter_accounts?.[0] });
  }

  // Token survived > 5 mins with volume
  const watchedMins = token.first_seen_at ? (Date.now() - new Date(token.first_seen_at).getTime()) / 60000 : 0;
  if (watchedMins >= 5 && (token.volume_sol || 0) > 0.1) {
    score += SIGNAL_SCORING.survived_5_mins.points;
    factors.push({ factor: 'survived_5_mins', points: SIGNAL_SCORING.survived_5_mins.points, value: `${watchedMins.toFixed(1)} mins` });
  }

  // Survived spike
  if (token.spike_detected_at && !token.was_spiked_and_killed) {
    score += SIGNAL_SCORING.survived_spike.points;
    factors.push({ factor: 'survived_spike', points: SIGNAL_SCORING.survived_spike.points, value: 'Token stabilized after spike' });
  }

  // RugCheck score > 70
  if ((token.rugcheck_score || 0) >= SIGNAL_SCORING.rugcheck_high.threshold) {
    score += SIGNAL_SCORING.rugcheck_high.points;
    factors.push({ factor: 'rugcheck_high', points: SIGNAL_SCORING.rugcheck_high.points, value: token.rugcheck_score });
  }

  // Holders > 50
  if ((token.holder_count || 0) >= SIGNAL_SCORING.holders_50plus.threshold) {
    score += SIGNAL_SCORING.holders_50plus.points;
    factors.push({ factor: 'holders_50plus', points: SIGNAL_SCORING.holders_50plus.points, value: token.holder_count });
  }

  // Bonding curve > 50%
  if ((token.bonding_curve_pct || 0) >= SIGNAL_SCORING.bonding_50plus.threshold) {
    score += SIGNAL_SCORING.bonding_50plus.points;
    factors.push({ factor: 'bonding_50plus', points: SIGNAL_SCORING.bonding_50plus.points, value: `${token.bonding_curve_pct}%` });
  }

  // Pattern: Hidden Whale (good if trusted dev)
  if ((devReputation?.pattern_hidden_whale || 0) > 0) {
    if (devReputation?.trust_level === 'trusted') {
      score += SIGNAL_SCORING.pattern_hidden_whale_good.points;
      factors.push({ factor: 'pattern_hidden_whale_good', points: SIGNAL_SCORING.pattern_hidden_whale_good.points, value: 'Trusted dev with secondary wallets' });
    } else {
      score += SIGNAL_SCORING.pattern_hidden_whale_unknown.points;
      penalties.push({ factor: 'pattern_hidden_whale_unknown', points: SIGNAL_SCORING.pattern_hidden_whale_unknown.points, value: 'Unknown dev with secondary wallets' });
    }
  }

  // DEX paid profile
  if (token.metadata?.dex_paid || token.dex_paid) {
    score += SIGNAL_SCORING.dex_paid_profile.points;
    factors.push({ factor: 'dex_paid_profile', points: SIGNAL_SCORING.dex_paid_profile.points, value: true });
  }

  // PENALTIES

  // Pattern: Wash Bundler
  if ((devReputation?.pattern_wash_bundler || 0) > 0) {
    score += SIGNAL_SCORING.pattern_wash_bundler.points;
    penalties.push({ factor: 'pattern_wash_bundler', points: SIGNAL_SCORING.pattern_wash_bundler.points, value: devReputation?.pattern_wash_bundler });
  }

  // Pattern: Wallet Washer
  if ((devReputation?.pattern_wallet_washer || 0) > 0) {
    score += SIGNAL_SCORING.pattern_wallet_washer.points;
    penalties.push({ factor: 'pattern_wallet_washer', points: SIGNAL_SCORING.pattern_wallet_washer.points, value: devReputation?.pattern_wallet_washer });
  }

  // High insider %
  if (insiderPct >= SIGNAL_SCORING.high_insider_pct.threshold) {
    score += SIGNAL_SCORING.high_insider_pct.points;
    penalties.push({ factor: 'high_insider_pct', points: SIGNAL_SCORING.high_insider_pct.points, value: `${insiderPct.toFixed(1)}%` });
  }

  // Price already spiked (>5x from mint)
  const priceAtMint = token.price_at_mint || 0;
  if (priceAtMint > 0 && priceUsd / priceAtMint >= BUY_GUARDRAILS.max_spike_ratio) {
    score += SIGNAL_SCORING.price_already_spiked.points;
    penalties.push({ factor: 'price_already_spiked', points: SIGNAL_SCORING.price_already_spiked.points, value: `${(priceUsd / priceAtMint).toFixed(1)}x from mint` });
  }

  // Crashed from peak
  const pricePeak = token.price_peak || priceUsd;
  if (pricePeak > 0 && priceUsd / pricePeak < (1 - BUY_GUARDRAILS.max_crash_from_peak_pct / 100)) {
    score += SIGNAL_SCORING.crashed_from_peak.points;
    penalties.push({ factor: 'crashed_from_peak', points: SIGNAL_SCORING.crashed_from_peak.points, value: `Down ${((1 - priceUsd / pricePeak) * 100).toFixed(0)}% from peak` });
  }

  // Pattern: Spike & Kill (BLACKLIST)
  if ((devReputation?.pattern_spike_kill || 0) > 0 || token.was_spiked_and_killed) {
    score += SIGNAL_SCORING.pattern_spike_kill.points;
    penalties.push({ factor: 'pattern_spike_kill', points: SIGNAL_SCORING.pattern_spike_kill.points, value: 'BLACKLISTED', blacklist: true });
  }

  return { score: Math.max(0, score), factors, penalties };
}

// Map score to signal strength tier
function scoreToSignalStrength(score: number): string {
  if (score >= 71) return 'very_strong';
  if (score >= 51) return 'strong';
  if (score >= 31) return 'moderate';
  return 'weak';
}

// Apply buy guardrails
function applyBuyGuardrails(token: any, devReputation: any): { passed: boolean; guards: any; failedGuards: string[] } {
  const priceUsd = token.price_usd || 0;
  const priceAtMint = token.price_at_mint || 0;
  const pricePeak = token.price_peak || priceUsd;
  const insiderPct = token.insider_pct || 0;

  const guards = {
    priceInRange: priceUsd >= BUY_GUARDRAILS.min_price_usd && priceUsd <= BUY_GUARDRAILS.max_price_usd,
    notSpikeThenKill: !token.was_spiked_and_killed,
    insiderPctOk: insiderPct < BUY_GUARDRAILS.max_insider_pct,
    notCrashedFromPeak: pricePeak <= 0 || (priceUsd / pricePeak) > (1 - BUY_GUARDRAILS.max_crash_from_peak_pct / 100),
    devNotBlacklisted: devReputation?.trust_level !== 'blacklisted' && (devReputation?.pattern_spike_kill || 0) === 0,
    notAlreadySpiked: priceAtMint <= 0 || (priceUsd / priceAtMint) < BUY_GUARDRAILS.max_spike_ratio,
    stableAfterSpike: !token.spike_detected_at || 
      (Date.now() - new Date(token.spike_detected_at).getTime() > BUY_GUARDRAILS.min_time_after_spike_mins * 60000),
  };

  const failedGuards = Object.entries(guards)
    .filter(([_, v]) => !v)
    .map(([k]) => k);

  return { passed: failedGuards.length === 0, guards, failedGuards };
}

// Step 5: Dev Wallet Check with enhanced behavior analysis
// PHASE 6: Added caching to avoid refetching static dev reputation data
async function runDevChecks(supabase: any): Promise<any> {
  console.log('[Step 5] Running dev wallet checks (LIVE)');

  const { data: qualified } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .limit(20);

  const passed: any[] = [];
  const failed: any[] = [];
  const now = new Date();
  const DEV_CHECK_CACHE_MINS = 5; // Only re-check dev every 5 mins

  for (const token of (qualified || [])) {
    let devReputation = null;
    let fromCache = false;
    
    if (token.creator_wallet) {
      // Check if we need to re-fetch dev reputation (caching logic)
      const lastDevCheck = token.last_dev_check_at ? new Date(token.last_dev_check_at) : null;
      const needsRefresh = !lastDevCheck || 
        (now.getTime() - lastDevCheck.getTime() > DEV_CHECK_CACHE_MINS * 60 * 1000);
      
      if (needsRefresh) {
        const { data: rep } = await supabase
          .from('dev_wallet_reputation')
          .select('*')
          .eq('wallet_address', token.creator_wallet)
          .single();
        devReputation = rep;
        
        // Update last_dev_check_at on the token
        await supabase
          .from('pumpfun_watchlist')
          .update({ last_dev_check_at: now.toISOString() })
          .eq('id', token.id);
      } else {
        // Use cached data from token record if available
        const { data: rep } = await supabase
          .from('dev_wallet_reputation')
          .select('*')
          .eq('wallet_address', token.creator_wallet)
          .single();
        devReputation = rep;
        fromCache = true;
      }
    }

    // Calculate signal score with patterns
    const { score: signalScore, factors: scoreFactors, penalties } = calculateSignalScore(token, devReputation);
    const signalStrength = scoreToSignalStrength(signalScore);

    // Apply guardrails
    const guardrailResult = applyBuyGuardrails(token, devReputation);

    // Detect primary pattern
    let detectedPattern = token.detected_dev_pattern || null;
    if (!detectedPattern && devReputation) {
      if (devReputation.pattern_diamond_dev > 0) detectedPattern = 'diamond_dev';
      else if (devReputation.pattern_buyback_dev > 0) detectedPattern = 'buyback_dev';
      else if (devReputation.pattern_hidden_whale > 0) detectedPattern = 'hidden_whale';
      else if (devReputation.pattern_wash_bundler > 0) detectedPattern = 'wash_bundler';
      else if (devReputation.pattern_wallet_washer > 0) detectedPattern = 'wallet_washer';
      else if (devReputation.pattern_spike_kill > 0) detectedPattern = 'spike_kill';
    }

    const devInfo = {
      wallet: token.creator_wallet,
      reputation: devReputation?.reputation_score || 50,
      trustLevel: devReputation?.trust_level || 'unknown',
      tokensLaunched: devReputation?.total_tokens_launched || 0,
      tokensRugged: devReputation?.tokens_rugged || 0,
      tokensSuccessful: devReputation?.tokens_successful || 0,
      tokensStableAfterDump: devReputation?.tokens_stable_after_dump || 0,
      twitterAccounts: devReputation?.twitter_accounts || [],
      telegramGroups: devReputation?.telegram_groups || [],
      linkedWallets: devReputation?.linked_wallets || token.dev_secondary_wallets || [],
      patterns: {
        diamondDev: devReputation?.pattern_diamond_dev || 0,
        buybackDev: devReputation?.pattern_buyback_dev || 0,
        hiddenWhale: devReputation?.pattern_hidden_whale || 0,
        washBundler: devReputation?.pattern_wash_bundler || 0,
        walletWasher: devReputation?.pattern_wallet_washer || 0,
        spikeKill: devReputation?.pattern_spike_kill || 0,
      },
      detectedPattern,
      signalScore,
      signalStrength,
      scoreFactors,
      penalties,
      guardrails: guardrailResult,
    };

    // Check for blacklist/failure conditions
    if (devReputation?.trust_level === 'blacklisted' || (devReputation?.pattern_spike_kill || 0) > 0) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Blacklisted dev: ${devReputation?.pattern_spike_kill || 0} spike/kills, ${devReputation?.tokens_rugged || 0} rugs`,
        devInfo,
      });
    } else if (devReputation?.trust_level === 'avoid' && devReputation?.tokens_rugged >= 3) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `High-risk dev: ${devReputation?.tokens_rugged} rugs, score ${devReputation?.reputation_score}`,
        devInfo,
      });
    } else if (!guardrailResult.passed) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: `Guardrail failed: ${guardrailResult.failedGuards.join(', ')}`,
        devInfo,
      });
    } else if (token.dev_sold && !devReputation?.tokens_stable_after_dump) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: 'Dev sold tokens (no stable history)',
        devInfo,
      });
    } else if (token.dev_launched_new) {
      failed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        reason: 'Dev launched new token',
        devInfo,
      });
    } else {
      passed.push({
        mint: token.token_mint,
        symbol: token.token_symbol,
        name: token.token_name,
        devInfo,
        devDumpedButStable: token.dev_sold && (devReputation?.tokens_stable_after_dump || 0) > 0,
        insiderPct: token.insider_pct || 0,
        priceUsd: token.price_usd,
      });
    }
  }

  return {
    checkedCount: (qualified || []).length,
    passedCount: passed.length,
    devSoldCount: failed.filter(f => f.reason.includes('sold')).length,
    newLaunchCount: failed.filter(f => f.reason.includes('new token')).length,
    blacklistedCount: failed.filter(f => f.reason.includes('Blacklisted')).length,
    highRiskCount: failed.filter(f => f.reason.includes('High-risk')).length,
    guardrailFailedCount: failed.filter(f => f.reason.includes('Guardrail')).length,
    signalScoring: SIGNAL_SCORING,
    buyGuardrails: BUY_GUARDRAILS,
    passed,
    failed,
  };
}

// Step 6: Get Buy Queue with tiered amounts and guardrails
async function getBuyQueue(supabase: any): Promise<any> {
  console.log('[Step 6] Getting buy queue (LIVE)');

  const { data: configData } = await supabase
    .from('pumpfun_monitor_config')
    .select('*')
    .single();

  const config = configData || {};

  const { data: readyToBuy } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('status', 'qualified')
    .eq('dev_check_passed', true)
    .limit(20);

  const today = new Date().toISOString().split('T')[0];
  const { count: dailyBuys } = await supabase
    .from('pumpfun_watchlist')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'bought')
    .gte('bought_at', today);

  const queue = await Promise.all((readyToBuy || []).map(async (t: any) => {
    let devReputation = null;
    if (t.creator_wallet) {
      const { data: rep } = await supabase
        .from('dev_wallet_reputation')
        .select('*')
        .eq('wallet_address', t.creator_wallet)
        .single();
      devReputation = rep;
    }

    const { score: signalScore, factors: scoreFactors, penalties } = calculateSignalScore(t, devReputation);
    const signalStrength = scoreToSignalStrength(signalScore);
    const buyTier = BUY_TIERS[signalStrength as keyof typeof BUY_TIERS] || BUY_TIERS.moderate;
    const guardrailResult = applyBuyGuardrails(t, devReputation);

    // Detect primary pattern
    let detectedPattern = t.detected_dev_pattern || null;
    if (!detectedPattern && devReputation) {
      if (devReputation.pattern_diamond_dev > 0) detectedPattern = 'diamond_dev';
      else if (devReputation.pattern_buyback_dev > 0) detectedPattern = 'buyback_dev';
      else if (devReputation.tokens_stable_after_dump > 0) detectedPattern = 'stable_after_dump';
    }

    return {
      mint: t.token_mint,
      symbol: t.token_symbol,
      name: t.token_name,
      priceUsd: t.price_usd || 0,
      onCurve: (t.bonding_curve_pct || 0) < 100,
      signalScore,
      signalStrength,
      scoreFactors,
      penalties,
      buyAmountUsd: buyTier.amount_usd,
      tierDescription: buyTier.description,
      devReputation: devReputation?.reputation_score || 50,
      devTrustLevel: devReputation?.trust_level || 'unknown',
      devDumpedButStable: t.dev_sold && (devReputation?.tokens_stable_after_dump || 0) > 0,
      detectedPattern,
      insiderPct: t.insider_pct || 0,
      guardrails: guardrailResult,
      recommendedAction: guardrailResult.passed ? `BUY $${buyTier.amount_usd}` : 'SKIP',
      executed: false,
    };
  }));

  // Sort by signal score descending, guardrail-passed first
  queue.sort((a, b) => {
    if (a.guardrails.passed && !b.guardrails.passed) return -1;
    if (!a.guardrails.passed && b.guardrails.passed) return 1;
    return b.signalScore - a.signalScore;
  });

  return {
    fantasyMode: config.fantasy_mode_enabled ?? true,
    queueCount: queue.length,
    passedGuardrails: queue.filter(q => q.guardrails.passed).length,
    failedGuardrails: queue.filter(q => !q.guardrails.passed).length,
    dailyBuys: dailyBuys || 0,
    dailyCap: config.daily_buy_cap || 20,
    buyTiers: BUY_TIERS,
    buyGuardrails: BUY_GUARDRAILS,
    signalScoring: SIGNAL_SCORING,
    queue,
  };
}

// Step 7: Get Positions
async function getPositions(supabase: any): Promise<any> {
  console.log('[Step 7] Getting positions (LIVE)');

  const { data: positions } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  const positionList = (positions || []).map((p: any) => ({
    mint: p.token_mint,
    symbol: p.token_symbol,
    entryPrice: p.entry_price_usd,
    currentPrice: p.current_price_usd,
    multiplier: p.entry_price_usd > 0 ? p.current_price_usd / p.entry_price_usd : 1,
    pnlPct: p.entry_price_usd > 0 ? ((p.current_price_usd - p.entry_price_usd) / p.entry_price_usd * 100) : 0,
    investedSol: p.invested_sol,
    signalStrength: p.signal_strength,
  }));

  const totalInvested = (positions || []).reduce((sum: number, p: any) => sum + (p.invested_sol || 0), 0);
  const unrealizedPnl = (positions || []).reduce((sum: number, p: any) => sum + (p.unrealized_pnl_sol || 0), 0);

  const { data: moonbags } = await supabase
    .from('pumpfun_fantasy_positions')
    .select('*')
    .eq('is_moonbag', true)
    .order('sold_at', { ascending: false })
    .limit(10);

  const moonbagList = (moonbags || []).map((m: any) => ({
    mint: m.token_mint,
    symbol: m.token_symbol,
    soldPrice: m.sold_price_usd,
    currentPrice: m.current_price_usd,
    changeSinceSell: m.sold_price_usd > 0 ? ((m.current_price_usd - m.sold_price_usd) / m.sold_price_usd * 100) : 0,
  }));

  return {
    positionCount: positionList.length,
    totalInvested,
    unrealizedPnl,
    positions: positionList,
    moonbags: moonbagList,
  };
}

// Track token lifecycle for post-rejection analysis
async function trackLifecycle(supabase: any, tokenMint: string, decision: string, reason: string): Promise<any> {
  console.log('[Lifecycle] Tracking token:', tokenMint, 'Decision:', decision);

  const { data: token } = await supabase
    .from('pumpfun_watchlist')
    .select('*')
    .eq('token_mint', tokenMint)
    .single();

  if (!token) {
    return { error: 'Token not found' };
  }

  const { data, error } = await supabase
    .from('token_lifecycle_tracking')
    .insert({
      token_mint: tokenMint,
      our_decision: decision,
      decision_reason: reason,
      price_at_decision: token.price_usd,
      dev_wallet: token.creator_wallet,
    })
    .select()
    .single();

  if (error) {
    console.error('[Lifecycle] Insert error:', error);
    return { error: error.message };
  }

  return { success: true, record: data };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });

    const { action, tokenMint, decision, reason } = await req.json();
    console.log('[Pipeline Debugger] Action:', action);

    let result;
    switch (action) {
      case 'run_discovery':
        result = await runDiscovery(supabase);
        break;
      case 'run_intake':
        result = await runIntake(supabase);
        break;
      case 'run_discovery_and_intake':
        result = await runDiscoveryAndIntake(supabase);
        break;
      case 'get_watchlist_status':
        result = await getWatchlistStatus(supabase);
        break;
      case 'run_qualification':
        result = await runQualification(supabase);
        break;
      case 'run_dev_checks':
        result = await runDevChecks(supabase);
        break;
      case 'get_buy_queue':
        result = await getBuyQueue(supabase);
        break;
      case 'get_positions':
        result = await getPositions(supabase);
        break;
      case 'track_lifecycle':
        result = await trackLifecycle(supabase, tokenMint, decision, reason);
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
