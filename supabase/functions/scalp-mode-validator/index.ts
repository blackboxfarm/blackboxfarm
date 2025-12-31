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

interface StageResult {
  passed: boolean;
  reason: string;
  data?: Record<string, unknown>;
}

interface ValidationResult {
  approved: boolean;
  stage_results: {
    stage_0_signal: StageResult;
    stage_1_bonding: StageResult;
    stage_2_price: StageResult;
    stage_3_liquidity: StageResult;
    stage_4_dev: StageResult;
  };
  hard_reject: boolean;
  hard_reject_reason: string | null;
  recommendation: 'BUY' | 'SKIP' | 'WATCH';
  confidence_score: number;
}

// Hard reject keywords for social/psychology filtering
const HARD_REJECT_KEYWORDS = [
  'next 100x', 'guaranteed', 'moonshot', 'get in now', 'last chance',
  'not financial advice but', 'easy money', 'free money', 'insider info',
  'countdown', 'launching in', 'presale ending'
];

async function fetchDexScreenerData(tokenMint: string) {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data?.pairs?.[0] || null;
  } catch (e) {
    console.error("DexScreener fetch error:", e);
    return null;
  }
}

async function fetchBondingCurvePercent(tokenMint: string): Promise<number | null> {
  const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
  if (!heliusApiKey) return null;

  try {
    const { Connection, PublicKey } = await import("npm:@solana/web3.js@1.95.3");
    const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
    const seed = new TextEncoder().encode("bonding-curve");

    const connection = new Connection(
      `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`,
      "confirmed"
    );

    const mint = new PublicKey(tokenMint);
    const [bondingCurvePda] = PublicKey.findProgramAddressSync(
      [seed, mint.toBuffer()],
      PUMP_PROGRAM_ID
    );

    const info = await connection.getAccountInfo(bondingCurvePda);
    if (!info?.data || info.data.length < 49) return null;

    const data = info.data;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const realTokenReserves = view.getBigUint64(24, true);
    const complete = data[48] === 1;

    if (complete) return 100; // Graduated

    const INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;
    const tokensSold = INITIAL_REAL_TOKEN_RESERVES - realTokenReserves;
    const progress = Math.min(Math.max(Number(tokensSold * 100n / INITIAL_REAL_TOKEN_RESERVES), 0), 100);

    return progress;
  } catch (e) {
    console.error("Bonding curve fetch error:", e);
    return null;
  }
}

async function checkDevWallet(supabase: any, tokenMint: string): Promise<{
  devHasSold: boolean;
  devSoldPercent: number;
  singleWalletHoldsOver20: boolean;
}> {
  try {
    // Call solscan-creator-lookup to get creator info
    const { data: creatorData } = await supabase.functions.invoke("solscan-creator-lookup", {
      body: { tokenMint }
    });

    if (!creatorData?.creatorWallet) {
      return { devHasSold: false, devSoldPercent: 0, singleWalletHoldsOver20: false };
    }

    // Check if we have developer tracking data
    const { data: devToken } = await supabase
      .from("developer_tokens")
      .select("developer_id")
      .eq("token_mint", tokenMint)
      .maybeSingle();

    if (devToken?.developer_id) {
      const { data: devProfile } = await supabase
        .from("developer_profiles")
        .select("trust_level, reputation_score")
        .eq("id", devToken.developer_id)
        .single();

      // If known bad dev, flag it
      if (devProfile?.trust_level === 'dangerous' || devProfile?.reputation_score < 20) {
        return { devHasSold: true, devSoldPercent: 100, singleWalletHoldsOver20: true };
      }
    }

    return { devHasSold: false, devSoldPercent: 0, singleWalletHoldsOver20: false };
  } catch (e) {
    console.error("Dev wallet check error:", e);
    return { devHasSold: false, devSoldPercent: 0, singleWalletHoldsOver20: false };
  }
}

