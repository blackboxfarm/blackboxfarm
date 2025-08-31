import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Connection, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction, Keypair } from "npm:@solana/web3.js@1.98.4";
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

    const { contributionId, contributorWalletAddress } = await req.json();

    if (!contributionId) {
      throw new Error("Contribution ID is required");
    }

    if (!contributorWalletAddress) {
      throw new Error("Contributor wallet address is required");
    }

    // Use service role to access data
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get contribution details
    const { data: contribution, error: contributionError } = await supabaseService
      .from('community_contributions')
      .select(`
        *,
        community_campaigns (
          id,
          status,
          multisig_wallet_address,
          current_funding_sol,
          blackbox_campaign_id
        )
      `)
      .eq('id', contributionId)
      .eq('contributor_id', user.id)
      .eq('refunded', false)
      .single();

    if (contributionError || !contribution) {
      throw new Error("Contribution not found or already refunded");
    }

    const campaign = contribution.community_campaigns;
    
    // Check if refund is allowed (before trading starts)
    if (campaign.status === 'executing' || campaign.status === 'completed') {
      throw new Error("Cannot refund - trading has already started or completed");
    }

    // Setup Solana connection
    const connection = new Connection(Deno.env.get("SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com");
    
    // Get the platform wallet private key
    const platformPrivateKey = Deno.env.get("TRADER_PRIVATE_KEY");
    if (!platformPrivateKey) {
      throw new Error("Platform private key not configured");
    }

    const platformKeypair = Keypair.fromSecretKey(decode(platformPrivateKey));
    const contributorPubkey = new PublicKey(contributorWalletAddress);

    // Calculate refund amount in lamports (SOL * 1e9)
    const refundLamports = contribution.amount_sol * 1e9;

    // Create transfer transaction
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: platformKeypair.publicKey,
        toPubkey: contributorPubkey,
        lamports: refundLamports,
      })
    );

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = platformKeypair.publicKey;

    // Send and confirm transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [platformKeypair],
      { commitment: 'confirmed' }
    );

    console.log(`SOL refund sent: ${contribution.amount_sol} SOL to ${contributorWalletAddress}, signature: ${signature}`);

    // Update contribution as refunded
    const { error: updateError } = await supabaseService
      .from('community_contributions')
      .update({
        refunded: true,
        refund_signature: signature,
        refunded_at: new Date().toISOString()
      })
      .eq('id', contributionId);

    if (updateError) throw updateError;

    // Update campaign funding
    const { error: campaignUpdateError } = await supabaseService
      .from('community_campaigns')
      .update({
        current_funding_sol: Math.max(0, campaign.current_funding_sol - contribution.amount_sol),
        contributor_count: Math.max(0, campaign.contributor_count - 1)
      })
      .eq('id', campaign.id);

    if (campaignUpdateError) throw campaignUpdateError;

    console.log(`Refund processed: ${contribution.amount_sol} SOL for contribution ${contributionId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        refund_signature: signature,
        amount_sol: contribution.amount_sol,
        contribution_id: contributionId
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Error processing refund:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});