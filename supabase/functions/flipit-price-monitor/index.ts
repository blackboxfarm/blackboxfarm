import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(message: string, status = 400) {
  return ok({ error: message }, status);
}

function firstSignature(swapResult: any): string | null {
  if (!swapResult) return null;
  if (typeof swapResult.signature === "string" && swapResult.signature.length > 0) return swapResult.signature;
  if (Array.isArray(swapResult.signatures) && typeof swapResult.signatures[0] === "string" && swapResult.signatures[0].length > 0) {
    return swapResult.signatures[0];
  }
  if (Array.isArray(swapResult.data?.signatures) && typeof swapResult.data.signatures?.[0] === "string") {
    return swapResult.data.signatures[0];
  }
  return null;
}

async function fetchSolPrice(): Promise<number> {
  try {
    const res = await fetch("https://price.jup.ag/v6/price?ids=SOL");
    const json = await res.json();
    return Number(json?.data?.SOL?.price) || 150;
  } catch {
    return 150; // fallback
  }
}

interface TokenPriceData {
  price: number;
  bondingCurvePercent?: number; // 0-100, only for pump.fun tokens still on curve
}

async function fetchBondingCurveData(tokenMints: string[]): Promise<Record<string, number>> {
  const curveData: Record<string, number> = {};
  const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
  
  if (!heliusApiKey) {
    console.log("No Helius API key, skipping bonding curve fetch");
    return curveData;
  }
  
  // Pump.fun program ID and bonding curve constants
  const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
  const BONDING_CURVE_SEED = "bonding-curve";
  
  for (const mint of tokenMints) {
    try {
      // Derive the bonding curve PDA
      const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      
      // First, check if this is a pump.fun token by looking for the bonding curve account
      // We'll use getAccountInfo on the derived PDA
      const pdaRes = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getProgramAccounts",
          params: [
            PUMP_PROGRAM_ID,
            {
              encoding: "base64",
              filters: [
                { dataSize: 323 }, // Bonding curve account size
                { memcmp: { offset: 8, bytes: mint } } // Token mint at offset 8
              ]
            }
          ]
        })
      });
      
      if (pdaRes.ok) {
        const pdaData = await pdaRes.json();
        if (pdaData?.result && pdaData.result.length > 0) {
          const accountData = pdaData.result[0]?.account?.data?.[0];
          if (accountData) {
            // Decode base64 account data
            const buffer = Uint8Array.from(atob(accountData), c => c.charCodeAt(0));
            
            // Bonding curve layout (simplified):
            // 8 bytes discriminator
            // 32 bytes mint
            // 8 bytes virtual_token_reserves
            // 8 bytes virtual_sol_reserves
            // 8 bytes real_token_reserves
            // 8 bytes real_sol_reserves
            // The progress is calculated as: real_sol_reserves / 85 SOL target
            
            const view = new DataView(buffer.buffer);
            // real_sol_reserves is at offset 8 + 32 + 8 + 8 + 8 = 64
            const realSolReserves = Number(view.getBigUint64(64, true)) / 1e9; // Convert lamports to SOL
            
            // Pump.fun bonding curve graduates at ~85 SOL
            const targetSol = 85;
            const progress = Math.min((realSolReserves / targetSol) * 100, 100);
            
            if (progress < 100) {
              curveData[mint] = progress;
              console.log(`Bonding curve for ${mint}: ${progress.toFixed(1)}% (${realSolReserves.toFixed(2)} SOL)`);
            }
          }
        }
      }
    } catch (e) {
      console.log(`Error fetching bonding curve for ${mint}:`, e);
    }
  }
  
  return curveData;
}

