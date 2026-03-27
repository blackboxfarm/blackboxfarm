import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * repurpose-content
 * 
 * Takes a scraped tweet and uses AI to:
 * 1. Repurpose the text into HoldersIntel-styled content
 * 2. Optionally generate a new image in HoldersIntel style
 */

Deno.serve(withRunLog('repurpose-content', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { post_id, custom_instructions, generate_image } = await req.json();

    if (!post_id) throw new Error('post_id is required');

    // Fetch the scraped post
    const { data: post, error: postError } = await supabase
      .from('repurpose_scraped_posts')
      .select('*')
      .eq('id', post_id)
      .single();

    if (postError || !post) throw new Error('Post not found');

    console.log(`Repurposing post from @${post.username}: ${post.tweet_text?.slice(0, 80)}...`);

    // Step 1: Repurpose the text
    const systemPrompt = `You are a social media content creator for HoldersIntel — a Solana blockchain intelligence platform that tracks token holder wallets, analyzes developer behavior, and exposes fraudulent activity in the crypto space.

Your job is to take content from other crypto/blockchain accounts and repurpose it into HoldersIntel's voice:
- Confident, edgy, slightly irreverent
- Data-driven and analytical
- Protective of retail investors
- Uses crypto/degen terminology naturally
- Highlights wallet tracking, holder analysis, dev behavior insights
- Always ties back to why HoldersIntel's tools matter

RULES:
- Never copy text verbatim — always rewrite completely
- Add HoldersIntel perspective/angle
- Include relevant hashtags (#Solana #HoldersIntel #WalletTracking etc)
- Keep under 280 chars for X/Threads, or provide both short + long versions
- If the original discusses a scam/rug, lean into how HoldersIntel would have caught it
- Use emojis sparingly but effectively

${custom_instructions ? `ADDITIONAL INSTRUCTIONS: ${custom_instructions}` : ''}`;

    const textResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Repurpose this tweet from @${post.username}:\n\n"${post.tweet_text}"\n\nProvide:\n1. A SHORT version (under 280 chars) for Threads/X\n2. A LONG version (under 500 chars) for Instagram caption\n\nReturn as JSON with keys: short_text, long_text`
          },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'deliver_repurposed_content',
            description: 'Return the repurposed content in both formats',
            parameters: {
              type: 'object',
              properties: {
                short_text: { type: 'string', description: 'Short version under 280 chars for Threads/X' },
                long_text: { type: 'string', description: 'Longer version under 500 chars for Instagram' },
              },
              required: ['short_text', 'long_text'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'deliver_repurposed_content' } },
      }),
    });

    if (!textResponse.ok) {
      if (textResponse.status === 429) throw new Error('AI rate limited — try again shortly');
      if (textResponse.status === 402) throw new Error('AI credits exhausted — add funds');
      throw new Error(`AI error: ${textResponse.status}`);
    }

    const textData = await textResponse.json();
    const toolCall = textData.choices?.[0]?.message?.tool_calls?.[0];
    let repurposedText = '';
    let longText = '';

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      repurposedText = parsed.short_text || '';
      longText = parsed.long_text || '';
    } else {
      repurposedText = textData.choices?.[0]?.message?.content || 'Failed to repurpose';
    }

    // Step 2: Optionally generate image
    let repurposedImageUrl: string | null = null;

    if (generate_image && post.image_urls?.length > 0) {
      const originalImageUrl = post.image_urls[0];

      const imageResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-image',
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Recreate the concept and symbolism of this image in a dark, cyberpunk-crypto style with these brand elements:
- Color scheme: deep blacks, neon orange (#FF6B00), electric cyan accents
- Include subtle blockchain/wallet imagery (hex patterns, node networks)
- Professional, data-driven aesthetic
- HoldersIntel branding feel — like a premium crypto intelligence platform
- Keep the core message/concept of the original but make it uniquely ours
- No text overlay needed`,
              },
              {
                type: 'image_url',
                image_url: { url: originalImageUrl },
              },
            ],
          }],
          modalities: ['image', 'text'],
        }),
      });

      if (imageResponse.ok) {
        const imageData = await imageResponse.json();
        repurposedImageUrl = imageData.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
      } else {
        console.warn('Image generation failed:', imageResponse.status);
      }
    }

    // Step 3: Save draft
    const { data: draft, error: draftError } = await supabase
      .from('content_drafts')
      .insert({
        source_post_id: post.id,
        original_text: post.tweet_text,
        original_image_url: post.image_urls?.[0] || null,
        repurposed_text: `${repurposedText}\n\n---\n\n${longText}`,
        repurposed_image_url: repurposedImageUrl,
        target_platforms: ['threads', 'instagram'],
        status: 'draft',
      })
      .select()
      .single();

    if (draftError) throw new Error(`Failed to save draft: ${draftError.message}`);

    // Mark original as repurposed
    await supabase
      .from('repurpose_scraped_posts')
      .update({ is_repurposed: true })
      .eq('id', post.id);

    console.log(`Draft created: ${draft.id}`);

    return new Response(JSON.stringify({
      success: true,
      draft: {
        id: draft.id,
        short_text: repurposedText,
        long_text: longText,
        image_generated: !!repurposedImageUrl,
        repurposed_image_url: repurposedImageUrl,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Repurpose error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
