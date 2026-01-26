import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Trigger type definitions and their comment messages
const TRIGGER_CONFIGS = {
  dex_paid: { comment: ' : Just Paid Dex!', priority: 1 },
  cto: { comment: ' : CTO Paid!', priority: 2 },
  boost_100: { comment: ' : Boost 100x!', priority: 3 },
  boost_50: { comment: ' : Boost 50x!', priority: 4 },
  ads: { comment: ' : Ads Started!', priority: 5 },
} as const;

type TriggerType = keyof typeof TRIGGER_CONFIGS;

interface BoostToken {
  chainId: string;
  tokenAddress: string;
  amount: number;
  totalAmount: number;
  icon?: string;
  name?: string;
  symbol?: string;
  description?: string;
  links?: { label: string; url: string }[];
  url?: string;
}

interface OrderInfo {
  type: string;
  status: string;
  paymentTimestamp?: number;
}

interface DetectedTrigger {
  tokenMint: string;
  symbol: string;
  name: string;
  triggerType: TriggerType;
  boostCount?: number;
}

// Fetch token info from DexScreener pairs endpoint
async function fetchTokenInfo(tokenMint: string): Promise<{ symbol: string; name: string }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; HoldersIntel/1.0)',
      },
    });
    
    if (!response.ok) {
      return { symbol: 'UNKNOWN', name: 'Unknown Token' };
    }
    
    const data = await response.json();
    const pairs = data?.pairs || [];
    
    if (pairs.length > 0) {
      const pair = pairs[0];
      return {
        symbol: pair.baseToken?.symbol || 'UNKNOWN',
        name: pair.baseToken?.name || 'Unknown Token',
      };
    }
    
    return { symbol: 'UNKNOWN', name: 'Unknown Token' };
  } catch {
    return { symbol: 'UNKNOWN', name: 'Unknown Token' };
  }
}
async function fetchTopBoostedTokens(): Promise<BoostToken[]> {
  console.log('[dex-scanner] Fetching top boosted tokens...');
  
  try {
    const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; HoldersIntel/1.0)',
      },
    });
    
    if (!response.ok) {
      console.error('[dex-scanner] Top boosts fetch failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    // Filter for Solana tokens only
    const solanaTokens = (data || []).filter((t: BoostToken) => t.chainId === 'solana');
    console.log(`[dex-scanner] Found ${solanaTokens.length} Solana boosted tokens`);
    
    return solanaTokens;
  } catch (err) {
    console.error('[dex-scanner] Error fetching top boosted:', err);
    return [];
  }
}

