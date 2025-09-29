import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";
import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from "https://esm.sh/@solana/web3.js@1.95.3";
import { decode } from "https://deno.land/std@0.190.0/encoding/base58.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
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

    const { campaign_id, amount_sol, contributor_wallet_secret } = await req.json();

    if (!campaign_id || !amount_sol || !contributor_wallet_secret) {
      throw new Error("Missing required fields");
    }

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabaseClient
      .from('community_campaigns')
      .select('*')
      .eq('id', campaign_id)
      .eq('status', 'funding')
      .single();

    if (campaignError || !campaign) {
      throw new Error("Campaign not found or not accepting funding");
    }

    // Validate contribution amount
    if (amount_sol < campaign.min_contribution_sol) {
      throw new Error(`Minimum contribution is ${campaign.min_contribution_sol} SOL`);
    }

    if (campaign.max_contribution_sol && amount_sol > campaign.max_contribution_sol) {
      throw new Error(`Maximum contribution is ${campaign.max_contribution_sol} SOL`);
    }

    // Initialize Solana connection
    const connection = new Connection(Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com");
    
    // Create contributor keypair from secret
    const secretKey = decode(contributor_wallet_secret);
    const contributorKeypair = Keypair.fromSecretKey(secretKey);

    // Create or get campaign multisig wallet address
    let campaignWalletAddress = campaign.multisig_wallet_address;
    if (!campaignWalletAddress) {
      // Generate a new wallet for this campaign (simplified - in production use proper multisig)
      const campaignWallet = Keypair.generate();
      campaignWalletAddress = campaignWallet.publicKey.toString();
      
      // Update campaign with wallet address
      const { error: updateError } = await supabaseClient
        .from('community_campaigns')
        .update({ multisig_wallet_address: campaignWalletAddress })
        .eq('id', campaign_id);

      if (updateError) throw updateError;
    }

    // Create transfer transaction
    const lamports = amount_sol * 1e9; // Convert SOL to lamports
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: contributorKeypair.publicKey,
        toPubkey: new PublicKey(campaignWalletAddress),
        lamports: lamports,
      })
    );

    // Send transaction
    const signature = await sendAndConfirmTransaction(connection, transaction, [contributorKeypair]);

    // Use service role to update database
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Record contribution
    const { error: contributionError } = await supabaseService
      .from('community_contributions')
      .insert({
        campaign_id: campaign_id,
        contributor_id: user.id,
        amount_sol: amount_sol,
        transaction_signature: signature
      });

    if (contributionError) throw contributionError;

    // Update campaign funding
    const { error: updateError } = await supabaseService
      .from('community_campaigns')
      .update({ 
        current_funding_sol: campaign.current_funding_sol + amount_sol,
        contributor_count: campaign.contributor_count + 1
      })
      .eq('id', campaign_id);

    if (updateError) throw updateError;

    console.log(`Contribution processed: ${amount_sol} SOL to campaign ${campaign_id}, signature: ${signature}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        signature: signature,
        amount_sol: amount_sol,
        campaign_id: campaign_id
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Error processing contribution:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});