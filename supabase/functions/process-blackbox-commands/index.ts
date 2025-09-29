import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2?target=deno";

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

    // Get all active command codes with campaign and wallet info through junction table
    const { data: commands, error } = await supabaseService
      .from("blackbox_command_codes")
      .select(`
        *,
        blackbox_wallets!inner (
          id,
          pubkey,
          secret_key_encrypted,
          sol_balance,
          is_active,
          campaign_wallets!inner (
            campaign_id,
            blackbox_campaigns!inner (*)
          )
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
        const campaign = wallet?.campaign_wallets?.[0]?.blackbox_campaigns;

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
        const shouldExecuteBuy = await shouldExecuteAction(supabaseService, command.id, 'buy', config);
        const shouldExecuteSell = await shouldExecuteAction(supabaseService, command.id, 'sell', config);

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
            results.push({ command_id: command.id, action: 'buy', success: false, error: error instanceof Error ? error.message : String(error) });
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
            results.push({ command_id: command.id, action: 'sell', success: false, error: error instanceof Error ? error.message : String(error) });
          }
        }

        if (!shouldExecuteBuy && !shouldExecuteSell) {
          console.log(`⏳ No actions needed for command ${command.name} (${command.id}) at this time`);
        }

      } catch (error) {
        console.error(`Error processing command ${command.id}:`, error);
        results.push({ command_id: command.id, success: false, error: error instanceof Error ? error.message : String(error) });
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
async function shouldExecuteAction(supabaseService: any, commandId: string, action: 'buy' | 'sell', config: any): Promise<boolean> {
  // Get the last transaction attempt (successful or failed) of this type for this command
  const { data: lastTransaction } = await supabaseService
    .from('blackbox_transactions')
    .select('executed_at, status')
    .eq('command_code_id', commandId)
    .eq('transaction_type', action)
    .order('executed_at', { ascending: false })
    .limit(1)
    .single();

  const interval = action === 'buy' ? config.buyInterval : config.sellInterval;
  
  let intervalSeconds: number;
  if (typeof interval === 'object' && interval.min !== undefined && interval.max !== undefined) {
    // Complex mode: random interval between min and max
    intervalSeconds = Math.random() * (interval.max - interval.min) + interval.min;
    console.log(`📊 ${action.toUpperCase()} interval (complex): ${intervalSeconds}s (range: ${interval.min}-${interval.max}s)`);
  } else {
    // Simple mode: fixed interval
    intervalSeconds = interval || (action === 'buy' ? 300 : 900); // Default fallbacks
    console.log(`📊 ${action.toUpperCase()} interval (simple): ${intervalSeconds}s`);
  }

  if (!lastTransaction) {
    console.log(`✅ ${action.toUpperCase()} decision: EXECUTE (no previous transaction)`);
    return true;
  }

  const lastExecutionTime = new Date(lastTransaction.executed_at).getTime();
  const now = Date.now();
  const timeSinceLastExecution = (now - lastExecutionTime) / 1000;

  const shouldExecute = timeSinceLastExecution >= intervalSeconds;
  console.log(`📊 ${action.toUpperCase()} decision: ${shouldExecute ? 'EXECUTE' : 'WAIT'} (${timeSinceLastExecution.toFixed(0)}s since last, need ${intervalSeconds.toFixed(0)}s)`);

  return shouldExecute;
}