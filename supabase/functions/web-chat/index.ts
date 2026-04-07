import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

// Rate limit tracking: map of identifier -> timestamps
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(identifier: string, tier: string): boolean {
  const now = Date.now();
  const maxPerHour = tier === 'paid' ? 60 : tier === 'free' ? 20 : 3;
  const window = tier === 'anon' ? Infinity : 3600_000; // anon = per session (no window reset)
  
  const timestamps = rateLimitMap.get(identifier) || [];
  const recent = tier === 'anon' ? timestamps : timestamps.filter(t => now - t < window);
  
  if (recent.length >= maxPerHour) return false;
  
  recent.push(now);
  rateLimitMap.set(identifier, recent.slice(-100)); // keep last 100 entries max
  return true;
}

async function buildSystemPrompt(userContext: { tier: string; pagePath: string; userId?: string; emailVerified?: boolean }): Promise<string | null> {
  try {
    const [configRes, binsRes, guardrailsRes] = await Promise.all([
      supabase.from('bot_personality_config').select('*').eq('id', 1).single(),
      supabase.from('bot_knowledge_bins').select('category,title,content').eq('is_active', true).order('priority', { ascending: false }).limit(30),
      supabase.from('bot_guardrails').select('rule_type,rule_name,rule_content,severity').eq('is_active', true).order('severity', { ascending: true }),
    ]);

    const config = configRes.data;
    const bins = binsRes.data || [];
    const guardrails = guardrailsRes.data || [];

    if (config?.is_active === false) return null; // AI disabled

    let prompt = '';

    if (config) {
      prompt += `## IDENTITY\nYou are "${config.persona_name}".\n${config.persona_description}\n\n`;
      prompt += `## TONE\n${config.tone}\n\n`;
      prompt += `## EXPERTISE\nYou are an expert in: ${(config.expertise_areas || []).join(', ')}.\n\n`;
      prompt += `## LANGUAGE\n${config.language_behavior}\n\n`;
      prompt += `## RESPONSE LIMITS\nKeep responses under ${config.max_response_length} words. Be concise but helpful.\n\n`;
    }

    if (bins.length > 0) {
      prompt += `## KNOWLEDGE BASE\n`;
      for (const b of bins) {
        prompt += `**${b.title}**: ${b.content}\n\n`;
      }
    }

    if (guardrails.length > 0) {
      prompt += `## GUARDRAILS (STRICT RULES)\n`;
      for (const g of guardrails) {
        const icon = g.severity === 'critical' ? '🔴' : g.severity === 'hard' ? '🟡' : '🟢';
        prompt += `${icon} **${g.rule_name}**: ${g.rule_content}\n`;
      }
      prompt += '\n';
    }

    prompt += `## INTERNAL LINKS\nWhen directing users to features, always reference the website with full URLs:\n`;
    prompt += `- Homepage: https://blackbox.farm\n`;
    prompt += `- Holders Analysis: https://blackbox.farm/holders\n`;
    prompt += `- Bubblemaps: https://blackbox.farm/bubblemaps\n`;
    prompt += `- Intel Briefings: https://blackbox.farm/intel\n`;
    prompt += `- Oracle Risk Tool: https://blackbox.farm/oracle\n`;
    prompt += `- Register/Sign Up: https://blackbox.farm/register\n`;
    prompt += `- Dashboard: https://blackbox.farm/dashboard\n`;
    prompt += `- Advertise With Us: https://blackbox.farm/advertise\n`;
    prompt += `- Share on Socials: https://blackbox.farm/share\n`;
    prompt += `- Subscriptions: https://blackbox.farm/subscriptions\n`;
    prompt += `- Live Feed: https://blackbox.farm/feed\n`;
    prompt += `- Telegram Bot: https://blackbox.farm/tgbot\n`;
    prompt += `Use these links naturally when relevant.\n\n`;

    // Web-specific context block
    prompt += `## CURRENT CONTEXT\n`;
    prompt += `- Platform: Website (blackbox.farm)\n`;
    prompt += `- User is currently viewing: ${userContext.pagePath}\n`;
    prompt += `- User tier: ${userContext.tier}\n`;
    if (userContext.emailVerified === false) {
      prompt += `- User has NOT verified their email. Gently remind them if relevant.\n`;
    }
    prompt += '\n';

    // Tier-specific behavior
    if (userContext.tier === 'anon') {
      prompt += `## VISITOR BEHAVIOR\nThis is an anonymous visitor (not signed in). Be warm and welcoming. Explain what BlackBox Farm does. Encourage them to create a free account. Highlight key features like Holders Analysis, Bubblemaps, and the Telegram Bot. After a few messages, suggest they sign up to continue chatting and unlock more features.\n\n`;
    } else if (userContext.tier === 'free') {
      prompt += `## VISITOR BEHAVIOR\nThis is a registered free user. Help them explore all features. If they ask about advanced features, mention Pro subscription benefits naturally (not pushy). Help with email verification if needed. Suggest sharing BlackBox on socials.\n\n`;
    } else {
      prompt += `## VISITOR BEHAVIOR\nThis is a paid subscriber. Give them priority treatment. Help with advanced features. No upselling needed — focus on maximizing their experience.\n\n`;
    }

    if (config?.fallback_response) {
      prompt += `## FALLBACK\nIf you cannot answer: ${config.fallback_response}\n`;
    }

    return prompt || 'You are a helpful crypto analytics assistant for BlackBox Farm. Be friendly, use emojis, never give financial advice.';
  } catch (err) {
    console.error('[web-chat] Failed to build system prompt:', err);
    return 'You are a helpful crypto analytics assistant for BlackBox Farm. Be friendly, use emojis, never give financial advice.';
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages, user_context } = await req.json();
    const { tier = 'anon', pagePath = '/', sessionId, userId, emailVerified } = user_context || {};

    // Rate limiting
    const rateLimitKey = userId || sessionId || 'unknown';
    if (!checkRateLimit(rateLimitKey, tier)) {
      const msg = tier === 'anon'
        ? "You've reached the message limit for anonymous visitors. Create a free account at https://blackbox.farm to keep chatting! 🚀"
        : "You're sending messages too quickly. Please wait a moment and try again. ⏳";
      return new Response(JSON.stringify({ error: msg, rate_limited: true }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = await buildSystemPrompt({ tier, pagePath, userId, emailVerified });
    if (systemPrompt === null) {
      return new Response(JSON.stringify({ error: "AI chat is temporarily disabled." }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log user message
    const lastUserMsg = messages?.[messages.length - 1];
    if (lastUserMsg?.role === 'user') {
      supabase.from('web_chat_messages').insert({
        session_id: sessionId || 'anon-' + Date.now(),
        user_id: userId || null,
        role: 'user',
        content: lastUserMsg.content,
        page_path: pagePath,
        user_tier: tier,
      }).then(() => {});
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || []).slice(-20), // Last 20 messages for context
        ],
        stream: true,
        temperature: 0.8,
        max_tokens: 1000,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "AI service is busy. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiRes.text();
      console.error("[web-chat] AI gateway error:", aiRes.status, t);
      return new Response(JSON.stringify({ error: "AI temporarily unavailable" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect streamed response for logging, then pass through
    const reader = aiRes.body!.getReader();
    let fullResponse = '';

    const stream = new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          // Log assistant response
          if (fullResponse) {
            supabase.from('web_chat_messages').insert({
              session_id: sessionId || 'anon-' + Date.now(),
              user_id: userId || null,
              role: 'assistant',
              content: fullResponse,
              page_path: pagePath,
              user_tier: tier,
            }).then(() => {});
          }
          return;
        }
        // Parse for logging
        const text = new TextDecoder().decode(value);
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) fullResponse += c;
          } catch {}
        }
        controller.enqueue(value);
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("[web-chat] error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
