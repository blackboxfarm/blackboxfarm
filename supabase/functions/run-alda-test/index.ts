import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🚀 Running ALDA test execution with new encryption...");

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const aldaCommandId = "defb2381-c5ea-4d75-9501-50e4ddc9f52f";
    
    console.log(`🎯 Testing ALDA command: ${aldaCommandId}`);

    // Execute a test buy
    console.log("🛒 Testing BUY execution...");
    const { data: buyResult, error: buyError } = await serviceClient.functions.invoke(
      'blackbox-executor',
      { body: { command_code_id: aldaCommandId, action: 'buy' } }
    );

    console.log("📊 Buy result:", buyResult);
    if (buyError) console.error("❌ Buy error:", buyError);

    // Wait a bit then test sell
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log("💱 Testing SELL execution...");
    const { data: sellResult, error: sellError } = await serviceClient.functions.invoke(
      'blackbox-executor',
      { body: { command_code_id: aldaCommandId, action: 'sell' } }
    );

    console.log("📊 Sell result:", sellResult);
    if (sellError) console.error("❌ Sell error:", sellError);

    // Check recent transactions
    const { data: recentTxs, error: txError } = await serviceClient
      .from('blackbox_transactions')
      .select('*')
      .eq('command_code_id', aldaCommandId)
      .order('executed_at', { ascending: false })
      .limit(5);

    console.log("📋 Recent transactions:", recentTxs);

    return new Response(
      JSON.stringify({
        success: true,
        test_results: {
          buy: { success: !buyError, result: buyResult, error: buyError },
          sell: { success: !sellError, result: sellResult, error: sellError }
        },
        recent_transactions: recentTxs,
        message: "ALDA testing completed! Check the logs for encryption and trading details.",
        status: buyError || sellError ? "NEEDS_FIXING" : "WORKING"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("❌ Test error:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        message: "Test failed - check function logs for details"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});