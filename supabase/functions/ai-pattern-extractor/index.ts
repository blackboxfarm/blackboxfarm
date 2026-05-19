import { withRunLog } from '../_shared/run-logger.ts';
/**
 * AI Pattern Extractor — Periodic analysis of all post-mortems to extract recurring rules.
 * 
 * Runs weekly via orchestrator (or manually).
 * 1. Loads all finalized assessments (post_mortem + mid_growth)
 * 2. Groups by outcome
 * 3. Asks Gemini to identify recurring patterns across each outcome group
 * 4. Stores extracted rules in token_pattern_rules
 * 
 * These rules then feed into:
 * - /risk command (rule matching against live tokens)
 * - Early warning system (proactive flagging)
 * - AI interpreter (contextual intelligence)
 */

import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions';

Deno.serve(withRunLog('ai-pattern-extractor', async (req) => {
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
  const stats = { outcomes_analyzed: 0, rules_extracted: 0, errors: 0 };

  try {
    // Load all finalized assessments
    const { data: assessments } = await supabase
      .from('token_assessments')
      .select(`
        symbol, assessment_type, outcome, cause_of_death, token_age_minutes,
        mcap_usd, total_holders, real_holders, dust_pct,
        whale_pct, whale_supply_pct, serious_pct, retail_pct,
        top10_pct, tier_divergence, buy_sell_ratio,
        health_score, health_grade, phase,
        dev_sold_all, dev_reputation_score, dev_is_serial_spammer, dev_pattern,
        volume_mcap_ratio, lp_pct_of_supply, bundled_pct, fresh_wallet_pct,
        has_twitter, has_telegram, dex_paid, active_warnings
      `)
      .in('assessment_type', ['post_mortem', 'mid_growth'])
      .not('outcome', 'eq', 'pending')
      .order('created_at', { ascending: false })
      .limit(500);

    if (!assessments || assessments.length < 5) {
      console.log(`[pattern-extractor] Only ${assessments?.length || 0} assessments — need at least 5 to extract patterns.`);
      return new Response(JSON.stringify({ ...stats, message: 'Insufficient data', elapsed: Date.now() - startTime }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Group by outcome
    const groups: Record<string, any[]> = {};
    for (const a of assessments) {
      const key = a.outcome || 'unknown';
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    }

    // For each outcome group with 3+ samples, ask AI to extract patterns
    for (const [outcome, tokens] of Object.entries(groups)) {
      if (tokens.length < 3) continue;
      stats.outcomes_analyzed++;

      const summaryBlock = tokens.slice(0, 30).map(t => {
        return `${t.symbol}: MCap $${((t.mcap_usd || 0) / 1000).toFixed(0)}K | ${t.real_holders || 0} holders | Health ${t.health_score || 0} | Whales ${(t.whale_supply_pct || 0).toFixed(0)}% | Top10 ${(t.top10_pct || 0).toFixed(0)}% | Dust ${(t.dust_pct || 0).toFixed(0)}% | Dev sold: ${t.dev_sold_all ? 'yes' : 'no'} | Twitter: ${t.has_twitter ? 'yes' : 'no'} | Bundled ${(t.bundled_pct || 0).toFixed(0)}% | Age ${t.token_age_minutes || '?'}min | Phase: ${t.phase || '?'}`;
      }).join('\n');

      try {
        const aiResp = await meteredAiFetch("ai-pattern-extractor", AI_GATEWAY, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-3-flash-preview',
            messages: [
              {
                role: 'system',
                content: `You are a crypto forensic data scientist. Analyze token assessment data grouped by outcome and extract RECURRING PATTERNS — conditions that reliably predict this outcome. Be specific with thresholds (e.g., "whale_supply_pct > 40%" not "high whale concentration"). Each pattern must be testable against new tokens.`
              },
              {
                role: 'user',
                content: `## ${tokens.length} tokens with outcome: ${outcome.toUpperCase()}\n\n${summaryBlock}\n\nExtract 3-7 recurring patterns that predict this outcome. Each pattern should have specific numeric conditions.`
              }
            ],
            tools: [{
              type: 'function',
              function: {
                name: 'extract_patterns',
                description: 'Extract recurring patterns from token assessment data.',
                parameters: {
                  type: 'object',
                  properties: {
                    patterns: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          rule_id: { type: 'string', description: 'Snake_case identifier, e.g. rug_whale_no_socials' },
                          description: { type: 'string', description: 'Human readable pattern description' },
                          conditions: {
                            type: 'object',
                            description: 'Key-value conditions. Keys are metric names, values are threshold strings like ">40", "<20", "true", "false"',
                          },
                          confidence_pct: { type: 'number', description: 'How often this pattern leads to this outcome (0-100)' },
                          matching_count: { type: 'number', description: 'How many of the sample tokens match this pattern' },
                          example_symbols: { type: 'array', items: { type: 'string' }, description: 'Up to 3 example token symbols' },
                        },
                        required: ['rule_id', 'description', 'conditions', 'confidence_pct', 'matching_count'],
                      }
                    }
                  },
                  required: ['patterns'],
                  additionalProperties: false,
                }
              }
            }],
            tool_choice: { type: 'function', function: { name: 'extract_patterns' } },
          }),
        });

        if (!aiResp.ok) {
          console.error(`[pattern-extractor] AI error for ${outcome}: ${aiResp.status}`);
          stats.errors++;
          continue;
        }

        const aiData = await aiResp.json();
        const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
        let extracted: any = null;

        if (toolCall?.function?.arguments) {
          try { extracted = JSON.parse(toolCall.function.arguments); } catch {}
        }

        if (!extracted?.patterns) {
          console.warn(`[pattern-extractor] No patterns extracted for ${outcome}`);
          continue;
        }

        // Determine pattern_type
        const deathOutcomes = ['rug', 'pump_dump', 'slow_bleed', 'organic_decline', 'abandoned'];
        const patternType = deathOutcomes.includes(outcome) ? 'death_signal' : 'survival_signal';

        // Upsert each rule
        for (const p of extracted.patterns) {
          const ruleId = `${outcome}_${p.rule_id}`.slice(0, 100);
          const { error } = await supabase.from('token_pattern_rules').upsert({
            rule_id: ruleId,
            pattern_type: patternType,
            outcome_association: outcome,
            description: p.description,
            conditions: p.conditions,
            confidence_pct: p.confidence_pct,
            sample_size: p.matching_count || tokens.length,
            example_tokens: (p.example_symbols || []).map((s: string) => ({ symbol: s })),
            is_active: true,
            extracted_by: 'ai',
            last_validated_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'rule_id' });

          if (!error) stats.rules_extracted++;
          else console.error(`[pattern-extractor] Upsert error for ${ruleId}:`, error);
        }

        // Rate limit between AI calls
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[pattern-extractor] Error processing ${outcome}:`, err);
        stats.errors++;
      }
    }
  } catch (err) {
    console.error('[pattern-extractor] Fatal error:', err);
    stats.errors++;
  }

  const elapsed = Date.now() - startTime;
  console.log(`[ai-pattern-extractor] ${JSON.stringify(stats)}, ${elapsed}ms`);

  return new Response(
    JSON.stringify({ ...stats, elapsed }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}));

