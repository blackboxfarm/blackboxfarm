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
  // Primary: Jupiter token endpoint
  try {
    const res = await fetch(`https://tokens.jup.ag/token/${tokenMint}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.symbol) {
        return { symbol: String(data.symbol), name: String(data.name || data.symbol) };
      }
    } else {
      console.log("Jupiter token endpoint non-200:", res.status);
    }
  } catch (e) {
    console.error("Jupiter token endpoint failed:", e);
  }

  // Fallback: DexScreener (includes social links)
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (dexRes.ok) {
      const dexData = await dexRes.json();
      const pair = dexData?.pairs?.[0];
      if (pair?.baseToken?.symbol) {
        const result: { 
          symbol: string; 
          name: string;
          image?: string;
          twitter?: string;
          website?: string;
          telegram?: string;
        } = { 
          symbol: pair.baseToken.symbol, 
          name: pair.baseToken.name || pair.baseToken.symbol 
        };
        
        // Extract image
        if (pair.info?.imageUrl) {
          result.image = pair.info.imageUrl;
        }
        
        // Extract social links
        if (pair.info?.socials && Array.isArray(pair.info.socials)) {
          for (const social of pair.info.socials) {
            const url = social.url || social;
            if (url?.includes('twitter.com') || url?.includes('x.com')) {
              result.twitter = url;
            } else if (url?.includes('t.me') || url?.includes('telegram')) {
              result.telegram = url;
            }
          }
        }
        
        // Extract website (skip launchpad sites)
        if (pair.info?.websites && Array.isArray(pair.info.websites)) {
          for (const site of pair.info.websites) {
            const url = site.url || site;
            if (url && !url.includes('pump.fun') && !url.includes('bonk.fun') && !url.includes('bags.fm') && !url.includes('raydium.io')) {
              result.website = url;
              break;
            }
          }
        }
        
        return result;
      }
    }
  } catch (e) {
    console.error("DexScreener metadata fetch failed:", e);
  }

  return null;
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
    const { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId, slippageBps, priorityFeeMode, source, sourceChannelId } = body;

    // Default slippage 5% (500 bps), configurable
    const effectiveSlippage = slippageBps || 500;
    
    console.log("FlipIt execute:", { action, tokenMint, walletId, buyAmountUsd, targetMultiplier, positionId, slippageBps: effectiveSlippage, priorityFeeMode, source, sourceChannelId });

    if (action === "buy") {
      if (!tokenMint || !walletId) {
        return bad("Missing tokenMint or walletId");
      }

      // Get wallet details
      const { data: wallet, error: walletError } = await supabase
        .from("super_admin_wallets")
        .select("id, pubkey, secret_key_encrypted")
        .eq("id", walletId)
        .single();

      if (walletError || !wallet) {
        return bad("Wallet not found");
      }

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

      // Create position record first (with social links and source tracking)
      const { data: position, error: posError } = await supabase
        .from("flip_positions")
        .insert({
          user_id: userId,
          wallet_id: walletId,
          token_mint: tokenMint,
          token_symbol: metadata?.symbol || null,
          token_name: metadata?.name || null,
          token_image: metadata?.image || null,
          twitter_url: metadata?.twitter || null,
          website_url: metadata?.website || null,
          telegram_url: metadata?.telegram || null,
          buy_amount_usd: buyAmountUsd || 10,
          buy_price_usd: currentPrice,
          target_multiplier: mult,
          target_price_usd: targetPrice,
          status: "pending_buy",
          source: source || "manual",
          source_channel_id: sourceChannelId || null
        })
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
        // Mark position as failed
        await supabase
          .from("flip_positions")
          .update({
            status: "failed",
            error_message: buyErr.message
          })
          .eq("id", position.id);

        return bad("Buy failed: " + buyErr.message);
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

    return bad("Invalid action. Use 'buy' or 'sell'");

  } catch (err: any) {
    console.error("FlipIt execute error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
