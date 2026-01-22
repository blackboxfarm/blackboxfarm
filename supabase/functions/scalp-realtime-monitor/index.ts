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

// Configuration
const POLL_INTERVAL_MS = 5000; // 5 seconds
const MAX_RUNTIME_MS = 50000; // 50 seconds (leave 10s buffer before Edge Function timeout)
const PRICE_CACHE_TTL_MS = 3000; // Cache prices for 3 seconds

// Simple price cache to avoid hammering APIs
const priceCache = new Map<string, { price: number; timestamp: number }>();

async function fetchSolPrice(): Promise<number> {
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  // Try Jupiter v2 API first with auth
  try {
    const res = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", {
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
    });
    const json = await res.json();
    const price = Number(json?.data?.['So11111111111111111111111111111111111111112']?.price);
    if (price && price > 0) return price;
  } catch (e) {
    console.error('Jupiter SOL price failed:', e);
  }
  
  // Try CoinGecko as backup
  try {
    const apiKey = Deno.env.get('COINGECKO_API_KEY');
    const headers: Record<string, string> = { 'Accept': 'application/json' };
    if (apiKey) headers['x-cg-demo-api-key'] = apiKey;
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', { headers });
    if (res.ok) {
      const data = await res.json();
      if (data?.solana?.usd) return data.solana.usd;
    }
  } catch (e) {
    console.error('CoinGecko SOL price failed:', e);
  }
  
  // NO FALLBACK - throw error
  throw new Error('CRITICAL: Cannot fetch SOL price from any source');
}

