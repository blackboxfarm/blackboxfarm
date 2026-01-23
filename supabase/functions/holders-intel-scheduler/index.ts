import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  
  // Determine which slot based on hour
  if (hour >= 6 && hour < 12) {
    return `${dateStr}_08:00`;
  } else if (hour >= 12 && hour < 17) {
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
  
  if (timeStr === '08:00') {
    // 8 AM: Only compare against previous day's 6pm
    slots.push(`${prevDateStr}_18:00`);
  } else if (timeStr === '14:00') {
    // 2 PM: Compare against today's 8am + previous day's 6pm
    slots.push(`${dateStr}_08:00`);
    slots.push(`${prevDateStr}_18:00`);
  } else if (timeStr === '18:00') {
    // 6 PM: Compare against today's 2pm + 8am + previous day's 6pm
    slots.push(`${dateStr}_14:00`);
    slots.push(`${dateStr}_08:00`);
    slots.push(`${prevDateStr}_18:00`);
  }
  
  return slots;
}

async function fetchTrendingTokens(): Promise<TrendingToken[]> {
  console.log('[scheduler] Fetching top 50 trending Solana tokens from DexScreener...');
  
  const browserHeaders = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://dexscreener.com/',
    'Origin': 'https://dexscreener.com',
  };
  
  try {
    // Try the token-profiles endpoint first (known to work)
    let response = await fetch(
      'https://api.dexscreener.com/token-profiles/latest/v1',
      { headers: browserHeaders }
    );
    
    if (!response.ok) {
      console.log(`[scheduler] token-profiles failed with ${response.status}, trying search endpoint...`);
      
      // Fallback: search for popular Solana tokens
      response = await fetch(
        'https://api.dexscreener.com/latest/dex/search?q=solana',
        { headers: browserHeaders }
      );
    }
    
    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('[scheduler] Raw API response type:', Array.isArray(data) ? 'array' : typeof data);
    console.log('[scheduler] First item sample:', JSON.stringify((data.pairs || data)?.[0], null, 2)?.slice(0, 500));
    
    // Handle different response formats
    let allItems = data.pairs || data || [];
    
    // Filter for Solana tokens and take top 50
    const solanaTokens = allItems
      .filter((p: any) => (p.chainId === 'solana' || p.chain === 'solana'))
      .slice(0, 50);
    
    console.log(`[scheduler] Found ${solanaTokens.length} Solana tokens`);
    
    const tokens: TrendingToken[] = solanaTokens.map((pair: any) => ({
      mint: pair.tokenAddress || pair.baseToken?.address,
      symbol: pair.baseToken?.symbol || pair.symbol || 'UNKNOWN',
      name: pair.baseToken?.name || pair.name || 'Unknown Token',
      marketCap: pair.marketCap || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
    }));
    
    console.log(`[scheduler] Total tokens collected: ${tokens.length}`);
    return tokens;
    
  } catch (error) {
    console.error('[scheduler] Error fetching trending tokens:', error);
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
    
    if (trendingTokens.length === 0) {
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
    
    const elapsed = Date.now() - startTime;
    
    return new Response(
      JSON.stringify({
        success: true,
        slot: currentSlot,
        trendingFetched: trendingTokens.length,
        alreadySeen: seenMints.size,
        newTokens: newTokens.length,
        qualifiedTokens: qualifiedTokens.length,
        queued: queueInserts.length,
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
