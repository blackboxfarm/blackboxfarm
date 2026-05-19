// Generates a 1.91:1 (1200x628) social-share card from an article's hero image.
// Recomposes the hero via Gemini image-edit so Twitter/Facebook/LinkedIn previews
// don't crop critical content from the 2:1 hero. Writes URL back to intel_briefings.
import { createClient } from "npm:@supabase/supabase-js@2";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOCIAL_BUCKET = "intel-images";
const SOCIAL_PREFIX = "social-cards";

const EDIT_PROMPT = `Recompose this image into a 1.91:1 horizontal social-share card (1200x628).
CRITICAL RULES:
- Keep all important content (titles, logos, focal subject) inside the centered safe zone (inner ~1000x500 region).
- Do NOT add any new text. Preserve existing text if present, but only when it fits inside the safe zone — never along the edges.
- Avoid placing critical elements in the bottom-left 30% (Twitter overlays a title bar there).
- Use the original image's visual style, colors, and subject matter. Extend or fill edges naturally if reframing is needed.
- Output must be a clean, high-contrast composition that previews well on social media at small sizes.`;

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`hero fetch failed: ${res.status}`);
  const ct = res.headers.get("content-type") || "image/png";
  const buf = new Uint8Array(await res.arrayBuffer());
  // base64 in chunks
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) {
    bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  }
  return `data:${ct};base64,${btoa(bin)}`;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("invalid data url");
  const bin = atob(m[2]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return { bytes: out, mime: m[1] };
}

async function generateSocialCard(heroUrl: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const heroDataUrl = await fetchAsDataUrl(heroUrl);

  const aiRes = await meteredAiFetch("generate-intel-social-card", "https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EDIT_PROMPT },
            { type: "image_url", image_url: { url: heroDataUrl } },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!aiRes.ok) {
    const txt = await aiRes.text();
    throw new Error(`AI gateway ${aiRes.status}: ${txt.slice(0, 300)}`);
  }
  const json = await aiRes.json();
  const outUrl: string | undefined =
    json?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!outUrl) throw new Error("no image returned from AI gateway");
  return dataUrlToBytes(outUrl);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const slug: string | undefined = body.slug;
    const slugs: string[] | undefined = body.slugs;
    const all: boolean = !!body.all;
    const force: boolean = !!body.force;

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    let query = supabase
      .from("intel_briefings")
      .select("id, slug, featured_image_url, social_image_url")
      .eq("is_published", true);

    if (slug) query = query.eq("slug", slug);
    else if (slugs?.length) query = query.in("slug", slugs);
    else if (!all) {
      return new Response(JSON.stringify({ error: "must pass slug, slugs[], or all=true" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: articles, error } = await query;
    if (error) throw error;
    if (!articles?.length) {
      return new Response(JSON.stringify({ ok: true, processed: 0, results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ slug: string; status: string; url?: string; error?: string }> = [];

    for (const article of articles) {
      try {
        if (!article.featured_image_url) {
          results.push({ slug: article.slug, status: "skipped_no_hero" });
          continue;
        }
        if (!force && article.social_image_url) {
          results.push({ slug: article.slug, status: "skipped_exists", url: article.social_image_url });
          continue;
        }

        const { bytes, mime } = await generateSocialCard(article.featured_image_url);
        const ext = mime.includes("jpeg") ? "jpg" : "png";
        const key = `${SOCIAL_PREFIX}/${article.slug}-${Date.now()}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from(SOCIAL_BUCKET)
          .upload(key, bytes, { contentType: mime, upsert: true });
        if (upErr) throw new Error(`upload: ${upErr.message}`);

        const { data: pub } = supabase.storage.from(SOCIAL_BUCKET).getPublicUrl(key);
        const publicUrl = pub.publicUrl;

        const { error: updErr } = await supabase
          .from("intel_briefings")
          .update({
            social_image_url: publicUrl,
            social_image_generated_at: new Date().toISOString(),
          })
          .eq("id", article.id);
        if (updErr) throw new Error(`db update: ${updErr.message}`);

        results.push({ slug: article.slug, status: "ok", url: publicUrl });
      } catch (e: any) {
        console.error(`[social-card] ${article.slug} failed:`, e.message);
        results.push({ slug: article.slug, status: "error", error: e.message });
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[generate-intel-social-card] fatal:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});