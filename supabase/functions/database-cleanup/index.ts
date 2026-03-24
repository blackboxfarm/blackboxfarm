import { withRunLog } from '../_shared/run-logger.ts';
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(withRunLog('database-cleanup', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create service role client for cleanup operations
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("🧹 Starting comprehensive database cleanup...");

    // 1. Keep only the OrangTUAH campaign and delete the rest
    const { data: keepCampaign } = await serviceClient
      .from('blackbox_campaigns')
      .select('id, nickname, token_address')
      .eq('nickname', 'OrangTUAH')
      .single();

    if (!keepCampaign) {
      throw new Error("OrangTUAH campaign not found!");
    }

    console.log("✅ Found OrangTUAH campaign:", keepCampaign);

    // Get all other campaigns to delete
    const { data: campaignsToDelete } = await serviceClient
      .from('blackbox_campaigns')
      .select('id, nickname')
      .neq('id', keepCampaign.id);

    console.log(`🗑️ Found ${campaignsToDelete?.length || 0} campaigns to delete`);

    // Delete other campaigns using cascade function
    const deletionResults = [];
    for (const campaign of campaignsToDelete || []) {
      try {
        const { data: deleteResult, error } = await serviceClient
          .rpc('delete_campaign_cascade', {
            campaign_id_param: campaign.id,
            campaign_type_param: 'blackbox'
          });

        if (error) {
          console.error(`❌ Failed to delete campaign ${campaign.nickname}:`, error);
          deletionResults.push({ campaign: campaign.nickname, success: false, error: error.message });
        } else {
          console.log(`✅ Deleted campaign ${campaign.nickname}`);
          deletionResults.push({ campaign: campaign.nickname, success: true });
        }
      } catch (error) {
        console.error(`❌ Exception deleting campaign ${campaign.nickname}:`, error);
        deletionResults.push({ campaign: campaign.nickname, success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }

    // 2. Find the funded wallet and ensure it's only connected to OrangTUAH
    const fundedWalletPubkey = 'Hg6eNemZ4eeA5KAbQYTN5bAojeaMgZ8Fpjgv3RFm6eCU';
    
    const { data: fundedWallet } = await serviceClient
      .from('blackbox_wallets')
      .select('id, pubkey, sol_balance')
      .eq('pubkey', fundedWalletPubkey)
      .single();

    if (!fundedWallet) {
      throw new Error("Funded wallet not found!");
    }

    console.log("✅ Found funded wallet:", fundedWallet);

    // 3. Clean up campaign_wallets - keep ONLY the funded wallet on OrangTUAH
    await serviceClient
      .from('campaign_wallets')
      .delete()
      .or(`campaign_id.neq.${keepCampaign.id},wallet_id.neq.${fundedWallet.id}`);

    // Ensure funded wallet is connected to OrangTUAH
    const { error: insertError } = await serviceClient
      .from('campaign_wallets')
      .upsert({
        campaign_id: keepCampaign.id,
        wallet_id: fundedWallet.id
      });

    if (insertError) {
      console.error("❌ Failed to connect funded wallet to campaign:", insertError);
    } else {
      console.log("✅ Connected funded wallet to OrangTUAH campaign");
    }

    // 4. Delete ALL placeholder and orphaned wallets
    let orphanedWalletsDeleted = 0;
    
    // First delete any wallet with PLACEHOLDER in the pubkey
    const { data: placeholderWallets, error: placeholderError } = await serviceClient
      .from('blackbox_wallets')
      .delete()
      .ilike('pubkey', '%PLACEHOLDER%')
      .select('id, pubkey');
    
    if (placeholderError) {
      console.error("❌ Failed to delete placeholder wallets:", placeholderError);
    } else {
      console.log(`✅ Deleted ${placeholderWallets?.length || 0} placeholder wallets`);
    }

    // Then delete all other wallets except the funded one
    const { data: deletedWallets, error: walletDeleteError } = await serviceClient
      .from('blackbox_wallets')
      .delete()
      .neq('id', fundedWallet.id)
      .select('id, pubkey');

    if (walletDeleteError) {
      console.error("❌ Failed to delete extra wallets:", walletDeleteError);
    } else {
      orphanedWalletsDeleted = deletedWallets?.length || 0;
      console.log(`✅ Deleted ${orphanedWalletsDeleted} extra wallets`);
    }

    // 5. Delete commands not on the funded wallet
    let orphanedCommandsDeleted = 0;
    const { data: deletedCommands, error: commandDeleteError } = await serviceClient
      .from('blackbox_command_codes')
      .delete()
      .neq('wallet_id', fundedWallet.id)
      .select('id');

    if (commandDeleteError) {
      console.error("❌ Failed to delete orphaned commands:", commandDeleteError);
    } else {
      orphanedCommandsDeleted = deletedCommands?.length || 0;
      console.log(`✅ Deleted ${orphanedCommandsDeleted} orphaned commands`);
    }

    // 6. Clean up transactions, timing and notifications not for the kept campaign
    const { error: txCleanupError } = await serviceClient
      .from('blackbox_transactions')
      .delete()
      .neq('campaign_id', keepCampaign.id);

    if (txCleanupError) {
      console.error("❌ Failed to clean up orphaned transactions:", txCleanupError);
    } else {
      console.log("✅ Cleaned up orphaned transactions");
    }

    const { error: timingCleanupError } = await serviceClient
      .from('campaign_timing')
      .delete()
      .neq('campaign_id', keepCampaign.id);

    if (timingCleanupError) {
      console.error("❌ Failed to clean up campaign timing:", timingCleanupError);
    } else {
      console.log("✅ Cleaned up campaign timing for other campaigns");
    }

    const { error: notifCleanupError } = await serviceClient
      .from('campaign_notifications')
      .delete()
      .neq('campaign_id', keepCampaign.id);

    if (notifCleanupError) {
      console.error("❌ Failed to clean up campaign notifications:", notifCleanupError);
    } else {
      console.log("✅ Cleaned up campaign notifications for other campaigns");
    }

    // 7. Clean up user wallet pool entries (generated/local wallets)
    let poolsDeleted = 0;
    const { data: deletedPools, error: poolDelError } = await serviceClient
      .from('wallet_pools')
      .delete()
      .neq('pubkey', fundedWalletPubkey)
      .select('id, pubkey');

    if (poolDelError) {
      console.error("❌ Failed to clean up wallet pools:", poolDelError);
    } else {
      poolsDeleted = deletedPools?.length || 0;
      console.log(`✅ Deleted ${poolsDeleted} wallet pool entries`);
    }

    // 8. Finally, delete all other campaigns directly
    const { data: deletedCampaigns, error: campaignDeleteError } = await serviceClient
      .from('blackbox_campaigns')
      .delete()
      .neq('id', keepCampaign.id)
      .select('id');

    if (campaignDeleteError) {
      console.error("❌ Failed to delete other campaigns:", campaignDeleteError);
    } else {
      console.log(`✅ Deleted ${deletedCampaigns?.length || 0} other campaigns`);
    }


    // 8. Get final state summary
    const { data: finalCampaigns } = await serviceClient
      .from('blackbox_campaigns')
      .select('id, nickname, token_address, is_active');

    const { data: finalWallets } = await serviceClient
      .from('blackbox_wallets')
      .select('id, pubkey, sol_balance, is_active');

    const { data: finalCommands } = await serviceClient
      .from('blackbox_command_codes')
      .select('id, name, is_active, wallet_id');

    console.log("🎉 Cleanup completed successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Database cleanup completed successfully",
        summary: {
          campaignsDeleted: deletionResults.filter(r => r.success).length,
          campaignsKept: finalCampaigns?.length || 0,
          walletsKept: finalWallets?.length || 0,
          commandsKept: finalCommands?.length || 0,
          orphanedWalletsDeleted: orphanedWalletsDeleted,
          orphanedCommandsDeleted: orphanedCommandsDeleted
        },
        finalState: {
          campaigns: finalCampaigns,
          wallets: finalWallets,
          commands: finalCommands
        },
        deletionResults
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("❌ Database cleanup error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
}));

