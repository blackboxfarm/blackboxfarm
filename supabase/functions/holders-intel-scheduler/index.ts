import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TrendingToken {
  mint: string;
  symbol: string;
  name: string;
  marketCap: number;
  priceChange24h: number;
}

// Toronto timezone offset (EST = -5, EDT = -4)
function getTorontoTime(): Date {
  const now = new Date();
  // This gives us the current Toronto time
  const torontoOffset = now.toLocaleString('en-US', { timeZone: 'America/Toronto' });
  return new Date(torontoOffset);
}

function getSnapshotSlot(): string {
  const toronto = getTorontoTime();
  const hour = toronto.getHours();
  const dateStr = toronto.toISOString().split('T')[0];
  
  // Determine which slot based on hour (4 slots: 2am, 8am, 2pm, 6pm)
  if (hour >= 0 && hour < 5) {
    return `${dateStr}_02:00`;
  } else if (hour >= 5 && hour < 11) {
    return `${dateStr}_08:00`;
  } else if (hour >= 11 && hour < 17) {
    return `${dateStr}_14:00`;
  } else {
    return `${dateStr}_18:00`;
  }
}

function getPreviousSnapshotSlots(currentSlot: string): string[] {
  const [dateStr, timeStr] = currentSlot.split('_');
  const date = new Date(dateStr);
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().split('T')[0];
  
  const slots: string[] = [];
  
  if (timeStr === '02:00') {
    // 2 AM: Compare against previous day's 6pm + 2pm
    slots.push(`${prevDateStr}_18:00`);
    slots.push(`${prevDateStr}_14:00`);
  } else if (timeStr === '08:00') {
    // 8 AM: Compare against today's 2am + previous day's 6pm
    slots.push(`${dateStr}_02:00`);
    slots.push(`${prevDateStr}_18:00`);
  } else if (timeStr === '14:00') {
    // 2 PM: Compare against today's 8am + 2am + previous day's 6pm
    slots.push(`${dateStr}_08:00`);
    slots.push(`${dateStr}_02:00`);
    slots.push(`${prevDateStr}_18:00`);
  } else if (timeStr === '18:00') {
    // 6 PM: Compare against today's 2pm + 8am + 2am
    slots.push(`${dateStr}_14:00`);
    slots.push(`${dateStr}_08:00`);
    slots.push(`${dateStr}_02:00`);
  }
  
  return slots;
}

const CLOUDFLARE_WORKER_URL = 'https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana';

// Fetch mint address from DexScreener pair page if worker didn't resolve it
async function fetchMintFromPair(pairId: string): Promise<{ mint: string | null; symbol: string; name: string }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${pairId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
    
    const data = await response.json();
    const pair = data.pair || data.pairs?.[0];
    
    if (pair?.baseToken?.address) {
      return {
        mint: pair.baseToken.address,
        symbol: pair.baseToken.symbol || 'UNKNOWN',
        name: pair.baseToken.name || 'Unknown',
      };
    }
    return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
  } catch (e) {
    console.error(`[scheduler] Failed to fetch pair ${pairId}:`, e);
    return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
  }
}

// Tier thresholds for proven dev tracking
const TIER_THRESHOLDS = [
  { tier: 6, minMcap: 3_000_000 },
  { tier: 5, minMcap: 2_000_000 },
  { tier: 4, minMcap: 1_000_000 },
  { tier: 3, minMcap: 800_000 },
  { tier: 2, minMcap: 600_000 },
  { tier: 1, minMcap: 400_000 },
];

function calculateTier(marketCap: number): number {
  for (const t of TIER_THRESHOLDS) {
    if (marketCap >= t.minMcap) return t.tier;
  }
  return 0;
}

const TIER_COLUMN_MAP: Record<number, string> = {
  1: 'tier_1_at', 2: 'tier_2_at', 3: 'tier_3_at',
  4: 'tier_4_at', 5: 'tier_5_at', 6: 'tier_6_at',
};

