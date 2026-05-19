import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(withRunLog('generate-reply-draft', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tweet_text, tweet_author, detected_tickers, detected_contracts, tone } = await req.json();

    if (!tweet_text) {
      return new Response(
        JSON.stringify({ success: false, error: 'tweet_text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'LOVABLE_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try to fetch token data for context
    let tokenContext = '';
    if (detected_contracts?.length > 0 || detected_tickers?.length > 0) {
      try {
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );

        // Try contracts first
        if (detected_contracts?.length > 0) {
          const { data: tokenData } = await supabase
            .from('holders_intel_seen_tokens')
            .select('symbol, name, health_grade, market_cap, total_wallets, whale_count, dev_status')
            .in('token_mint', detected_contracts)
            .limit(1)
            .maybeSingle();

          if (tokenData) {
            tokenContext = `\n\nTOKEN DATA (use 1-2 of these naturally):
- Symbol: $${tokenData.symbol}
- Name: ${tokenData.name}
- Health Grade: ${tokenData.health_grade || 'unknown'}
- Market Cap: $${tokenData.market_cap ? Number(tokenData.market_cap).toLocaleString() : 'unknown'}
- Total Holders: ${tokenData.total_wallets || 'unknown'}
- Whale Count: ${tokenData.whale_count || 'unknown'}
- Dev Status: ${tokenData.dev_status || 'unknown'}`;
          }
        }

        // Fallback to ticker search
        if (!tokenContext && detected_tickers?.length > 0) {
          const { data: tokenData } = await supabase
            .from('holders_intel_seen_tokens')
            .select('symbol, name, health_grade, market_cap, total_wallets, whale_count, dev_status')
            .in('symbol', detected_tickers.map((t: string) => t.toUpperCase()))
            .limit(1)
            .maybeSingle();

          if (tokenData) {
            tokenContext = `\n\nTOKEN DATA (use 1-2 of these naturally):
- Symbol: $${tokenData.symbol}
- Name: ${tokenData.name}
- Health Grade: ${tokenData.health_grade || 'unknown'}
- Market Cap: $${tokenData.market_cap ? Number(tokenData.market_cap).toLocaleString() : 'unknown'}
- Total Holders: ${tokenData.total_wallets || 'unknown'}
- Whale Count: ${tokenData.whale_count || 'unknown'}
- Dev Status: ${tokenData.dev_status || 'unknown'}`;
          }
        }
      } catch (e) {
        console.warn('Could not fetch token data:', e);
      }
    }

    const toneGuide = {
      casual: 'Sound like a regular crypto trader casually sharing what you noticed. Use lowercase, abbreviations, maybe an emoji or two. Keep it under 200 chars.',
      analytical: 'Sound like someone who does their own research. Reference specific numbers. Professional but not stiff. Keep it under 240 chars.',
      degen: 'Sound like a degen shitposter who stumbled on interesting data. Use crypto slang (ser, anon, ape, based). Keep it punchy, under 180 chars.',
    };

    const selectedTone = toneGuide[tone as keyof typeof toneGuide] || toneGuide.casual;

    const systemPrompt = `You are a crypto trader who uses holdersintel.com to check token holder data. You write organic-sounding Twitter replies that casually reference holder data insights.

RULES:
- Generate exactly 3 reply variations
- Each reply should feel like a genuine human comment, NOT a marketing bot
- Naturally weave in 1-2 data points from the token data if available
- Sometimes mention "i checked on holdersintel" or "holder data looks interesting" or similar casual phrasing — but NOT in every reply
- NEVER use hashtags
- NEVER sound like an advertisement
- NEVER say "check out" or "you should use"
- Match the energy of the original tweet
- Keep replies short — Twitter replies should be punchy
- ${selectedTone}

Return a JSON array of exactly 3 strings, each being a reply draft. Return ONLY the JSON array, no other text.`;

    const userPrompt = `Original tweet by @${tweet_author || 'unknown'}:
"${tweet_text}"

Detected tickers: ${detected_tickers?.join(', ') || 'none'}
Detected contracts: ${detected_contracts?.map((c: string) => c.slice(0, 8) + '...').join(', ') || 'none'}${tokenContext}

Generate 3 reply variations with a "${tone || 'casual'}" tone.`;

    const aiResponse = await meteredAiFetch("generate-reply-draft", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'deliver_reply_drafts',
              description: 'Return 3 reply draft variations',
              parameters: {
                type: 'object',
                properties: {
                  drafts: {
                    type: 'array',
                    items: { type: 'string' },
                    minItems: 3,
                    maxItems: 3,
                  },
                },
                required: ['drafts'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'deliver_reply_drafts' } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limited — try again in a moment' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits exhausted — add funds in workspace settings' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: 'AI generation failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    
    // Extract from tool call response
    let drafts: string[] = [];
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        drafts = parsed.drafts || [];
      } catch {
        console.error('Failed to parse tool call arguments');
      }
    }

    // Fallback: try to parse from content
    if (drafts.length === 0) {
      const content = aiData.choices?.[0]?.message?.content;
      if (content) {
        try {
          drafts = JSON.parse(content);
        } catch {
          drafts = [content];
        }
      }
    }

    if (drafts.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No drafts generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, drafts, token_context: !!tokenContext }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating reply draft:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? (error as Error).message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