function checkHardRejectKeywords(messageText: string): { reject: boolean; reason: string | null } {
  if (!messageText) return { reject: false, reason: null };
  
  const lowerText = messageText.toLowerCase();
  for (const keyword of HARD_REJECT_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      return { reject: true, reason: `Detected hype keyword: "${keyword}"` };
    }
  }
  return { reject: false, reason: null };
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
    const { 
      tokenMint, 
      channelId,
      messageText,
      config // scalp mode config from channel
    } = body;

    if (!tokenMint) {
      return bad("Missing tokenMint");
    }

    console.log("Scalp mode validation for:", tokenMint);

    // Default config values
    const minBondingPct = config?.scalp_min_bonding_pct ?? 20;
    const maxBondingPct = config?.scalp_max_bonding_pct ?? 65;
    const maxAgeMins = config?.scalp_max_age_minutes ?? 45;
    const minCallers = config?.scalp_min_callers ?? 1;
    const callerTimeoutSecs = config?.scalp_caller_timeout_seconds ?? 180;

    const result: ValidationResult = {
      approved: false,
      stage_results: {
        stage_0_signal: { passed: false, reason: "" },
        stage_1_bonding: { passed: false, reason: "" },
        stage_2_price: { passed: false, reason: "" },
        stage_3_liquidity: { passed: false, reason: "" },
        stage_4_dev: { passed: false, reason: "" },
      },
      hard_reject: false,
      hard_reject_reason: null,
      recommendation: 'SKIP',
      confidence_score: 0,
    };

    // ==== HARD REJECT CHECK (before stages) ====
    const keywordCheck = checkHardRejectKeywords(messageText || '');
    if (keywordCheck.reject) {
      result.hard_reject = true;
      result.hard_reject_reason = keywordCheck.reason;
      console.log("Hard reject:", keywordCheck.reason);
      return ok(result);
    }

    // ==== STAGE 0: Signal Source Filter ====
    console.log("Stage 0: Signal source check");
    
    // Record this signal
    if (channelId) {
      await supabase.from("scalp_signal_tracker").upsert({
        token_mint: tokenMint,
        channel_id: channelId,
        detected_at: new Date().toISOString(),
        message_text: (messageText || '').slice(0, 500),
      }, {
        onConflict: 'token_mint,channel_id'
      });
    }

    // Count signals from different channels in the timeout window
    const timeoutCutoff = new Date(Date.now() - callerTimeoutSecs * 1000).toISOString();
    const { data: signals, error: signalErr } = await supabase
      .from("scalp_signal_tracker")
      .select("channel_id, caller_username")
      .eq("token_mint", tokenMint)
      .gte("detected_at", timeoutCutoff);

    const uniqueChannels = new Set(signals?.map(s => s.channel_id) || []);
    const callerCount = uniqueChannels.size;

    if (callerCount >= minCallers) {
      result.stage_results.stage_0_signal = {
        passed: true,
        reason: `${callerCount} caller(s) detected within ${callerTimeoutSecs}s window`,
        data: { callerCount, channels: Array.from(uniqueChannels) }
      };
    } else {
      result.stage_results.stage_0_signal = {
        passed: minCallers <= 1, // Pass if only 1 caller required
        reason: `Only ${callerCount} caller(s) detected, need ${minCallers}`,
        data: { callerCount }
      };
    }

    // ==== STAGE 1: Bonding Curve Position Check ====
    console.log("Stage 1: Bonding curve check");
    const bondingPct = await fetchBondingCurvePercent(tokenMint);
    
    if (bondingPct === null) {
      // Not a pump.fun token or couldn't fetch - might be graduated
      result.stage_results.stage_1_bonding = {
        passed: true,
        reason: "Not on bonding curve (possibly graduated)",
        data: { bondingPct: null }
      };
    } else if (bondingPct >= 100) {
      result.stage_results.stage_1_bonding = {
        passed: true,
        reason: "Token has graduated from bonding curve",
        data: { bondingPct: 100 }
      };
    } else if (bondingPct < minBondingPct) {
      result.stage_results.stage_1_bonding = {
        passed: false,
        reason: `Bonding ${bondingPct.toFixed(1)}% below minimum ${minBondingPct}%`,
        data: { bondingPct }
      };
    } else if (bondingPct > maxBondingPct) {
      result.stage_results.stage_1_bonding = {
        passed: false,
        reason: `Bonding ${bondingPct.toFixed(1)}% above maximum ${maxBondingPct}%`,
        data: { bondingPct }
      };
    } else {
      result.stage_results.stage_1_bonding = {
        passed: true,
        reason: `Bonding at ${bondingPct.toFixed(1)}% (target: ${minBondingPct}-${maxBondingPct}%)`,
        data: { bondingPct }
      };
    }

    // ==== STAGE 2: Price Structure Validation ====
    console.log("Stage 2: Price structure check");
    const dexData = await fetchDexScreenerData(tokenMint);
    
    if (!dexData) {
      result.stage_results.stage_2_price = {
        passed: false,
        reason: "Could not fetch price data from DexScreener"
      };
    } else {
      const priceChange5m = dexData.priceChange?.m5 || 0;
      const priceChange1h = dexData.priceChange?.h1 || 0;
      const ageMinutes = dexData.pairCreatedAt 
        ? Math.floor((Date.now() - dexData.pairCreatedAt) / 60000)
        : 999;

      // Check timing
      if (ageMinutes > maxAgeMins) {
        result.stage_results.stage_2_price = {
          passed: false,
          reason: `Token is ${ageMinutes} minutes old, max is ${maxAgeMins}`,
          data: { ageMinutes, priceChange5m, priceChange1h }
        };
        result.hard_reject = true;
        result.hard_reject_reason = `Token too old: ${ageMinutes} mins`;
      } else if (priceChange5m > 100) {
        // Vertical pump detected
        result.stage_results.stage_2_price = {
          passed: false,
          reason: `Vertical pump detected: +${priceChange5m.toFixed(0)}% in 5 minutes`,
          data: { priceChange5m, priceChange1h, ageMinutes }
        };
      } else {
        result.stage_results.stage_2_price = {
          passed: true,
          reason: `Price structure OK: ${priceChange5m >= 0 ? '+' : ''}${priceChange5m.toFixed(1)}% (5m), age ${ageMinutes}m`,
          data: { priceChange5m, priceChange1h, ageMinutes, priceUsd: dexData.priceUsd }
        };
      }
    }

    // ==== STAGE 3: Liquidity Check ====
    console.log("Stage 3: Liquidity check");
    const liquidityUsd = dexData?.liquidity?.usd || 0;
    const buyAmountUsd = config?.scalp_buy_amount_usd || 10;
    const minLiquidity = buyAmountUsd * 3; // 3x position size

    if (liquidityUsd >= minLiquidity) {
      result.stage_results.stage_3_liquidity = {
        passed: true,
        reason: `Liquidity $${liquidityUsd.toLocaleString()} >= 3x position ($${minLiquidity})`,
        data: { liquidityUsd, minLiquidity }
      };
    } else if (liquidityUsd > 0) {
      result.stage_results.stage_3_liquidity = {
        passed: false,
        reason: `Liquidity $${liquidityUsd.toLocaleString()} < 3x position ($${minLiquidity})`,
        data: { liquidityUsd, minLiquidity }
      };
    } else {
      result.stage_results.stage_3_liquidity = {
        passed: false,
        reason: "No liquidity data available"
      };
    }

    // ==== STAGE 4: Dev Wallet Check ====
    console.log("Stage 4: Dev wallet check");
    const devCheck = await checkDevWallet(supabase, tokenMint);

    if (devCheck.devSoldPercent > 5) {
      result.stage_results.stage_4_dev = {
        passed: false,
        reason: `Dev sold ${devCheck.devSoldPercent}% (max 5%)`,
        data: devCheck
      };
    } else if (devCheck.singleWalletHoldsOver20) {
      result.stage_results.stage_4_dev = {
        passed: false,
        reason: "Single wallet holds >20% of supply",
        data: devCheck
      };
    } else {
      result.stage_results.stage_4_dev = {
        passed: true,
        reason: "Dev wallet check passed",
        data: devCheck
      };
    }

    // ==== Calculate final result ====
    const stages = result.stage_results;
    const passedStages = [
      stages.stage_0_signal.passed,
      stages.stage_1_bonding.passed,
      stages.stage_2_price.passed,
      stages.stage_3_liquidity.passed,
      stages.stage_4_dev.passed,
    ].filter(Boolean).length;

    result.confidence_score = (passedStages / 5) * 100;

    // Determine recommendation
    if (result.hard_reject) {
      result.recommendation = 'SKIP';
      result.approved = false;
    } else if (passedStages >= 4) {
      result.recommendation = 'BUY';
      result.approved = true;
    } else if (passedStages >= 3) {
      result.recommendation = 'WATCH';
      result.approved = false;
    } else {
      result.recommendation = 'SKIP';
      result.approved = false;
    }

    console.log(`Scalp validation result: ${result.recommendation} (${passedStages}/5 stages, confidence ${result.confidence_score}%)`);

    return ok(result);

  } catch (err: any) {
    console.error("Scalp mode validator error:", err);
    return bad(err.message || "Unknown error", 500);
  }
});