async function upsertProvenDevTokens(supabase: any, tokens: TrendingToken[], currentSlot: string) {
  const qualifying = tokens.filter(t => t.marketCap >= 400_000);
  if (qualifying.length === 0) return;

  console.log(`[scheduler] ${qualifying.length} tokens qualify for proven dev tracking (≥400k mcap)`);

  for (const token of qualifying) {
    const tier = calculateTier(token.marketCap);
    const now = new Date().toISOString();

    // Check if already exists
    const { data: existing } = await supabase
      .from('proven_dev_tokens')
      .select('id, tier, market_cap_ath')
      .eq('token_mint', token.mint)
      .maybeSingle();

    if (existing) {
      // Only update if new tier is HIGHER or new ATH
      if (tier > existing.tier || token.marketCap > (existing.market_cap_ath || 0)) {
        const updates: Record<string, any> = {
          updated_at: now,
        };

        if (token.marketCap > (existing.market_cap_ath || 0)) {
          updates.market_cap_ath = token.marketCap;
          updates.ath_timestamp = now;
        }

        if (tier > existing.tier) {
          updates.tier = tier;
          // Set timestamp for each new tier reached
          for (let t = existing.tier + 1; t <= tier; t++) {
            const col = TIER_COLUMN_MAP[t];
            if (col) updates[col] = now;
          }
          console.log(`[scheduler] ⬆ ${token.symbol} upgraded T${existing.tier}→T${tier} (mcap: ${token.marketCap})`);
        }

        await supabase
          .from('proven_dev_tokens')
          .update(updates)
          .eq('id', existing.id);
      }
    } else {
      // New entry
      const tierTimestamps: Record<string, string> = {};
      for (let t = 1; t <= tier; t++) {
        const col = TIER_COLUMN_MAP[t];
        if (col) tierTimestamps[col] = now;
      }

      const { error } = await supabase
        .from('proven_dev_tokens')
        .insert({
          token_mint: token.mint,
          symbol: token.symbol,
          name: token.name,
          tier,
          market_cap_at_discovery: token.marketCap,
          market_cap_ath: token.marketCap,
          ath_timestamp: now,
          snapshot_slot: currentSlot,
          trigger_source: 'dex_trending',
          ...tierTimestamps,
        });

      if (!error) {
        console.log(`[scheduler] ✦ New proven token: ${token.symbol} at T${tier} (mcap: ${token.marketCap})`);
      }
    }
  }
}

