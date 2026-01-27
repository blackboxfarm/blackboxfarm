import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// METRIC BUCKETING LOGIC (Deterministic)
// ============================================================================

interface MetricBucket {
  value: number;
  bucket: string;
}

function bucketControlDensity(top10Pct: number): MetricBucket {
  if (top10Pct < 25) return { value: top10Pct, bucket: "diffuse" };
  if (top10Pct < 50) return { value: top10Pct, bucket: "coordinated-capable" };
  return { value: top10Pct, bucket: "centralized" };
}

function bucketLiquidityCoverage(unlockedToLpRatio: number): MetricBucket {
  if (unlockedToLpRatio < 3) return { value: unlockedToLpRatio, bucket: "covered" };
  if (unlockedToLpRatio < 8) return { value: unlockedToLpRatio, bucket: "thin" };
  return { value: unlockedToLpRatio, bucket: "very-thin" };
}

function bucketResilienceScore(score: number): MetricBucket {
  if (score < 40) return { value: score, bucket: "weak" };
  if (score < 70) return { value: score, bucket: "moderate" };
  return { value: score, bucket: "strong" };
}

function bucketTierDivergence(whalePercent: number, retailPercent: number): MetricBucket {
  const divergence = Math.abs(whalePercent - retailPercent);
  if (divergence < 15) return { value: divergence, bucket: "low" };
  if (divergence < 35) return { value: divergence, bucket: "medium" };
  return { value: divergence, bucket: "high" };
}

// ============================================================================
// LIFECYCLE STAGE DETERMINATION (Deterministic)
// ============================================================================

type LifecycleStage = "Genesis" | "Discovery" | "Expansion" | "Distribution" | "Compression" | "Dormant" | "Reactivation";
type Confidence = "high" | "medium" | "low";

interface LifecycleResult {
  stage: LifecycleStage;
  confidence: Confidence;
  signals: string[];
}

function determineLifecycleStage(metrics: {
  totalHolders: number;
  healthScore: number;
  retailPercent: number;
  seriousPercent: number;
  whalePercent: number;
  dustPercent: number;
}): LifecycleResult {
  const { totalHolders, healthScore, retailPercent, seriousPercent, whalePercent, dustPercent } = metrics;
  const signals: string[] = [];
  
  // Genesis: Very new token
  if (totalHolders < 100) {
    signals.push(`holder_count_low:${totalHolders}`);
    if (healthScore > 50) signals.push(`health_score_decent:${healthScore}`);
    return {
      stage: "Genesis",
      confidence: totalHolders < 50 ? "high" : "medium",
      signals
    };
  }
  
  // Discovery: Growing retail base
  if (totalHolders >= 100 && totalHolders <= 500) {
    signals.push(`holder_count_growing:${totalHolders}`);
    if (retailPercent > 40) {
      signals.push(`retail_dominant:${retailPercent.toFixed(1)}%`);
      return { stage: "Discovery", confidence: "high", signals };
    }
    return { stage: "Discovery", confidence: "medium", signals };
  }
  
  // Expansion: Mature holder base with strong tiers
  if (totalHolders > 500) {
    signals.push(`holder_count_mature:${totalHolders}`);
    
    // Check for Distribution signals
    if (whalePercent < 10 && dustPercent > 50) {
      signals.push(`whales_exiting:${whalePercent.toFixed(1)}%`);
      signals.push(`dust_accumulating:${dustPercent.toFixed(1)}%`);
      return { stage: "Distribution", confidence: "medium", signals };
    }
    
    // Strong serious + whale tiers = Expansion
    if (seriousPercent + whalePercent > 25) {
      signals.push(`serious_whale_strong:${(seriousPercent + whalePercent).toFixed(1)}%`);
      return { stage: "Expansion", confidence: "high", signals };
    }
    
    return { stage: "Expansion", confidence: "low", signals };
  }
  
  // Default fallback
  return { stage: "Discovery", confidence: "low", signals: ["insufficient_data"] };
}

