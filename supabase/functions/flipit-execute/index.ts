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

async function fetchTokenPrice(tokenMint: string): Promise<number | null> {
  // Try Jupiter first
  try {
    const res = await fetch(`https://price.jup.ag/v6/price?ids=${tokenMint}`);
    const json = await res.json();
    const price = json?.data?.[tokenMint]?.price;
    if (price) return Number(price);
  } catch (e) {
    console.error("Jupiter price fetch failed:", e);
  }
  
  // Fallback to DexScreener
  try {
    console.log("Trying DexScreener fallback for price...");
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    const dexData = await dexRes.json();
    const pair = dexData?.pairs?.[0];
    if (pair?.priceUsd) {
      console.log("Got price from DexScreener:", pair.priceUsd);
      return Number(pair.priceUsd);
    }
  } catch (e) {
    console.error("DexScreener price fetch failed:", e);
  }
  
  return null;
}

async function fetchSolPrice(): Promise<number> {
  // Try Jupiter first
  try {
    const res = await fetch("https://price.jup.ag/v6/price?ids=SOL");
    const json = await res.json();
    const price = json?.data?.SOL?.price || json?.data?.wSOL?.price;
    if (price) return Number(price);
  } catch (e) {
    console.error("Jupiter SOL price failed:", e);
  }
  
  // Fallback to CoinGecko
  try {
    console.log("Trying CoinGecko fallback for SOL price...");
    const cgRes = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const cgData = await cgRes.json();
    if (cgData?.solana?.usd) {
      console.log("Got SOL price from CoinGecko:", cgData.solana.usd);
      return Number(cgData.solana.usd);
    }
  } catch (e) {
    console.error("CoinGecko SOL price failed:", e);
  }
  
  return 200; // Default fallback
}

