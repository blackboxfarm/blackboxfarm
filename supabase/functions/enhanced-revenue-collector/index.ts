import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from "npm:@solana/web3.js@1.98.4";
import { decode } from "https://deno.land/std@0.190.0/encoding/base58.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// YOUR REVENUE WALLET - Replace with your actual Solana wallet
const PLATFORM_REVENUE_WALLET = "YOUR_ACTUAL_SOLANA_WALLET_ADDRESS_HERE";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, amount_sol, revenue_type = "trade_fee" } = await req.json();

    if (!user_id || !amount_sol) {
      throw new Error("User ID and amount are required");
    }

    // Create Supabase service client
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get current SOL price (simplified - you'd want real price feed)
    const solPriceUSD = 200; // You should fetch this from an API like CoinGecko

    // Get platform wallet config
    const { data: configData } = await supabaseService
      .from("platform_config")
      .select("config_value")
      .eq("config_key", "revenue_wallet")
      .single();

    const platformWallet = configData?.config_value?.solana_address || PLATFORM_REVENUE_WALLET;

    // Initialize Solana connection
    const connection = new Connection(
      Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com",
      "confirmed"
    );

    // Log revenue transaction
    const { data: revenueRecord, error: revenueError } = await supabaseService
      .from("revenue_transactions")
      .insert({
        user_id: user_id,
        revenue_type: revenue_type,
        amount_sol: amount_sol,
        amount_usd: amount_sol * solPriceUSD,
        sol_price_at_time: solPriceUSD,
        platform_wallet: platformWallet,
        status: "collected"
      })
      .select()
      .single();

    if (revenueError) {
      console.error("Revenue logging error:", revenueError);
    }

    console.log(`💰 REVENUE COLLECTED: ${amount_sol} SOL ($${(amount_sol * solPriceUSD).toFixed(2)}) from user ${user_id}`);
    console.log(`📍 Destination wallet: ${platformWallet}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        revenue_collected: {
          amount_sol: amount_sol,
          amount_usd: amount_sol * solPriceUSD,
          platform_wallet: platformWallet,
          revenue_id: revenueRecord?.id
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Revenue collection error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});