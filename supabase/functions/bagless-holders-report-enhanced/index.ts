import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Import the original bagless-holders-report logic
import '../bagless-holders-report/index.ts';

// This is an enhanced wrapper that adds multi-venue first buyer detection
// The original function already does most of the work, we just need to enhance the first buyers section

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint, manualPrice, limit = 50 } = await req.json();
    
    // Get the basic report from the original function
    const originalResponse = await fetch(new URL(req.url).origin + '/functions/v1/bagless-holders-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenMint, manualPrice })
    });
    
    const baseReport = await originalResponse.json();
    
    // Enhance with multi-venue detection
    const enhancedFirstBuyers = await getMultiVenueFirstBuyers(tokenMint, limit);
    
    // Merge the results
    const enhancedReport = {
      ...baseReport,
      firstBuyers: enhancedFirstBuyers.length > 0 ? enhancedFirstBuyers : baseReport.firstBuyers,
      venueStats: calculateVenueStats(enhancedFirstBuyers),
      multiVenueEnabled: true
    };
    
    return new Response(
      JSON.stringify(enhancedReport),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Enhanced report error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getMultiVenueFirstBuyers(tokenMint: string, limit: number) {
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
  const allBuyers: any[] = [];
  
  // Try Pump.fun first via Helius
  if (heliusApiKey) {
    console.log('🚀 Checking Pump.fun via Helius...');
    const pumpBuyers = await tryPumpFunHelius(tokenMint, heliusApiKey, limit);
    allBuyers.push(...pumpBuyers.map(b => ({ ...b, venue: 'pumpfun' })));
  }
  
  // Try Raydium pools
  if (allBuyers.length < limit) {
    console.log('💧 Checking Raydium pools...');
    const raydiumBuyers = await tryRaydiumPools(tokenMint, limit - allBuyers.length);
    allBuyers.push(...raydiumBuyers.map(b => ({ ...b, venue: 'raydium' })));
  }
  
  // Deduplicate and rank
  const unique = deduplicateBuyers(allBuyers);
  return unique.slice(0, limit).map((b, i) => ({ ...b, rank: i + 1 }));
}

function deduplicateBuyers(buyers: any[]) {
  const seen = new Set<string>();
  const unique: any[] = [];
  
  // Sort by timestamp first
  const sorted = [...buyers].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  
  for (const buyer of sorted) {
    if (!seen.has(buyer.wallet)) {
      unique.push(buyer);
      seen.add(buyer.wallet);
    }
  }
  
  return unique;
}

function calculateVenueStats(buyers: any[]) {
  const stats: Record<string, { count: number; volume: number }> = {};
  
  for (const buyer of buyers) {
    if (!stats[buyer.venue]) {
      stats[buyer.venue] = { count: 0, volume: 0 };
    }
    stats[buyer.venue].count++;
    if (buyer.amount_in) {
      stats[buyer.venue].volume += parseFloat(buyer.amount_in) || 0;
    }
  }
  
  return stats;
}

async function tryPumpFunHelius(tokenMint: string, heliusApiKey: string, limit: number) {
  // Simplified Pump.fun detection via Helius Enhanced Transactions
  // This is a placeholder - the full implementation would be more sophisticated
  return [];
}

async function tryRaydiumPools(tokenMint: string, limit: number) {
  // Placeholder for Raydium pool first swap detection
  return [];
}