async function fetchTokenMetadata(tokenMint: string): Promise<{ 
  symbol: string; 
  name: string;
  image?: string;
  twitter?: string;
  website?: string;
  telegram?: string;
} | null> {
  let result: { 
    symbol: string; 
    name: string;
    image?: string;
    twitter?: string;
    website?: string;
    telegram?: string;
  } | null = null;

  // PRIMARY: For pump.fun tokens, try pump.fun API first (has most reliable social data)
  if (tokenMint.endsWith('pump')) {
    try {
      console.log(`Fetching metadata from pump.fun API for ${tokenMint}`);
      const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`);
      if (pumpRes.ok) {
        const pumpData = await pumpRes.json();
        if (pumpData?.symbol) {
          result = {
            symbol: pumpData.symbol,
            name: pumpData.name || pumpData.symbol,
            image: pumpData.image_uri || pumpData.metadata?.image || null,
            twitter: pumpData.twitter || null,
            website: pumpData.website || null,
            telegram: pumpData.telegram || null,
          };
          console.log(`pump.fun API returned socials: twitter=${result.twitter}, website=${result.website}, telegram=${result.telegram}`);
          // If we got symbol, return immediately - pump.fun is authoritative for pump tokens
          return result;
        }
      } else {
        console.log("pump.fun API non-200:", pumpRes.status);
      }
    } catch (e) {
      console.log("pump.fun API failed, falling back:", e);
    }
  }

  // SECONDARY: Jupiter token endpoint (for symbol/name, but no socials)
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.symbol) {
        result = { symbol: String(data.symbol), name: String(data.name || data.symbol) };
      }
    } else {
      console.log("Jupiter token endpoint non-200:", res.status);
    }
  } catch (e) {
    console.error("Jupiter token endpoint failed:", e);
  }

  // FALLBACK: DexScreener (includes social links for graduated tokens)
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pair = dexData?.pairs?.[0];
      if (pair?.baseToken?.symbol) {
        // If we don't have a result yet, use DexScreener for symbol/name
        if (!result) {
          result = { 
            symbol: pair.baseToken.symbol, 
            name: pair.baseToken.name || pair.baseToken.symbol 
          };
        }
        
        // Extract image if missing
        if (!result.image && pair.info?.imageUrl) {
          result.image = pair.info.imageUrl;
        }
        
        // Extract social links if missing
        if (pair.info?.socials && Array.isArray(pair.info.socials)) {
          for (const social of pair.info.socials) {
            const url = social.url || social;
            if (!result.twitter && (url?.includes('twitter.com') || url?.includes('x.com'))) {
              result.twitter = url;
            } else if (!result.telegram && (url?.includes('t.me') || url?.includes('telegram'))) {
              result.telegram = url;
            }
          }
        }
        
        // Extract website (skip launchpad sites) if missing
        if (!result.website && pair.info?.websites && Array.isArray(pair.info.websites)) {
          for (const site of pair.info.websites) {
            const url = site.url || site;
            if (url && !url.includes('pump.fun') && !url.includes('bonk.fun') && !url.includes('bags.fm') && !url.includes('raydium.io')) {
              result.website = url;
              break;
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("DexScreener metadata fetch failed:", e);
  }

  return result;
}

// Lookup creator wallet and create/update developer profile
async function trackDeveloper(supabase: any, tokenMint: string, positionId: string, metadata: any) {
  try {
    console.log("Looking up creator for token:", tokenMint);
    
    // Call solscan-creator-lookup to get the creator wallet
    const { data: creatorData, error: creatorError } = await supabase.functions.invoke("solscan-creator-lookup", {
      body: { tokenMint }
    });
    
    if (creatorError || !creatorData?.creatorWallet) {
      console.log("Could not find creator wallet:", creatorError?.message || "No creator returned");
      return null;
    }
    
    const creatorWallet = creatorData.creatorWallet;
    console.log("Found creator wallet:", creatorWallet);
    
    // Check if developer profile already exists
    const { data: existingProfile } = await supabase
      .from("developer_profiles")
      .select("id, display_name, total_tokens_created")
      .eq("master_wallet_address", creatorWallet)
      .maybeSingle();
    
    let developerId: string;
    
    if (existingProfile) {
      developerId = existingProfile.id;
      console.log("Developer profile already exists:", developerId);
      
      // Update token count
      await supabase
        .from("developer_profiles")
        .update({ 
          total_tokens_created: (existingProfile.total_tokens_created || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", developerId);
    } else {
      // Create new developer profile
      console.log("Creating new developer profile for:", creatorWallet);
      
      // Extract Twitter handle from metadata if available
      let twitterHandle: string | null = null;
      if (metadata?.twitter) {
        const match = metadata.twitter.match(/(?:twitter\.com|x\.com)\/([^\/\?]+)/);
        if (match) {
          twitterHandle = match[1];
        }
      }
      
      const { data: newProfile, error: profileError } = await supabase
        .from("developer_profiles")
        .insert({
          master_wallet_address: creatorWallet,
          display_name: twitterHandle || `Dev-${creatorWallet.slice(0, 8)}`,
          twitter_handle: twitterHandle,
          total_tokens_created: 1,
          reputation_score: 50, // Neutral starting score
          trust_level: "neutral",
          source: "flipit",
          is_active: true
        })
        .select("id")
        .single();
      
      if (profileError) {
        console.error("Failed to create developer profile:", profileError);
        return null;
      }
      
      developerId = newProfile.id;
      console.log("Created developer profile:", developerId);
    }
    
    // Create developer wallet entry if it doesn't exist
    const { data: existingWallet } = await supabase
      .from("developer_wallets")
      .select("id")
      .eq("wallet_address", creatorWallet)
      .maybeSingle();
    
    if (!existingWallet) {
      await supabase
        .from("developer_wallets")
        .insert({
          developer_id: developerId,
          wallet_address: creatorWallet,
          wallet_type: "creator",
          is_primary: true
        });
    }
    
    // Create developer token entry
    const { error: tokenError } = await supabase
      .from("developer_tokens")
      .insert({
        developer_id: developerId,
        token_mint: tokenMint,
        token_name: metadata?.name || null,
        token_symbol: metadata?.symbol || null,
        outcome: "pending",
        flipit_position_id: positionId,
        created_at: new Date().toISOString()
      });
    
    if (tokenError) {
      console.error("Failed to create developer token:", tokenError);
    } else {
      console.log("Created developer token entry for:", tokenMint);
    }
    
    return { developerId, creatorWallet };
  } catch (e) {
    console.error("Error tracking developer:", e);
    return null;
  }
}

// Track trade outcome and update developer reputation
async function trackTradeOutcome(supabase: any, position: any) {
  try {
    if (!position.token_mint) return;
    
    // Find the developer token entry for this position
    const { data: devToken } = await supabase
      .from("developer_tokens")
      .select("id, developer_id")
      .eq("flipit_position_id", position.id)
      .maybeSingle();
    
    if (!devToken) {
      console.log("No developer token found for position:", position.id);
      return;
    }
    
    // Calculate outcome based on profit
    const profitPercent = position.buy_price_usd && position.sell_price_usd
      ? ((position.sell_price_usd / position.buy_price_usd) - 1) * 100
      : 0;
    
    let outcome: string;
    if (profitPercent >= 0) {
      outcome = "success";
    } else if (profitPercent <= -90) {
      outcome = "rug_pull";
    } else if (profitPercent <= -50) {
      outcome = "slow_drain";
    } else {
      outcome = "failed";
    }
    
    console.log(`Trade outcome for position ${position.id}: ${outcome} (${profitPercent.toFixed(1)}%)`);
    
    // Update developer token with outcome
    await supabase
      .from("developer_tokens")
      .update({ 
        outcome,
        performance_score: profitPercent > 0 ? Math.min(100, profitPercent) : Math.max(0, 50 + profitPercent)
      })
      .eq("id", devToken.id);
    
    // Trigger reputation recalculation
    await supabase.functions.invoke("developer-reputation-calculator", {
      body: { developerId: devToken.developer_id }
    });
    
    console.log("Developer reputation updated for:", devToken.developer_id);
  } catch (e) {
    console.error("Error tracking trade outcome:", e);
  }
}

async function sendTweet(supabase: any, tweetData: {
  type: 'buy' | 'sell' | 'rebuy';
  tokenMint?: string;
  tokenSymbol: string;
  tokenName?: string;
  twitterUrl?: string;
  positionId?: string;
  entryPrice?: number;
  exitPrice?: number;
  targetMultiplier?: number;
  profitPercent?: number;
  profitSol?: number;
  amountSol?: number;
  txSignature?: string;
}) {
  try {
    console.log("Sending tweet for:", tweetData.type, tweetData.tokenSymbol);
    const { data, error } = await supabase.functions.invoke("flipit-tweet", {
      body: tweetData
    });
    if (error) {
      console.error("Tweet failed:", error);
    } else {
      console.log("Tweet sent successfully:", data?.tweet_id);
    }
    return data;
  } catch (e) {
    console.error("Tweet error:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId, slippageBps, priorityFeeMode, source, sourceChannelId, isScalpPosition, scalpTakeProfitPct, scalpMoonBagPct, scalpStopLossPct, moonbagEnabled, moonbagSellPct, moonbagKeepPct, positionType, isDiamondHand, diamondTrailingStopPct, diamondMinPeakX, diamondMaxHoldHours } = body;

    // Default slippage 5% (500 bps), configurable
    const effectiveSlippage = slippageBps || 500;
    
    console.log("FlipIt execute:", { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId, slippageBps: effectiveSlippage, priorityFeeMode, source, sourceChannelId, isScalpPosition });

    if (action === "buy") {
      if (!tokenMint || !walletId) {
        return bad("Missing tokenMint or walletId");
      }

      // Get wallet details
      console.log("Looking up wallet:", walletId);
      const { data: wallet, error: walletError } = await supabase
        .from("super_admin_wallets")
        .select("id, pubkey, secret_key_encrypted")
        .eq("id", walletId)
        .single();

      if (walletError) {
        console.error("Wallet lookup error:", walletError);
        return bad(`Wallet not found: ${walletError.message}`);
      }
      
      if (!wallet) {
        console.error("Wallet not found in DB for ID:", walletId);
        return bad("Wallet not found in database");
      }
      
      console.log("Found wallet:", wallet.pubkey);

      // ============================================
      // CRITICAL: CHECK BALANCE BEFORE ANYTHING ELSE
      // ============================================
      const solPrice = await fetchSolPrice();
      const buyAmountSol = (buyAmountUsd || 4) / solPrice;
      const gasFeeBuffer = 0.005; // 0.005 SOL buffer for gas fees (reduced from 0.01)
      const requiredSol = buyAmountSol + gasFeeBuffer;
      
      // Always fetch fresh balance from RPC
      let walletBalance = 0;
      
      try {
        console.log("Fetching fresh wallet balance for:", wallet.pubkey);
        const rpcUrl = Deno.env.get("HELIUS_API_KEY") 
          ? `https://mainnet.helius-rpc.com/?api-key=${Deno.env.get("HELIUS_API_KEY")}`
          : "https://api.mainnet-beta.solana.com";
        
        const balanceRes = await fetch(rpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getBalance",
            params: [wallet.pubkey]
          })
        });
        
        const balanceData = await balanceRes.json();
        if (balanceData?.result?.value !== undefined) {
          walletBalance = balanceData.result.value / 1e9; // Convert lamports to SOL
          console.log("Fresh wallet balance:", walletBalance, "SOL");
        }
      } catch (balanceErr) {
        console.error("Failed to fetch fresh balance:", balanceErr);
        return bad("Failed to fetch wallet balance");
      }
      
      // Check if we have enough funds
      if (walletBalance < requiredSol) {
        console.error(`INSUFFICIENT FUNDS: Wallet has ${walletBalance.toFixed(4)} SOL, need ${requiredSol.toFixed(4)} SOL (${buyAmountSol.toFixed(4)} buy + ${gasFeeBuffer} gas)`);
        return bad(`Insufficient funds: wallet has ${walletBalance.toFixed(4)} SOL, need ${requiredSol.toFixed(4)} SOL`);
      }
      
      console.log(`Balance check passed: ${walletBalance.toFixed(4)} SOL >= ${requiredSol.toFixed(4)} SOL required`);

      // Fetch current token price
      const currentPrice = await fetchTokenPrice(tokenMint);
      if (!currentPrice) {
        return bad("Could not fetch token price");
      }

      // Fetch token metadata
      const metadata = await fetchTokenMetadata(tokenMint);

      // Calculate target price
      const mult = targetMultiplier || 2;
      const targetPrice = currentPrice * mult;

      // Get auth user
      const authHeader = req.headers.get("authorization");
      let userId: string | null = null;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      }

      // NOW create position record (only after balance check passes)
      const positionData: any = {
        user_id: userId,
        wallet_id: walletId,
        token_mint: tokenMint,
        token_symbol: metadata?.symbol || null,
        token_name: metadata?.name || null,
        token_image: metadata?.image || null,
        twitter_url: metadata?.twitter || null,
        website_url: metadata?.website || null,
        telegram_url: metadata?.telegram || null,
        buy_amount_usd: buyAmountUsd || 4,
        buy_price_usd: currentPrice,
        target_multiplier: mult,
        target_price_usd: targetPrice,
        status: "pending_buy",
        source: source || "manual",
        source_channel_id: sourceChannelId || null
      };

      // Add scalp mode fields if this is a scalp position
      if (isScalpPosition) {
        positionData.is_scalp_position = true;
        positionData.moon_bag_enabled = true;
        positionData.moon_bag_percent = scalpMoonBagPct || 10;
        positionData.scalp_take_profit_pct = scalpTakeProfitPct || 50;
        positionData.scalp_stop_loss_pct = scalpStopLossPct || 35;
        positionData.scalp_stage = 'initial';
        console.log("Creating SCALP position with TP:", scalpTakeProfitPct, "%, Moon Bag:", scalpMoonBagPct, "%");
      }
      // Add FlipIt moonbag fields for non-scalp positions
      else if (moonbagEnabled) {
        positionData.moon_bag_enabled = true;
        positionData.moon_bag_percent = moonbagKeepPct || 10;
        positionData.flipit_moonbag_sell_pct = moonbagSellPct || 90;
        console.log("Creating FlipIt position with MOONBAG: Sell", moonbagSellPct || 90, "%, Keep", moonbagKeepPct || 10, "%");
      }

      // Add Diamond Hand fields for KingKong mode
      if (positionType === 'diamond_hand' || isDiamondHand) {
        positionData.position_type = 'diamond_hand';
        positionData.is_diamond_hand = true;
        positionData.diamond_trailing_stop_pct = diamondTrailingStopPct || 25;
        positionData.diamond_min_peak_x = diamondMinPeakX || 5;
        positionData.diamond_max_hold_hours = diamondMaxHoldHours || 24;
        positionData.diamond_trailing_active = false;
        positionData.target_multiplier = 999;
        console.log(`Creating DIAMOND HAND position: Wait for ${diamondMinPeakX || 5}x, then trail at ${diamondTrailingStopPct || 25}%`);
      } else if (positionType === 'quick_flip') {
        positionData.position_type = 'quick_flip';
        positionData.moon_bag_enabled = false;
        console.log(`Creating QUICK FLIP position: ${mult}x target, no moonbag`);
      }

      const { data: position, error: posError } = await supabase
        .from("flip_positions")
        .insert(positionData)
        .select()
        .single();

      if (posError) {
        console.error("Failed to create position:", posError);
        return bad("Failed to create position: " + posError.message);
      }

      // Execute the buy via raydium-swap
      try {
        const solPrice = await fetchSolPrice();
        const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
          body: {
            side: "buy",
            tokenMint: tokenMint,
            usdcAmount: buyAmountUsd || 10,
            buyWithSol: true,
            slippageBps: effectiveSlippage,
            priorityFeeMode: priorityFeeMode || "medium",
          },
          headers: {
            "x-owner-secret": wallet.secret_key_encrypted
          }
        });

        if (swapError) {
          throw new Error(swapError.message);
        }

        // Handle soft errors (200 with error_code)
        if (swapResult?.error_code) {
          throw new Error(`[${swapResult.error_code}] ${swapResult.error}`);
        }

        if (swapResult?.error) {
          throw new Error(swapResult.error);
        }
        const signature = firstSignature(swapResult);
        if (!signature) {
          throw new Error("Swap returned no signature (buy did not confirm)");
        }

        // Update position with buy result
        await supabase
          .from("flip_positions")
          .update({
            buy_signature: signature,
            buy_executed_at: new Date().toISOString(),
            quantity_tokens: (swapResult as any)?.outAmount ?? null,
            status: "holding",
            error_message: null,
          })
          .eq("id", position.id);

        // Calculate SOL amount from USD (reuse solPrice from above)
        const amountSol = (buyAmountUsd || 10) / solPrice;

        // Send buy tweet (fire and forget)
        await sendTweet(supabase, {
          type: 'buy',
          tokenMint: tokenMint,
          tokenSymbol: position.token_symbol || metadata?.symbol || 'TOKEN',
          tokenName: position.token_name || metadata?.name,
          twitterUrl: position.twitter_url || metadata?.twitter || '',
          positionId: position.id,
          entryPrice: currentPrice,
          targetMultiplier: mult,
          amountSol: amountSol,
          txSignature: signature,
        });

        // Track developer (fire and forget - don't block the response)
        trackDeveloper(supabase, tokenMint, position.id, metadata).catch(e => 
          console.error("Developer tracking failed:", e)
        );

        return ok({
          success: true,
          positionId: position.id,
          signature,
          signatures: (swapResult as any)?.signatures ?? [signature],
          entryPrice: currentPrice,
          targetPrice: targetPrice,
          multiplier: mult,
        });

      } catch (buyErr: any) {
        const errMsg = buyErr?.message || String(buyErr);

        // User asked: don't insert rows when a buy fails.
        // Delete the pending position so failed attempts don't show up as "holding"/"failed" positions.
        try {
          await supabase.from("flip_positions").delete().eq("id", position.id);
        } catch (delErr) {
          console.error("Failed to delete failed buy position:", delErr);
        }

        console.error("Buy failed:", errMsg);
        return ok({ success: false, error: `Buy failed: ${errMsg}` });
      }
    }

    if (action === "sell") {
      if (!positionId) {
        return bad("Missing positionId");
      }

      // Get position
      const { data: position, error: posErr } = await supabase
        .from("flip_positions")
        .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(secret_key_encrypted)")
        .eq("id", positionId)
        .single();

      if (posErr || !position) {
        return bad("Position not found");
      }

      // Allow retry when the UI/database incorrectly marked a sell without a signature.
      if (position.status !== "holding" && !(position.status === "sold" && !position.sell_signature)) {
        return bad("Position is not in holding status");
      }

      // Mark as pending sell
      await supabase
        .from("flip_positions")
        .update({ status: "pending_sell" })
        .eq("id", positionId);

      try {
        // Execute sell via raydium-swap using wallet ID for direct lookup
        const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
          body: {
            side: "sell",
            tokenMint: position.token_mint,
            sellAll: true,
            slippageBps: effectiveSlippage,
            priorityFeeMode: priorityFeeMode || "medium",
            walletId: position.wallet_id, // Pass wallet ID for direct DB lookup
          },
        });

        if (swapError) {
          throw new Error(swapError.message);
        }

        // Handle soft errors (200 with error_code)
        if (swapResult?.error_code) {
          throw new Error(`[${swapResult.error_code}] ${swapResult.error}`);
        }

        if (swapResult?.error) {
          throw new Error(swapResult.error);
        }

        const signature = firstSignature(swapResult);
        if (!signature) {
          throw new Error("Swap returned no signature (sell did not confirm)");
        }

        // Get current price for profit calculation
        const sellPrice = (await fetchTokenPrice(position.token_mint)) || position.buy_price_usd;
        const profit = sellPrice && position.buy_price_usd
          ? position.buy_amount_usd * ((sellPrice / position.buy_price_usd) - 1)
          : null;

        // Update position with sell result
        await supabase
          .from("flip_positions")
          .update({
            sell_signature: signature,
            sell_executed_at: new Date().toISOString(),
            sell_price_usd: sellPrice,
            profit_usd: profit,
            status: "sold",
            error_message: null,
          })
          .eq("id", positionId);

        // Calculate profit percent and SOL values for tweet
        const profitPercent = position.buy_price_usd && sellPrice
          ? ((sellPrice / position.buy_price_usd) - 1) * 100
          : 0;
        const solPrice = await fetchSolPrice();
        const profitSol = profit ? profit / solPrice : 0;

        // Send sell tweet (fire and forget)
        await sendTweet(supabase, {
          type: 'sell',
          tokenMint: position.token_mint,
          tokenSymbol: position.token_symbol || 'TOKEN',
          tokenName: position.token_name,
          twitterUrl: position.twitter_url || '',
          positionId: positionId,
          entryPrice: position.buy_price_usd,
          exitPrice: sellPrice,
          profitPercent: profitPercent,
          profitSol: profitSol,
          txSignature: signature,
        });

        // Track trade outcome for developer reputation (fire and forget)
        trackTradeOutcome(supabase, {
          ...position,
          sell_price_usd: sellPrice
        }).catch(e => console.error("Trade outcome tracking failed:", e));

        return ok({
          success: true,
          signature,
          signatures: (swapResult as any)?.signatures ?? [signature],
          sellPrice,
          profit,
        });

      } catch (sellErr: any) {
        const errMsg = sellErr.message || String(sellErr);
        console.error("Sell error caught:", errMsg);

        // Check for soft errors returned with error_code from raydium-swap
        const noBalanceCodes = ["NO_BALANCE", "BALANCE_CHECK_FAILED"];
        const noBalanceIndicators = [
          "No token balance",
          "No token accounts found",
          "already been sold",
          "buy never completed",
          "Token balance is 0",
        ];
        const isNoBalance =
          noBalanceCodes.some((code) => errMsg.includes(code)) ||
          noBalanceIndicators.some((indicator) => errMsg.includes(indicator));

        if (isNoBalance) {
          // Mark as sold since there's nothing to sell
          await supabase
            .from("flip_positions")
            .update({
              status: "sold",
              error_message: "Position closed: " + errMsg,
              sell_executed_at: new Date().toISOString(),
            })
            .eq("id", positionId);

          return ok({
            success: true,
            message: "Position marked as closed - no tokens to sell",
            error: errMsg,
          });
        }

        // Revert to holding on other errors
        await supabase
          .from("flip_positions")
          .update({
            status: "holding",
            error_message: errMsg,
          })
          .eq("id", positionId);

        return bad("Sell failed: " + errMsg);
      }
    }

    // ============================================
    // PARTIAL SELL ACTION (for Scalp Mode moon bags)
    // ============================================
    if (action === "partial_sell") {
      const { sellPercent, reason } = body;
      
      if (!positionId) {
        return bad("Missing positionId");
      }
      if (!sellPercent || sellPercent <= 0 || sellPercent > 100) {
        return bad("Invalid sellPercent (must be 1-100)");
      }

      console.log(`Partial sell ${sellPercent}% of position ${positionId}, reason: ${reason}`);

      // Get position
      const { data: position, error: posErr } = await supabase
        .from("flip_positions")
        .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(secret_key_encrypted)")
        .eq("id", positionId)
        .single();

      if (posErr || !position) {
        return bad("Position not found");
      }

      if (position.status !== "holding") {
        return bad("Position is not in holding status");
      }

      // Calculate token amount to sell
      const currentTokens = position.moon_bag_quantity_tokens || position.original_quantity_tokens || position.quantity_tokens || 0;
      if (currentTokens <= 0) {
        return bad("No tokens available to sell");
      }

      const tokensToSell = Math.floor(currentTokens * (sellPercent / 100));
      if (tokensToSell <= 0) {
        return bad("Calculated token amount too small");
      }

      console.log(`Selling ${tokensToSell} tokens (${sellPercent}% of ${currentTokens})`);

      try {
        // Execute partial sell via raydium-swap
        const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
          body: {
            side: "sell",
            tokenMint: position.token_mint,
            sellAmount: tokensToSell, // Specific amount, not sellAll
            slippageBps: effectiveSlippage,
            priorityFeeMode: priorityFeeMode || "medium",
            walletId: position.wallet_id,
          },
        });

        if (swapError) {
          throw new Error(swapError.message);
        }

        if (swapResult?.error_code || swapResult?.error) {
          throw new Error(swapResult?.error || swapResult?.error_code);
        }

        const signature = firstSignature(swapResult);
        if (!signature) {
          throw new Error("Swap returned no signature");
        }

        // Get current price
        const currentPrice = await fetchTokenPrice(position.token_mint) || position.buy_price_usd;
        const solPrice = await fetchSolPrice();
        
        // Calculate this partial sell's value
        const outLamports = Number(swapResult?.outAmount || swapResult?.data?.outAmount || 0);
        const soldValueUsd = outLamports > 0 
          ? (outLamports / 1e9) * solPrice 
          : (tokensToSell * currentPrice);

        // Update partial_sells array
        const existingPartialSells = position.partial_sells || [];
        const newPartialSell = {
          percent: sellPercent,
          tokens_sold: tokensToSell,
          price_usd: currentPrice,
          value_usd: soldValueUsd,
          signature,
          reason: reason || 'manual',
          timestamp: new Date().toISOString(),
        };

        // Calculate remaining tokens
        const remainingTokens = currentTokens - tokensToSell;

        // Determine new scalp stage
        let newScalpStage = position.scalp_stage || 'initial';
        if (reason === 'scalp_tp1') {
          newScalpStage = 'tp1_hit';
        } else if (reason === 'scalp_ladder_100') {
          newScalpStage = 'ladder_100';
        } else if (reason === 'scalp_ladder_300') {
          newScalpStage = 'ladder_300';
        } else if (reason === 'emergency_exit' || remainingTokens <= 0) {
          newScalpStage = 'closed';
        }

        // Update position
        const updateData: any = {
          partial_sells: [...existingPartialSells, newPartialSell],
          moon_bag_quantity_tokens: remainingTokens,
          scalp_stage: newScalpStage,
        };

        // If no tokens remaining, mark as sold
        if (remainingTokens <= 0) {
          updateData.status = 'sold';
          updateData.sell_executed_at = new Date().toISOString();
          updateData.sell_price_usd = currentPrice;
          
          // Calculate total profit from all partial sells
          const allSells = [...existingPartialSells, newPartialSell];
          const totalSoldValue = allSells.reduce((sum, s) => sum + (s.value_usd || 0), 0);
          updateData.profit_usd = totalSoldValue - position.buy_amount_usd;
        }

        await supabase
          .from("flip_positions")
          .update(updateData)
          .eq("id", positionId);

        console.log(`Partial sell complete: ${tokensToSell} tokens sold, ${remainingTokens} remaining, stage: ${newScalpStage}`);

        return ok({
          success: true,
          signature,
          tokensSold: tokensToSell,
          tokensRemaining: remainingTokens,
          soldValueUsd,
          scalp_stage: newScalpStage,
          reason,
        });

      } catch (sellErr: any) {
        console.error("Partial sell error:", sellErr);
        return bad("Partial sell failed: " + sellErr.message);
      }
    }

    return bad("Invalid action. Use 'buy', 'sell', or 'partial_sell'");

  } catch (err: any) {
    console.error("FlipIt execute error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