// ============================================================================
// COMMENTARY MODE SELECTION
// ============================================================================

type CommentaryMode = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

interface ModeResult {
  mode: CommentaryMode;
  label: string;
  reason: string;
}

function selectCommentaryMode(metrics: {
  controlDensity: MetricBucket;
  resilienceScore: MetricBucket;
  tierDivergence: MetricBucket;
  riskFlags: string[];
  hasHistoricalData: boolean;
  hasBehavioralData: boolean;
}): ModeResult {
  const { controlDensity, resilienceScore, tierDivergence, riskFlags, hasHistoricalData, hasBehavioralData } = metrics;
  
  // Mode E - Risk Posture: High risk flags present
  if (riskFlags.length >= 2) {
    return { mode: "E", label: "Risk Posture", reason: `multiple_risk_flags:${riskFlags.join(",")}` };
  }
  
  // Mode B - Structural: High concentration
  if (controlDensity.bucket === "centralized") {
    return { mode: "B", label: "Structural", reason: `control_density:${controlDensity.bucket}` };
  }
  
  // Mode G - Capital Consensus: High tier divergence
  if (tierDivergence.bucket === "high") {
    return { mode: "G", label: "Capital Consensus", reason: `tier_divergence:${tierDivergence.bucket}` };
  }
  
  // Mode H - Retention: Historical snapshots available (future enhancement)
  if (hasHistoricalData) {
    return { mode: "H", label: "Retention", reason: "historical_data_available" };
  }
  
  // Mode C - Behavioral Shift: Whale movement data (future enhancement)
  if (hasBehavioralData) {
    return { mode: "C", label: "Behavioral Shift", reason: "behavioral_data_available" };
  }
  
  // Mode A - Snapshot: Default
  return { mode: "A", label: "Snapshot", reason: "default_overview" };
}

// ============================================================================
// RISK FLAG DETECTION
// ============================================================================

function detectRiskFlags(metrics: {
  dustPercent: number;
  lpPercentage: number;
  bundledPercent: number;
  healthScore: number;
}): string[] {
  const flags: string[] = [];
  
  if (metrics.dustPercent > 70) flags.push("high_dust");
  if (metrics.lpPercentage < 5) flags.push("low_lp");
  if (metrics.bundledPercent > 20) flags.push("high_bundled_insiders");
  if (metrics.healthScore < 30) flags.push("low_health_score");
  
  return flags;
}

// ============================================================================
// AI PROMPT BUILDER
// ============================================================================

function buildSystemPrompt(mode: ModeResult): string {
  const modeInstructions: Record<CommentaryMode, string> = {
    "A": "Provide a balanced snapshot overview of the token's current holder structure.",
    "B": "Focus deeply on the structural concentration and what it implies for price sensitivity.",
    "C": "Analyze recent behavioral shifts in whale activity and what they signal.",
    "D": "Explain the token's current lifecycle stage and what typically happens next.",
    "E": "Prioritize risk factors and what they mean for holder stability.",
    "F": "Analyze selling pressure indicators and liquidity dynamics.",
    "G": "Compare behavior across tier groups and what the divergence reveals.",
    "H": "Assess holder retention patterns and diamond-hand indicators."
  };

  return `You are a TOKEN STRUCTURE INTERPRETER for Holders Intel, an analytical platform for Solana tokens.

CRITICAL RULES - FOLLOW EXACTLY:
1. You interpret STRUCTURE and BEHAVIOR patterns, never price direction
2. FORBIDDEN WORDS/PHRASES (never use these):
   - "bullish", "bearish", "buy", "sell", "pump", "dump"
   - "guaranteed", "definitely", "will moon", "rug", "scam"
   - "investment advice", "financial advice", "should invest"
   - Any price predictions or targets
3. ALLOWED TERMINOLOGY:
   - "fragile", "resilient", "sensitive", "concentrated", "diffuse"
   - "pressure", "support", "distribution", "accumulation" (as structural terms)
   - "coordinated-capable", "thin coverage", "structural weakness"
4. If signals conflict, you MUST explicitly say "signals are mixed" or "data shows tension"
5. Use conditional language: "If X continues, sensitivity may increase"
6. Always cite the specific metrics driving your interpretation
7. Never recommend actions - only describe structure and its implications

COMMENTARY MODE: ${mode.label} (${mode.mode})
${modeInstructions[mode.mode]}

Generate your response using the structured output schema provided.`;
}

