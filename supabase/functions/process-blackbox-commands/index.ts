import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🤖 BlackBox Command Processor: Starting cycle...");

    // Create Supabase service client
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get all active command codes with campaign and wallet info
    const { data: commands, error } = await supabaseService
      .from("blackbox_command_codes")
      .select(`
        *,
        blackbox_wallets (
          *,
          blackbox_campaigns (*)
        )
      `)
      .eq("is_active", true);

    if (error) {
      console.error("Error fetching command codes:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!commands || commands.length === 0) {
      console.log("No active command codes found");
      return new Response(JSON.stringify({ message: "No active commands" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    console.log(`Found ${commands.length} active command(s)`);

    const results: any[] = [];
    const now = Date.now();

    // Create Supabase client for invoking other functions
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Process each command
    for (const command of commands) {
      try {
        const wallet = command.blackbox_wallets;
        const campaign = wallet?.blackbox_campaigns;

        if (!wallet || !campaign) {
          console.log(`⚠️ Command ${command.id} missing wallet or campaign data`);
          continue;
        }

        if (!campaign.is_active) {
          console.log(`⚠️ Campaign ${campaign.id} is not active, skipping command ${command.id}`);
          continue;
        }

        if (!wallet.is_active) {
          console.log(`⚠️ Wallet ${wallet.id} is not active, skipping command ${command.id}`);
          continue;
        }

        const config = command.config;
        
        // Check if it's time to execute based on intervals
        const shouldExecuteBuy = shouldExecuteAction(config, 'buy', now);
        const shouldExecuteSell = shouldExecuteAction(config, 'sell', now);

        if (shouldExecuteBuy) {
          console.log(`🟢 Executing BUY for command ${command.name} (${command.id})`);
          
          try {
            const { data, error } = await supabaseClient.functions.invoke('blackbox-executor', {
              body: {
                command_code_id: command.id,
                action: 'buy'
              }
            });

            if (error) {
              console.error(`❌ Buy execution failed for ${command.id}:`, error);
              results.push({ command_id: command.id, action: 'buy', success: false, error: error.message });
            } else {
              console.log(`✅ Buy execution successful for ${command.id}:`, data);
              results.push({ command_id: command.id, action: 'buy', success: true, result: data });
            }
          } catch (error) {
            console.error(`❌ Buy execution error for ${command.id}:`, error);
            results.push({ command_id: command.id, action: 'buy', success: false, error: error.message });
          }
        }

        if (shouldExecuteSell) {
          console.log(`🔴 Executing SELL for command ${command.name} (${command.id})`);
          
          try {
            const { data, error } = await supabaseClient.functions.invoke('blackbox-executor', {
              body: {
                command_code_id: command.id,
                action: 'sell'
              }
            });

            if (error) {
              console.error(`❌ Sell execution failed for ${command.id}:`, error);
              results.push({ command_id: command.id, action: 'sell', success: false, error: error.message });
            } else {
              console.log(`✅ Sell execution successful for ${command.id}:`, data);
              results.push({ command_id: command.id, action: 'sell', success: true, result: data });
            }
          } catch (error) {
            console.error(`❌ Sell execution error for ${command.id}:`, error);
            results.push({ command_id: command.id, action: 'sell', success: false, error: error.message });
          }
        }

        if (!shouldExecuteBuy && !shouldExecuteSell) {
          console.log(`⏳ No actions needed for command ${command.name} (${command.id}) at this time`);
        }

      } catch (error) {
        console.error(`Error processing command ${command.id}:`, error);
        results.push({ command_id: command.id, success: false, error: error.message });
      }
    }

    console.log(`🤖 BlackBox Command Processor: Completed cycle. Processed ${commands.length} commands, executed ${results.length} actions`);

    return new Response(JSON.stringify({ 
      success: true, 
      processed: commands.length,
      executed: results.length,
      results,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error: any) {
    console.error("BlackBox command processor error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

// Helper function to determine if an action should be executed
function shouldExecuteAction(config: any, action: 'buy' | 'sell', now: number): boolean {
  // Simple implementation - in production this would track last execution times
  // For now, execute based on probability to simulate intervals
  
  const interval = action === 'buy' ? config.buyInterval : config.sellInterval;
  const intervalMs = typeof interval === 'object' 
    ? (interval.min + Math.random() * (interval.max - interval.min)) * 1000
    : interval * 1000;

  // Use a random factor to simulate interval-based execution
  // In production, you'd store last execution times in the database
  const randomFactor = Math.random();
  const executionProbability = 60000 / intervalMs; // Based on 1-minute cron cycle
  
  return randomFactor < executionProbability;
}