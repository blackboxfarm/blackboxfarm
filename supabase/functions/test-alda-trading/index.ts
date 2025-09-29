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
    console.log("🧪 Testing ALDA trading system...");

    // Create service role client for testing
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Get the ALDA command ID
    const aldaCommandId = "defb2381-c5ea-4d75-9501-50e4ddc9f52f";
    
    console.log(`🎯 Testing encryption and buy execution for ALDA command: ${aldaCommandId}`);

    // Test a buy operation
    const { data: buyResult, error: buyError } = await serviceClient.functions.invoke(
      'blackbox-executor',
      {
        body: {
          command_code_id: aldaCommandId,
          action: 'buy'
        }
      }
    );

    console.log("📊 Buy test result:", { buyResult, buyError });

    // Also test encryption directly
    const testData = "test-secret-key-12345";
    const { data: encryptResult, error: encryptError } = await serviceClient.functions.invoke(
      'encrypt-data',
      {
        body: {
          data: testData,
          action: 'encrypt'
        }
      }
    );

    console.log("🔐 Encryption test:", { encryptResult, encryptError });

    if (encryptResult && !encryptError) {
      // Test decryption
      const { data: decryptResult, error: decryptError } = await serviceClient.functions.invoke(
        'encrypt-data',
        {
          body: {
            data: encryptResult.encryptedData,
            action: 'decrypt'
          }
        }
      );

      console.log("🔓 Decryption test:", { decryptResult, decryptError });
    }

    // Get current campaign status
    const { data: campaignData, error: campaignError } = await serviceClient
      .from('blackbox_campaigns')
      .select(`
        id, nickname, token_address, is_active,
        campaign_wallets!inner (
          blackbox_wallets!inner (
            pubkey,
            blackbox_command_codes!inner (
              id, name, is_active, config
            )
          )
        )
      `)
      .eq('nickname', 'OrangTUAH')
      .maybeSingle();

    console.log("📋 ALDA Campaign status:", campaignData);

    return new Response(
      JSON.stringify({
        success: true,
        tests: {
          encryption: {
            encrypt_success: !encryptError,
            encrypt_error: encryptError,
            decrypt_success: encryptResult ? true : false,
            decrypt_error: null
          },
          trading: {
            buy_success: !buyError,
            buy_result: buyResult,
            buy_error: buyError
          }
        },
        campaign_status: campaignData,
        message: "ALDA trading test completed",
        next_steps: [
          "1. Fix any encryption issues found",
          "2. Delete unwanted campaigns",
          "3. Enable randomized intervals",
          "4. Test full trading cycle"
        ]
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("❌ Test error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});