// ============================================================================
// TOOL CALLING SCHEMA
// ============================================================================

const interpretationTool = {
  type: "function",
  function: {
    name: "token_interpretation",
    description: "Generate a structured interpretation of token holder metrics",
    parameters: {
      type: "object",
      properties: {
        status_overview: {
          type: "string",
          description: "3-7 sentence summary focusing on structure, not price. Must cite specific metrics."
        },
        lifecycle: {
          type: "object",
          properties: {
            stage: { 
              type: "string", 
              enum: ["Genesis", "Discovery", "Expansion", "Distribution", "Compression", "Dormant", "Reactivation"] 
            },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            explanation: { type: "string", description: "1-2 sentences explaining why this stage" }
          },
          required: ["stage", "confidence", "explanation"]
        },
        key_drivers: {
          type: "array",
          description: "3-5 most important metrics driving the interpretation",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Human-readable metric name" },
              metric_value: { type: "string", description: "The actual value" },
              bucket: { type: "string", description: "The category this falls into" },
              implication: { type: "string", description: "What this means structurally" }
            },
            required: ["label", "metric_value", "bucket", "implication"]
          }
        },
        reasoning_trace: {
          type: "array",
          description: "Step-by-step logic trail showing how conclusions were reached",
          items: {
            type: "object",
            properties: {
              metric: { type: "string" },
              value: { type: "string" },
              threshold_category: { type: "string" },
              phrase_selected: { type: "string", description: "The interpretive phrase chosen" }
            },
            required: ["metric", "value", "threshold_category", "phrase_selected"]
          }
        },
        uncertainty_notes: {
          type: "array",
          description: "Any caveats, missing data, or conflicting signals",
          items: { type: "string" }
        },
        abbreviated_summary: {
          type: "string",
          description: "1-2 sentence version for social media posts. Max 200 characters."
        }
      },
      required: ["status_overview", "lifecycle", "key_drivers", "reasoning_trace", "abbreviated_summary"]
    }
  }
};

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reportData, tokenMint, forceRefresh = false } = await req.json();

    if (!reportData || !tokenMint) {
      return new Response(
        JSON.stringify({ error: "Missing reportData or tokenMint" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache first (unless forceRefresh)
    if (!forceRefresh) {
      const { data: cached } = await supabase
        .from("token_ai_interpretations")
        .select("interpretation, commentary_mode, created_at")
        .eq("token_mint", tokenMint)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cached) {
        console.log(`[token-ai-interpreter] Cache hit for ${tokenMint.slice(0, 8)}...`);
        return new Response(
          JSON.stringify({ 
            interpretation: cached.interpretation, 
            mode: cached.commentary_mode,
            cached: true,
            cached_at: cached.created_at
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`[token-ai-interpreter] Generating fresh interpretation for ${tokenMint.slice(0, 8)}...`);

    // Extract metrics from report data
    const healthScore = reportData.healthScore?.score ?? reportData.stabilityScore ?? 50;
    const totalHolders = reportData.totalHolders ?? reportData.realHolders ?? 0;
    const top10Pct = reportData.distributionStats?.top10Percentage ?? 50;
    const lpPercentage = reportData.lpPercentageOfSupply ?? 10;
    const circulatingPct = reportData.circulatingSupply?.percentage ?? 50;
    const bundledPct = reportData.insidersGraph?.bundledPercentage ?? 0;
    
    // Tier percentages
    const dustPercent = reportData.simpleTiers?.dust?.percentage ?? 0;
    const retailPercent = reportData.simpleTiers?.retail?.percentage ?? 0;
    const seriousPercent = reportData.simpleTiers?.serious?.percentage ?? 0;
    const whalePercent = reportData.simpleTiers?.whales?.percentage ?? 0;

    // Calculate derived metrics
    const unlockedToLpRatio = lpPercentage > 0 ? circulatingPct / lpPercentage : 10;

    // Bucket metrics
    const controlDensity = bucketControlDensity(top10Pct);
    const liquidityCoverage = bucketLiquidityCoverage(unlockedToLpRatio);
    const resilienceScore = bucketResilienceScore(healthScore);
    const tierDivergence = bucketTierDivergence(whalePercent, retailPercent);

    // Detect risk flags
    const riskFlags = detectRiskFlags({
      dustPercent,
      lpPercentage,
      bundledPercent: bundledPct,
      healthScore
    });

    // Determine lifecycle stage
    const lifecycle = determineLifecycleStage({
      totalHolders,
      healthScore,
      retailPercent,
      seriousPercent,
      whalePercent,
      dustPercent
    });

    // Select commentary mode
    const mode = selectCommentaryMode({
      controlDensity,
      resilienceScore,
      tierDivergence,
      riskFlags,
      hasHistoricalData: false, // Future enhancement
      hasBehavioralData: false  // Future enhancement
    });

    // Build the prompt context
    const metricsContext = {
      token_symbol: reportData.symbol || reportData.tokenSymbol || "Unknown",
      token_name: reportData.name || reportData.tokenName || "Unknown Token",
      control_density: controlDensity,
      liquidity_coverage: liquidityCoverage,
      resilience_score: resilienceScore,
      tier_divergence: tierDivergence,
      lifecycle_stage: lifecycle.stage,
      lifecycle_confidence: lifecycle.confidence,
      lifecycle_signals: lifecycle.signals,
      tier_distribution: {
        dust: { percent: dustPercent.toFixed(1), count: reportData.simpleTiers?.dust?.count ?? 0 },
        retail: { percent: retailPercent.toFixed(1), count: reportData.simpleTiers?.retail?.count ?? 0 },
        serious: { percent: seriousPercent.toFixed(1), count: reportData.simpleTiers?.serious?.count ?? 0 },
        whales: { percent: whalePercent.toFixed(1), count: reportData.simpleTiers?.whales?.count ?? 0 }
      },
      risk_flags: riskFlags,
      total_holders: totalHolders,
      lp_percentage: lpPercentage.toFixed(2),
      bundled_insider_pct: bundledPct.toFixed(2),
      market_cap: reportData.marketCap ?? null
    };

    // Call Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: buildSystemPrompt(mode) },
          { 
            role: "user", 
            content: `Analyze this token's holder structure and generate an interpretation:\n\n${JSON.stringify(metricsContext, null, 2)}`
          }
        ],
        tools: [interpretationTool],
        tool_choice: { type: "function", function: { name: "token_interpretation" } }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error(`[token-ai-interpreter] AI API error: ${aiResponse.status}`, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    
    // Extract tool call result
    let interpretation;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      try {
        interpretation = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("[token-ai-interpreter] Failed to parse tool response:", e);
        throw new Error("Failed to parse AI response");
      }
    } else {
      console.error("[token-ai-interpreter] No tool call in response:", aiData);
      throw new Error("AI did not return expected tool call format");
    }

    // Cache the result
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes
    await supabase
      .from("token_ai_interpretations")
      .insert({
        token_mint: tokenMint,
        interpretation,
        commentary_mode: mode.mode,
        metrics_snapshot: metricsContext,
        expires_at: expiresAt
      });

    console.log(`[token-ai-interpreter] Generated and cached interpretation for ${tokenMint.slice(0, 8)}...`);

    return new Response(
      JSON.stringify({ 
        interpretation, 
        mode: mode.mode,
        mode_label: mode.label,
        mode_reason: mode.reason,
        cached: false,
        metrics_context: metricsContext
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[token-ai-interpreter] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});