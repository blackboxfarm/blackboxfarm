import { withRunLog } from '../_shared/run-logger.ts';
/**
 * AI Token Pattern Matcher — Uses historical post-mortems + mid-growth assessments
 * to predict outcomes for new/growing tokens.
 * 
 * How it works:
 * 1. Receives a token mint (or fresh report data)
 * 2. Pulls the most similar historical assessments by feature similarity
 * 3. Feeds them as context to Gemini for probabilistic prediction
 * 4. Stores the prediction in token_assessments for later validation
 * 
 * Can be called:
 * - Manually via API
 * - From the Telegram bot (/predict command)
 * - From token-vigil for automatic assessment enrichment
 */

import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

Deno.serve(withRunLog('ai-token-pattern-matcher', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: 'LOVABLE_API_KEY not configured' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json();
    const { tokenMint, reportData, returnRaw } = body;

    if (!tokenMint) {
      return new Response(JSON.stringify({ error: 'tokenMint required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Get current token data (either passed in or fetch fresh)
    let currentData = reportData;
    if (!currentData) {
      const reportResp = await fetch(`${supabaseUrl}/functions/v1/bagless-holders-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ tokenMint }),
      });
      if (reportResp.ok) {
        currentData = await reportResp.json();
      }
    }

    if (!currentData) {
      return new Response(JSON.stringify({ error: 'Could not fetch token data' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 2: Extract feature vector for similarity matching
    const currentFeatures = extractFeatures(currentData);

    // Step 3: Pull historical assessments for similarity matching
    // We pull a broad set and rank by feature similarity in code
    const { data: historicalAll } = await supabase
      .from('token_assessments')
      .select(`
        symbol, assessment_type, outcome, cause_of_death, token_age_minutes,
        mcap_usd, total_holders, real_holders, dust_pct,
        whale_count, whale_pct, whale_supply_pct,
        serious_pct, serious_supply_pct, retail_pct, retail_supply_pct,
        top10_pct, tier_divergence, buy_sell_ratio,
        health_score, health_grade, phase,
        dev_sold_all, dev_reputation_score, dev_is_serial_spammer, dev_pattern,
        volume_mcap_ratio, lp_pct_of_supply, bundled_pct, fresh_wallet_pct,
        has_twitter, has_telegram, dex_paid, active_warnings, risk_flags,
        ai_prediction, ai_confidence, prediction_validated
      `)
      .in('outcome', ['rug', 'slow_bleed', 'pump_dump', 'abandoned', 'organic_decline', 'survived', 'thrived'])
      .not('outcome', 'eq', 'pending')
      .order('created_at', { ascending: false })
      .limit(200);

    const historical = historicalAll || [];
    
    // Step 4: Rank by similarity and pick top matches
    const scored = historical.map(h => ({
      ...h,
      similarity: calculateSimilarity(currentFeatures, extractFeaturesFromAssessment(h)),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    const topMatches = scored.slice(0, 15);

    // Step 5: Count outcomes in our training set
    const outcomeCounts: Record<string, number> = {};
    for (const h of historical) {
      outcomeCounts[h.outcome] = (outcomeCounts[h.outcome] || 0) + 1;
    }

    // Step 6: Build AI prompt with historical context
    const prompt = buildPrompt(currentData, currentFeatures, topMatches, outcomeCounts);

    // Step 7: Call Gemini via Lovable AI Gateway with tool calling for structured output
    const aiResp = await meteredAiFetch("ai-token-pattern-matcher", AI_GATEWAY, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'deliver_prediction',
            description: 'Deliver a structured prediction for a token based on historical pattern analysis.',
            parameters: {
              type: 'object',
              properties: {
                prediction: {
                  type: 'string',
                  enum: ['likely_rug', 'likely_pump_dump', 'likely_slow_bleed', 'likely_survive', 'likely_thrive', 'uncertain'],
                  description: 'The most likely outcome based on pattern matching',
                },
                confidence: {
                  type: 'number',
                  description: 'Confidence level 0-100',
                },
                reasoning: {
                  type: 'string',
                  description: 'Plain language reasoning citing specific historical patterns and data points. Use street language. Max 300 words.',
                },
                key_risk_factors: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Top 3-5 risk factors identified',
                },
                key_strength_factors: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Top 3-5 strength factors identified',
                },
                similar_outcomes: {
                  type: 'object',
                  properties: {
                    died: { type: 'number', description: 'Count of similar tokens that died' },
                    survived: { type: 'number', description: 'Count of similar tokens that survived' },
                  },
                  required: ['died', 'survived'],
                },
                watchlist_triggers: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'What to watch for that would change this prediction',
                },
              },
              required: ['prediction', 'confidence', 'reasoning', 'key_risk_factors', 'key_strength_factors', 'similar_outcomes', 'watchlist_triggers'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'deliver_prediction' } },
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      console.error(`[pattern-matcher] AI gateway error ${aiResp.status}:`, errText);
      
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'AI rate limited, try again shortly' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: 'AI prediction failed' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiResp.json();
    
    // Parse tool call response
    let prediction: any = null;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        prediction = JSON.parse(toolCall.function.arguments);
      } catch { }
    }

    if (!prediction) {
      // Fallback: try content
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try { prediction = JSON.parse(content); } catch { }
      }
    }

    if (!prediction) {
      return new Response(JSON.stringify({ error: 'Failed to parse AI prediction' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 8: Store the live assessment with AI prediction
    const tiers = currentData?.simpleTiers || {};
    const vitality = currentData?.vitality || {};
    const health = currentData?.healthScore || {};
    const dist = currentData?.distributionStats || {};

    const pairCreatedAt = currentData?.vitality?.pairCreatedAt;
    const tokenAgeMinutes = pairCreatedAt ? Math.round((Date.now() - pairCreatedAt) / 60000) : null;

    await supabase.from('token_assessments').upsert({
      token_mint: tokenMint,
      symbol: currentData.symbol || currentData.tokenSymbol,
      name: currentData.name || currentData.tokenName,
      assessment_type: 'live',
      outcome: 'pending',
      token_age_minutes: tokenAgeMinutes,
      snapshot_at: new Date().toISOString(),
      
      price_usd: currentData.tokenPriceUSD || 0,
      mcap_usd: currentData.marketCap || 0,
      volume_1h: vitality?.volume?.h1 || 0,
      volume_24h: vitality?.volume?.h24 || 0,
      volume_mcap_ratio: currentData.marketCap > 0 ? (vitality?.volume?.h24 || 0) / currentData.marketCap : 0,
      liquidity_usd: vitality?.liquidityUsd || 0,
      lp_pct_of_supply: currentData.lpPercentageOfSupply || 0,

      total_holders: currentData.totalHolders || 0,
      real_holders: currentData.realHolders || 0,
      dust_wallets: currentData.dustWallets || 0,
      dust_pct: currentData.dustPercentage || 0,
      whale_count: tiers?.whales?.count || 0,
      whale_pct: tiers?.whales?.percentage || 0,
      whale_supply_pct: tiers?.whales?.supplyPercentage || 0,
      serious_pct: tiers?.serious?.percentage || 0,
      retail_pct: tiers?.retail?.percentage || 0,
      top10_pct: dist?.top10Percentage || 0,
      tier_divergence: Math.abs((tiers?.whales?.percentage || 0) - (tiers?.retail?.percentage || 0)),
      
      buys_1h: vitality?.txns?.h1?.buys || 0,
      sells_1h: vitality?.txns?.h1?.sells || 0,
      buy_sell_ratio: (vitality?.txns?.h1?.sells || 1) > 0 ? (vitality?.txns?.h1?.buys || 0) / (vitality?.txns?.h1?.sells || 1) : 0,

      health_score: health?.score || 0,
      health_grade: health?.grade || 'F',
      phase: health?.phase || 'unknown',

      dev_sold_all: currentData?.potentialDevWallet?.detectionMethod === 'creator_api_sold',
      has_twitter: !!currentData?.socials?.twitter,
      dex_paid: currentData?.dexStatus?.hasDexPaid || false,

      ai_prediction: prediction.prediction,
      ai_confidence: prediction.confidence,
      ai_reasoning: prediction.reasoning,
      ai_similar_tokens: {
        top_matches: topMatches.slice(0, 5).map(m => ({
          symbol: m.symbol,
          outcome: m.outcome,
          similarity: m.similarity,
        })),
        ...prediction.similar_outcomes,
        risk_factors: prediction.key_risk_factors,
        strength_factors: prediction.key_strength_factors,
        watchlist_triggers: prediction.watchlist_triggers,
      },
    }, { 
      onConflict: 'token_mint,assessment_type,snapshot_at',
    });

    const elapsed = Date.now() - startTime;
    console.log(`[pattern-matcher] ${currentData.symbol}: ${prediction.prediction} (${prediction.confidence}% conf), ${topMatches.length} similar tokens, ${elapsed}ms`);

    return new Response(JSON.stringify({
      token: currentData.symbol || tokenMint.slice(0, 8),
      prediction: prediction.prediction,
      confidence: prediction.confidence,
      reasoning: prediction.reasoning,
      risk_factors: prediction.key_risk_factors,
      strength_factors: prediction.key_strength_factors,
      similar_outcomes: prediction.similar_outcomes,
      watchlist_triggers: prediction.watchlist_triggers,
      training_data_size: historical.length,
      top_matches: topMatches.slice(0, 5).map(m => ({
        symbol: m.symbol, outcome: m.outcome, similarity: Math.round(m.similarity * 100),
      })),
      elapsed,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[pattern-matcher] Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));

// ============ Feature Extraction ============

interface FeatureVector {
  mcap_bucket: number; // 0=<10K, 1=10-50K, 2=50-100K, 3=100-500K, 4=500K+
  holders_bucket: number; // 0=<50, 1=50-200, 2=200-500, 3=500-1000, 4=1000+
  whale_supply_pct: number;
  retail_pct: number;
  tier_divergence: number;
  dust_pct: number;
  top10_pct: number;
  buy_sell_ratio: number;
  volume_mcap_ratio: number;
  health_score: number;
  lp_pct: number;
  dev_sold_all: number;
  has_socials: number;
  dex_paid: number;
  bundled_pct: number;
}

function extractFeatures(data: any): FeatureVector {
  const tiers = data?.simpleTiers || {};
  const vitality = data?.vitality || {};
  const health = data?.healthScore || {};
  const mcap = data?.marketCap || 0;
  
  return {
    mcap_bucket: mcap < 10000 ? 0 : mcap < 50000 ? 1 : mcap < 100000 ? 2 : mcap < 500000 ? 3 : 4,
    holders_bucket: (data?.realHolders || 0) < 50 ? 0 : (data?.realHolders || 0) < 200 ? 1 : (data?.realHolders || 0) < 500 ? 2 : (data?.realHolders || 0) < 1000 ? 3 : 4,
    whale_supply_pct: tiers?.whales?.supplyPercentage || 0,
    retail_pct: tiers?.retail?.percentage || 0,
    tier_divergence: Math.abs((tiers?.whales?.percentage || 0) - (tiers?.retail?.percentage || 0)),
    dust_pct: data?.dustPercentage || 0,
    top10_pct: data?.distributionStats?.top10Percentage || 0,
    buy_sell_ratio: (vitality?.txns?.h1?.sells || 1) > 0 ? (vitality?.txns?.h1?.buys || 0) / (vitality?.txns?.h1?.sells || 1) : 0,
    volume_mcap_ratio: mcap > 0 ? (vitality?.volume?.h24 || 0) / mcap : 0,
    health_score: health?.score || 0,
    lp_pct: data?.lpPercentageOfSupply || 0,
    dev_sold_all: data?.potentialDevWallet?.detectionMethod === 'creator_api_sold' ? 1 : 0,
    has_socials: (data?.socials?.twitter ? 1 : 0) + (data?.socials?.telegram ? 1 : 0),
    dex_paid: data?.dexStatus?.hasDexPaid ? 1 : 0,
    bundled_pct: data?.insidersGraph?.bundledPercentage || 0,
  };
}

function extractFeaturesFromAssessment(a: any): FeatureVector {
  return {
    mcap_bucket: (a.mcap_usd || 0) < 10000 ? 0 : (a.mcap_usd || 0) < 50000 ? 1 : (a.mcap_usd || 0) < 100000 ? 2 : (a.mcap_usd || 0) < 500000 ? 3 : 4,
    holders_bucket: (a.real_holders || 0) < 50 ? 0 : (a.real_holders || 0) < 200 ? 1 : (a.real_holders || 0) < 500 ? 2 : (a.real_holders || 0) < 1000 ? 3 : 4,
    whale_supply_pct: a.whale_supply_pct || 0,
    retail_pct: a.retail_pct || 0,
    tier_divergence: a.tier_divergence || 0,
    dust_pct: a.dust_pct || 0,
    top10_pct: a.top10_pct || 0,
    buy_sell_ratio: a.buy_sell_ratio || 0,
    volume_mcap_ratio: (a.mcap_usd || 0) > 0 ? ((a.volume_1h || 0) * 24) / a.mcap_usd : 0,
    health_score: a.health_score || 0,
    lp_pct: a.lp_pct_of_supply || 0,
    dev_sold_all: a.dev_sold_all ? 1 : 0,
    has_socials: (a.has_twitter ? 1 : 0) + (a.has_telegram ? 1 : 0),
    dex_paid: a.dex_paid ? 1 : 0,
    bundled_pct: a.bundled_pct || 0,
  };
}

/**
 * Cosine-ish similarity on normalized feature vectors.
 * Weighted by importance: health_score, whale_supply, tier_divergence matter most.
 */
function calculateSimilarity(a: FeatureVector, b: FeatureVector): number {
  const weights: Record<keyof FeatureVector, number> = {
    mcap_bucket: 2,
    holders_bucket: 2,
    whale_supply_pct: 3,
    retail_pct: 1.5,
    tier_divergence: 3,
    dust_pct: 2,
    top10_pct: 2.5,
    buy_sell_ratio: 1.5,
    volume_mcap_ratio: 2,
    health_score: 3,
    lp_pct: 2,
    dev_sold_all: 2,
    has_socials: 1,
    dex_paid: 1,
    bundled_pct: 2.5,
  };

  // Normalization ranges (approximate)
  const ranges: Record<keyof FeatureVector, number> = {
    mcap_bucket: 4, holders_bucket: 4,
    whale_supply_pct: 100, retail_pct: 100, tier_divergence: 100,
    dust_pct: 100, top10_pct: 100, buy_sell_ratio: 5,
    volume_mcap_ratio: 20, health_score: 100, lp_pct: 100,
    dev_sold_all: 1, has_socials: 2, dex_paid: 1, bundled_pct: 50,
  };

  let weightedSim = 0;
  let totalWeight = 0;

  for (const key of Object.keys(weights) as (keyof FeatureVector)[]) {
    const range = ranges[key] || 1;
    const diff = Math.abs((a[key] - b[key]) / range);
    const sim = Math.max(0, 1 - diff);
    weightedSim += sim * weights[key];
    totalWeight += weights[key];
  }

  return totalWeight > 0 ? weightedSim / totalWeight : 0;
}

// ============ Prompt Building ============

const SYSTEM_PROMPT = `You are a Solana memecoin forensic analyst. You analyze token holder distributions, developer behavior, and market signals to predict whether a token will survive or die.

Rules:
- Use hedging language: "appears likely", "our analysis suggests", "patterns indicate"
- Never state certainties — crypto is unpredictable
- Use street language: "one whale dump = instant crash" not "insufficient liquidity coverage"
- Cite specific historical precedents when available
- Be blunt about risk — users need honest assessments, not hopium
- If training data is thin (< 20 historical records), say so and lower confidence accordingly`;

function buildPrompt(
  currentData: any,
  features: FeatureVector,
  topMatches: any[],
  outcomeCounts: Record<string, number>,
): string {
  const symbol = currentData.symbol || currentData.tokenSymbol || 'Unknown';
  const tiers = currentData.simpleTiers || {};
  const vitality = currentData.vitality || {};
  const health = currentData.healthScore || {};

  const totalTraining = Object.values(outcomeCounts).reduce((a, b) => a + b, 0);

  let prompt = `## Live Token: $${symbol}

**Market**: MCap $${((currentData.marketCap || 0) / 1000).toFixed(0)}K | Price $${currentData.tokenPriceUSD || 0} | LP $${((vitality?.liquidityUsd || 0) / 1000).toFixed(0)}K (${(currentData.lpPercentageOfSupply || 0).toFixed(1)}% of supply)
**Holders**: ${currentData.realHolders || 0} real (${currentData.totalHolders || 0} total, ${(currentData.dustPercentage || 0).toFixed(0)}% dust)
**Health**: ${health?.score || 0}/100 (${health?.grade || '?'}) | Phase: ${health?.phase || '?'}
**Tier Distribution**: Whales ${tiers?.whales?.count || 0} (${(tiers?.whales?.supplyPercentage || 0).toFixed(0)}% supply) | Serious ${tiers?.serious?.count || 0} (${(tiers?.serious?.supplyPercentage || 0).toFixed(0)}%) | Retail ${tiers?.retail?.count || 0} (${(tiers?.retail?.supplyPercentage || 0).toFixed(0)}%)
**Divergence**: ${features.tier_divergence.toFixed(0)}% gap (whale vs retail holder %)
**Top 10**: Hold ${(currentData.distributionStats?.top10Percentage || 0).toFixed(0)}% of supply
**Activity**: ${vitality?.txns?.h1?.buys || 0} buys / ${vitality?.txns?.h1?.sells || 0} sells (1h) | Vol/MCap ratio: ${features.volume_mcap_ratio.toFixed(1)}x
**Dev**: ${currentData.potentialDevWallet?.detectionMethod === 'creator_api_sold' ? '❌ Sold everything' : `Holding ${(currentData.potentialDevWallet?.percentageOfSupply || 0).toFixed(1)}%`}
**Socials**: Twitter ${currentData.socials?.twitter ? '✅' : '❌'} | Telegram ${currentData.socials?.telegram ? '✅' : '❌'} | DexPaid ${currentData.dexStatus?.hasDexPaid ? '✅' : '❌'}
**Bundles**: ${(currentData.insidersGraph?.bundledPercentage || 0).toFixed(1)}%

## Training Data: ${totalTraining} historical assessments
Outcomes: ${Object.entries(outcomeCounts).map(([k, v]) => `${k}: ${v}`).join(', ')}

## 15 Most Similar Historical Tokens:
`;

  for (const match of topMatches) {
    const outcome = match.outcome.toUpperCase();
    const emoji = ['rug', 'pump_dump', 'slow_bleed'].includes(match.outcome) ? '💀' : '✅';
    prompt += `${emoji} **${match.symbol || '???'}** → ${outcome} | MCap $${((match.mcap_usd || 0) / 1000).toFixed(0)}K | ${match.real_holders || 0} holders | Health ${match.health_score || 0} | Whales ${(match.whale_supply_pct || 0).toFixed(0)}% supply | Top10 ${(match.top10_pct || 0).toFixed(0)}% | Similarity: ${(match.similarity * 100).toFixed(0)}%\n`;
  }

  prompt += `\nBased on this data and historical patterns, predict the most likely outcome for $${symbol}. If training data is thin, say so.`;

  return prompt;
}
