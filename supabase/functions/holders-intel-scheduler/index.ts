import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { withRunLog } from "../_shared/run-logger.ts";

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

// Cloudflare worker suspended — now using internal dex-top-200 edge function
// const CLOUDFLARE_WORKER_URL = 'https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana';

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

// Tier thresholds for proven dev tracking (expanded to 200k+)
const TIER_THRESHOLDS = [
  { tier: 8, minMcap: 3_000_000 },
  { tier: 7, minMcap: 2_000_000 },
  { tier: 6, minMcap: 1_000_000 },
  { tier: 5, minMcap: 800_000 },
  { tier: 4, minMcap: 600_000 },
  { tier: 3, minMcap: 400_000 },
  { tier: 2, minMcap: 300_000 },
  { tier: 1, minMcap: 200_000 },
];

function calculateTier(marketCap: number): number {
  for (const t of TIER_THRESHOLDS) {
    if (marketCap >= t.minMcap) return t.tier;
  }
  return 0;
}

const TIER_COLUMN_MAP: Record<number, string> = {
  1: 'tier_200k_at', 2: 'tier_300k_at', 3: 'tier_1_at', 4: 'tier_2_at',
  5: 'tier_3_at', 6: 'tier_4_at', 7: 'tier_5_at', 8: 'tier_6_at',
};

async function upsertProvenDevTokens(supabase: any, tokens: TrendingToken[], currentSlot: string) {
  const qualifying = tokens.filter(t => t.marketCap >= 200_000);
  if (qualifying.length === 0) return;

  console.log(`[scheduler] ${qualifying.length} tokens qualify for proven dev tracking (≥200k mcap)`);

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
  console.log('[scheduler] Fetching from internal dex-top-200 edge function...');
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    const response = await fetch(`${supabaseUrl}/functions/v1/dex-top-200`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
    
    if (!response.ok) {
      console.error('[scheduler] dex-top-200 fetch failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.success) {
      console.error('[scheduler] dex-top-200 returned error:', data.error);
      return [];
    }
    
    console.log(`[scheduler] Got ${data.total || 0} ranked tokens from dex-top-200 (${data.resolved || 0} resolved)`);
    
    const tokens: TrendingToken[] = [];
    
    for (const t of (data.tokens || [])) {
      if (t.tokenMint) {
        tokens.push({
          mint: t.tokenMint,
          symbol: t.symbol || 'UNKNOWN',
          name: t.name || 'Unknown Token',
          marketCap: t.fdv || t.marketCap || 0,
          priceChange24h: 0,
        });
      }
    }
    
    console.log(`[scheduler] Total tokens from dex-top-200: ${tokens.length}`);
    if (tokens.length > 0) {
      console.log(`[scheduler] Sample: ${tokens.slice(0, 5).map((t: TrendingToken) => t.symbol).join(', ')}`);
    }
    
    return tokens;
    
  } catch (error) {
    console.error('[scheduler] Error fetching from dex-top-200:', error);
    return [];
  }
}

Deno.serve(withRunLog('holders-intel-scheduler', async (req) => {
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
    console.log(`[scheduler] Already seen tokens (slot-based): ${seenMints.size}`);
    
    // ALSO check post_queue for tokens already posted or currently pending
    // This prevents re-queuing tokens that stay in the Dex Top 200 for days
    // Now includes ALL statuses + 7-day cooldown for expired/skipped/failed
    const trendingMints = trendingTokens.map(t => t.mint);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // Check for ANY status - if it was ever queued recently, skip it
    const { data: alreadyQueued, error: queuedError } = await supabase
      .from('holders_intel_post_queue')
      .select('token_mint')
      .in('token_mint', trendingMints)
      .gte('created_at', sevenDaysAgo);
    
    if (queuedError) {
      console.error('[scheduler] Error checking existing queue:', queuedError);
    }
    
    const queuedMints = new Set((alreadyQueued || []).map(t => t.token_mint));
    console.log(`[scheduler] Already queued/posted: ${queuedMints.size}`);
    
    // Filter out both seen AND already queued/posted tokens
    const newTokens = trendingTokens.filter(t => !seenMints.has(t.mint) && !queuedMints.has(t.mint));
    console.log(`[scheduler] New tokens to queue (pre-established filter): ${newTokens.length} (filtered ${queuedMints.size} already in queue)`);
    
    // Filter out ESTABLISHED tokens: old (>7d) with high mcap (>500k) unless actively boosted
    // These tokens like $LOOK, $WOJAK don't need repeated posting
    const newMints = newTokens.map(t => t.mint);
    let establishedMints = new Set<string>();
    
    if (newMints.length > 0) {
      const sevenDaysAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      
      // Batch query token_lifecycle for age + boost data
      for (let i = 0; i < newMints.length; i += 50) {
        const batch = newMints.slice(i, i + 50);
        const { data: lifecycleData } = await supabase
          .from('token_lifecycle')
          .select('token_mint, pair_created_at, first_seen_at, market_cap, active_boosts')
          .in('token_mint', batch);
        
        if (lifecycleData) {
          for (const lc of lifecycleData) {
            const pairAge = lc.pair_created_at ? new Date(lc.pair_created_at) : null;
            const firstSeen = new Date(lc.first_seen_at);
            const effectiveAge = pairAge || firstSeen;
            const ageMs = Date.now() - effectiveAge.getTime();
            const ageDays = ageMs / (24 * 60 * 60 * 1000);
            const mcap = lc.market_cap || 0;
            const hasBoosts = (lc.active_boosts || 0) > 0;
            
            // Established = older than 7 days AND mcap > 500k AND no active boosts
            if (ageDays > 7 && mcap > 500_000 && !hasBoosts) {
              establishedMints.add(lc.token_mint);
            }
          }
        }
      }
      
      if (establishedMints.size > 0) {
        console.log(`[scheduler] ⏭ Skipping ${establishedMints.size} established tokens (>7d old, >500k mcap, no boosts)`);
      }
    }
    
    const qualifiedTokens = newTokens.filter(t => !establishedMints.has(t.mint));
    
    // CAP: Check current pending count — don't flood the queue beyond 50 pending
    const { count: currentPending } = await supabase
      .from('holders_intel_post_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    const pendingCount = currentPending || 0;
    const maxPending = 50;
    const slotsAvailable = Math.max(0, maxPending - pendingCount);
    
    const cappedTokens = qualifiedTokens.slice(0, slotsAvailable);
    
    if (qualifiedTokens.length > slotsAvailable) {
      console.log(`[scheduler] ⚠️ Queue cap: ${pendingCount} already pending, only adding ${slotsAvailable} of ${qualifiedTokens.length} qualified`);
    }
    console.log(`[scheduler] Final tokens to queue: ${cappedTokens.length} (cap: ${slotsAvailable} slots available)`);
    
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
        trigger_source: 'scheduler',
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
        establishedSkipped: establishedMints.size,
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
}));
