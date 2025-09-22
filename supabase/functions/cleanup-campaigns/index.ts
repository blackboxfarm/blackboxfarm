import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { campaigns_to_delete, keep_campaign } = await req.json();
    
    console.log(`🧹 Cleaning up campaigns, keeping: ${keep_campaign}`);
    console.log(`🗑️ Deleting campaigns:`, campaigns_to_delete);

    // Create authenticated supabase client
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    );

    // Create service role client for deletions
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const deletionResults = [];

    // Delete each campaign using the cascade function
    for (const campaignId of campaigns_to_delete) {
      try {
        console.log(`🗑️ Deleting campaign ${campaignId}...`);
        
        const { data: deleteResult, error: deleteError } = await serviceClient
          .rpc('delete_campaign_cascade', {
            campaign_id_param: campaignId,
            campaign_type_param: 'blackbox'
          });

        if (deleteError) {
          console.error(`❌ Failed to delete campaign ${campaignId}:`, deleteError);
          deletionResults.push({ campaignId, success: false, error: deleteError.message });
        } else {
          console.log(`✅ Successfully deleted campaign ${campaignId}:`, deleteResult);
          deletionResults.push({ campaignId, success: true, deleted: deleteResult });
        }
      } catch (error) {
        console.error(`❌ Exception deleting campaign ${campaignId}:`, error);
        deletionResults.push({ campaignId, success: false, error: error.message });
      }
    }

    // Verify the kept campaign
    const { data: keptCampaign, error: verifyError } = await supabaseClient
      .from('blackbox_campaigns')
      .select('id, nickname, token_address, is_active')
      .eq('nickname', keep_campaign)
      .maybeSingle();

    if (verifyError) {
      console.error("❌ Error verifying kept campaign:", verifyError);
    } else if (keptCampaign) {
      console.log(`✅ Kept campaign verified:`, keptCampaign);
    } else {
      console.warn(`⚠️ Kept campaign '${keep_campaign}' not found!`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted_campaigns: deletionResults,
        kept_campaign: keptCampaign,
        message: `Cleanup completed. Deleted ${deletionResults.filter(r => r.success).length} campaigns, kept '${keep_campaign}'`
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("❌ Cleanup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});