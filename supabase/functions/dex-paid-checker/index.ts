import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DexPaidStatus {
  tokenMint: string;
  activeBoosts: number;
  hasPaidProfile: boolean;
  hasActiveAds: boolean;
  hasCTO: boolean;
  orders: Array<{
    type: string;
    status: string;
    paymentTimestamp?: number;
  }>;
  checkedAt: string;
}

interface DexScreenerOrder {
  type: 'tokenProfile' | 'communityTakeover' | 'tokenAd' | 'trendingBarAd';
  status: 'processing' | 'cancelled' | 'on-hold' | 'approved' | 'rejected';
  paymentTimestamp?: number;
}

interface DexScreenerPair {
  boosts?: {
    active?: number;
  };
}

async function fetchDexScreenerOrders(tokenMint: string): Promise<DexScreenerOrder[]> {
  try {
    const response = await fetch(`https://api.dexscreener.com/orders/v1/solana/${tokenMint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FlipIt-Bot/1.0'
      }
    });
    
    if (!response.ok) {
      console.log(`DexScreener orders API returned ${response.status} for ${tokenMint}`);
      return [];
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`Error fetching DexScreener orders for ${tokenMint}:`, error);
    return [];
  }
}

async function fetchDexScreenerBoosts(tokenMint: string): Promise<number> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'FlipIt-Bot/1.0'
      }
    });
    
    if (!response.ok) {
      console.log(`DexScreener tokens API returned ${response.status} for ${tokenMint}`);
      return 0;
    }
    
    const data = await response.json();
    
    // Get the max boost count across all pairs
    let maxBoosts = 0;
    if (data.pairs && Array.isArray(data.pairs)) {
      for (const pair of data.pairs) {
        const pairBoosts = pair.boosts?.active || 0;
        if (pairBoosts > maxBoosts) {
          maxBoosts = pairBoosts;
        }
      }
    }
    
    return maxBoosts;
  } catch (error) {
    console.error(`Error fetching DexScreener boosts for ${tokenMint}:`, error);
    return 0;
  }
}

async function checkDexPaidStatus(tokenMint: string): Promise<DexPaidStatus> {
  console.log(`Checking DEX paid status for ${tokenMint}`);
  
  // Fetch orders and boosts in parallel
  const [orders, activeBoosts] = await Promise.all([
    fetchDexScreenerOrders(tokenMint),
    fetchDexScreenerBoosts(tokenMint)
  ]);
  
  // Analyze orders
  const approvedOrders = orders.filter(o => o.status === 'approved');
  
  const hasPaidProfile = approvedOrders.some(o => o.type === 'tokenProfile');
  const hasActiveAds = approvedOrders.some(o => o.type === 'tokenAd' || o.type === 'trendingBarAd');
  const hasCTO = approvedOrders.some(o => o.type === 'communityTakeover');
  
  const result: DexPaidStatus = {
    tokenMint,
    activeBoosts,
    hasPaidProfile,
    hasActiveAds,
    hasCTO,
    orders: orders.map(o => ({
      type: o.type,
      status: o.status,
      paymentTimestamp: o.paymentTimestamp
    })),
    checkedAt: new Date().toISOString()
  };
  
  console.log(`DEX status for ${tokenMint}: boosts=${activeBoosts}, paid=${hasPaidProfile}, ads=${hasActiveAds}, cto=${hasCTO}`);
  
  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { tokenMints, positionId, updateDb = true } = await req.json();
    
    // Handle single token or array of tokens
    const mints: string[] = tokenMints 
      ? (Array.isArray(tokenMints) ? tokenMints : [tokenMints])
      : [];
    
    // If positionId provided, fetch the token from that position
    if (positionId && mints.length === 0) {
      const { data: position, error } = await supabase
        .from('flip_positions')
        .select('token_mint')
        .eq('id', positionId)
        .single();
      
      if (error || !position) {
        throw new Error(`Position not found: ${positionId}`);
      }
      
      mints.push(position.token_mint);
    }
    
    if (mints.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No token mints provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Check status for all tokens (with rate limiting - max 5 concurrent)
    const results: DexPaidStatus[] = [];
    const batchSize = 5;
    
    for (let i = 0; i < mints.length; i += batchSize) {
      const batch = mints.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(mint => checkDexPaidStatus(mint))
      );
      results.push(...batchResults);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < mints.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    // Update database if requested
    if (updateDb) {
      for (const status of results) {
        const { error } = await supabase
          .from('flip_positions')
          .update({ 
            dex_paid_status: status 
          })
          .eq('token_mint', status.tokenMint)
          .in('status', ['holding', 'buying']); // Only update active positions
        
        if (error) {
          console.error(`Error updating dex_paid_status for ${status.tokenMint}:`, error);
        }
      }
    }
    
    return new Response(
      JSON.stringify({ 
        success: true,
        results,
        count: results.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in dex-paid-checker:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        success: false
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
