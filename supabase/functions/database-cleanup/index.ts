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
        deletionResults.push({ campaign: campaign.nickname, success: false, error: error.message });
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

    // 3. Clean up campaign_wallets - ensure funded wallet is only connected to OrangTUAH
    await serviceClient
      .from('campaign_wallets')
      .delete()
      .neq('campaign_id', keepCampaign.id);

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

    // 4. Delete orphaned wallets (not connected to any campaign)
    const { data: orphanedWallets } = await serviceClient
      .from('blackbox_wallets')
      .select('id, pubkey, sol_balance')
      .not('id', 'in', `(SELECT wallet_id FROM campaign_wallets WHERE campaign_id = '${keepCampaign.id}')`);

    console.log(`🗑️ Found ${orphanedWallets?.length || 0} orphaned wallets to delete`);

    if (orphanedWallets && orphanedWallets.length > 0) {
      const { error: walletDeleteError } = await serviceClient
        .from('blackbox_wallets')
        .delete()
        .in('id', orphanedWallets.map(w => w.id));

      if (walletDeleteError) {
        console.error("❌ Failed to delete orphaned wallets:", walletDeleteError);
      } else {
        console.log(`✅ Deleted ${orphanedWallets.length} orphaned wallets`);
      }
    }

    // 5. Clean up commands - keep only commands associated with the funded wallet
    const { data: orphanedCommands } = await serviceClient
      .from('blackbox_command_codes')
      .select('id, name, wallet_id')
      .neq('wallet_id', fundedWallet.id);

    console.log(`🗑️ Found ${orphanedCommands?.length || 0} orphaned commands to delete`);

    if (orphanedCommands && orphanedCommands.length > 0) {
      const { error: commandDeleteError } = await serviceClient
        .from('blackbox_command_codes')
        .delete()
        .in('id', orphanedCommands.map(c => c.id));

      if (commandDeleteError) {
        console.error("❌ Failed to delete orphaned commands:", commandDeleteError);
      } else {
        console.log(`✅ Deleted ${orphanedCommands.length} orphaned commands`);
      }
    }

    // 6. Get remaining valid commands
    const { data: validCommands } = await serviceClient
      .from('blackbox_command_codes')
      .select('id, name, config, is_active')
      .eq('wallet_id', fundedWallet.id);

    // 7. Clean up orphaned transactions
    const { error: txCleanupError } = await serviceClient
      .from('blackbox_transactions')
      .delete()
      .neq('campaign_id', keepCampaign.id);

    if (txCleanupError) {
      console.error("❌ Failed to clean up orphaned transactions:", txCleanupError);
    } else {
      console.log("✅ Cleaned up orphaned transactions");
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
          orphanedWalletsDeleted: orphanedWallets?.length || 0,
          orphanedCommandsDeleted: orphanedCommands?.length || 0
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
});
