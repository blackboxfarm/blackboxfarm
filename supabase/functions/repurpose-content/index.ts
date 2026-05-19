import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * repurpose-content
 * 
 * Modes:
 * 1. New repurpose: post_id → create draft with AI text + optional image
 * 2. Regenerate: draft_id + regenerate ('text'|'image') → update existing draft
 */

async function uploadBase64Image(supabase: any, base64Url: string, prefix: string): Promise<string | null> {
  const match = base64Url.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!match) return null;

  const format = match[1];
  const data = match[2];
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  const fileName = `${prefix}_${Date.now()}.${format}`;
  const { error } = await supabase.storage
    .from('repurposed-images')
    .upload(fileName, bytes, { contentType: `image/${format}`, upsert: true });

  if (error) {
    console.error('Image upload error:', error);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from('repurposed-images')
    .getPublicUrl(fileName);

  const publicUrl = urlData?.publicUrl || null;

  // Auto-capture to social media gallery
  if (publicUrl) {
    try {
      await supabase.from('social_media_gallery').insert({
        file_name: fileName,
        display_name: `AI ${prefix} ${new Date().toLocaleDateString()}`,
        file_url: publicUrl,
        source_type: 'ai_generated',
        ai_prompt: prefix,
        mime_type: `image/${format}`,
      });
    } catch (e) {
      console.error('Gallery auto-capture failed:', e);
    }
  }

  return publicUrl;
}

async function generateText(LOVABLE_API_KEY: string, originalText: string, username: string, customInstructions?: string) {
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

${customInstructions ? `ADDITIONAL INSTRUCTIONS: ${customInstructions}` : ''}`;

  const response = await meteredAiFetch("repurpose-content", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
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
          content: `Repurpose this tweet from @${username}:\n\n"${originalText}"\n\nProvide:\n1. A SHORT version (under 280 chars) for Threads/X\n2. A LONG version (under 500 chars) for Instagram caption\n\nReturn as JSON with keys: short_text, long_text`
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

  if (!response.ok) {
    if (response.status === 429) throw new Error('AI rate limited — try again shortly');
    if (response.status === 402) throw new Error('AI credits exhausted — add funds');
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

  if (toolCall?.function?.arguments) {
    const parsed = JSON.parse(toolCall.function.arguments);
    return { short: parsed.short_text || '', long: parsed.long_text || '' };
  }
  return { short: data.choices?.[0]?.message?.content || 'Failed to repurpose', long: '' };
}

async function getActiveStylePrompt(supabase: any): Promise<{ prompt: string; refUrls: string[] }> {
  const { data } = await supabase
    .from('image_style_presets')
    .select('style_prompt, reference_image_urls')
    .eq('is_default', true)
    .eq('is_active', true)
    .single();

  if (data) {
    return { prompt: data.style_prompt, refUrls: data.reference_image_urls || [] };
  }
  // Fallback to original hardcoded style
  return {
    prompt: `Recreate the concept and symbolism of this image in a dark, cyberpunk-crypto style with these brand elements:
- Color scheme: deep blacks, neon orange (#FF6B00), electric cyan accents
- Include subtle blockchain/wallet imagery (hex patterns, node networks)
- Professional, data-driven aesthetic
- HoldersIntel branding feel — like a premium crypto intelligence platform
- Keep the core message/concept of the original but make it uniquely ours
- No text overlay needed`,
    refUrls: [],
  };
}

async function generateImage(LOVABLE_API_KEY: string, originalImageUrl: string, supabase: any): Promise<string | null> {
  const style = await getActiveStylePrompt(supabase);

  const content: any[] = [
    { type: 'text', text: style.prompt },
    { type: 'image_url', image_url: { url: originalImageUrl } },
  ];
  // Include reference images so the AI can match the style
  for (const refUrl of style.refUrls.slice(0, 3)) {
    content.push({ type: 'image_url', image_url: { url: refUrl } });
  }

  const response = await meteredAiFetch("repurpose-content", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-image',
      messages: [{ role: 'user', content }],
      modalities: ['image', 'text'],
    }),
  });

  if (!response.ok) {
    console.warn('Image generation failed:', response.status);
    return null;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.images?.[0]?.image_url?.url || null;
}

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

    const { post_id, draft_id, regenerate, custom_instructions, generate_image } = await req.json();

    // ─── MODE 2: Regenerate existing draft ───
    if (draft_id && regenerate) {
      const { data: draft, error: draftErr } = await supabase
        .from('content_drafts')
        .select('*')
        .eq('id', draft_id)
        .single();

      if (draftErr || !draft) throw new Error('Draft not found');

      console.log(`Regenerating ${regenerate} for draft ${draft_id}`);

      if (regenerate === 'text') {
        const { short, long } = await generateText(LOVABLE_API_KEY, draft.original_text, 'original', custom_instructions);
        await supabase.from('content_drafts').update({
          repurposed_text: `${short}\n\n---\n\n${long}`,
          updated_at: new Date().toISOString(),
        }).eq('id', draft_id);

        return new Response(JSON.stringify({
          success: true,
          draft: { id: draft_id, short_text: short, long_text: long },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (regenerate === 'image') {
        const originalImage = draft.original_image_url;
        if (!originalImage) throw new Error('No original image to regenerate from');

        const rawImage = await generateImage(LOVABLE_API_KEY, originalImage, supabase);
        let imageUrl: string | null = null;

        if (rawImage) {
          imageUrl = await uploadBase64Image(supabase, rawImage, `regen_${draft_id.slice(0, 8)}`);
          if (!imageUrl) imageUrl = rawImage; // fallback to base64 if upload fails
        }

        if (imageUrl) {
          await supabase.from('content_drafts').update({
            repurposed_image_url: imageUrl,
            updated_at: new Date().toISOString(),
          }).eq('id', draft_id);
        }

        return new Response(JSON.stringify({
          success: true,
          draft: { id: draft_id, image_generated: !!imageUrl, repurposed_image_url: imageUrl },
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      throw new Error('regenerate must be "text" or "image"');
    }

    // ─── MODE 1: New repurpose from scraped post ───
    if (!post_id) throw new Error('post_id is required');

    const { data: post, error: postError } = await supabase
      .from('repurpose_scraped_posts')
      .select('*')
      .eq('id', post_id)
      .single();

    if (postError || !post) throw new Error('Post not found');

    console.log(`Repurposing post from @${post.username}: ${post.tweet_text?.slice(0, 80)}...`);

    // Step 1: Repurpose text
    const { short: repurposedText, long: longText } = await generateText(
      LOVABLE_API_KEY, post.tweet_text, post.username, custom_instructions
    );

    // Step 2: Optionally generate + upload image
    let repurposedImageUrl: string | null = null;

    if (generate_image && post.image_urls?.length > 0) {
      const rawImage = await generateImage(LOVABLE_API_KEY, post.image_urls[0], supabase);
      if (rawImage) {
        repurposedImageUrl = await uploadBase64Image(supabase, rawImage, `repurpose_${post_id.slice(0, 8)}`);
        if (!repurposedImageUrl) repurposedImageUrl = rawImage; // fallback
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
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
