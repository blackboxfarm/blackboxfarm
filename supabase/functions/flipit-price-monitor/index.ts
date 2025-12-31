import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, PublicKey } from "npm:@solana/web3.js@1.95.3";

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

  // Pump.fun program ID
  const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
  const seed = new TextEncoder().encode("bonding-curve");

  const connection = new Connection(
    `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
    "confirmed"
  );

  for (const mintStr of tokenMints) {
    try {
      const mint = new PublicKey(mintStr);
      // Derive bonding curve PDA: seeds = ["bonding-curve", mint]
      const [bondingCurvePda] = PublicKey.findProgramAddressSync(
        [seed, mint.toBuffer()],
        PUMP_PROGRAM_ID
      );

      const info = await connection.getAccountInfo(bondingCurvePda);
      if (!info?.data) continue;

      const data = info.data;
      // BondingCurveAccount layout:
      // 0..8   discriminator (u64)
      // 8..16  virtual_token_reserves (u64)
      // 16..24 virtual_sol_reserves (u64)
      // 24..32 real_token_reserves (u64)
      // 32..40 real_sol_reserves (u64)
      // 40..48 token_total_supply (u64)
      // 48     complete (bool)
      if (data.length < 49) continue;

      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const realTokenReserves = view.getBigUint64(24, true);
      const complete = data[48] === 1;

      // Skip graduated tokens
      if (complete) continue;

      // Pump.fun starts with ~793,100,000 tokens available for sale
      // Progress = tokens sold / initial tokens = (initial - remaining) / initial
      const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n; // 793.1M with 6 decimals
      const tokensSold = INITIAL_REAL_TOKEN_RESERVES - realTokenReserves;
      const progress = Math.min(Math.max(Number(tokensSold * 100n / INITIAL_REAL_TOKEN_RESERVES), 0), 100);

      curveData[mintStr] = progress;
      const tokensSoldM = Number(INITIAL_REAL_TOKEN_RESERVES - realTokenReserves) / 1e12;
      console.log(`Bonding curve for ${mintStr}: ${progress.toFixed(1)}% (${tokensSoldM.toFixed(1)}M tokens sold)`);
    } catch (e) {
      // Not a pump.fun token or invalid - skip silently
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
    const solPrice = await fetchSolPrice();

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

      const priceChangePercent = ((currentPrice / entryPrice) - 1) * 100;
      console.log(`Position ${position.id}: entry=${entryPrice}, current=${currentPrice}, target=${targetPrice}, change=${priceChangePercent.toFixed(1)}%`);

      // ============================================
      // SCALP MODE EXIT LOGIC
      // ============================================
      if (position.is_scalp_position) {
        const scalp_stage = position.scalp_stage || 'initial';
        const takeProfitPct = position.scalp_take_profit_pct || 50;
        const moonBagPct = position.moon_bag_percent || 10;
        const stopLossPct = position.scalp_stop_loss_pct || 35;

        // Fetch channel-specific sell slippage and priority fee for scalp positions
        let scalpSellSlippage = effectiveSlippage;
        let scalpSellPriority = priorityFeeMode || 'high';
        
        if (position.source_channel_id) {
          const { data: channelConfig } = await supabase
            .from('telegram_channel_config')
            .select('scalp_sell_slippage_bps, scalp_sell_priority_fee')
            .eq('id', position.source_channel_id)
            .single();
          
          if (channelConfig) {
            scalpSellSlippage = channelConfig.scalp_sell_slippage_bps || 1500;
            scalpSellPriority = channelConfig.scalp_sell_priority_fee || 'high';
            console.log(`Scalp position using channel sell settings: slippage=${scalpSellSlippage}bps, priority=${scalpSellPriority}`);
          }
        }

        console.log(`Scalp position ${position.id}: stage=${scalp_stage}, TP=${takeProfitPct}%, SL=${stopLossPct}%, change=${priceChangePercent.toFixed(1)}%`);

        // Emergency exit: Stop loss hit
        if (priceChangePercent <= -stopLossPct && scalp_stage === 'initial') {
          console.log(`STOP LOSS HIT for ${position.token_mint}! Selling 100%`);
          
          try {
            const { data: sellResult, error: sellError } = await supabase.functions.invoke("flipit-execute", {
              body: {
                action: "sell",
                positionId: position.id,
                slippageBps: scalpSellSlippage,
                priorityFeeMode: scalpSellPriority,
              }
            });

            if (!sellError && sellResult?.success) {
              executed.push({
                positionId: position.id,
                action: 'emergency_stop_loss',
                tokenMint: position.token_mint,
                priceChangePercent,
                signature: sellResult.signature,
              });
            }
          } catch (e) {
            console.error(`Stop loss sell failed for ${position.id}:`, e);
          }
          continue;
        }

        // Primary Take Profit: Sell 90% at +TP%
        if (priceChangePercent >= takeProfitPct && scalp_stage === 'initial') {
          console.log(`SCALP TP1 HIT for ${position.token_mint}! Selling ${100 - moonBagPct}%`);
          
          try {
            const { data: partialResult, error: partialError } = await supabase.functions.invoke("flipit-execute", {
              body: {
                action: "partial_sell",
                positionId: position.id,
                sellPercent: 100 - moonBagPct, // Sell 90%, keep 10% moon bag
                reason: "scalp_tp1",
                slippageBps: scalpSellSlippage,
                priorityFeeMode: scalpSellPriority,
              }
            });

            if (!partialError && partialResult?.success) {
              executed.push({
                positionId: position.id,
                action: 'scalp_tp1',
                tokenMint: position.token_mint,
                priceChangePercent,
                soldPercent: 100 - moonBagPct,
                signature: partialResult.signature,
              });

              // Send notification
              try {
                await supabase.functions.invoke("send-email-notification", {
                  body: {
                    to: "wilsondavid@live.ca",
                    subject: `🎯 Scalp TP Hit: ${position.token_symbol || position.token_mint.slice(0, 8)} +${priceChangePercent.toFixed(0)}%`,
                    title: "Scalp Take Profit Hit!",
                    message: `Sold ${100 - moonBagPct}% at +${priceChangePercent.toFixed(1)}%, keeping ${moonBagPct}% moon bag.`,
                    type: "success"
                  }
                });
              } catch (e) {
                console.error("Email notification failed:", e);
              }
            }
          } catch (e) {
            console.error(`Scalp TP1 sell failed for ${position.id}:`, e);
          }
          continue;
        }

        // Moon bag ladder: At +100%, sell 50% of remaining
        if (priceChangePercent >= 100 && scalp_stage === 'tp1_hit') {
          console.log(`SCALP LADDER 100% for ${position.token_mint}! Selling 50% of moon bag`);
          
          try {
            const { data: ladderResult, error: ladderError } = await supabase.functions.invoke("flipit-execute", {
              body: {
                action: "partial_sell",
                positionId: position.id,
                sellPercent: 50, // Sell half of remaining moon bag
                reason: "scalp_ladder_100",
                slippageBps: scalpSellSlippage,
                priorityFeeMode: scalpSellPriority,
              }
            });

            if (!ladderError && ladderResult?.success) {
              executed.push({
                positionId: position.id,
                action: 'scalp_ladder_100',
                tokenMint: position.token_mint,
                priceChangePercent,
                signature: ladderResult.signature,
              });
            }
          } catch (e) {
            console.error(`Scalp ladder 100 failed for ${position.id}:`, e);
          }
          continue;
        }

        // Moon bag ladder: At +300%, sell all remaining
        if (priceChangePercent >= 300 && (scalp_stage === 'ladder_100' || scalp_stage === 'tp1_hit')) {
          console.log(`SCALP LADDER 300% for ${position.token_mint}! Selling all remaining`);
          
          try {
            const { data: finalResult, error: finalError } = await supabase.functions.invoke("flipit-execute", {
              body: {
                action: "partial_sell",
                positionId: position.id,
                sellPercent: 100, // Sell all remaining
                reason: "scalp_ladder_300",
                slippageBps: scalpSellSlippage,
                priorityFeeMode: scalpSellPriority,
              }
            });

            if (!finalError && finalResult?.success) {
              executed.push({
                positionId: position.id,
                action: 'scalp_ladder_300',
                tokenMint: position.token_mint,
                priceChangePercent,
                signature: finalResult.signature,
              });
            }
          } catch (e) {
            console.error(`Scalp ladder 300 failed for ${position.id}:`, e);
          }
          continue;
        }

        // Scalp positions handled - skip regular target logic
        continue;
      }

      // ============================================
      // REGULAR (NON-SCALP) TARGET LOGIC
      // ============================================
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
