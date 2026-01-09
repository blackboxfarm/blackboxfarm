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

// Price cache with 3-second TTL for faster repeated lookups
const priceCache: Map<string, { price: number; timestamp: number }> = new Map();
const CACHE_TTL_MS = 3000;

function getCachedPrice(mint: string): number | null {
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.price;
  }
  return null;
}

function setCachedPrice(mint: string, price: number): void {
  priceCache.set(mint, { price, timestamp: Date.now() });
}

// Jupiter API endpoints in priority order
const JUPITER_ENDPOINTS = [
  'https://api.jup.ag/price/v2',      // v2 API (more reliable)
  'https://price.jup.ag/v6/price',    // v6 API (legacy)
];

async function fetchWithTimeout(url: string, timeoutMs = 3000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return res;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

async function fetchSolPrice(): Promise<number> {
  // Check cache first
  const cached = getCachedPrice('SOL');
  if (cached) return cached;

  // Try Jupiter endpoints with retry
  for (const baseUrl of JUPITER_ENDPOINTS) {
    try {
      const url = baseUrl.includes('v2') 
        ? `${baseUrl}?ids=So11111111111111111111111111111111111111112`
        : `${baseUrl}?ids=SOL`;
      const res = await fetchWithTimeout(url, 3000);
      if (!res.ok) continue;
      
      const json = await res.json();
      const price = baseUrl.includes('v2')
        ? Number(json?.data?.['So11111111111111111111111111111111111111112']?.price)
        : Number(json?.data?.SOL?.price);
      
      if (price && price > 0) {
        setCachedPrice('SOL', price);
        console.log(`SOL price from Jupiter: $${price.toFixed(2)}`);
        return price;
      }
    } catch (e) {
      console.log(`Jupiter endpoint ${baseUrl} failed:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Fallback to CoinGecko
  try {
    const res = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', 3000);
    if (res.ok) {
      const json = await res.json();
      const price = Number(json?.solana?.usd);
      if (price && price > 0) {
        setCachedPrice('SOL', price);
        console.log(`SOL price from CoinGecko: $${price.toFixed(2)}`);
        return price;
      }
    }
  } catch (e) {
    console.log('CoinGecko fallback failed:', e instanceof Error ? e.message : String(e));
  }

  return 150; // Ultimate fallback
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

  // Parallelize bonding curve fetches
  await Promise.all(tokenMints.map(async (mintStr) => {
    try {
      const mint = new PublicKey(mintStr);
      const [bondingCurvePda] = PublicKey.findProgramAddressSync(
        [seed, mint.toBuffer()],
        PUMP_PROGRAM_ID
      );

      const info = await connection.getAccountInfo(bondingCurvePda);
      if (!info?.data) return;

      const data = info.data;
      if (data.length < 49) return;

      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const realTokenReserves = view.getBigUint64(24, true);
      const complete = data[48] === 1;

      if (complete) return;

      const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;
      const tokensSold = INITIAL_REAL_TOKEN_RESERVES - realTokenReserves;
      const progress = Math.min(Math.max(Number(tokensSold * 100n / INITIAL_REAL_TOKEN_RESERVES), 0), 100);

      curveData[mintStr] = progress;
    } catch (e) {
      // Not a pump.fun token or invalid - skip silently
    }
  }));

  return curveData;
}

async function fetchTokenPrices(tokenMints: string[]): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};
  const uncachedMints: string[] = [];

  // Check cache first
  for (const mint of tokenMints) {
    const cached = getCachedPrice(mint);
    if (cached) {
      prices[mint] = cached;
    } else {
      uncachedMints.push(mint);
    }
  }

  if (uncachedMints.length === 0) {
    console.log(`All ${tokenMints.length} prices served from cache`);
    return prices;
  }

  console.log(`Fetching ${uncachedMints.length} prices (${tokenMints.length - uncachedMints.length} cached)`);

  // Try Jupiter v2 API first (more reliable)
  const chunks: string[][] = [];
  for (let i = 0; i < uncachedMints.length; i += 100) {
    chunks.push(uncachedMints.slice(i, i + 100));
  }

  // Parallel chunk fetches with Jupiter v2
  await Promise.all(chunks.map(async (chunk) => {
    const ids = chunk.join(",");
    
    for (const baseUrl of JUPITER_ENDPOINTS) {
      try {
        const res = await fetchWithTimeout(`${baseUrl}?ids=${ids}`, 5000);
        if (!res.ok) continue;
        
        const json = await res.json();
        let foundCount = 0;
        
        for (const mint of chunk) {
          const price = Number(json?.data?.[mint]?.price);
          if (price && price > 0) {
            prices[mint] = price;
            setCachedPrice(mint, price);
            foundCount++;
          }
        }
        
        if (foundCount > 0) {
          console.log(`Jupiter ${baseUrl.includes('v2') ? 'v2' : 'v6'}: fetched ${foundCount}/${chunk.length} prices`);
          break; // Success, don't try other endpoints
        }
      } catch (e) {
        console.log(`Jupiter chunk fetch failed:`, e instanceof Error ? e.message : String(e));
      }
    }
  }));

  // For any missing prices, try DexScreener in parallel
  const missing = uncachedMints.filter(m => !prices[m]);
  if (missing.length > 0) {
    console.log(`Fetching ${missing.length} missing prices from DexScreener`);
    
    await Promise.all(missing.map(async (mint) => {
      try {
        const res = await fetchWithTimeout(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, 3000);
        if (res.ok) {
          const data = await res.json();
          const pair = data?.pairs?.[0];
          if (pair?.priceUsd) {
            const price = Number(pair.priceUsd);
            prices[mint] = price;
            setCachedPrice(mint, price);
          }
        }
      } catch (e) {
        // Silent fail for individual tokens
      }
    }));
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

    // Get all holding positions (including diamond hand)
    const { data: positions, error: posErr } = await supabase
      .from("flip_positions")
      .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(secret_key_encrypted)")
      .in("status", ["holding", "moonbag"]);

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
        const isTestPosition = position.is_test_position === true;

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

        console.log(`Scalp position ${position.id}: stage=${scalp_stage}, TP=${takeProfitPct}%, SL=${stopLossPct}%, change=${priceChangePercent.toFixed(1)}%${isTestPosition ? ' [TEST]' : ''}`);

        // ============================================
        // TEST POSITION EXIT LOGIC (SIMULATED)
        // ============================================
        if (isTestPosition) {
          // Stop loss simulation
          if (priceChangePercent <= -stopLossPct && scalp_stage === 'initial') {
            console.log(`[TEST MODE] STOP LOSS HIT for ${position.token_mint}! Simulating 100% sell`);
            
            const soldQuantity = position.quantity_tokens || 0;
            const simulatedValue = soldQuantity * currentPrice;
            const simulatedProfit = simulatedValue - position.buy_amount_usd;
            
            await supabase
              .from('flip_positions')
              .update({
                sell_price_usd: currentPrice,
                sell_executed_at: new Date().toISOString(),
                sell_signature: 'SIMULATED_SL_' + Date.now(),
                profit_usd: simulatedProfit,
                status: 'sold',
                scalp_stage: 'stop_loss',
                error_message: null,
              })
              .eq('id', position.id);
            
            executed.push({
              positionId: position.id,
              action: 'test_stop_loss',
              tokenMint: position.token_mint,
              priceChangePercent,
              simulatedProfit,
              signature: 'SIMULATED',
            });
            continue;
          }

          // Take profit simulation
          if (priceChangePercent >= takeProfitPct && scalp_stage === 'initial') {
            console.log(`[TEST MODE] TP1 HIT for ${position.token_mint}! Simulating ${100 - moonBagPct}% sell`);
            
            const soldPercent = 100 - moonBagPct;
            const soldQuantity = (position.quantity_tokens || 0) * (soldPercent / 100);
            const remainingQuantity = (position.quantity_tokens || 0) * (moonBagPct / 100);
            const simulatedValue = soldQuantity * currentPrice;
            const costBasis = position.buy_amount_usd * (soldPercent / 100);
            const partialProfit = simulatedValue - costBasis;
            
            await supabase
              .from('flip_positions')
              .update({
                scalp_stage: 'tp1_hit',
                quantity_tokens: remainingQuantity,
                moon_bag_quantity_tokens: remainingQuantity,
                profit_usd: partialProfit,
                partial_sells: [{
                  percent: soldPercent,
                  price: currentPrice,
                  signature: 'SIMULATED_TP1',
                  timestamp: new Date().toISOString(),
                  reason: 'scalp_tp1',
                  profit: partialProfit,
                }],
              })
              .eq('id', position.id);
            
            executed.push({
              positionId: position.id,
              action: 'test_scalp_tp1',
              tokenMint: position.token_mint,
              priceChangePercent,
              soldPercent,
              simulatedProfit: partialProfit,
              signature: 'SIMULATED',
            });
            continue;
          }

          // Moon bag ladder at +100%
          if (priceChangePercent >= 100 && scalp_stage === 'tp1_hit') {
            console.log(`[TEST MODE] LADDER 100% for ${position.token_mint}! Simulating 50% moon bag sell`);
            
            const currentMoonBag = position.moon_bag_quantity_tokens || position.quantity_tokens || 0;
            const soldQuantity = currentMoonBag * 0.5;
            const remainingQuantity = currentMoonBag * 0.5;
            const simulatedValue = soldQuantity * currentPrice;
            
            const existingPartialSells = Array.isArray(position.partial_sells) ? position.partial_sells : [];
            
            await supabase
              .from('flip_positions')
              .update({
                scalp_stage: 'ladder_100',
                quantity_tokens: remainingQuantity,
                moon_bag_quantity_tokens: remainingQuantity,
                partial_sells: [...existingPartialSells, {
                  percent: 50,
                  price: currentPrice,
                  signature: 'SIMULATED_LADDER100',
                  timestamp: new Date().toISOString(),
                  reason: 'scalp_ladder_100',
                }],
              })
              .eq('id', position.id);
            
            executed.push({
              positionId: position.id,
              action: 'test_scalp_ladder_100',
              tokenMint: position.token_mint,
              priceChangePercent,
              signature: 'SIMULATED',
            });
            continue;
          }

          // Moon bag ladder at +300% - sell all remaining
          if (priceChangePercent >= 300 && (scalp_stage === 'ladder_100' || scalp_stage === 'tp1_hit')) {
            console.log(`[TEST MODE] LADDER 300% for ${position.token_mint}! Simulating final sell`);
            
            const remainingQuantity = position.moon_bag_quantity_tokens || position.quantity_tokens || 0;
            const finalValue = remainingQuantity * currentPrice;
            const existingPartialSells = Array.isArray(position.partial_sells) ? position.partial_sells : [];
            const existingProfit = position.profit_usd || 0;
            
            // Calculate total profit including this final sale
            const finalSaleProfit = finalValue - (position.buy_amount_usd * (moonBagPct / 100));
            const totalProfit = existingProfit + finalSaleProfit;
            
            await supabase
              .from('flip_positions')
              .update({
                scalp_stage: 'completed',
                status: 'sold',
                quantity_tokens: 0,
                moon_bag_quantity_tokens: 0,
                sell_price_usd: currentPrice,
                sell_executed_at: new Date().toISOString(),
                sell_signature: 'SIMULATED_LADDER300_' + Date.now(),
                profit_usd: totalProfit,
                partial_sells: [...existingPartialSells, {
                  percent: 100,
                  price: currentPrice,
                  signature: 'SIMULATED_LADDER300',
                  timestamp: new Date().toISOString(),
                  reason: 'scalp_ladder_300',
                }],
              })
              .eq('id', position.id);
            
            executed.push({
              positionId: position.id,
              action: 'test_scalp_ladder_300',
              tokenMint: position.token_mint,
              priceChangePercent,
              totalProfit,
              signature: 'SIMULATED',
            });
            continue;
          }

          // No exit trigger hit for test position - skip to next
          continue;
        }

        // ============================================
        // REAL POSITION EXIT LOGIC (below is original)
        // ============================================

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
      // DIAMOND HAND POSITION LOGIC (KingKong mode)
      // ============================================
      if (position.is_diamond_hand) {
        const currentMultiplier = currentPrice / entryPrice;
        const peakMultiplier = position.diamond_peak_multiplier || currentMultiplier;
        const minPeakX = position.diamond_min_peak_x || 5;
        const trailingStopPct = position.diamond_trailing_stop_pct || 25;
        const maxHoldHours = position.diamond_max_hold_hours || 24;

        console.log(`Diamond Hand ${position.id}: ${currentMultiplier.toFixed(2)}x (peak: ${peakMultiplier.toFixed(2)}x, trailing: ${position.diamond_trailing_active})`);

        // Update peak if new high
        if (currentMultiplier > peakMultiplier) {
          const updateData: any = { diamond_peak_multiplier: currentMultiplier, moon_bag_peak_price_usd: currentPrice };
          
          // Activate trailing stop if we've hit min peak
          if (!position.diamond_trailing_active && currentMultiplier >= minPeakX) {
            updateData.diamond_trailing_active = true;
            console.log(`Diamond Hand ${position.id}: Trailing ACTIVATED at ${currentMultiplier.toFixed(1)}x`);
          }
          
          await supabase.from('flip_positions').update(updateData).eq('id', position.id);
          continue;
        }

        // Check exit conditions only if trailing is active
        if (position.diamond_trailing_active) {
          const drawdownFromPeak = ((peakMultiplier - currentMultiplier) / peakMultiplier) * 100;
          
          if (drawdownFromPeak >= trailingStopPct) {
            console.log(`Diamond Hand EXIT: ${position.token_symbol} dropped ${drawdownFromPeak.toFixed(1)}% from ${peakMultiplier.toFixed(1)}x peak`);
            
            const { data: sellResult } = await supabase.functions.invoke("flipit-execute", {
              body: { action: "sell", positionId: position.id, slippageBps: effectiveSlippage, priorityFeeMode: priorityFeeMode || "high" }
            });

            if (sellResult?.success) {
              executed.push({ positionId: position.id, action: 'diamond_trailing_stop', tokenMint: position.token_mint, peakMultiplier, exitMultiplier: currentMultiplier, signature: sellResult.signature });
            }
            continue;
          }
        }

        // Check max hold time
        if (maxHoldHours > 0) {
          const holdHours = (Date.now() - new Date(position.buy_executed_at).getTime()) / (1000 * 60 * 60);
          if (holdHours >= maxHoldHours) {
            console.log(`Diamond Hand EXIT: ${position.token_symbol} max hold time (${maxHoldHours}h) exceeded`);
            
            const { data: sellResult } = await supabase.functions.invoke("flipit-execute", {
              body: { action: "sell", positionId: position.id, slippageBps: effectiveSlippage, priorityFeeMode: priorityFeeMode || "medium" }
            });

            if (sellResult?.success) {
              executed.push({ positionId: position.id, action: 'diamond_max_hold', tokenMint: position.token_mint, signature: sellResult.signature });
            }
            continue;
          }
        }
        
        continue; // Diamond hand - no regular target check
      }

      // ============================================
      // REGULAR (NON-SCALP) TARGET LOGIC
      // ============================================
      
      // Skip auto-sell if target multiplier is disabled (0)
      if (position.target_multiplier === 0 || !position.target_multiplier) {
        console.log(`Position ${position.id} (${position.token_symbol}): Auto-sell disabled, skipping target check`);
        continue;
      }
      
      if (currentPrice >= targetPrice) {
        // Check if this position has moonbag enabled (FlipIt moonbag mode)
        const hasMoonbag = position.moon_bag_enabled && position.moon_bag_percent > 0 && !position.is_scalp_position;
        const moonbagSellPct = position.flipit_moonbag_sell_pct || (100 - (position.moon_bag_percent || 10));
        const moonbagKeepPct = position.moon_bag_percent || 10;

        if (hasMoonbag) {
          console.log(`TARGET HIT for ${position.token_mint}! Executing ${moonbagSellPct}% sell, keeping ${moonbagKeepPct}% moonbag...`);

          try {
            // Execute partial sell via flipit-execute
            const { data: partialResult, error: partialError } = await supabase.functions.invoke("flipit-execute", {
              body: {
                action: "partial_sell",
                positionId: position.id,
                sellPercent: moonbagSellPct,
                reason: "flipit_target_moonbag",
                slippageBps: effectiveSlippage,
                priorityFeeMode: priorityFeeMode || "medium",
              }
            });

            if (!partialError && partialResult?.success) {
              console.log(`FlipIt moonbag: Sold ${moonbagSellPct}% of ${position.token_mint}, keeping ${moonbagKeepPct}% moonbag`);
              
              executed.push({
                positionId: position.id,
                action: 'flipit_moonbag_target',
                tokenMint: position.token_mint,
                priceChangePercent,
                soldPercent: moonbagSellPct,
                signature: partialResult.signature,
              });

              // Send email notification
              try {
                await supabase.functions.invoke("send-email-notification", {
                  body: {
                    to: "wilsondavid@live.ca",
                    subject: `🎯 FlipIt Target Hit: ${position.token_symbol || position.token_mint.slice(0, 8)} +${priceChangePercent.toFixed(0)}%`,
                    title: "FlipIt Target Hit - Moonbag Active!",
                    message: `Sold ${moonbagSellPct}% at +${priceChangePercent.toFixed(1)}%, keeping ${moonbagKeepPct}% moonbag for potential further gains.`,
                    type: "success"
                  }
                });
              } catch (e) {
                console.error("Email notification failed:", e);
              }
            } else {
              console.error(`FlipIt moonbag sell failed for ${position.id}:`, partialError || partialResult?.error);
            }
          } catch (e) {
            console.error(`FlipIt moonbag sell failed for ${position.id}:`, e);
          }
          continue;
        }

        // Standard full sell (no moonbag)
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
