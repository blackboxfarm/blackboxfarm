import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { 
  resolvePrice, 
  fetchSolPrice, 
  type PriceResult 
} from "../_shared/price-resolver.ts";
import { parseBuyFromSolscan } from "../_shared/solscan-api.ts";
import { validateBuyQuote, getTradeGuardConfig } from "../_shared/trade-guard.ts";
import { verifyBuyTransaction, updatePositionWithVerifiedBuy } from "../_shared/helius-verify.ts";
import { createExecutionLogger, type ExecutionLogger } from "../_shared/execution-logger.ts";

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

/**
 * PRICE FETCHING - Now uses centralized price resolver
 * 
 * API Truth Table:
 * - Pre-Raydium (on bonding curve): pump.fun API -> bonding curve math  
 * - Post-Raydium (graduated): DexScreener -> Jupiter fallback
 */
async function fetchTokenPrice(tokenMint: string, options: { forceFresh?: boolean } = {}): Promise<{ price: number; metadata: PriceResult } | null> {
  const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
  // CRITICAL: Pass forceFresh to bypass cache for accurate buy execution
  const result = await resolvePrice(tokenMint, { 
    heliusApiKey, 
    forceFresh: options.forceFresh ?? false 
  });
  
  if (!result) {
    return null;
  }
  
  console.log(`Price for ${tokenMint.slice(0, 8)}: $${result.price.toFixed(10)} from ${result.source}${result.isOnCurve ? ` (curve ${result.bondingCurveProgress?.toFixed(1)}%)` : ''}${options.forceFresh ? ' [FRESH]' : ''}`);
  
  return { price: result.price, metadata: result };
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

// Auto-capture position to lists on sell if not already rated/tracked
async function capturePositionToLists(supabase: any, position: any) {
  try {
    // Skip if already rated (was captured on rating) or already locked
    if (position.tracking_locked) {
      console.log("Position already locked, skipping capture");
      return;
    }
    if (position.dev_trust_rating && 
        position.dev_trust_rating !== 'unknown') {
      console.log("Position already rated, skipping capture");
      return;
    }
    
    // Check if already in any list
    const { data: existingBlacklist } = await supabase
      .from('pumpfun_blacklist')
      .select('id')
      .eq('identifier', position.token_mint)
      .maybeSingle();
      
    const { data: existingWhitelist } = await supabase
      .from('pumpfun_whitelist')
      .select('id')
      .eq('identifier', position.token_mint)
      .maybeSingle();
      
    const { data: existingNeutral } = await supabase
      .from('pumpfun_neutrallist')
      .select('id')
      .eq('identifier', position.token_mint)
      .maybeSingle();
    
    if (existingBlacklist || existingWhitelist || existingNeutral) {
      console.log("Token already in a list, skipping capture");
      return;
    }
    
    // Add to neutrallist as unreviewed
    await supabase.from('pumpfun_neutrallist').upsert({
      entry_type: 'token_mint',
      identifier: position.token_mint,
      trust_level: 'unreviewed',
      neutrallist_reason: 'Auto-captured on sell (unrated)',
      source: 'flipit_auto_sell',
      tags: ['auto_captured', 'pending_review'],
      linked_twitter: position.twitter_url ? [position.twitter_url] : [],
      linked_websites: position.website_url ? [position.website_url] : [],
      linked_telegram: position.telegram_url ? [position.telegram_url] : [],
      linked_dev_wallets: position.creator_wallet ? [position.creator_wallet] : [],
      is_active: true
    }, { onConflict: 'entry_type,identifier' });
    
    // Add creator wallet to neutrallist if present
    if (position.creator_wallet) {
      await supabase.from('pumpfun_neutrallist').upsert({
        entry_type: 'dev_wallet',
        identifier: position.creator_wallet,
        trust_level: 'unreviewed',
        neutrallist_reason: 'Auto-captured on sell (unrated)',
        source: 'flipit_auto_sell',
        tags: ['auto_captured', 'pending_review', 'dev_wallet'],
        linked_token_mints: [position.token_mint],
        is_active: true
      }, { onConflict: 'entry_type,identifier' });
    }
    
    console.log(`Auto-captured ${position.token_mint} to neutrallist on sell`);
  } catch (e) {
    console.error("Error capturing position to lists:", e);
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

async function sendTelegramNotification(supabase: any, notifyData: {
  type: 'buy' | 'sell';
  positionId: string;
  tokenMint: string;
  tokenSymbol: string;
  tokenName?: string;
  buyAmountSol?: number;
  buyAmountUsd?: number;
  buyPrice?: number;
  tokensReceived?: number;
  targetMultiplier?: number;
  targetPrice?: number;
  expectedProfit?: number;
  sellAmountSol?: number;
  sellAmountUsd?: number;
  sellPrice?: number;
  tokensSold?: number;
  profitLossSol?: number;
  profitLossUsd?: number;
  profitLossPct?: number;
  holdDurationMins?: number;
  walletAddress?: string;
  txSignature?: string;
  venue?: string;
  source?: string;
  sourceChannel?: string;
  priceImpact?: number;
  slippageBps?: number;
  solPrice?: number;
  twitterUrl?: string;
  telegramUrl?: string;
  websiteUrl?: string;
  pumpfunUrl?: string;
}) {
  try {
    console.log("Sending Telegram notification for:", notifyData.type, notifyData.tokenSymbol);
    const { data, error } = await supabase.functions.invoke("flipit-notify", {
      body: notifyData
    });
    if (error) {
      console.error("Telegram notification failed:", error);
    } else {
      console.log("Telegram notification sent:", data?.sent, "messages");
    }
    return data;
  } catch (e) {
    console.error("Telegram notification error:", e);
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
    const { action, tokenMint, walletId, buyAmountSol: explicitBuyAmountSol, buyAmountUsd, displayPriceUsd, targetMultiplier, positionId, slippageBps, priorityFeeMode, customPriorityFee, source, sourceChannelId, isScalpPosition, scalpTakeProfitPct, scalpMoonBagPct, scalpStopLossPct, moonbagEnabled, moonbagSellPct, moonbagKeepPct, positionType, isDiamondHand, diamondTrailingStopPct, diamondMinPeakX, diamondMaxHoldHours } = body;

    // Default slippage 5% (500 bps), configurable
    const effectiveSlippage = slippageBps || 500;
    
    console.log("FlipIt execute:", { action, tokenMint, walletId, explicitBuyAmountSol, buyAmountUsd, targetMultiplier, positionId, slippageBps: effectiveSlippage, priorityFeeMode, customPriorityFee, source, sourceChannelId, isScalpPosition });

    // Helper to validate UUID format (catches "undefined" string bug)
    const isValidUuid = (id: string | undefined | null): boolean => {
      if (!id || id === "undefined" || id === "null") return false;
      // Basic UUID format check
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    };

    if (action === "buy") {
      // Initialize execution logger for comprehensive tracking
      const execLog = createExecutionLogger('buy', tokenMint || 'unknown');
      
      if (!tokenMint || !walletId) {
        execLog.logFailure('Missing tokenMint or walletId');
        return bad("Missing tokenMint or walletId");
      }
      if (!isValidUuid(walletId)) {
        execLog.logFailure('Invalid walletId format', { walletId });
        return bad(`Invalid walletId format: ${walletId}`);
      }

      execLog.log('PARAMS', {
        tokenMint: tokenMint.slice(0, 12),
        walletId: walletId.slice(0, 8),
        buyAmountSol: explicitBuyAmountSol,
        buyAmountUsd,
        targetMultiplier,
        slippageBps: effectiveSlippage,
        priorityFeeMode,
        source
      });

      // ============================================
      // BLACKLIST CHECK: Block buys for blacklisted tokens/devs
      // ============================================
      execLog.logPhaseStart('BLACKLIST_CHECK');
      try {
        const { data: blacklisted } = await supabase
          .from("pumpfun_blacklist")
          .select("identifier, entry_type, risk_level, blacklist_reason")
          .eq("identifier", tokenMint)
          .eq("is_active", true)
          .maybeSingle();
        
        if (blacklisted && blacklisted.risk_level === "high") {
          execLog.logFailure('Token blacklisted', { reason: blacklisted.blacklist_reason });
          return bad(`BLOCKED: This token is blacklisted (${blacklisted.blacklist_reason || 'DANGER rating'})`);
        }
        
        if (blacklisted) {
          execLog.log('BLACKLIST_WARNING', { riskLevel: blacklisted.risk_level });
        }
        execLog.logPhaseEnd('BLACKLIST_CHECK', { passed: true });
      } catch (blErr) {
        execLog.log('BLACKLIST_CHECK_FAILED', { error: String(blErr) });
      }

      // Get wallet details
      execLog.logPhaseStart('WALLET_LOOKUP');
      const { data: wallet, error: walletError } = await supabase
        .from("super_admin_wallets")
        .select("id, pubkey, secret_key_encrypted")
        .eq("id", walletId)
        .single();

      if (walletError) {
        execLog.logFailure('Wallet lookup failed', { error: walletError.message });
        return bad(`Wallet not found: ${walletError.message}`);
      }
      
      if (!wallet) {
        execLog.logFailure('Wallet not found in DB');
        return bad("Wallet not found in database");
      }
      execLog.logPhaseEnd('WALLET_LOOKUP', { pubkey: wallet.pubkey.slice(0, 12) });

      // ============================================
      // CRITICAL: CHECK BALANCE BEFORE ANYTHING ELSE
      // ============================================
      execLog.logPhaseStart('BALANCE_CHECK');
      
      if (!explicitBuyAmountSol || explicitBuyAmountSol <= 0) {
        execLog.logFailure('buyAmountSol required', { explicitBuyAmountSol });
        return bad("buyAmountSol is required and must be positive (frontend must convert USD→SOL)");
      }
      const buyAmountSol = explicitBuyAmountSol;
      
      // Fetch SOL price for USD display/logging only (NOT for buy amount calculation)
      const solPrice = await fetchSolPrice();
      execLog.log('SOL_PRICE', { solPrice, buyAmountSol, buyAmountUsd: buyAmountSol * solPrice });
      
      const gasFeeBuffer = 0.005;
      const requiredSol = buyAmountSol + gasFeeBuffer;
      
      // Always fetch fresh balance from RPC (fail closed if RPC errors)
      let walletBalance: number | null = null;

      const heliusKey = Deno.env.get("HELIUS_API_KEY");
      const rpcUrls = [
        ...(heliusKey ? [`https://mainnet.helius-rpc.com/?api-key=${heliusKey}`] : []),
        "https://api.mainnet-beta.solana.com",
        "https://rpc.ankr.com/solana",
      ];

      let lastBalanceErr: unknown = null;
      let rpcUsed = "";

      for (const rpcUrl of rpcUrls) {
        try {
          execLog.log('RPC_ATTEMPT', { rpc: rpcUrl.split('?')[0].split('//')[1]?.slice(0, 20) });

          const balanceRes = await fetch(rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "getBalance",
              params: [wallet.pubkey],
            }),
          });

          const raw = await balanceRes.text();
          if (!balanceRes.ok) {
            throw new Error(`RPC HTTP ${balanceRes.status}: ${raw.slice(0, 200)}`);
          }

          const balanceData = JSON.parse(raw);
          if (balanceData?.error) {
            throw new Error(`RPC error: ${JSON.stringify(balanceData.error)}`);
          }

          const lamports = balanceData?.result?.value;
          if (typeof lamports !== "number") {
            throw new Error(`Unexpected RPC response: ${raw.slice(0, 200)}`);
          }

          walletBalance = lamports / 1e9;
          rpcUsed = rpcUrl.split('?')[0];
          break;
        } catch (balanceErr) {
          lastBalanceErr = balanceErr;
          execLog.log('RPC_FAILED', { error: String(balanceErr).slice(0, 50) });
        }
      }

      if (walletBalance === null) {
        execLog.logFailure('All RPC endpoints failed', { lastError: String(lastBalanceErr) });
        return bad("Failed to fetch wallet balance (RPC error)");
      }
      
      execLog.log('BALANCE_FETCHED', { walletBalance, requiredSol, rpc: rpcUsed.slice(0, 30) });
      
      // Check if we have enough funds
      if (walletBalance < requiredSol) {
        execLog.logFailure('Insufficient funds', { walletBalance, requiredSol, shortfall: requiredSol - walletBalance });
        return bad(`Insufficient funds: wallet has ${walletBalance.toFixed(4)} SOL, need ${requiredSol.toFixed(4)} SOL`);
      }
      execLog.logPhaseEnd('BALANCE_CHECK', { passed: true, surplus: walletBalance - requiredSol });

      // CRITICAL: Fetch FRESH token price
      execLog.logPhaseStart('PRICE_FETCH');
      const priceResult = await fetchTokenPrice(tokenMint, { forceFresh: true });
      if (!priceResult) {
        execLog.logFailure('Could not fetch token price');
        return bad("Could not fetch token price");
      }
      
      const currentPrice = priceResult.price;
      const priceMetadata = priceResult.metadata;
      execLog.logPhaseEnd('PRICE_FETCH', { 
        price: currentPrice, 
        source: priceMetadata.source,
        isOnCurve: priceMetadata.isOnCurve,
        curveProgress: priceMetadata.bondingCurveProgress
      });

      // Fetch token metadata
      const metadata = await fetchTokenMetadata(tokenMint);

      // Calculate target price (0 = no auto-sell)
      // CRITICAL: Allow 0 as valid value for "no auto-sell" mode
      const mult = targetMultiplier === 0 ? 0 : (targetMultiplier || 2);
      const targetPrice = mult > 0 ? currentPrice * mult : 0; // 0 means no target (manual sell only)

      // Get auth user
      const authHeader = req.headers.get("authorization");
      let userId: string | null = null;
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id || null;
      }

      // NOW create position record (only after balance check passes)
      // Include price source metadata from resolver
      // CRITICAL: Store the actual SOL amount spent, USD is calculated live for display
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
        buy_amount_sol: buyAmountSol, // Store actual SOL spent
        buy_amount_usd: buyAmountSol * solPrice, // Calculate USD at time of purchase using live price
        buy_price_usd: currentPrice,
        target_multiplier: mult,
        target_price_usd: targetPrice,
        status: "pending_buy",
        source: source || "manual",
        source_channel_id: sourceChannelId || null,
        // New price tracking fields
        price_source: priceMetadata.source,
        price_fetched_at: priceMetadata.fetchedAt,
        is_on_curve: priceMetadata.isOnCurve,
        bonding_curve_progress: priceMetadata.bondingCurveProgress ?? null,
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

      execLog.logPhaseStart('CREATE_POSITION');
      const { data: position, error: posError } = await supabase
        .from("flip_positions")
        .insert(positionData)
        .select()
        .single();

      if (posError) {
        execLog.logFailure('Failed to create position', { error: posError.message });
        return bad("Failed to create position: " + posError.message);
      }
      execLog.logPhaseEnd('CREATE_POSITION', { positionId: position.id.slice(0, 8) });

      // CRITICAL: Capture pre-buy token balance to calculate delta later
      execLog.logPhaseStart('PRE_BUY_BALANCE');
      let preBuyTokenBalance: string | null = null;
      try {
        const heliusKey = Deno.env.get("HELIUS_API_KEY");
        const preBuyRpcUrl = heliusKey 
          ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
          : "https://api.mainnet-beta.solana.com";
        
        const preBuyRes = await fetch(preBuyRpcUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTokenAccountsByOwner",
            params: [
              wallet.pubkey,
              { mint: tokenMint },
              { encoding: "jsonParsed" }
            ]
          }),
        });
        
        if (preBuyRes.ok) {
          const preBuyData = await preBuyRes.json();
          const accounts = preBuyData?.result?.value || [];
          if (accounts.length > 0) {
            const tokenAmount = accounts[0]?.account?.data?.parsed?.info?.tokenAmount;
            preBuyTokenBalance = tokenAmount?.amount || "0";
          } else {
            preBuyTokenBalance = "0";
          }
        }
        execLog.logPhaseEnd('PRE_BUY_BALANCE', { preBuyTokenBalance: preBuyTokenBalance?.slice(0, 15) });
      } catch (preBuyErr) {
        execLog.log('PRE_BUY_BALANCE_FAILED', { error: String(preBuyErr).slice(0, 50) });
        preBuyTokenBalance = "0";
      }

      // ========================================================
      // TRADE GUARD: Pre-Trade Quote Validation
      // ========================================================
      execLog.logPhaseStart('TRADE_GUARD');
      let quoteValidation: { isValid: boolean; blockReason?: string; premiumPct: number; priceImpactPct: number; priceImpact?: number } | null = null;
      try {
        const tradeGuardConfig = await getTradeGuardConfig(supabase);
        execLog.log('TRADE_GUARD_CONFIG', { 
          maxPremiumPct: tradeGuardConfig.maxPremiumPct,
          maxPriceImpactPct: tradeGuardConfig.maxPriceImpactPct 
        });

        const displayPriceForGuard = (Number.isFinite(Number(displayPriceUsd)) && Number(displayPriceUsd) > 0)
          ? Number(displayPriceUsd)
          : currentPrice;

        quoteValidation = await validateBuyQuote(
          tokenMint,
          buyAmountSol,
          displayPriceForGuard,
          tradeGuardConfig,
          {
            slippageBps: effectiveSlippage,
            walletPubkey: wallet.pubkey
          }
        );
        
        if (!quoteValidation.isValid) {
          execLog.logFailure('Trade blocked by TradeGuard', { 
            reason: quoteValidation.blockReason,
            premiumPct: quoteValidation.premiumPct,
            priceImpactPct: quoteValidation.priceImpactPct
          });
          
          await supabase
            .from("flip_positions")
            .update({
              status: "blocked",
              error_message: quoteValidation.blockReason,
            })
            .eq("id", position.id);
          
          return bad(`Trade blocked: ${quoteValidation.blockReason}`);
        }
        
        execLog.logPhaseEnd('TRADE_GUARD', { 
          passed: true,
          premiumPct: quoteValidation.premiumPct,
          priceImpactPct: quoteValidation.priceImpactPct
        });
      } catch (guardErr) {
        execLog.logFailure('TradeGuard validation error', { error: String(guardErr) });
        
        await supabase
          .from("flip_positions")
          .update({
            status: "blocked",
            error_message: `TradeGuard error: ${guardErr instanceof Error ? guardErr.message : String(guardErr)}`,
          })
          .eq("id", position.id);
        
        return bad(`Trade blocked: TradeGuard validation failed - ${guardErr instanceof Error ? guardErr.message : "Unknown error"}`);
      }

      // Execute the buy via raydium-swap
      execLog.logPhaseStart('SWAP_EXECUTION');
      try {
        const buyLamportsForSwap = Math.floor(buyAmountSol * 1_000_000_000);
        const buyUsdForSwap = buyAmountSol * solPrice;

        execLog.log('SWAP_INVOKE', { 
          buyAmountSol, 
          buyLamportsForSwap, 
          buyUsdForSwap,
          slippageBps: effectiveSlippage,
          priorityFeeMode
        });

        const swapStartTime = Date.now();
        const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
          body: {
            side: "buy",
            tokenMint: tokenMint,
            buyWithSol: true,
            solAmountLamports: buyLamportsForSwap,
            usdcAmount: buyUsdForSwap,
            slippageBps: effectiveSlippage,
            priorityFeeMode: priorityFeeMode || "medium",
          },
          headers: {
            "x-owner-secret": wallet.secret_key_encrypted,
          },
        });
        const swapDuration = Date.now() - swapStartTime;

        if (swapError) {
          execLog.logFailure('Swap invocation error', { error: swapError.message, durationMs: swapDuration });
          throw new Error(swapError.message);
        }

        if (swapResult?.error_code) {
          execLog.logFailure('Swap soft error', { errorCode: swapResult.error_code, error: swapResult.error, durationMs: swapDuration });
          throw new Error(`[${swapResult.error_code}] ${swapResult.error}`);
        }

        if (swapResult?.error) {
          execLog.logFailure('Swap returned error', { error: swapResult.error, durationMs: swapDuration });
          throw new Error(swapResult.error);
        }
        
        const signature = firstSignature(swapResult);
        if (!signature) {
          execLog.logFailure('No signature returned', { durationMs: swapDuration });
          throw new Error("Swap returned no signature (buy did not confirm)");
        }

        execLog.log('SWAP_SUCCESS', { 
          signature: signature.slice(0, 20),
          source: (swapResult as any)?.source,
          venue: (swapResult as any)?.venue,
          durationMs: swapDuration
        });

        // Get estimated outAmount from swap response as initial fallback
        let quantityTokens = (swapResult as any)?.outAmount ?? null;
        let quantityTokensRaw: string | null = null;
        let tokenDecimals: number | null = null;
        execLog.log('SWAP_RESULT', { 
          outAmount: quantityTokens,
          solInputLamports: (swapResult as any)?.solInputLamports
        });

        // CRITICAL: Use Helius Parse Transaction API to get EXACT tokens received from THIS swap
        // This is the only reliable way to know exactly how many tokens this specific buy received
        const heliusKey = Deno.env.get("HELIUS_API_KEY");
        
        if (heliusKey && signature) {
          try {
            // Wait for transaction to be indexed by Helius
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            console.log("Parsing transaction via Helius to get exact token output:", signature);
            const parseRes = await fetch(`https://api.helius.xyz/v0/transactions/?api-key=${heliusKey}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ transactions: [signature] }),
            });
            
            if (parseRes.ok) {
              const parsedTxs = await parseRes.json();
              const parsedTx = parsedTxs?.[0];
              
              console.log("Helius parsed transaction type:", parsedTx?.type, "source:", parsedTx?.source);
              
              // Check for swap event with token outputs - most reliable
              if (parsedTx?.events?.swap) {
                const swapEvent = parsedTx.events.swap;
                
                // Find token output matching our target token mint
                const tokenOutput = swapEvent.tokenOutputs?.find(
                  (out: any) => out.mint === tokenMint
                );
                
                if (tokenOutput?.rawTokenAmount?.tokenAmount) {
                  // Apply decimals to get human-readable amount
                  quantityTokensRaw = tokenOutput.rawTokenAmount.tokenAmount;
                  tokenDecimals = tokenOutput.rawTokenAmount.decimals ?? 9;
                  const humanAmount = Number(quantityTokensRaw) / Math.pow(10, tokenDecimals);
                  quantityTokens = String(humanAmount);
                  console.log(`Got token quantity from swap event: raw=${quantityTokensRaw}, decimals=${tokenDecimals}, human=${humanAmount}`);
                } else if (tokenOutput?.tokenAmount) {
                  // tokenAmount is already human-readable
                  quantityTokens = String(tokenOutput.tokenAmount);
                  console.log("Got token quantity from tokenAmount (human-readable):", quantityTokens);
                }
              }
              
              // Fallback: check tokenTransfers array
              if (!quantityTokens && parsedTx?.tokenTransfers?.length > 0) {
                // Find transfer TO our wallet OF the target token
                const inboundTransfer = parsedTx.tokenTransfers.find(
                  (t: any) => t.mint === tokenMint && t.toUserAccount === wallet.pubkey
                );
                
                if (inboundTransfer?.tokenAmount) {
                  // tokenAmount in tokenTransfers is human-readable
                  quantityTokens = String(inboundTransfer.tokenAmount);
                  console.log("Got token quantity from tokenTransfers (human-readable):", quantityTokens);
                }
              }
              
              // Fallback: check accountData tokenBalanceChanges
              if (!quantityTokens && parsedTx?.accountData?.length > 0) {
                for (const acct of parsedTx.accountData) {
                  const tokenChange = acct.tokenBalanceChanges?.find(
                    (c: any) => c.mint === tokenMint && c.userAccount === wallet.pubkey
                  );
                  if (tokenChange?.rawTokenAmount?.tokenAmount) {
                    const rawAmount = BigInt(tokenChange.rawTokenAmount.tokenAmount);
                    // Only use positive changes (tokens received)
                    if (rawAmount > 0n) {
                      // Apply decimals to get human-readable amount
                      quantityTokensRaw = tokenChange.rawTokenAmount.tokenAmount;
                      tokenDecimals = tokenChange.rawTokenAmount.decimals ?? 9;
                      const humanAmount = Number(rawAmount) / Math.pow(10, tokenDecimals);
                      quantityTokens = String(humanAmount);
                      console.log(`Got token quantity from accountData: raw=${quantityTokensRaw}, decimals=${tokenDecimals}, human=${humanAmount}`);
                      break;
                    }
                  }
                }
              }
            } else {
              console.warn("Helius parse transaction failed:", parseRes.status, await parseRes.text());
            }
          } catch (parseErr) {
            console.error("Error parsing transaction with Helius:", parseErr);
          }
        }
        
        // Final fallback: use delta calculation if Helius parsing didn't work
        if (!quantityTokens) {
          try {
            const verifyRpcUrl = heliusKey 
              ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`
              : "https://api.mainnet-beta.solana.com";
            
            console.log("Fallback: calculating delta from pre/post buy balance");
            const balanceRes = await fetch(verifyRpcUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getTokenAccountsByOwner",
                params: [wallet.pubkey, { mint: tokenMint }, { encoding: "jsonParsed" }]
              }),
            });
            
            if (balanceRes.ok) {
              const balanceData = await balanceRes.json();
              const accounts = balanceData?.result?.value || [];
              
              if (accounts.length > 0) {
                const tokenAmount = accounts[0]?.account?.data?.parsed?.info?.tokenAmount;
                if (tokenAmount) {
                  // Use uiAmount for human-readable values
                  const postBuyHuman = tokenAmount.uiAmount ?? (Number(tokenAmount.amount) / Math.pow(10, tokenAmount.decimals || 9));
                  const preBuyHuman = Number(preBuyTokenBalance || "0") / Math.pow(10, tokenAmount.decimals || 9);
                  const tokensReceived = postBuyHuman - preBuyHuman;
                  
                  console.log("Delta fallback:", {
                    pre: preBuyHuman,
                    post: postBuyHuman,
                    delta: tokensReceived,
                    decimals: tokenAmount.decimals
                  });
                  
                  if (tokensReceived > 0) {
                    quantityTokens = String(tokensReceived);
                  }
                }
              }
            }
          } catch (fallbackErr) {
            console.error("Delta fallback failed:", fallbackErr);
          }
        }
        
        execLog.log('QUANTITY_RESOLVED', { 
          quantityTokens: quantityTokens == null ? null : String(quantityTokens).slice(0, 15),
          quantityTokensRaw: quantityTokensRaw?.slice(0, 15),
          tokenDecimals
        });

        // Calculate actual values from swap
        const solInputLamports = Number.isFinite(Number((swapResult as any)?.solInputLamports))
          ? Number((swapResult as any)?.solInputLamports)
          : buyLamportsForSwap;
        const solSpentSol = solInputLamports / 1_000_000_000;
        const actualBuyAmountUsd = solSpentSol * solPrice;

        let actualBuyPriceUsd = currentPrice;
        if (quantityTokens && Number(quantityTokens) > 0) {
          actualBuyPriceUsd = actualBuyAmountUsd / Number(quantityTokens);
        }

        execLog.log('PRICE_CALCULATED', { 
          solSpentSol,
          actualBuyAmountUsd,
          actualBuyPriceUsd,
          quantityTokens: quantityTokens == null ? null : String(quantityTokens).slice(0, 12),
          targetPriceUsd: mult > 0 ? actualBuyPriceUsd * mult : 0
        });

        // Update position with buy result
        execLog.logPhaseStart('DB_UPDATE');
        await supabase
          .from("flip_positions")
          .update({
            buy_signature: signature,
            buy_executed_at: new Date().toISOString(),
            quantity_tokens: quantityTokens,
            quantity_tokens_raw: quantityTokensRaw,
            token_decimals: tokenDecimals,
            buy_amount_sol: solSpentSol,
            buy_price_usd: actualBuyPriceUsd,
            buy_amount_usd: actualBuyAmountUsd,
            target_price_usd: mult > 0 ? actualBuyPriceUsd * mult : 0,
            status: "holding",
            error_message: null,
          })
          .eq("id", position.id);
        execLog.logPhaseEnd('DB_UPDATE', { status: 'holding' });

        // AUTO-VERIFY ENTRY: Use Solscan for accurate on-chain truth (with retry logic)
        const solscanApiKey = Deno.env.get("SOLSCAN_API_KEY");
        if (solscanApiKey && signature) {
          // IMPROVED: More resilient verification with retries and longer wait
          const verifyEntry = async (attempt = 1) => {
            const maxAttempts = 3;
            const waitTime = attempt === 1 ? 15000 : 10000; // 15s first try, 10s retries
            
            await new Promise(resolve => setTimeout(resolve, waitTime));
            
            try {
              console.log(`Verifying entry via Solscan API (attempt ${attempt}/${maxAttempts}):`, signature);
              const buyData = await parseBuyFromSolscan(signature, tokenMint, wallet.pubkey, solscanApiKey);
              
              if (buyData) {
                console.log("Solscan verified:", buyData);
                
                const verifiedBuyAmountUsd = buyData.solSpent * solPrice;
                const verifiedBuyPriceUsd = verifiedBuyAmountUsd / buyData.tokensReceived;
                
                // SANITY CHECK: Don't overwrite with bad data if deviation is too large
                const quotedSolSpent = buyAmountSol;
                const deviation = Math.abs(buyData.solSpent - quotedSolSpent) / quotedSolSpent * 100;
                
                if (deviation > 25) {
                  console.error(`VERIFY_MISMATCH: quoted=${quotedSolSpent.toFixed(6)} SOL, verified=${buyData.solSpent.toFixed(6)} SOL, deviation=${deviation.toFixed(1)}%`);
                  await supabase.from("flip_positions").update({
                    entry_verified: false,
                    error_message: `Entry verification mismatch: ${deviation.toFixed(1)}% deviation from quote`
                  }).eq("id", position.id);
                  return;
                }
                
                await supabase.from("flip_positions").update({
                  quantity_tokens: buyData.tokensReceived,
                  buy_amount_sol: buyData.solSpent,
                  buy_amount_usd: verifiedBuyAmountUsd,
                  buy_price_usd: verifiedBuyPriceUsd,
                  // CRITICAL: target must track verified entry price too
                  // If mult is 0 (no auto-sell), target_price_usd = 0
                  target_price_usd: mult > 0 ? verifiedBuyPriceUsd * mult : 0,
                  buy_fee_sol: buyData.fee,
                  entry_verified: true,
                  entry_verified_at: new Date().toISOString(),
                }).eq("id", position.id);
                
                console.log(`Entry verified: ${buyData.tokensReceived} tokens for ${buyData.solSpent} SOL = $${verifiedBuyPriceUsd.toFixed(10)}/token`);
              } else if (attempt < maxAttempts) {
                console.warn(`Solscan verification attempt ${attempt} failed, retrying...`);
                verifyEntry(attempt + 1);
              } else {
                console.error("Solscan verification failed after all attempts - inline price used");
                // Log failure for debugging
                await supabase.from("activity_logs").insert({
                  message: `Solscan verification failed for position ${position.id}`,
                  log_level: "warn",
                  metadata: { positionId: position.id, signature, attempts: maxAttempts }
                });
              }
            } catch (e) {
              console.error(`Auto-verify attempt ${attempt} failed:`, e);
              if (attempt < maxAttempts) {
                verifyEntry(attempt + 1);
              }
            }
          };
          
          // Start verification in background
          verifyEntry();
        }

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

        // Send Telegram notification (fire and forget)
        sendTelegramNotification(supabase, {
          type: 'buy',
          positionId: position.id,
          tokenMint: tokenMint,
          tokenSymbol: position.token_symbol || metadata?.symbol || 'TOKEN',
          tokenName: position.token_name || metadata?.name,
          buyAmountSol: buyAmountSol,
          buyAmountUsd: actualBuyAmountUsd,
          buyPrice: actualBuyPriceUsd,
          tokensReceived: quantityTokens ? Number(quantityTokens) : undefined,
          targetMultiplier: mult,
          targetPrice: actualBuyPriceUsd * mult,
          expectedProfit: actualBuyAmountUsd * (mult - 1),
          walletAddress: wallet.pubkey,
          txSignature: signature,
          venue: priceMetadata?.source || 'unknown',
          source: source || 'manual',
          sourceChannel: sourceChannelId,
          priceImpact: quoteValidation?.priceImpact,
          slippageBps: effectiveSlippage,
          solPrice: solPrice,
          twitterUrl: position.twitter_url || metadata?.twitter,
          telegramUrl: metadata?.telegram,
          websiteUrl: metadata?.website,
          pumpfunUrl: `https://pump.fun/${tokenMint}`,
        }).catch(e => console.error("Telegram notification failed:", e));

        // Track developer (fire and forget - don't block the response)
        trackDeveloper(supabase, tokenMint, position.id, metadata).catch(e => 
          console.error("Developer tracking failed:", e)
        );

        execLog.logSuccess(signature);
        execLog.logPhaseEnd('SWAP_EXECUTION');

        return ok({
          success: true,
          positionId: position.id,
          signature,
          signatures: (swapResult as any)?.signatures ?? [signature],
          entryPrice: actualBuyPriceUsd,
          targetPrice: actualBuyPriceUsd * mult,
          multiplier: mult,
          quantityTokens: quantityTokens,
          executionLog: execLog.getLogString()
        });

      } catch (buyErr: any) {
        const errMsg = buyErr?.message || String(buyErr);
        execLog.logFailure(errMsg);

        // Delete the pending position
        try {
          await supabase.from("flip_positions").delete().eq("id", position.id);
        } catch (delErr) {
          execLog.log('DELETE_FAILED_POSITION_ERROR', { error: String(delErr) });
        }

        return ok({ success: false, error: `Buy failed: ${errMsg}`, executionLog: execLog.getLogString() });
      }
    }

    if (action === "sell") {
      // Initialize execution logger for sell
      const execLog = createExecutionLogger('sell', tokenMint || 'unknown', positionId);
      
      if (!positionId) {
        execLog.logFailure('Missing positionId');
        return bad("Missing positionId");
      }
      if (!isValidUuid(positionId)) {
        execLog.logFailure('Invalid positionId format', { positionId });
        return bad(`Invalid positionId format: ${positionId}`);
      }

      execLog.log('PARAMS', { 
        positionId: positionId.slice(0, 8),
        slippageBps: effectiveSlippage,
        priorityFeeMode
      });

      // Get position
      execLog.logPhaseStart('FETCH_POSITION');
      const { data: position, error: posErr } = await supabase
        .from("flip_positions")
        .select("*, super_admin_wallets!flip_positions_wallet_id_fkey(secret_key_encrypted)")
        .eq("id", positionId)
        .single();

      if (posErr || !position) {
        execLog.logFailure('Position not found', { error: posErr?.message });
        return bad("Position not found");
      }

      execLog.logPhaseEnd('FETCH_POSITION', { 
        tokenMint: position.token_mint?.slice(0, 12),
        status: position.status,
        // quantity_tokens is numeric in DB; stringify before slicing for log preview
        quantityTokens: position.quantity_tokens == null ? null : String(position.quantity_tokens).slice(0, 12),
        quantityTokensRaw: position.quantity_tokens_raw?.slice(0, 15),
        tokenDecimals: position.token_decimals
      });

      if (position.status !== "holding" && !(position.status === "sold" && !position.sell_signature)) {
        execLog.logFailure('Position not in holding status', { currentStatus: position.status });
        return bad("Position is not in holding status");
      }

      // Mark as pending sell
      await supabase
        .from("flip_positions")
        .update({ status: "pending_sell" })
        .eq("id", positionId);

      execLog.logPhaseStart('SWAP_EXECUTION');
      try {
        const hasRecordedQuantity = position.quantity_tokens && Number(position.quantity_tokens) > 0;
        let hasRawQuantity =
          typeof position.quantity_tokens_raw === "string" &&
          /^\d+$/.test(position.quantity_tokens_raw) &&
          position.quantity_tokens_raw !== "0";
        
        // FIX: For legacy positions without quantity_tokens_raw, fetch actual balance from chain
        let effectiveRawAmount = position.quantity_tokens_raw;
        if (!hasRawQuantity && position.wallet_id && position.token_mint) {
          execLog.log('LEGACY_POSITION_DETECTED', { 
            reason: 'quantity_tokens_raw missing, fetching from chain' 
          });
          
          try {
            // Get wallet info including token balance for this specific mint
            const { data: walletData, error: walletErr } = await supabase.functions.invoke("trader-wallet", {
              body: { 
                tokenMint: position.token_mint,
                walletId: position.wallet_id 
              }
            });
            
            if (!walletErr && walletData?.tokenBalanceRaw && walletData.tokenBalanceRaw !== "0") {
              effectiveRawAmount = walletData.tokenBalanceRaw;
              hasRawQuantity = true;
              execLog.log('CHAIN_BALANCE_FETCHED', {
                tokenBalanceRaw: String(walletData.tokenBalanceRaw).slice(0, 15),
                tokenDecimals: walletData.tokenDecimals,
                tokenUiAmount: walletData.tokenUiAmount
              });
            } else {
              execLog.log('CHAIN_BALANCE_ZERO_OR_ERROR', { 
                error: walletErr?.message,
                tokenBalanceRaw: walletData?.tokenBalanceRaw 
              });
            }
          } catch (chainErr) {
            execLog.log('CHAIN_BALANCE_FETCH_FAILED', { 
              error: String((chainErr as Error)?.message || chainErr) 
            });
          }
        }
        
        execLog.log('SELL_QUANTITY', { 
          hasRecordedQuantity,
          hasRawQuantity,
          quantityTokens: position.quantity_tokens == null ? null : String(position.quantity_tokens).slice(0, 12),
          quantityTokensRaw: position.quantity_tokens_raw?.slice(0, 15),
          effectiveRawAmount: effectiveRawAmount?.slice(0, 15),
          tokenDecimals: position.token_decimals,
          willSellAll: !hasRawQuantity
        });

        // Execute sell via raydium-swap using wallet ID for direct lookup
        // CRITICAL: unwrapSol ensures we get native SOL back (no stranded WSOL)
        const { data: swapResult, error: swapError } = await supabase.functions.invoke("raydium-swap", {
          body: {
            side: "sell",
            tokenMint: position.token_mint,
            // Use effective raw amount (from DB or fetched from chain), fall back to sellAll
            ...(hasRawQuantity ? { amount: effectiveRawAmount } : { sellAll: true }),
            slippageBps: effectiveSlippage,
            priorityFeeMode: priorityFeeMode || "medium",
            priorityFeeSol: customPriorityFee, // Override with specific SOL amount if provided
            walletId: position.wallet_id, // Pass wallet ID for direct DB lookup
            unwrapSol: true, // CRITICAL: Unwrap WSOL to native SOL to prevent stranded wrapped SOL
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

        // CRITICAL FIX: Calculate actual USD received from the swap
        // swapResult should contain the SOL amount received from the sell
        const solPrice = await fetchSolPrice();
        let soldForUsd = 0;
        let sellPricePerToken = 0;

        // Try to get actual SOL received from swap result
        const solReceived = Number(swapResult?.solReceived || swapResult?.outputAmount || 0);
        if (solReceived > 0) {
          // solReceived is in lamports, convert to SOL then to USD
          const solAmount = solReceived / 1e9;
          soldForUsd = solAmount * solPrice;
          console.log(`Sell: Received ${solAmount.toFixed(6)} SOL = $${soldForUsd.toFixed(2)} USD`);
        }

        // If swap didn't return SOL amount, estimate from current price
        if (soldForUsd <= 0) {
          const currentPriceResult = await fetchTokenPrice(position.token_mint);
          const currentPrice = currentPriceResult?.price || 0;
          if (currentPrice > 0 && position.quantity_tokens) {
            // quantity_tokens is already in human-readable form
            soldForUsd = currentPrice * Number(position.quantity_tokens);
            console.log(`Sell: Estimated $${soldForUsd.toFixed(2)} USD from price $${currentPrice.toFixed(10)} × ${position.quantity_tokens} tokens`);
          }
        }

        // Calculate sell price per token for display
        if (position.quantity_tokens && Number(position.quantity_tokens) > 0) {
          sellPricePerToken = soldForUsd / Number(position.quantity_tokens);
        }

        // Calculate profit: what we got minus what we paid
        const profit = soldForUsd > 0 ? soldForUsd - Number(position.buy_amount_usd || 0) : null;

        console.log(`Sell summary: Invested $${position.buy_amount_usd}, Sold for $${soldForUsd.toFixed(2)}, Profit: $${profit?.toFixed(2) || 'N/A'}`);

        // Update position with sell result
        await supabase
          .from("flip_positions")
          .update({
            sell_signature: signature,
            sell_executed_at: new Date().toISOString(),
            sell_price_usd: sellPricePerToken, // Price per token (for display consistency)
            profit_usd: profit,
            status: "sold",
            error_message: null,
          })
          .eq("id", positionId);

        // Calculate profit percent and SOL values for tweet
        const profitPercent = position.buy_price_usd && sellPricePerToken
          ? ((sellPricePerToken / Number(position.buy_price_usd)) - 1) * 100
          : 0;
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
          exitPrice: sellPricePerToken,
          profitPercent: profitPercent,
          profitSol: profitSol,
          txSignature: signature,
        });

        // Calculate hold duration in minutes
        const holdDurationMins = position.buy_executed_at 
          ? (Date.now() - new Date(position.buy_executed_at).getTime()) / 60000
          : undefined;

        // Send Telegram notification (fire and forget)
        sendTelegramNotification(supabase, {
          type: 'sell',
          positionId: positionId,
          tokenMint: position.token_mint,
          tokenSymbol: position.token_symbol || 'TOKEN',
          tokenName: position.token_name,
          buyAmountSol: position.buy_amount_sol,
          buyAmountUsd: position.buy_amount_usd,
          buyPrice: position.buy_price_usd,
          sellAmountSol: soldForUsd / solPrice,
          sellAmountUsd: soldForUsd,
          sellPrice: sellPricePerToken,
          tokensSold: position.quantity_tokens ? Number(position.quantity_tokens) : undefined,
          profitLossSol: profitSol,
          profitLossUsd: profit,
          profitLossPct: profitPercent,
          holdDurationMins: holdDurationMins,
          walletAddress: position.super_admin_wallets?.pubkey,
          txSignature: signature,
          venue: 'raydium',
          source: position.source || 'manual',
          solPrice: solPrice,
          twitterUrl: position.twitter_url,
          pumpfunUrl: `https://pump.fun/${position.token_mint}`,
        }).catch(e => console.error("Telegram notification failed:", e));

        // Track trade outcome for developer reputation (fire and forget)
        trackTradeOutcome(supabase, {
          ...position,
          sell_price_usd: sellPricePerToken
        }).catch(e => console.error("Trade outcome tracking failed:", e));

        // Auto-capture unrated positions to neutrallist on sell (fire and forget)
        capturePositionToLists(supabase, position)
          .catch(e => console.error("Position list capture failed:", e));

        return ok({
          success: true,
          signature,
          signatures: (swapResult as any)?.signatures ?? [signature],
          sellPrice: sellPricePerToken,
          soldForUsd,
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
            priorityFeeSol: customPriorityFee, // Override with specific SOL amount if provided
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
