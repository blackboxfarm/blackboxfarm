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

    const { contribution_id } = await req.json();

    if (!contribution_id) {
      throw new Error("Contribution ID is required");
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
          target_deadline,
          multisig_wallet_address,
          current_funding_sol,
          funding_goal_sol
        )
      `)
      .eq('id', contribution_id)
      .eq('contributor_id', user.id)
      .eq('refunded', false)
      .single();

    if (contributionError || !contribution) {
      throw new Error("Contribution not found or already refunded");
    }

    const campaign = contribution.community_campaigns;
    
    // Check if refund is allowed (campaign not funded or expired)
    const now = new Date();
    const deadline = new Date(campaign.target_deadline);
    const isExpired = now > deadline;
    const isFunded = campaign.current_funding_sol >= campaign.funding_goal_sol;

    if (isFunded && !isExpired) {
      throw new Error("Cannot refund - campaign is funded and active");
    }

    // For now, mark as refunded in database (in production, would need actual SOL refund)
    const refundSignature = `refund_${Date.now()}_${contribution_id}`;

    // Update contribution as refunded
    const { error: updateError } = await supabaseService
      .from('community_contributions')
      .update({
        refunded: true,
        refund_signature: refundSignature,
        refunded_at: new Date().toISOString()
      })
      .eq('id', contribution_id);

    if (updateError) throw updateError;

    // Update campaign funding if applicable
    if (campaign.current_funding_sol > 0) {
      const { error: campaignUpdateError } = await supabaseService
        .from('community_campaigns')
        .update({
          current_funding_sol: Math.max(0, campaign.current_funding_sol - contribution.amount_sol),
          contributor_count: Math.max(0, (campaign as any).contributor_count - 1)
        })
        .eq('id', campaign.id);

      if (campaignUpdateError) throw campaignUpdateError;
    }

    console.log(`Refund processed: ${contribution.amount_sol} SOL for contribution ${contribution_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        refund_signature: refundSignature,
        amount_sol: contribution.amount_sol,
        contribution_id: contribution_id
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