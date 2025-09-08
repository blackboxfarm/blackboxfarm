import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from "npm:@solana/web3.js@1.98.4";
import { decode } from "https://deno.land/std@0.190.0/encoding/base58.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DecryptionResponse {
  decryptedData: string;
}

// Token platform detection function
function detectTokenPlatform(tokenAddress: string): string {
  const address = tokenAddress.toLowerCase();
  
  // Platform detection by domain ending
  if (address.endsWith('pump')) return 'pump.fun';
  if (address.endsWith('bags')) return 'bags.fm';
  if (address.endsWith('bonk')) return 'bonk.fun';
  if (address.endsWith('moon')) return 'moonshot.cc';
  if (address.endsWith('fun')) return 'fun.finance';
  if (address.endsWith('dex')) return 'dexlab.space';
  if (address.endsWith('launch')) return 'launch.pad';
  
  // Check for specific platform patterns
  if (address.includes('ray') || address.includes('amm')) return 'raydium';
  if (address.includes('orca')) return 'orca';
  if (address.includes('jupiter') || address.includes('jup')) return 'jupiter';
  if (address.includes('meteora')) return 'meteora';
  if (address.includes('serum')) return 'serum';
  
  // Default to generic/unknown for standard SPL tokens
  return 'spl-token';
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { command_code_id, action } = await req.json();

    if (!command_code_id || !action) {
      throw new Error("Command code ID and action are required");
    }

    // Create Supabase service client
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Get command code with wallet and campaign info using many-to-many relationship
    const { data: commandData, error: commandError } = await supabaseService
      .from("blackbox_command_codes")
      .select(`
        *,
        blackbox_wallets!inner (
          *,
          campaign_wallets!inner (
            campaign_id,
            blackbox_campaigns!inner (*)
          )
        )
      `)
      .eq("id", command_code_id)
      .single();

    if (commandError || !commandData) {
      throw new Error("Command code not found");
    }

    const wallet = commandData.blackbox_wallets;
    const campaign = wallet.campaign_wallets[0]?.blackbox_campaigns;

    // Decrypt wallet secret key
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { data: decryptedData, error: decryptError } = await supabaseClient.functions.invoke(
      'encrypt-data',
      { body: { data: wallet.secret_key_encrypted, action: 'decrypt' } }
    );

    if (decryptError) {
      throw new Error("Failed to decrypt wallet secret");
    }

    const secretKey = (decryptedData as DecryptionResponse).decryptedData;
    const keypair = Keypair.fromSecretKey(decode(secretKey));

    // Initialize Solana connection
    const connection = new Connection(
      Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com",
      "confirmed"
    );

    let result: any = {};

    if (action === "buy") {
      // Execute REAL buy transaction using Jupiter/Raydium
      const config = commandData.config;
      const buyAmountUSD = config.type === "simple" 
        ? config.buyAmount  // This is in USD
        : Math.random() * (config.buyAmount.max - config.buyAmount.min) + config.buyAmount.min;

      // Get current SOL price to convert USD to SOL
      const { data: solPriceData } = await supabaseClient.functions.invoke('sol-price');
      const solPrice = solPriceData?.price || 201; // Fallback price
      const buyAmountSOL = buyAmountUSD / solPrice;

      console.log(`💰 Converting $${buyAmountUSD} USD to ${buyAmountSOL} SOL (SOL price: $${solPrice})`);

      // Detect token platform by address pattern
      const tokenAddress = campaign.token_address;
      const platform = detectTokenPlatform(tokenAddress);
      
      console.log(`🔍 Detected platform: ${platform} for token: ${tokenAddress}`);
      
      // Log detailed execution info
      console.log(`🚀 EXECUTING BUY:`, {
        tokenAddress,
        platform,
        buyAmountUSD,
        buyAmountSOL,
        solPrice,
        commandId: command_code_id,
        walletPubkey: keypair.publicKey.toString()
      });

      // Use raydium-swap function for REAL blockchain trades
      // The raydium-swap function already handles fallbacks to Jupiter for non-Raydium tokens
      const swapResponse = await supabaseClient.functions.invoke('raydium-swap', {
        body: {
          side: 'buy',
          tokenMint: campaign.token_address,
          usdcAmount: buyAmountSOL, // Now properly converted to SOL
          slippageBps: 500, // 5% slippage
          confirmPolicy: 'processed',
          buyWithSol: true
        },
        headers: {
          'x-owner-secret': wallet.secret_key_encrypted,
          'x-function-token': Deno.env.get("FUNCTION_TOKEN")
        }
      });

      if (swapResponse.error) {
        console.error('Buy swap failed:', {
          error: swapResponse.error,
          token: campaign.token_address,
          buyAmountSOL
        });
        
        // For pump.fun tokens that may not have Raydium liquidity, skip but don't fail
        const errorMessage = swapResponse.error.message || '';
        console.error(`❌ BUY FAILED for token ${campaign.token_address}:`, {
          error: swapResponse.error,
          buyAmountSOL,
          platform,
          errorMessage,
          fullResponse: swapResponse
        });
        
        if (errorMessage.includes('REQ_AMOUNT_ERROR') || errorMessage.includes('INSUFFICIENT_LIQUIDITY') || errorMessage.includes('ROUTE_NOT_FOUND')) {
          console.log(`⚠️ Token ${campaign.token_address} may not have Raydium liquidity, skipping buy`);
          result = { 
            message: 'Buy skipped - token may not have sufficient liquidity on Raydium',
            token: campaign.token_address,
            buyAmountSOL,
            type: 'buy',
            skipped: true,
            platform
          };
        } else {
          throw new Error(`Buy swap failed: ${swapResponse.error.message}`);
        }
      } else {

        const signatures = swapResponse.data?.signatures || [];
        const signature = signatures[0] || 'unknown';

        console.log(`✅ REAL BUY executed: ${buyAmountSOL} SOL -> ${campaign.token_address}, signatures: ${signatures.join(', ')}`);

        // Calculate fees for revenue collection
        const baseTradeFee = 0.003;
        const serviceFee = buyAmountSOL * 0.35; // 35% markup
        const totalRevenue = baseTradeFee + serviceFee;

        // Check if this is the testuser@blackbox.farm account (skip fees for testing)
        const { data: userData } = await supabaseService.auth.admin.getUserById(campaign.user_id);
        const userEmail = userData?.user?.email;
        
        const isTestAccount = userEmail === "testuser@blackbox.farm";

        let revenueCollected = 0;
        if (!isTestAccount) {
          // Collect revenue automatically
          try {
            await supabaseClient.functions.invoke('enhanced-revenue-collector', {
              body: { 
                user_id: campaign.user_id, 
                amount_sol: totalRevenue,
                revenue_type: 'trade_fee'
              }
            });
            revenueCollected = totalRevenue;
          } catch (revenueError) {
            console.error("Revenue collection failed:", revenueError);
          }
        } else {
          console.log(`🧪 TEST ACCOUNT (${userEmail}): Skipping revenue collection for user ${campaign.user_id}`);
        }

        // Log transaction
        await supabaseService
          .from("blackbox_transactions")
          .insert({
            wallet_id: wallet.id,
            command_code_id: command_code_id,
            transaction_type: "buy",
            amount_sol: buyAmountSOL,
            gas_fee: 0.000005, // Standard Solana gas
            service_fee: serviceFee,
            signature: signature,
            status: "completed"
          });

        result = { signature, amount: buyAmountSOL, type: "buy", revenue_collected: revenueCollected, signatures };
      }

    } else if (action === "sell") {
      // For sell, we need to check current token balance first
      try {
        // Detect token platform for logging
        const tokenAddress = campaign.token_address;
        const platform = detectTokenPlatform(tokenAddress);
        console.log(`🔍 Detected platform for sell: ${platform} for token: ${tokenAddress}`);
        
        // Get current token balance from wallet
        const connection = new Connection(
          Deno.env.get("SOLANA_RPC_URL") ?? "https://api.mainnet-beta.solana.com",
          "confirmed"
        );
        
        // Get token account for this wallet and token
        const tokenAccounts = await connection.getTokenAccountsByOwner(
          keypair.publicKey,
          { mint: new PublicKey(campaign.token_address) }
        );

        if (tokenAccounts.value.length === 0) {
          console.log(`⚠️ No token balance found for ${campaign.token_address}, skipping sell`);
          result = { message: "No tokens to sell", type: "sell" };
        } else {
          const tokenAccount = tokenAccounts.value[0];
          const accountInfo = await connection.getTokenAccountBalance(tokenAccount.pubkey);
          const tokenBalance = parseFloat(accountInfo.value.uiAmount || '0');

          if (tokenBalance <= 0) {
            console.log(`⚠️ Zero token balance, skipping sell`);
            result = { message: "Zero token balance", type: "sell" };
          } else {
            // Calculate sell amount based on percentage
            const config = commandData.config;
            const sellPercent = config.type === "simple" 
              ? config.sellPercent 
              : Math.random() * (config.sellPercent.max - config.sellPercent.min) + config.sellPercent.min;
            
            const sellAmount = tokenBalance * (sellPercent / 100);

            console.log(`💱 Selling ${sellAmount} tokens (${sellPercent}% of ${tokenBalance}) on ${platform}`);
            
            // Log detailed execution info
            console.log(`🚀 EXECUTING SELL:`, {
              tokenAddress: campaign.token_address,
              platform,
              sellAmount,
              sellPercent,
              tokenBalance,
              commandId: command_code_id,
              walletPubkey: keypair.publicKey.toString()
            });

            // Use raydium-swap function for REAL blockchain trades
            // The raydium-swap function handles platform-specific routing internally
            const swapResponse = await supabaseClient.functions.invoke('raydium-swap', {
              body: {
                side: 'sell',
                tokenMint: campaign.token_address,
                amount: sellAmount,
                slippageBps: 500,
                confirmPolicy: 'processed'
              },
              headers: {
                'x-owner-secret': wallet.secret_key_encrypted,
                'x-function-token': Deno.env.get("FUNCTION_TOKEN")
              }
            });

            if (swapResponse.error) {
              console.error('Sell swap failed:', {
                error: swapResponse.error,
                token: campaign.token_address,
                sellAmount
              });
              
              // For pump.fun tokens that may not have Raydium liquidity, skip but don't fail
              const errorMessage = swapResponse.error.message || '';
              console.error(`❌ SELL FAILED for token ${campaign.token_address}:`, {
                error: swapResponse.error,
                sellAmount,
                platform,
                errorMessage,
                fullResponse: swapResponse
              });
              
              if (errorMessage.includes('REQ_AMOUNT_ERROR') || errorMessage.includes('INSUFFICIENT_LIQUIDITY') || errorMessage.includes('ROUTE_NOT_FOUND')) {
                console.log(`⚠️ Token ${campaign.token_address} may not have Raydium liquidity, skipping sell`);
                result = { 
                  message: 'Sell skipped - token may not have sufficient liquidity on Raydium',
                  token: campaign.token_address,
                  sellAmount,
                  type: 'sell',
                  skipped: true,
                  platform
                };
              } else {
                throw new Error(`Sell swap failed: ${swapResponse.error.message}`);
              }
            } else {

              const signatures = swapResponse.data?.signatures || [];
              const signature = signatures[0] || 'unknown';
              const solReceived = swapResponse.data?.estimatedAmountOut || 0;

              console.log(`✅ REAL SELL executed: ${sellAmount} tokens -> ${solReceived} SOL, signatures: ${signatures.join(', ')}`);

              // Log transaction
              await supabaseService
                .from("blackbox_transactions")
                .insert({
                  wallet_id: wallet.id,
                  command_code_id: command_code_id,
                  transaction_type: "sell",
                  amount_sol: solReceived,
                  gas_fee: 0.000005,
                  service_fee: solReceived * 0.35,
                  signature: signature,
                  status: "completed"
                });

              result = { amount: sellAmount, percent: sellPercent, type: "sell", signatures, solReceived };
            }
          }
        }
      } catch (error) {
        console.error(`❌ Sell failed: ${error.message}`);
        throw error;
      }
    }

    console.log(`✅ ${action.toUpperCase()} EXECUTION COMPLETED for command ${command_code_id}:`, JSON.stringify(result, null, 2));

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error("Execution error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});