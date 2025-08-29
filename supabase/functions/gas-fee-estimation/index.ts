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
    speed: 'slow' | 'medium' | 'fast';
    successProbability: number;
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

    // Get current Solana network fees from Helios RPC
    const heliosResponse = await fetch(`${Deno.env.get('SOLANA_RPC_URL')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('HELIOS_API_KEY')}`,
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

    const feeData = await heliosResponse.json();
    
    // Get SOL price for USD conversion
    const priceResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const priceData = await priceResponse.json();
    const solPrice = priceData.solana?.usd || 20; // Fallback price

    // Calculate base transaction fee (5000 lamports = 0.000005 SOL)
    const baseFee = 0.000005;
    
    // Calculate priority fees based on recent data
    const recentFees = feeData.result || [];
    const avgPriorityFee = recentFees.length > 0 
      ? recentFees.reduce((sum: number, fee: any) => sum + fee.prioritizationFee, 0) / recentFees.length / 1_000_000_000
      : 0.000001; // Fallback: 1000 lamports

    // Determine network congestion
    const networkCongestion = avgPriorityFee > 0.00001 ? 'high' : avgPriorityFee > 0.000005 ? 'medium' : 'low';
    
    // Calculate compute units based on transaction type
    const computeUnits = transactionType === 'swap' ? 300_000 : 
                        transactionType === 'transfer' ? 200_000 : 250_000;
    
    const priorityFeeOptions = {
      slow: avgPriorityFee * 0.5,
      medium: avgPriorityFee,
      fast: avgPriorityFee * 2
    };

    const estimation: FeeEstimation = {
      basic: {
        estimatedCostSOL: baseFee + priorityFeeOptions.medium,
        estimatedCostUSD: (baseFee + priorityFeeOptions.medium) * solPrice,
        speed: 'medium',
        successProbability: networkCongestion === 'low' ? 95 : networkCongestion === 'medium' ? 85 : 75
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
      }
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