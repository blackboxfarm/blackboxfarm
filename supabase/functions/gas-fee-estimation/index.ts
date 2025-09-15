import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FeeEstimation {
  basic: {
    estimatedCostSOL: number;
    estimatedCostUSD: number;
    speed: 'economy' | 'standard' | 'priority';
    successProbability: number;
    batchAvailable: boolean;
  };
  pro: {
    baseFee: number;
    priorityFee: number;
    computeUnits: number;
    computeUnitPrice: number;
    maxRetries: number;
    slippageTolerance: number;
    historicalAverage: number;
    networkCongestion: 'low' | 'medium' | 'high';
  };
  batch: {
    costPer100Operations: number;
    minimumOperations: number;
    effectiveCostPerOperation: number;
    recommendedForVolume: number;
  };
  competitive: {
    trojanFast: number;
    trojanTurbo: number;
    maestroFree: number;
    mevx: number;
    bananagun: number;
    ourAdvantage: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transactionType, amount, tokenMint } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get current Solana network fees from Helius RPC
    const heliusResponse = await fetch(`${Deno.env.get('SOLANA_RPC_URL')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('HELIUS_API_KEY')}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getRecentPrioritizationFees',
        params: [
          [tokenMint].filter(Boolean) // Only include if token provided
        ]
      })
    });

    const feeData = await heliusResponse.json();
    
    // Get SOL price for USD conversion
    const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const priceData = await priceResponse.json();
    const solPrice = priceData.solana?.usd || 20; // Fallback price

    // Realistic Solana base fee (5000 lamports = 0.000005 SOL)
    const baseFee = 0.000005;
    
    // Calculate priority fees based on recent data with realistic fallbacks
    const recentFees = feeData.result || [];
    const avgPriorityFee = recentFees.length > 0 
      ? recentFees.reduce((sum: number, fee: any) => sum + fee.prioritizationFee, 0) / recentFees.length / 1_000_000_000
      : 0.000001; // Conservative fallback for micro-trades

    // Determine network congestion
    const networkCongestion = avgPriorityFee > 0.00001 ? 'high' : avgPriorityFee > 0.000005 ? 'medium' : 'low';
    
    // Calculate compute units based on transaction type
    const computeUnits = transactionType === 'swap' ? 300_000 : 
                        transactionType === 'transfer' ? 200_000 : 250_000;
    
    // Smart fee tiers for different use cases
    const feeOptions = {
      economy: baseFee + (avgPriorityFee * 0.1), // For micro-trades where speed doesn't matter
      standard: baseFee + avgPriorityFee,        // Normal operations
      priority: baseFee + (avgPriorityFee * 2)   // When speed is critical
    };

    // Batch pricing model (Smithii-style)
    const batchModel = {
      costPer100Operations: 0.025, // SOL per 100 operations
      minimumOperations: 10,
      effectiveCostPerOperation: 0.025 / 100, // 0.00025 SOL per operation
      recommendedForVolume: 50 // Recommend batch mode for 50+ operations
    };

    // Honest competitive analysis based on real market data
    const competitiveData = {
      trojanFast: 0.0015,    // Trojan fast mode
      trojanTurbo: 0.0075,   // Trojan turbo mode  
      maestroFree: amount * 0.01,  // Maestro 1% fee
      mevx: amount * 0.008,        // MevX 0.8% fee
      bananagun: amount * 0.0075,  // BananaGun 0.5-1% fee (avg 0.75%)
      ourAdvantage: amount && amount < 0.1 ? 'batch_pricing' : 'competitive_fees'
    };

    const estimation: FeeEstimation = {
      basic: {
        estimatedCostSOL: amount < 0.1 ? feeOptions.economy : feeOptions.standard,
        estimatedCostUSD: (amount < 0.1 ? feeOptions.economy : feeOptions.standard) * solPrice,
        speed: amount < 0.1 ? 'economy' : 'standard',
        successProbability: networkCongestion === 'low' ? 95 : networkCongestion === 'medium' ? 85 : 75,
        batchAvailable: true
      },
      pro: {
        baseFee,
        priorityFee: avgPriorityFee,
        computeUnits,
        computeUnitPrice: Math.ceil(avgPriorityFee * 1_000_000_000 / computeUnits),
        maxRetries: networkCongestion === 'high' ? 5 : 3,
        slippageTolerance: transactionType === 'swap' ? (networkCongestion === 'high' ? 3 : 1) : 0,
        historicalAverage: avgPriorityFee,
        networkCongestion
      },
      batch: batchModel,
      competitive: competitiveData
    };

    // Store fee estimation for analytics
    await supabase.from('activity_logs').insert({
      message: 'Gas fee estimation',
      log_level: 'info',
      metadata: {
        ...estimation,
        transactionType,
        amount,
        tokenMint,
        solPrice
      }
    });

    return new Response(JSON.stringify(estimation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Gas fee estimation error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});