async function fetchTokenPrices(tokenMints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const now = Date.now();
  const mintsToFetch: string[] = [];

  // Check cache first
  for (const mint of tokenMints) {
    const cached = priceCache.get(mint);
    if (cached && now - cached.timestamp < PRICE_CACHE_TTL_MS) {
      prices[mint] = cached.price;
    } else {
      mintsToFetch.push(mint);
    }
  }

  if (mintsToFetch.length === 0) {
    return prices;
  }

  // Batch fetch from Jupiter with auth
  const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
  try {
    const ids = mintsToFetch.join(",");
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`, {
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
    });
    const json = await res.json();

    for (const mint of mintsToFetch) {
      const price = json?.data?.[mint]?.price;
      if (price) {
        prices[mint] = Number(price);
        priceCache.set(mint, { price: Number(price), timestamp: now });
      }
    }
  } catch (e) {
    console.error("Jupiter batch price fetch failed:", e);
  }

  // Fallback to DexScreener for missing
  const missing = mintsToFetch.filter((m) => !prices[m]);
  for (const mint of missing) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      if (res.ok) {
        const data = await res.json();
        const pair = data?.pairs?.[0];
        if (pair?.priceUsd) {
          prices[mint] = Number(pair.priceUsd);
          priceCache.set(mint, { price: Number(pair.priceUsd), timestamp: now });
        }
      }
    } catch (e) {
      console.error(`DexScreener price fetch failed for ${mint}:`, e);
    }
  }

  return prices;
}

interface ScalpPosition {
  id: string;
  token_mint: string;
  token_symbol: string | null;
  buy_price_usd: number;
  buy_amount_usd: number;
  quantity_tokens: number;
  scalp_stage: string;
  scalp_take_profit_pct: number;
  scalp_stop_loss_pct: number;
  moon_bag_percent: number;
  moon_bag_quantity_tokens: number | null;
  is_test_position: boolean;
  source_channel_id: string | null;
  wallet_id: string;
  partial_sells: any[];
  profit_usd: number | null;
  // Moon bag dump protection fields
  moon_bag_peak_price_usd: number | null;
  moon_bag_peak_change_pct: number | null;
  moon_bag_dump_threshold_pct: number | null;
}

interface ExecutionResult {
  positionId: string;
  action: string;
  tokenMint: string;
  priceChangePercent: number;
  signature?: string;
  simulatedProfit?: number;
  soldPercent?: number;
  peakDropPct?: number;
}

// Calculate graduated dump threshold based on how high it reached
function getGraduatedDumpThreshold(peakChangePct: number): number {
  // If it went really high, give it more room to drop
  if (peakChangePct >= 200) return 50; // Allow 50% drop from peak if it went 3x+
  if (peakChangePct >= 100) return 40; // Allow 40% drop if it doubled
  if (peakChangePct >= 50) return 30;  // Allow 30% drop after TP1
  return 25; // Tight stop if barely past TP1
}

async function processScalpPosition(
  supabase: any,
  position: ScalpPosition,
  currentPrice: number,
  solPrice: number
): Promise<ExecutionResult | null> {
  const entryPrice = position.buy_price_usd;
  if (!entryPrice || !currentPrice) return null;

  const priceChangePercent = ((currentPrice / entryPrice) - 1) * 100;
  const scalp_stage = position.scalp_stage || "initial";
  const takeProfitPct = position.scalp_take_profit_pct || 50;
  const moonBagPct = position.moon_bag_percent || 10;
  const stopLossPct = position.scalp_stop_loss_pct || 35;
  const isTestPosition = position.is_test_position === true;

  console.log(
    `[${position.token_symbol || position.token_mint.slice(0, 8)}] ` +
    `stage=${scalp_stage}, change=${priceChangePercent.toFixed(1)}%, ` +
    `TP=${takeProfitPct}%, SL=${stopLossPct}%${isTestPosition ? " [TEST]" : ""}`
  );

  // Fetch channel-specific sell settings
  let scalpSellSlippage = 1500;
  let scalpSellPriority = "high";

  if (position.source_channel_id) {
    const { data: channelConfig } = await supabase
      .from("telegram_channel_config")
      .select("scalp_sell_slippage_bps, scalp_sell_priority_fee")
      .eq("id", position.source_channel_id)
      .single();

    if (channelConfig) {
      scalpSellSlippage = channelConfig.scalp_sell_slippage_bps || 1500;
      scalpSellPriority = channelConfig.scalp_sell_priority_fee || "high";
    }
  }

  // ============ TEST POSITION LOGIC (SIMULATED) ============
  if (isTestPosition) {
    // Stop loss simulation
    if (priceChangePercent <= -stopLossPct && scalp_stage === "initial") {
      console.log(`[TEST MODE] STOP LOSS HIT for ${position.token_mint}!`);

      const soldQuantity = position.quantity_tokens || 0;
      const simulatedValue = soldQuantity * currentPrice;
      const simulatedProfit = simulatedValue - position.buy_amount_usd;

      await supabase
        .from("flip_positions")
        .update({
          sell_price_usd: currentPrice,
          sell_executed_at: new Date().toISOString(),
          sell_signature: "SIMULATED_SL_" + Date.now(),
          profit_usd: simulatedProfit,
          status: "sold",
          scalp_stage: "stop_loss",
          error_message: null,
        })
        .eq("id", position.id);

      return {
        positionId: position.id,
        action: "test_stop_loss",
        tokenMint: position.token_mint,
        priceChangePercent,
        simulatedProfit,
        signature: "SIMULATED",
      };
    }

    // Take profit simulation
    if (priceChangePercent >= takeProfitPct && scalp_stage === "initial") {
      console.log(`[TEST MODE] TP1 HIT for ${position.token_mint}!`);

      const soldPercent = 100 - moonBagPct;
      const soldQuantity = (position.quantity_tokens || 0) * (soldPercent / 100);
      const remainingQuantity = (position.quantity_tokens || 0) * (moonBagPct / 100);
      const simulatedValue = soldQuantity * currentPrice;
      const costBasis = position.buy_amount_usd * (soldPercent / 100);
      const partialProfit = simulatedValue - costBasis;

      await supabase
        .from("flip_positions")
        .update({
          scalp_stage: "tp1_hit",
          quantity_tokens: remainingQuantity,
          moon_bag_quantity_tokens: remainingQuantity,
          moon_bag_peak_price_usd: currentPrice,
          moon_bag_peak_change_pct: priceChangePercent,
          profit_usd: partialProfit,
          partial_sells: [
            {
              percent: soldPercent,
              price: currentPrice,
              signature: "SIMULATED_TP1",
              timestamp: new Date().toISOString(),
              reason: "scalp_tp1",
              profit: partialProfit,
            },
          ],
        })
        .eq("id", position.id);

      return {
        positionId: position.id,
        action: "test_scalp_tp1",
        tokenMint: position.token_mint,
        priceChangePercent,
        soldPercent,
        simulatedProfit: partialProfit,
        signature: "SIMULATED",
      };
    }

    // Moon bag ladder at +100%
    if (priceChangePercent >= 100 && scalp_stage === "tp1_hit") {
      console.log(`[TEST MODE] LADDER 100% for ${position.token_mint}!`);

      const currentMoonBag = position.moon_bag_quantity_tokens || position.quantity_tokens || 0;
      const remainingQuantity = currentMoonBag * 0.5;
      const existingPartialSells = Array.isArray(position.partial_sells) ? position.partial_sells : [];

      await supabase
        .from("flip_positions")
        .update({
          scalp_stage: "ladder_100",
          quantity_tokens: remainingQuantity,
          moon_bag_quantity_tokens: remainingQuantity,
          moon_bag_peak_price_usd: currentPrice,
          moon_bag_peak_change_pct: priceChangePercent,
          partial_sells: [
            ...existingPartialSells,
            {
              percent: 50,
              price: currentPrice,
              signature: "SIMULATED_LADDER100",
              timestamp: new Date().toISOString(),
              reason: "scalp_ladder_100",
            },
          ],
        })
        .eq("id", position.id);

      return {
        positionId: position.id,
        action: "test_scalp_ladder_100",
        tokenMint: position.token_mint,
        priceChangePercent,
        signature: "SIMULATED",
      };
    }

    // Moon bag ladder at +300% - sell all remaining
    if (priceChangePercent >= 300 && (scalp_stage === "ladder_100" || scalp_stage === "tp1_hit")) {
      console.log(`[TEST MODE] LADDER 300% for ${position.token_mint}!`);

      const remainingQuantity = position.moon_bag_quantity_tokens || position.quantity_tokens || 0;
      const finalValue = remainingQuantity * currentPrice;
      const existingPartialSells = Array.isArray(position.partial_sells) ? position.partial_sells : [];
      const existingProfit = position.profit_usd || 0;
      const finalSaleProfit = finalValue - position.buy_amount_usd * (moonBagPct / 100);
      const totalProfit = existingProfit + finalSaleProfit;

      await supabase
        .from("flip_positions")
        .update({
          scalp_stage: "completed",
          status: "sold",
          quantity_tokens: 0,
          moon_bag_quantity_tokens: 0,
          sell_price_usd: currentPrice,
          sell_executed_at: new Date().toISOString(),
          sell_signature: "SIMULATED_LADDER300_" + Date.now(),
          profit_usd: totalProfit,
          partial_sells: [
            ...existingPartialSells,
            {
              percent: 100,
              price: currentPrice,
              signature: "SIMULATED_LADDER300",
              timestamp: new Date().toISOString(),
              reason: "scalp_ladder_300",
            },
          ],
        })
        .eq("id", position.id);

      return {
        positionId: position.id,
        action: "test_scalp_ladder_300",
        tokenMint: position.token_mint,
        priceChangePercent,
        signature: "SIMULATED",
      };
    }

    // ======== MOON BAG DUMP PROTECTION (TEST MODE) ========
    // After TP1 hit, track peak and check for dump
    if (scalp_stage === "tp1_hit" || scalp_stage === "ladder_100") {
      const currentPeakPrice = position.moon_bag_peak_price_usd || entryPrice;
      const currentPeakChangePct = position.moon_bag_peak_change_pct || 0;

      // Update peak if current is higher
      if (currentPrice > currentPeakPrice) {
        console.log(`[TEST MODE] New peak for ${position.token_mint}: $${currentPrice.toFixed(6)} (+${priceChangePercent.toFixed(1)}%)`);
        await supabase
          .from("flip_positions")
          .update({
            moon_bag_peak_price_usd: currentPrice,
            moon_bag_peak_change_pct: priceChangePercent,
          })
          .eq("id", position.id);
      } else if (position.moon_bag_peak_price_usd) {
        // Check for dump from peak
        const peakPrice = position.moon_bag_peak_price_usd;
        const dropFromPeakPct = ((peakPrice - currentPrice) / peakPrice) * 100;
        const dumpThreshold = position.moon_bag_dump_threshold_pct || getGraduatedDumpThreshold(currentPeakChangePct);

        console.log(`[TEST MODE] Peak: $${peakPrice.toFixed(6)}, Current: $${currentPrice.toFixed(6)}, Drop: ${dropFromPeakPct.toFixed(1)}%, Threshold: ${dumpThreshold}%`);

        if (dropFromPeakPct >= dumpThreshold) {
          console.log(`[TEST MODE] 🚨 MOON BAG DUMP DETECTED for ${position.token_mint}! Dropped ${dropFromPeakPct.toFixed(1)}% from peak`);

          const remainingQuantity = position.moon_bag_quantity_tokens || position.quantity_tokens || 0;
          const finalValue = remainingQuantity * currentPrice;
          const existingPartialSells = Array.isArray(position.partial_sells) ? position.partial_sells : [];
          const existingProfit = position.profit_usd || 0;
          const dumpSaleProfit = finalValue - position.buy_amount_usd * (moonBagPct / 100);
          const totalProfit = existingProfit + dumpSaleProfit;

          await supabase
            .from("flip_positions")
            .update({
              scalp_stage: "dump_exit",
              status: "sold",
              quantity_tokens: 0,
              moon_bag_quantity_tokens: 0,
              sell_price_usd: currentPrice,
              sell_executed_at: new Date().toISOString(),
              sell_signature: "SIMULATED_DUMP_EXIT_" + Date.now(),
              profit_usd: totalProfit,
              partial_sells: [
                ...existingPartialSells,
                {
                  percent: 100,
                  price: currentPrice,
                  signature: "SIMULATED_DUMP_EXIT",
                  timestamp: new Date().toISOString(),
                  reason: "moon_bag_dump_exit",
                  peakPrice: peakPrice,
                  dropFromPeakPct: dropFromPeakPct,
                },
              ],
            })
            .eq("id", position.id);

          return {
            positionId: position.id,
            action: "test_moon_bag_dump_exit",
            tokenMint: position.token_mint,
            priceChangePercent,
            peakDropPct: dropFromPeakPct,
            signature: "SIMULATED",
          };
        }
      }
    }

    // No trigger hit for test position
    return null;
  }

  // ============ REAL POSITION LOGIC ============

  // Emergency exit: Stop loss hit
  if (priceChangePercent <= -stopLossPct && scalp_stage === "initial") {
    console.log(`STOP LOSS HIT for ${position.token_mint}! Selling 100%`);

    try {
      const { data: sellResult, error: sellError } = await supabase.functions.invoke("flipit-execute", {
        body: {
          action: "sell",
          positionId: position.id,
          slippageBps: scalpSellSlippage,
          priorityFeeMode: scalpSellPriority,
        },
      });

      if (!sellError && sellResult?.success) {
        return {
          positionId: position.id,
          action: "emergency_stop_loss",
          tokenMint: position.token_mint,
          priceChangePercent,
          signature: sellResult.signature,
        };
      }
    } catch (e) {
      console.error(`Stop loss sell failed for ${position.id}:`, e);
    }
    return null;
  }

  // Primary Take Profit: Sell 90% at +TP%
  if (priceChangePercent >= takeProfitPct && scalp_stage === "initial") {
    console.log(`SCALP TP1 HIT for ${position.token_mint}! Selling ${100 - moonBagPct}%`);

    try {
      const { data: partialResult, error: partialError } = await supabase.functions.invoke("flipit-execute", {
        body: {
          action: "partial_sell",
          positionId: position.id,
          sellPercent: 100 - moonBagPct,
          reason: "scalp_tp1",
          slippageBps: scalpSellSlippage,
          priorityFeeMode: scalpSellPriority,
        },
      });

      if (!partialError && partialResult?.success) {
        // Initialize peak tracking for moon bag
        await supabase
          .from("flip_positions")
          .update({
            moon_bag_peak_price_usd: currentPrice,
            moon_bag_peak_change_pct: priceChangePercent,
          })
          .eq("id", position.id);

        // Send notification
        try {
          await supabase.functions.invoke("send-email-notification", {
            body: {
              to: "wilsondavid@live.ca",
              subject: `🎯 Scalp TP Hit: ${position.token_symbol || position.token_mint.slice(0, 8)} +${priceChangePercent.toFixed(0)}%`,
              title: "Scalp Take Profit Hit!",
              message: `Sold ${100 - moonBagPct}% at +${priceChangePercent.toFixed(1)}%, keeping ${moonBagPct}% moon bag. Moon bag peak tracking started.`,
              type: "success",
            },
          });
        } catch (e) {
          console.error("Email notification failed:", e);
        }

        return {
          positionId: position.id,
          action: "scalp_tp1",
          tokenMint: position.token_mint,
          priceChangePercent,
          soldPercent: 100 - moonBagPct,
          signature: partialResult.signature,
        };
      }
    } catch (e) {
      console.error(`Scalp TP1 sell failed for ${position.id}:`, e);
    }
    return null;
  }

  // Moon bag ladder: At +100%, sell 50% of remaining
  if (priceChangePercent >= 100 && scalp_stage === "tp1_hit") {
    console.log(`SCALP LADDER 100% for ${position.token_mint}!`);

    try {
      const { data: ladderResult, error: ladderError } = await supabase.functions.invoke("flipit-execute", {
        body: {
          action: "partial_sell",
          positionId: position.id,
          sellPercent: 50,
          reason: "scalp_ladder_100",
          slippageBps: scalpSellSlippage,
          priorityFeeMode: scalpSellPriority,
        },
      });

      if (!ladderError && ladderResult?.success) {
        // Update peak tracking after ladder sell
        await supabase
          .from("flip_positions")
          .update({
            moon_bag_peak_price_usd: currentPrice,
            moon_bag_peak_change_pct: priceChangePercent,
          })
          .eq("id", position.id);

        return {
          positionId: position.id,
          action: "scalp_ladder_100",
          tokenMint: position.token_mint,
          priceChangePercent,
          signature: ladderResult.signature,
        };
      }
    } catch (e) {
      console.error(`Scalp ladder 100 failed for ${position.id}:`, e);
    }
    return null;
  }

  // Moon bag ladder: At +300%, sell all remaining
  if (priceChangePercent >= 300 && (scalp_stage === "ladder_100" || scalp_stage === "tp1_hit")) {
    console.log(`SCALP LADDER 300% for ${position.token_mint}!`);

    try {
      const { data: finalResult, error: finalError } = await supabase.functions.invoke("flipit-execute", {
        body: {
          action: "partial_sell",
          positionId: position.id,
          sellPercent: 100,
          reason: "scalp_ladder_300",
          slippageBps: scalpSellSlippage,
          priorityFeeMode: scalpSellPriority,
        },
      });

      if (!finalError && finalResult?.success) {
        return {
          positionId: position.id,
          action: "scalp_ladder_300",
          tokenMint: position.token_mint,
          priceChangePercent,
          signature: finalResult.signature,
        };
      }
    } catch (e) {
      console.error(`Scalp ladder 300 failed for ${position.id}:`, e);
    }
    return null;
  }

  // ======== MOON BAG DUMP PROTECTION (REAL POSITIONS) ========
  // After TP1 hit, track peak and check for dump
  if (scalp_stage === "tp1_hit" || scalp_stage === "ladder_100") {
    const currentPeakPrice = position.moon_bag_peak_price_usd || entryPrice;
    const currentPeakChangePct = position.moon_bag_peak_change_pct || 0;

    // Update peak if current is higher
    if (currentPrice > currentPeakPrice) {
      console.log(`📈 New peak for ${position.token_mint}: $${currentPrice.toFixed(6)} (+${priceChangePercent.toFixed(1)}%)`);
      await supabase
        .from("flip_positions")
        .update({
          moon_bag_peak_price_usd: currentPrice,
          moon_bag_peak_change_pct: priceChangePercent,
        })
        .eq("id", position.id);
    } else if (position.moon_bag_peak_price_usd) {
      // Check for dump from peak
      const peakPrice = position.moon_bag_peak_price_usd;
      const dropFromPeakPct = ((peakPrice - currentPrice) / peakPrice) * 100;
      const dumpThreshold = position.moon_bag_dump_threshold_pct || getGraduatedDumpThreshold(currentPeakChangePct);

      console.log(`Moon bag check: Peak=$${peakPrice.toFixed(6)}, Now=$${currentPrice.toFixed(6)}, Drop=${dropFromPeakPct.toFixed(1)}%, Threshold=${dumpThreshold}%`);

      if (dropFromPeakPct >= dumpThreshold) {
        console.log(`🚨 MOON BAG DUMP DETECTED for ${position.token_mint}! Dropped ${dropFromPeakPct.toFixed(1)}% from peak - SELLING ALL`);

        try {
          const { data: dumpResult, error: dumpError } = await supabase.functions.invoke("flipit-execute", {
            body: {
              action: "partial_sell",
              positionId: position.id,
              sellPercent: 100,
              reason: "moon_bag_dump_exit",
              slippageBps: scalpSellSlippage,
              priorityFeeMode: scalpSellPriority,
            },
          });

          if (!dumpError && dumpResult?.success) {
            // Update scalp_stage to dump_exit
            await supabase
              .from("flip_positions")
              .update({ scalp_stage: "dump_exit" })
              .eq("id", position.id);

            // Send notification about dump exit
            try {
              await supabase.functions.invoke("send-email-notification", {
                body: {
                  to: "wilsondavid@live.ca",
                  subject: `🚨 Moon Bag Dump Exit: ${position.token_symbol || position.token_mint.slice(0, 8)} -${dropFromPeakPct.toFixed(0)}% from peak`,
                  title: "Moon Bag Dump Protection Triggered",
                  message: `Sold remaining moon bag after ${dropFromPeakPct.toFixed(1)}% drop from peak price of $${peakPrice.toFixed(6)}. Current: $${currentPrice.toFixed(6)}`,
                  type: "warning",
                },
              });
            } catch (e) {
              console.error("Email notification failed:", e);
            }

            return {
              positionId: position.id,
              action: "moon_bag_dump_exit",
              tokenMint: position.token_mint,
              priceChangePercent,
              peakDropPct: dropFromPeakPct,
              signature: dumpResult.signature,
            };
          }
        } catch (e) {
          console.error(`Moon bag dump exit failed for ${position.id}:`, e);
        }
      }
    }
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  console.log("🚀 Scalp realtime monitor starting...");

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { singlePass } = body; // For testing: only run once

    const allExecuted: ExecutionResult[] = [];
    const priceSnapshots: Record<string, number[]> = {};
    let pollCount = 0;

    // Main polling loop - runs for up to MAX_RUNTIME_MS
    while (Date.now() - startTime < MAX_RUNTIME_MS) {
      pollCount++;
      const pollStart = Date.now();

      console.log(`\n📊 Poll #${pollCount} at ${new Date().toISOString()}`);

      // Fetch active scalp positions
      const { data: positions, error: posErr } = await supabase
        .from("flip_positions")
        .select("*")
        .eq("status", "holding")
        .eq("is_scalp_position", true);

      if (posErr) {
        console.error("Failed to fetch positions:", posErr);
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (!positions || positions.length === 0) {
        console.log("No active scalp positions to monitor");
        if (singlePass) break;
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      console.log(`Monitoring ${positions.length} scalp positions`);

      // Get unique token mints and fetch prices
      const tokenMints = [...new Set(positions.map((p: any) => p.token_mint))];
      const prices = await fetchTokenPrices(tokenMints);
      const solPrice = await fetchSolPrice();

      // Track price snapshots for logging
      for (const mint of tokenMints) {
        if (prices[mint]) {
          if (!priceSnapshots[mint]) priceSnapshots[mint] = [];
          priceSnapshots[mint].push(prices[mint]);
        }
      }

      // Process each position
      for (const position of positions) {
        const currentPrice = prices[position.token_mint];
        if (!currentPrice) {
          console.log(`No price for ${position.token_mint}`);
          continue;
        }

        const result = await processScalpPosition(supabase, position as ScalpPosition, currentPrice, solPrice);
        if (result) {
          allExecuted.push(result);
          console.log(`✅ Executed: ${result.action} for ${result.tokenMint}`);
        }
      }

      // Check if we should exit early
      if (singlePass) break;

      // Calculate how long to sleep (maintain 5s interval)
      const pollDuration = Date.now() - pollStart;
      const sleepTime = Math.max(POLL_INTERVAL_MS - pollDuration, 1000);
      
      // Check if we have enough time for another poll
      if (Date.now() - startTime + sleepTime + 5000 > MAX_RUNTIME_MS) {
        console.log("Approaching timeout, exiting gracefully");
        break;
      }

      await sleep(sleepTime);
    }

    const runtime = Date.now() - startTime;
    console.log(`\n🏁 Scalp monitor completed: ${pollCount} polls in ${runtime}ms`);

    return ok({
      success: true,
      runtime_ms: runtime,
      poll_count: pollCount,
      executed: allExecuted,
      price_snapshots: Object.entries(priceSnapshots).map(([mint, prices]) => ({
        mint: mint.slice(0, 8) + "...",
        samples: prices.length,
        min: Math.min(...prices),
        max: Math.max(...prices),
        volatility: prices.length > 1 
          ? ((Math.max(...prices) - Math.min(...prices)) / prices[0] * 100).toFixed(2) + "%"
          : "N/A",
      })),
    });
  } catch (err: any) {
    console.error("Scalp realtime monitor error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
