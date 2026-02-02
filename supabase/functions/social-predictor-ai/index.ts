import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { input, type } = await req.json();

    if (!input) {
      return new Response(
        JSON.stringify({ error: 'Input is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log(`Analyzing ${type}: ${input.substring(0, 100)}...`);

    // Build the analysis prompt
    const systemPrompt = `You are an expert AI analyst specializing in social media trends, market sentiment, and predictive commentary. Your task is to analyze the given input and provide intelligent, actionable observations.

CRITICAL RULES:
1. Be objective and data-driven in your analysis
2. Use conditional language when making predictions ("If X continues...", "Should Y occur...")
3. Never give direct financial advice or guarantees
4. Acknowledge uncertainty where appropriate
5. Focus on observable patterns and verifiable information

Your response MUST be a valid JSON object with this exact structure:
{
  "summary": "A 2-3 sentence executive summary of your analysis",
  "sentiment": "bullish" | "bearish" | "neutral" | "mixed",
  "confidence": <number between 0-100>,
  "keyInsights": ["insight1", "insight2", "insight3"],
  "riskFactors": ["risk1", "risk2", "risk3"],
  "opportunities": ["opportunity1", "opportunity2", "opportunity3"],
  "sources": ["https://source1.com", "https://source2.com"],
  "fullAnalysis": "A detailed markdown-formatted analysis with headers and bullet points"
}

For the fullAnalysis field, structure it with:
## Overview
Brief context about the topic

## Market Dynamics
Current state and trends

## Technical Analysis
Pattern observations if applicable

## Sentiment Analysis
Social media and community sentiment

## Forward-Looking Observations
Conditional predictions based on observed patterns

## Conclusion
Summary of key takeaways`;

    const userPrompt = type === 'url' 
      ? `Analyze the content and context from this URL, considering its implications for market trends and social sentiment: ${input}

Conduct a thorough analysis considering:
1. What is the main topic/subject being discussed?
2. What are the key claims or information presented?
3. How might this impact market sentiment?
4. What are the potential implications?
5. What risks or opportunities does this present?`
      : `Conduct a comprehensive analysis on this topic, researching current trends, sentiment, and market dynamics: ${input}

Your analysis should cover:
1. Current state and recent developments
2. Social media sentiment and community discussions
3. Key influencers and their positions
4. Market implications and trends
5. Risk factors and potential opportunities
6. Forward-looking observations based on current patterns`;

    // Call the AI Gateway
    const response = await fetch(AI_GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content in AI response');
    }

    console.log('AI response received, parsing...');

    // Parse the JSON response from AI
    let parsedResult;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || 
                        content.match(/```\s*([\s\S]*?)\s*```/) ||
                        [null, content];
      const jsonStr = jsonMatch[1] || content;
      parsedResult = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Create a fallback structure
      parsedResult = {
        summary: content.substring(0, 200) + '...',
        sentiment: 'neutral',
        confidence: 60,
        keyInsights: ['Analysis generated but structured parsing failed'],
        riskFactors: ['Unable to extract structured risk factors'],
        opportunities: ['Unable to extract structured opportunities'],
        sources: [],
        fullAnalysis: content
      };
    }

    // Validate and ensure all required fields
    const result = {
      summary: parsedResult.summary || 'Analysis complete',
      sentiment: ['bullish', 'bearish', 'neutral', 'mixed'].includes(parsedResult.sentiment) 
        ? parsedResult.sentiment 
        : 'neutral',
      confidence: typeof parsedResult.confidence === 'number' 
        ? Math.min(100, Math.max(0, parsedResult.confidence)) 
        : 60,
      keyInsights: Array.isArray(parsedResult.keyInsights) 
        ? parsedResult.keyInsights.slice(0, 5) 
        : [],
      riskFactors: Array.isArray(parsedResult.riskFactors) 
        ? parsedResult.riskFactors.slice(0, 5) 
        : [],
      opportunities: Array.isArray(parsedResult.opportunities) 
        ? parsedResult.opportunities.slice(0, 5) 
        : [],
      sources: Array.isArray(parsedResult.sources) 
        ? parsedResult.sources.filter((s: string) => s.startsWith('http')).slice(0, 10) 
        : [],
      fullAnalysis: parsedResult.fullAnalysis || content
    };

    console.log('Analysis complete:', result.summary.substring(0, 50) + '...');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Social predictor error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Analysis failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
