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
    // Force JPEG on DexScreener CDN (format=auto returns AVIF which X rejects)
    let fetchUrl = target;
    try {
      const t = new URL(target);
      if (/(^|\.)dexscreener\.com$/i.test(t.hostname)) {
        t.searchParams.set("format", "jpg");
        fetchUrl = t.toString();
      }
    } catch { /* ignore */ }
    const upstream = await fetch(fetchUrl, {
      // Accept only formats X supports — avoid AVIF
      headers: {
        accept: "image/jpeg,image/png,image/gif",
        "user-agent": "Mozilla/5.0 (compatible; HoldersIntelProxy/1.0)",
        referer: new URL(fetchUrl).origin + "/",
      },
      redirect: "follow",
    });
    if (!upstream.ok || !upstream.body) {
      return new Response(`Upstream ${upstream.status}`, { status: 502, headers: corsHeaders });
    }
    let ct = upstream.headers.get("content-type") || "image/jpeg";
    // If the CDN still returned AVIF/WebP, lie about the content-type only if filename forces jpg —
    // better: surface the real type but rename file so OS picks the right viewer.
    let safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    if (/avif/i.test(ct)) safeName = safeName.replace(/\.[a-z0-9]+$/i, "") + ".avif";
    else if (/webp/i.test(ct)) safeName = safeName.replace(/\.[a-z0-9]+$/i, "") + ".webp";
    else if (/png/i.test(ct)) safeName = safeName.replace(/\.[a-z0-9]+$/i, "") + ".png";
    else safeName = safeName.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
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