async function fetchTokenPrices(tokenMints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  
  // Batch fetch from Jupiter (up to 100 at a time)
  const chunks = [];
  for (let i = 0; i < tokenMints.length; i += 100) {
    chunks.push(tokenMints.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    try {
      const ids = chunk.join(",");
      const res = await fetch(`https://price.jup.ag/v6/price?ids=${ids}`);
      const json = await res.json();
      
      for (const mint of chunk) {
        const price = json?.data?.[mint]?.price;
        if (price) {
          prices[mint] = Number(price);
        }
      }
    } catch (e) {
      console.error("Jupiter batch price fetch failed:", e);
    }
  }

  // For any missing prices, try DexScreener
  const missing = tokenMints.filter(m => !prices[m]);
  for (const mint of missing) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (res.ok) {
        const data = await res.json();
        const pair = data?.pairs?.[0];
        if (pair?.priceUsd) {
          prices[mint] = Number(pair.priceUsd);
        }
      }
    } catch (e) {
      console.error(`DexScreener price fetch failed for ${mint}:`, e);
    }
  }

  return prices;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { action, slippageBps, priorityFeeMode } = body;

    // Default slippage 5% (500 bps), configurable
    const effectiveSlippage = slippageBps || 500;

    console.log("FlipIt price monitor:", { action, slippageBps: effectiveSlippage, priorityFeeMode });

    // Get all holding positions
    const { data: positions, error: posErr } = await supabase
      .from("flip_positions")
      .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(secret_key_encrypted)")
      .eq("status", "holding");

    if (posErr) {
      console.error("Failed to fetch positions:", posErr);
      return bad("Failed to fetch positions");
    }

    if (!positions || positions.length === 0) {
      return ok({ message: "No active positions to monitor", prices: {}, bondingCurveData: {}, executed: [] });
    }

    console.log(`Monitoring ${positions.length} active positions`);

    // Get unique token mints
    const tokenMints = [...new Set(positions.map(p => p.token_mint))];

    // Fetch all prices and bonding curve data in parallel
    const [prices, bondingCurveData] = await Promise.all([
      fetchTokenPrices(tokenMints),
      fetchBondingCurveData(tokenMints)
    ]);
    console.log("Fetched prices:", prices);
    console.log("Fetched bonding curve data:", bondingCurveData);

    const executed: any[] = [];

    // Check each position for target hit
    for (const position of positions) {
      const currentPrice = prices[position.token_mint];
      if (!currentPrice) {
        console.log(`No price available for ${position.token_mint}`);
        continue;
      }

      const targetPrice = position.target_price_usd;
      const entryPrice = position.buy_price_usd;

      if (!targetPrice || !entryPrice) {
        continue;
      }

      console.log(`Position ${position.id}: entry=${entryPrice}, current=${currentPrice}, target=${targetPrice}`);

      // Check if target hit
      if (currentPrice >= targetPrice) {
        console.log(`TARGET HIT for ${position.token_mint}! Executing sell...`);

        try {
          // Mark as pending sell
          await supabase
            .from("flip_positions")
            .update({ status: "pending_sell" })
            .eq("id", position.id);

          // Execute sell using walletId for direct DB lookup (more reliable)
          const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
            body: {
              side: "sell",
              tokenMint: position.token_mint,
              sellAll: true,
              slippageBps: effectiveSlippage,
              priorityFeeMode: priorityFeeMode || "medium",
              walletId: position.wallet_id,
            },
          });

          if (swapError) {
            throw new Error(swapError.message);
          }

          // Handle soft errors (200 with error_code) - mark as sold if no balance
          if (swapResult?.error_code) {
            const noBalanceCodes = ["NO_BALANCE", "BALANCE_CHECK_FAILED"];
            if (noBalanceCodes.includes(swapResult.error_code)) {
              console.log(`Position ${position.id} has no balance, marking as sold`);
              await supabase
                .from("flip_positions")
                .update({
                  status: "sold",
                  error_message: `Auto-closed: ${swapResult.error}`,
                  sell_executed_at: new Date().toISOString(),
                })
                .eq("id", position.id);
              continue; // Skip to next position
            }
            throw new Error(`[${swapResult.error_code}] ${swapResult.error}`);
          }

          if (swapResult?.error) {
            throw new Error(swapResult.error);
          }

          const signature = firstSignature(swapResult);
          if (!signature) {
            throw new Error("Swap returned no signature (sell did not confirm)");
          }

          // Calculate profit at trigger price
          const triggerProfit = position.buy_amount_usd * ((currentPrice / entryPrice) - 1);
          const targetProfit = position.buy_amount_usd * ((targetPrice / entryPrice) - 1);
          
          // Try to get actual output amount from swap result for accurate profit
          let finalProfit = triggerProfit;
          let finalSellPrice = currentPrice;
          
          const outLamports = Number(swapResult?.outAmount || swapResult?.data?.outAmount || 0);
          if (outLamports > 0) {
            const solPrice = await fetchSolPrice();
            const actualSellValue = (outLamports / 1e9) * solPrice;
            const actualProfit = actualSellValue - position.buy_amount_usd;
            
            console.log(`Swap output: ${outLamports} lamports = ${(outLamports / 1e9).toFixed(6)} SOL @ $${solPrice} = $${actualSellValue.toFixed(2)}`);
            console.log(`Trigger profit: $${triggerProfit.toFixed(2)}, Actual profit: $${actualProfit.toFixed(2)}, Target profit: $${targetProfit.toFixed(2)}`);
            
            // Use the HIGHEST of: trigger profit, actual profit, or target profit
            if (actualProfit > finalProfit) {
              finalProfit = actualProfit;
              // Calculate effective price from actual value
              if (position.token_amount > 0) {
                finalSellPrice = actualSellValue / position.token_amount;
              }
            }
          }
          
          // Never record below target price profit (user set this as minimum)
          if (finalProfit < targetProfit) {
            console.log(`Final profit $${finalProfit.toFixed(2)} below target $${targetProfit.toFixed(2)}, using target`);
            finalProfit = targetProfit;
            finalSellPrice = targetPrice;
          }

          // Update position - and set rebuy_status to 'watching' if rebuy_enabled
          const updateData: any = {
            sell_signature: signature,
            sell_executed_at: new Date().toISOString(),
            sell_price_usd: finalSellPrice,
            profit_usd: finalProfit,
            status: "sold",
            error_message: null,
          };

          // If rebuy is enabled and has price/amount set, start watching
          if (position.rebuy_enabled && position.rebuy_price_usd && position.rebuy_amount_usd) {
            updateData.rebuy_status = "watching";
            console.log(`Rebuy enabled for ${position.id}, setting status to watching`);
          }

          await supabase
            .from("flip_positions")
            .update(updateData)
            .eq("id", position.id);

          executed.push({
            positionId: position.id,
            tokenMint: position.token_mint,
            entryPrice,
            sellPrice: finalSellPrice,
            profit: finalProfit,
            signature,
            signatures: (swapResult as any)?.signatures ?? [signature],
          });

          console.log(`Sold position ${position.id} with profit: $${finalProfit.toFixed(2)} (trigger: $${triggerProfit.toFixed(2)})`);

          // Send email notification for successful sell
          try {
            const profitPct = ((finalSellPrice / entryPrice) - 1) * 100;
            const isProfit = finalProfit >= 0;
            
            await supabase.functions.invoke("send-email-notification", {
              body: {
                to: "wilsondavid@live.ca",
                subject: `${isProfit ? "💰" : "📉"} FlipIt Sold: ${position.token_symbol || position.token_mint.slice(0, 8)} | ${isProfit ? "+" : ""}$${finalProfit.toFixed(2)}`,
                title: isProfit ? "Target Hit - Position Sold!" : "Position Sold",
                message: `
<strong>Token:</strong> ${position.token_name || position.token_symbol || "Unknown"} (${position.token_symbol || position.token_mint.slice(0, 8)})

<strong>Trade Summary:</strong>
• Entry Price: $${entryPrice.toFixed(8)}
• Sell Price: <strong>$${finalSellPrice.toFixed(8)}</strong>
• Target Price: $${targetPrice.toFixed(8)}
• Buy Amount: $${position.buy_amount_usd?.toFixed(2) || "N/A"}

<strong>Result:</strong>
• Profit/Loss: <strong style="color: ${isProfit ? "#22c55e" : "#ef4444"}">${isProfit ? "+" : ""}$${finalProfit.toFixed(2)} (${isProfit ? "+" : ""}${profitPct.toFixed(1)}%)</strong>

<strong>Rebuy Status:</strong> ${updateData.rebuy_status === "watching" ? "👀 Watching for rebuy opportunity" : "❌ Not enabled"}
                `,
                type: isProfit ? "success" : "warning",
                metadata: {
                  tokenMint: position.token_mint,
                  actionUrl: `https://solscan.io/tx/${signature}`,
                  actionText: "View Transaction",
                  chartUrl: `https://dexscreener.com/solana/${position.token_mint}`,
                }
              }
            });
            console.log("Sell notification email sent");
          } catch (emailErr) {
            console.error("Failed to send sell notification email:", emailErr);
          }

        } catch (sellErr: any) {
          console.error(`Failed to sell position ${position.id}:`, sellErr);
          
          // Revert to holding
          await supabase
            .from("flip_positions")
            .update({
              status: "holding",
              error_message: sellErr.message
            })
            .eq("id", position.id);
        }
      }
    }

    return ok({
      message: `Monitored ${positions.length} positions`,
      prices,
      bondingCurveData,
      executed,
      checkedAt: new Date().toISOString()
    });

  } catch (err: any) {
    console.error("FlipIt monitor error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
