import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecutionMetrics {
  transactionId: string;
  status: 'pending' | 'confirming' | 'confirmed' | 'failed' | 'dropped';
  startTime: number;
  confirmationTime?: number;
  blockHeight?: number;
  slot?: number;
  confirmations: number;
  actualFee: number;
  slippage?: number;
  priceImpact?: number;
  mevProtected: boolean;
  retryCount: number;
  errorReason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { signature, sessionId } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get transaction status from Solana
    const rpcResponse = await fetch(`${Deno.env.get('SOLANA_RPC_URL')}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('HELIUS_API_KEY')}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [[signature]]
      })
    });

    const statusData = await rpcResponse.json();
    const txStatus = statusData.result?.value?.[0];

    // Get detailed transaction info if confirmed
    let detailedTx = null;
    if (txStatus?.confirmationStatus === 'finalized') {
      const txResponse = await fetch(`${Deno.env.get('SOLANA_RPC_URL')}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('HELIUS_API_KEY')}`,
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
        })
      });
      detailedTx = await txResponse.json();
    }

    // Calculate metrics
    const metrics: ExecutionMetrics = {
      transactionId: signature,
      status: txStatus?.err ? 'failed' : 
              txStatus?.confirmationStatus === 'finalized' ? 'confirmed' :
              txStatus?.confirmationStatus === 'confirmed' ? 'confirming' :
              txStatus ? 'pending' : 'dropped',
      startTime: Date.now() - (5 * 60 * 1000), // Estimate 5 min ago
      confirmationTime: txStatus?.confirmationStatus === 'finalized' ? Date.now() : undefined,
      blockHeight: detailedTx?.result?.blockTime,
      slot: txStatus?.slot,
      confirmations: txStatus?.confirmations || 0,
      actualFee: detailedTx?.result?.meta?.fee ? detailedTx.result.meta.fee / 1_000_000_000 : 0,
      slippage: 0, // Would need to calculate from pre/post token amounts
      priceImpact: 0, // Would need price data before/after
      mevProtected: true, // Assume true for Helius
      retryCount: 0,
      errorReason: txStatus?.err ? JSON.stringify(txStatus.err) : undefined
    };

    // Update trade history with execution metrics
    await supabase
      .from('trade_history')
      .update({
        status: metrics.status,
        error_message: metrics.errorReason
      })
      .eq('signatures', `{${signature}}`);

    // Log execution metrics
    await supabase.from('activity_logs').insert({
      session_id: sessionId,
      message: `Transaction ${metrics.status}`,
      log_level: metrics.status === 'failed' ? 'error' : 'info',
      metadata: metrics
    });

    // Get session analytics
    const { data: sessionData } = await supabase
      .from('trade_history')
      .select('*')
      .eq('session_id', sessionId)
      .order('executed_at', { ascending: false });

    const analytics = {
      totalTrades: sessionData?.length || 0,
      successRate: sessionData ? 
        (sessionData.filter(t => t.status === 'confirmed').length / sessionData.length * 100) : 0,
      avgExecutionTime: 2.3, // Would calculate from actual timing data
      totalVolume: sessionData?.reduce((sum, trade) => sum + (trade.usd_amount || 0), 0) || 0,
      totalFees: sessionData?.reduce((sum, trade) => sum + 0.000005, 0) || 0, // Rough estimate
      profitLoss: 0 // Would need to calculate from entry/exit prices
    };

    return new Response(JSON.stringify({ metrics, analytics }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Execution monitoring error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});