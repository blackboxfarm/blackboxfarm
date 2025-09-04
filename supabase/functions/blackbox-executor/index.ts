import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from "npm:@solana/web3.js@1.98.4";
import { decode } from "https://deno.land/std@0.190.0/encoding/base58.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DecryptionResponse {
  decryptedData: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { command_code_id, action } = await req.json();

    if (!command_code_id || !action) {
      throw new Error("Command code ID and action are required");
    }

    // Create Supabase service client
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get command code with wallet and campaign info
    const { data: commandData, error: commandError } = await supabaseService
      .from("blackbox_command_codes")
      .select(`
        *,
        blackbox_wallets (
          *,
          blackbox_campaigns (*)
        )
      `)
      .eq("id", command_code_id)
      .single();

    if (commandError || !commandData) {
      throw new Error("Command code not found");
    }

    const wallet = commandData.blackbox_wallets;
    const campaign = wallet.blackbox_campaigns;

    // Decrypt wallet secret key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { data: decryptedData, error: decryptError } = await supabaseClient.functions.invoke(
      'encrypt-data',
      { body: { data: wallet.secret_key_encrypted, action: 'decrypt' } }
    );

    if (decryptError) {
      throw new Error("Failed to decrypt wallet secret");
    }

    const secretKey = (decryptedData as DecryptionResponse).decryptedData;
    const keypair = Keypair.fromSecretKey(decode(secretKey));

    // Initialize Solana connection
    const connection = new Connection(
      Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com",
      "confirmed"
    );

    let result: any = {};

    if (action === "buy") {
      // Execute buy transaction
      const config = commandData.config;
      const buyAmount = config.type === "simple" 
        ? config.buyAmount 
        : Math.random() * (config.buyAmount.max - config.buyAmount.min) + config.buyAmount.min;

      // Calculate MUCH HIGHER fees (15x competitive rates)
      const lamports = Math.floor(buyAmount * 1_000_000_000);
      const baseTradeFee = 0.003; // 15x higher base fee
      const gasFee = 5000; // Solana network fee
      const serviceFee = Math.floor(lamports * 0.35) + (0.0002 * 1_000_000_000); // 35% markup + higher flat fee

      // Create transaction (simplified - in real implementation would interact with DEX)
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: keypair.publicKey,
          toPubkey: keypair.publicKey, // Placeholder
          lamports: lamports
        })
      );

      const signature = await connection.sendTransaction(transaction, [keypair]);

      // Calculate total revenue to collect
      const totalRevenue = baseTradeFee + (serviceFee / 1_000_000_000);

      // Check if this is the testuser@blackbox.farm account (skip fees for testing)
      const { data: userData } = await supabaseService.auth.admin.getUserById(campaign.user_id);
      const userEmail = userData?.user?.email;
      
      const isTestAccount = userEmail === "testuser@blackbox.farm";

      let revenueCollected = 0;
      if (!isTestAccount) {
        // Collect revenue automatically
        try {
          await supabaseClient.functions.invoke('enhanced-revenue-collector', {
            body: { 
              user_id: campaign.user_id, 
              amount_sol: totalRevenue,
              revenue_type: 'trade_fee'
            }
          });
          revenueCollected = totalRevenue;
        } catch (revenueError) {
          console.error("Revenue collection failed:", revenueError);
        }
      } else {
        console.log(`🧪 TEST ACCOUNT (${userEmail}): Skipping revenue collection for user ${campaign.user_id}`);
      }

      // Log transaction
      await supabaseService
        .from("blackbox_transactions")
        .insert({
          wallet_id: wallet.id,
          command_code_id: command_code_id,
          transaction_type: "buy",
          amount_sol: buyAmount,
          gas_fee: gasFee / 1_000_000_000,
          service_fee: serviceFee / 1_000_000_000,
          signature: signature,
          status: "completed"
        });

      result = { signature, amount: buyAmount, type: "buy", revenue_collected: revenueCollected };

    } else if (action === "sell") {
      // Execute sell transaction (similar structure)
      const config = commandData.config;
      const sellPercent = config.type === "simple" 
        ? config.sellPercent 
        : Math.random() * (config.sellPercent.max - config.sellPercent.min) + config.sellPercent.min;

      // In real implementation, would calculate position size and sell percentage
      const sellAmount = (wallet.sol_balance * sellPercent) / 100;

      result = { amount: sellAmount, percent: sellPercent, type: "sell" };
    }

    console.log(`Executed ${action} for command ${command_code_id}:`, result);

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Execution error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});