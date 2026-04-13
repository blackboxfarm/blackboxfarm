import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

const BASE_URL = "https://blackbox.farm";

serve(async () => {
  try {
    const { data: articles, error } = await supabase
      .from("intel_briefings")
      .select("slug, updated_at, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (error) {
      console.error("[sitemap-articles] DB error:", error);
      return new Response("Internal error", { status: 500 });
    }

    const urls = (articles || []).map((a) => {
      const lastmod = (a.updated_at || a.published_at || new Date().toISOString()).split("T")[0];
      return `  <url>
    <loc>${BASE_URL}/intel/briefing/${a.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[sitemap-articles] error:", e);
    return new Response("Internal error", { status: 500 });
  }
});