async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  console.log('[scheduler] Fetching from Cloudflare KV worker...');
  
  try {
    const response = await fetch(CLOUDFLARE_WORKER_URL);
    
    if (!response.ok) {
      console.error('[scheduler] Worker fetch failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (data.stale) {
      console.warn('[scheduler] Warning: Worker data is stale');
    }
    
    console.log(`[scheduler] Got ${data.countPairsResolved || 0}/${data.countPairsRequested || 0} resolved pairs from worker`);
    
    const allPairs = data.pairs || [];
    const tokens: TrendingToken[] = [];
    
    // Process ALL pairs, not just resolved ones
    for (let i = 0; i < Math.min(allPairs.length, 50); i++) {
      const p = allPairs[i];
      
      if (p.ok && p.tokenMint) {
        // Worker resolved it - use directly
        tokens.push({
          mint: p.tokenMint,
          symbol: p.symbol || 'UNKNOWN',
          name: p.name || 'Unknown Token',
          marketCap: p.fdv || 0,
          priceChange24h: 0,
        });
      } else if (p.pairId) {
        // Worker didn't resolve - fetch from DexScreener ourselves
        console.log(`[scheduler] Resolving unresolved pair #${i + 1}: ${p.pairId}`);
        const resolved = await fetchMintFromPair(p.pairId);
        
        if (resolved.mint) {
          tokens.push({
            mint: resolved.mint,
            symbol: resolved.symbol,
            name: resolved.name,
            marketCap: p.fdv || 0,
            priceChange24h: 0,
          });
        } else {
          console.warn(`[scheduler] Could not resolve pair ${p.pairId}`);
        }
      }
    }
    
    console.log(`[scheduler] Total tokens after resolution: ${tokens.length}`);
    if (tokens.length > 0) {
      console.log(`[scheduler] Sample: ${tokens.slice(0, 5).map((t: TrendingToken) => t.symbol).join(', ')}`);
    }
    
    return tokens;
    
  } catch (error) {
    console.error('[scheduler] Error fetching from Cloudflare worker:', error);
    return [];
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const currentSlot = getSnapshotSlot();
    const previousSlots = getPreviousSnapshotSlots(currentSlot);
    
    console.log(`[scheduler] Current slot: ${currentSlot}`);
    console.log(`[scheduler] Previous slots to filter: ${previousSlots.join(', ')}`);
    
    // Fetch trending tokens
    const trendingTokens = await fetchTrendingTokens();
    
    // Proven Dev Tracking: upsert ALL tokens ≥400k mcap (runs in parallel, non-blocking)
    const tierTrackingPromise = upsertProvenDevTokens(supabase, trendingTokens, currentSlot)
      .catch(err => console.error('[scheduler] Tier tracking error (non-fatal):', err));
    
    if (trendingTokens.length === 0) {
      await tierTrackingPromise; // still let tier tracking finish
      return new Response(
        JSON.stringify({ success: false, error: 'No trending tokens found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get already seen tokens from previous slots
    const { data: seenTokens, error: seenError } = await supabase
      .from('holders_intel_seen_tokens')
      .select('token_mint')
      .in('snapshot_slot', previousSlots);
    
    if (seenError) {
      console.error('[scheduler] Error fetching seen tokens:', seenError);
    }
    
    const seenMints = new Set((seenTokens || []).map(t => t.token_mint));
    console.log(`[scheduler] Already seen tokens: ${seenMints.size}`);
    
    // Filter out already seen tokens
    const newTokens = trendingTokens.filter(t => !seenMints.has(t.mint));
    console.log(`[scheduler] New tokens to queue: ${newTokens.length}`);
    
    // No filtering here - we take all 50 trending tokens
    // Quality checks happen in the poster (holders count, health grade)
    const qualifiedTokens = newTokens;
    
    console.log(`[scheduler] New tokens to queue: ${qualifiedTokens.length}`);
    
    // Insert seen tokens
    if (qualifiedTokens.length > 0) {
      const seenInserts = qualifiedTokens.map(t => ({
        token_mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        snapshot_slot: currentSlot,
        market_cap_at_discovery: t.marketCap,
        was_posted: false,
      }));
      
      const { error: insertSeenError } = await supabase
        .from('holders_intel_seen_tokens')
        .upsert(seenInserts, { 
          onConflict: 'token_mint',
          ignoreDuplicates: false 
        });
      
      if (insertSeenError) {
        console.error('[scheduler] Error inserting seen tokens:', insertSeenError);
      }
    }
    
    // Queue tokens with random delays (3-10 minutes apart)
    const now = new Date();
    let cumulativeDelayMs = 0;
    
    const queueInserts = qualifiedTokens.map((t, index) => {
      // Random delay between 3-10 minutes (180000-600000 ms)
      const delayMs = 180000 + Math.floor(Math.random() * 420000);
      cumulativeDelayMs += delayMs;
      
      const scheduledAt = new Date(now.getTime() + cumulativeDelayMs);
      
      return {
        token_mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        scheduled_at: scheduledAt.toISOString(),
        status: 'pending',
        market_cap: t.marketCap,
        snapshot_slot: currentSlot,
      };
    });
    
    if (queueInserts.length > 0) {
      const { error: queueError } = await supabase
        .from('holders_intel_post_queue')
        .insert(queueInserts);
      
      if (queueError) {
        console.error('[scheduler] Error queuing tokens:', queueError);
        throw queueError;
      }
      
      console.log(`[scheduler] Queued ${queueInserts.length} tokens for posting`);
      
      // Log estimated completion time
      const lastScheduled = queueInserts[queueInserts.length - 1].scheduled_at;
      console.log(`[scheduler] Last post scheduled for: ${lastScheduled}`);
    }
    
    // Wait for tier tracking to complete before responding
    await tierTrackingPromise;
    
    const elapsed = Date.now() - startTime;
    const tierQualified = trendingTokens.filter(t => t.marketCap >= 400_000).length;
    
    return new Response(
      JSON.stringify({
        success: true,
        slot: currentSlot,
        trendingFetched: trendingTokens.length,
        alreadySeen: seenMints.size,
        newTokens: newTokens.length,
        qualifiedTokens: qualifiedTokens.length,
        queued: queueInserts.length,
        tierTracked: tierQualified,
        executionTimeMs: elapsed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('[scheduler] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