// Fetch order details for a specific token
async function fetchTokenOrders(tokenMint: string): Promise<OrderInfo[]> {
  try {
    const response = await fetch(`https://api.dexscreener.com/orders/v1/solana/${tokenMint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; HoldersIntel/1.0)',
      },
    });
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    
    // Handle different response formats - could be array or object with orders property
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.orders)) {
      return data.orders;
    }
    // If data is empty or unexpected format, return empty array
    return [];
  } catch {
    return [];
  }
}

// Detect triggers for a boosted token
async function detectTriggers(token: BoostToken): Promise<DetectedTrigger[]> {
  const triggers: DetectedTrigger[] = [];
  const now = Date.now();
  const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
  
  // Get token info if not provided in boost response
  let symbol = token.symbol || '';
  let name = token.name || '';
  
  if (!symbol || symbol === 'UNKNOWN' || !name || name === 'Unknown Token') {
    const tokenInfo = await fetchTokenInfo(token.tokenAddress);
    symbol = tokenInfo.symbol;
    name = tokenInfo.name;
  }
  
  // Get detailed order info
  const orders = await fetchTokenOrders(token.tokenAddress);
  
  // Check for boost thresholds
  if (token.totalAmount >= 100) {
    triggers.push({
      tokenMint: token.tokenAddress,
      symbol,
      name,
      triggerType: 'boost_100',
      boostCount: token.totalAmount,
    });
  } else if (token.totalAmount >= 50) {
    triggers.push({
      tokenMint: token.tokenAddress,
      symbol,
      name,
      triggerType: 'boost_50',
      boostCount: token.totalAmount,
    });
  }
  
  // Check for approved orders with recent payment timestamps
  for (const order of orders) {
    if (order.status !== 'approved') continue;
    
    // Only consider orders paid within last 24 hours
    const isRecent = order.paymentTimestamp && order.paymentTimestamp > twentyFourHoursAgo;
    if (!isRecent) continue;
    
    if (order.type === 'tokenProfile') {
      triggers.push({
        tokenMint: token.tokenAddress,
        symbol,
        name,
        triggerType: 'dex_paid',
      });
    } else if (order.type === 'communityTakeover') {
      triggers.push({
        tokenMint: token.tokenAddress,
        symbol,
        name,
        triggerType: 'cto',
      });
    } else if (order.type === 'tokenAd' || order.type === 'trendingBarAd') {
      triggers.push({
        tokenMint: token.tokenAddress,
        symbol,
        name,
        triggerType: 'ads',
      });
    }
  }
  
  return triggers;
}

// Add a small delay between API calls to respect rate limits
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
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
    
    // Fetch top boosted tokens
    const boostedTokens = await fetchTopBoostedTokens();
    
    if (boostedTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No boosted tokens found', triggersDetected: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Process top 30 tokens to stay within rate limits
    const tokensToProcess = boostedTokens.slice(0, 30);
    const allTriggers: DetectedTrigger[] = [];
    
    console.log(`[dex-scanner] Processing ${tokensToProcess.length} tokens for triggers...`);
    
    for (const token of tokensToProcess) {
      const triggers = await detectTriggers(token);
      allTriggers.push(...triggers);
      
      // Small delay between API calls
      await delay(100);
    }
    
    console.log(`[dex-scanner] Detected ${allTriggers.length} potential triggers`);
    
    // Check which triggers are new (not already in the tracking table)
    const newTriggers: DetectedTrigger[] = [];
    
    for (const trigger of allTriggers) {
      const { data: existing } = await supabase
        .from('holders_intel_dex_triggers')
        .select('id')
        .eq('token_mint', trigger.tokenMint)
        .eq('trigger_type', trigger.triggerType)
        .maybeSingle();
      
      if (!existing) {
        newTriggers.push(trigger);
      }
    }
    
    console.log(`[dex-scanner] ${newTriggers.length} new triggers to queue`);
    
    // Queue new triggers with staggered scheduling
    let queuedCount = 0;
    const baseTime = Date.now();
    
    // Sort by priority (dex_paid first, then cto, etc.)
    newTriggers.sort((a, b) => {
      const prioA = TRIGGER_CONFIGS[a.triggerType].priority;
      const prioB = TRIGGER_CONFIGS[b.triggerType].priority;
      return prioA - prioB;
    });
    
    for (let i = 0; i < newTriggers.length; i++) {
      const trigger = newTriggers[i];
      const triggerConfig = TRIGGER_CONFIGS[trigger.triggerType];
      
      // Stagger posts 2-5 minutes apart
      const delayMinutes = 2 + Math.random() * 3;
      const scheduledTime = new Date(baseTime + (i * delayMinutes * 60 * 1000));
      
      // Insert into post queue
      const { data: queueItem, error: queueError } = await supabase
        .from('holders_intel_post_queue')
        .insert({
          token_mint: trigger.tokenMint,
          symbol: trigger.symbol,
          name: trigger.name,
          status: 'pending',
          scheduled_at: scheduledTime.toISOString(),
          trigger_comment: triggerConfig.comment,
          trigger_source: 'dex_scanner',
        })
        .select('id')
        .single();
      
      if (queueError) {
        console.error(`[dex-scanner] Failed to queue ${trigger.symbol}:`, queueError.message);
        continue;
      }
      
      // Record in triggers table
      const { error: triggerError } = await supabase
        .from('holders_intel_dex_triggers')
        .insert({
          token_mint: trigger.tokenMint,
          symbol: trigger.symbol,
          name: trigger.name,
          trigger_type: trigger.triggerType,
          boost_count: trigger.boostCount,
          queue_id: queueItem?.id,
        });
      
      if (triggerError) {
        console.error(`[dex-scanner] Failed to record trigger for ${trigger.symbol}:`, triggerError.message);
      } else {
        console.log(`[dex-scanner] Queued: ${trigger.symbol} (${trigger.triggerType}) → "${triggerConfig.comment}"`);
        queuedCount++;
      }
    }
    
    const elapsed = Date.now() - startTime;
    
    return new Response(
      JSON.stringify({
        success: true,
        tokensScanned: tokensToProcess.length,
        triggersDetected: allTriggers.length,
        newTriggersQueued: queuedCount,
        executionTimeMs: elapsed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('[dex-scanner] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
