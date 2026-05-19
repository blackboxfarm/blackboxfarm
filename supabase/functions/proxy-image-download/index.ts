const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const target = url.searchParams.get("url");
    const filename = url.searchParams.get("filename") || "download.jpg";
    if (!target || !/^https?:\/\//i.test(target)) {
      return new Response("Missing or invalid url", { status: 400, headers: corsHeaders });
    }
    const upstream = await fetch(target, {
      headers: { accept: "image/*,*/*;q=0.8" },
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream ${upstream.status}`, { status: 502, headers: corsHeaders });
    }
    const ct = upstream.headers.get("content-type") || "image/jpeg";
    const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": ct,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});