import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://apxauapuusmgwbbzjgfl.supabase.co";
const STORAGE_BASE = `${SUPABASE_URL}/storage/v1/object/public/OG`;
const DEFAULT_OG_IMAGE = `${STORAGE_BASE}/holders_og.png`;

function slugifyVersion(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchImage(url: string): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // Some CDNs behave better with an explicit Accept
        "accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });

    const ct = res.headers.get("content-type") || "";
    if (!res.ok) return null;
    if (!ct.toLowerCase().startsWith("image/")) return null;
    return res;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const tokenParam = url.searchParams.get("token");
    const versionParam = url.searchParams.get("v");

    // Initialize Supabase client (service role, read-only intent)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let ogImageUpstream = DEFAULT_OG_IMAGE;
    let ogSource = "default";

    // Priority 0/1: token-specific images
    if (tokenParam) {
      const { data: seenToken } = await supabase
        .from("holders_intel_seen_tokens")
        .select("paid_composite_url, banner_url")
        .eq("token_mint", tokenParam)
        .maybeSingle();

      if (seenToken?.paid_composite_url) {
        ogImageUpstream = seenToken.paid_composite_url;
        ogSource = "composite";
      } else if (seenToken?.banner_url) {
        ogImageUpstream = seenToken.banner_url;
        ogSource = "banner";
      } else {
        const { data: tokenBanner } = await supabase
          .from("token_banners")
          .select("banner_url")
          .eq("token_address", tokenParam)
          .eq("is_active", true)
          .maybeSingle();

        if (tokenBanner?.banner_url) {
          ogImageUpstream = tokenBanner.banner_url;
          ogSource = "banner";
        }
      }
    }

    // Priority 2: versioned promotional OG (non-token)
    if (!tokenParam && versionParam) {
      const safeV = slugifyVersion(versionParam);
      if (safeV) {
        const versionedImageUrl = `${STORAGE_BASE}/holders_og_${safeV}.png`;
        if (await headOk(versionedImageUrl)) {
          ogImageUpstream = versionedImageUrl;
          ogSource = "versioned";
        }
      }
    }

    // Fetch upstream server-to-server; fallback to default if upstream is blocked/invalid
    const upstreamRes = (await fetchImage(ogImageUpstream)) ?? (await fetchImage(DEFAULT_OG_IMAGE));

    if (!upstreamRes) {
      return new Response("OG image fetch failed", {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const contentType = upstreamRes.headers.get("content-type") || "image/png";

    return new Response(upstreamRes.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=300",
        "X-Debug-OG-Source": ogSource,
        "X-Debug-OG-Upstream": ogImageUpstream.slice(-100),
      },
    });
  } catch (e) {
    console.error("holders-og-image error:", e);
    return new Response("Internal error", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
});
