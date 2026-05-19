import { createClient } from "https://esm.sh/@supabase/supabase-js@2.54.0";
import { assertInsert } from "../_shared/db-assert.ts";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { articleContent, articleTitle, articleId, articleSlug, articleLabel, imageUsageContext = "gallery", styleImageUrls } = await req.json();

    if (!articleContent) {
      return new Response(
        JSON.stringify({ error: "Article content is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Truncate article to ~2000 chars for prompt context
    const contentSnippet = articleContent.slice(0, 2000);

    // Build style reference description
    const styleContext = styleImageUrls?.length
      ? `Use these existing uploaded images as style/brand guardrails — match their visual tone, color palette, and aesthetic: ${styleImageUrls.slice(0, 5).join(", ")}`
      : "Use a clean, professional crypto/fintech visual style with dark tones and accent colors.";

    const results: { imageUrl: string; prompt: string }[] = [];

    // Generate 3 images with varied prompts
    const angles = [
      "Create a visually striking hero/thumbnail image",
      "Create an abstract conceptual illustration",
      "Create an infographic-style visual summary",
    ];

    for (let i = 0; i < 3; i++) {
      const prompt = `${angles[i]} for a crypto intelligence article titled "${articleTitle || "Untitled"}".

Article excerpt: "${contentSnippet.slice(0, 800)}"

${styleContext}

Requirements:
- 1200x630 aspect ratio (social media thumbnail)
- No placeholder text or lorem ipsum — use real article context
- Bold, editorial feel suitable for a professional crypto research platform
- Make it visually distinct from the other thumbnails in this batch (variation #${i + 1} of 3)`;

      // Build messages — include style images as image_url content if available
      const userContent: any[] = [{ type: "text", text: prompt }];

      if (styleImageUrls?.length) {
        // Include up to 3 style reference images
        for (const url of styleImageUrls.slice(0, 3)) {
          userContent.push({
            type: "image_url",
            image_url: { url },
          });
        }
      }

      try {
        const aiResponse = await meteredAiFetch("generate-gallery-images", "https://ai.gateway.lovable.dev/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3.1-flash-image-preview",
              messages: [
                {
                  role: "user",
                  content: userContent,
                },
              ],
              modalities: ["image", "text"],
            }),
          }
        );

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error(`AI image gen ${i + 1} failed (${aiResponse.status}):`, errText);
          if (aiResponse.status === 429) {
            return new Response(
              JSON.stringify({ error: "Rate limited. Please wait a moment and try again.", partialResults: results }),
              { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          if (aiResponse.status === 402) {
            return new Response(
              JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage.", partialResults: results }),
              { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }
          continue;
        }

        const aiData = await aiResponse.json();
        const imageData = aiData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (!imageData) {
          console.error(`No image in AI response ${i + 1}`);
          continue;
        }

        // Decode base64 and upload to storage
        const base64Content = imageData.replace(/^data:image\/\w+;base64,/, "");
        const imageBytes = Uint8Array.from(atob(base64Content), (c) => c.charCodeAt(0));
        const fileName = `ai_trio_${Date.now()}_${i + 1}.png`;

        const { error: uploadError } = await supabase.storage
          .from("social-gallery")
          .upload(fileName, imageBytes, {
            contentType: "image/png",
            upsert: true,
          });

        if (uploadError) {
          console.error(`Upload error ${i + 1}:`, uploadError);
          continue;
        }

        const { data: urlData } = supabase.storage
          .from("social-gallery")
          .getPublicUrl(fileName);

        if (!urlData?.publicUrl) continue;

        // Insert into gallery as ai_generated
        await assertInsert(supabase.from("social_media_gallery").insert({
          file_name: fileName,
          display_name: `AI Trio - ${articleTitle?.slice(0, 40) || "Article"} #${i + 1}`,
          file_url: urlData.publicUrl,
          source_type: "ai_generated",
          mime_type: "image/png",
          ai_prompt: prompt.slice(0, 500),
          tags: ["trio-generate", "ai-thumbnail"],
          related_article_id: articleId || null,
          related_article_slug: articleSlug || null,
          related_article_title: articleTitle || null,
          related_article_label: articleLabel || null,
          image_usage_context: imageUsageContext,
        }), "social_media_gallery");

        results.push({ imageUrl: urlData.publicUrl, prompt: prompt.slice(0, 200) });
        console.log(`Generated image ${i + 1}/3 successfully`);
      } catch (genErr) {
        console.error(`Generation ${i + 1} error:`, genErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, images: results, count: results.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Trio generate error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? (error as Error).message : "Generation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
