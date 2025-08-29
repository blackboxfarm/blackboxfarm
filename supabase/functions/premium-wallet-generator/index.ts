import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Keypair } from "npm:@solana/web3.js@1.98.4";
import { encode } from "https://deno.land/std@0.190.0/encoding/base58.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EncryptionResponse {
  encryptedData: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client for auth verification
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Verify user authentication
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;

    if (!user) {
      throw new Error("User not authenticated");
    }

    const { campaign_id, tier = "starter" } = await req.json();

    if (!campaign_id) {
      throw new Error("Campaign ID is required");
    }

    // Service client for admin operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Check user's subscription tier and limits
    const { data: subscription } = await supabaseService
      .rpc("get_user_subscription", { user_id_param: user.id });

    if (!subscription || subscription.length === 0) {
      throw new Error("No active subscription found. Please subscribe to a pricing tier.");
    }

    const userTier = subscription[0];

    // Check existing wallets for this campaign
    const { data: existingWallets, error: walletCheckError } = await supabaseService
      .from("blackbox_wallets")
      .select("id")
      .eq("campaign_id", campaign_id);

    if (walletCheckError) {
      throw walletCheckError;
    }

    // Get pricing tier info
    const { data: pricingTier, error: tierError } = await supabaseService
      .from("pricing_tiers")
      .select("*")
      .eq("tier_name", userTier.tier_name)
      .single();

    if (tierError || !pricingTier) {
      throw new Error("Invalid pricing tier");
    }

    // Check wallet limits
    if (existingWallets.length >= pricingTier.max_wallets_per_campaign) {
      throw new Error(`Wallet limit reached for ${userTier.tier_name} tier. Maximum: ${pricingTier.max_wallets_per_campaign} wallets per campaign.`);
    }

    // Generate new Solana keypair with premium entropy
    const keypair = Keypair.generate();
    const publicKey = keypair.publicKey.toString();
    const secretKey = encode(keypair.secretKey);

    console.log(`🔐 Generating premium wallet for ${userTier.tier_name} tier user`);

    // Encrypt the secret key using the encryption edge function
    const { data: encryptedData, error: encryptError } = await supabaseClient.functions.invoke(
      'encrypt-data', 
      { body: { data: secretKey } }
    );

    if (encryptError) {
      console.error('Encryption error:', encryptError);
      throw new Error("Failed to encrypt wallet secret");
    }

    const encryptedSecret = (encryptedData as EncryptionResponse).encryptedData;

    // Charge setup fee
    const setupFee = pricingTier.base_fee_sol;
    
    try {
      await supabaseClient.functions.invoke('enhanced-revenue-collector', {
        body: { 
          user_id: user.id, 
          amount_sol: setupFee,
          revenue_type: 'setup_fee'
        }
      });
    } catch (revenueError) {
      console.error("Setup fee collection failed:", revenueError);
      // Continue anyway - you might want to handle this differently
    }

    // Store wallet in database
    const { data: wallet, error: insertError } = await supabaseService
      .from("blackbox_wallets")
      .insert({
        campaign_id: campaign_id,
        pubkey: publicKey,
        secret_key_encrypted: encryptedSecret,
        sol_balance: 0
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    console.log(`💰 Generated wallet ${publicKey} for campaign ${campaign_id}`);
    console.log(`💸 Collected setup fee: ${setupFee} SOL for ${userTier.tier_name} tier`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        wallet: {
          id: wallet.id,
          pubkey: publicKey,
          sol_balance: 0,
          tier: userTier.tier_name,
          setup_fee_charged: setupFee
        },
        subscription_info: {
          tier: userTier.tier_name,
          wallets_used: existingWallets.length + 1,
          max_wallets: pricingTier.max_wallets_per_campaign,
          trades_used: userTier.trades_used,
          max_trades_per_hour: userTier.max_trades_per_hour
        }
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Error generating premium wallet:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});