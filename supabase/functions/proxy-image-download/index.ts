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
    // Build candidate URLs. DexScreener CDN 500s on format=jpg, so try original first,
    // then a png variant, then strip format entirely.
    const candidates: string[] = [target];
    try {
      const t = new URL(target);
      if (/(^|\.)dexscreener\.com$/i.test(t.hostname) && t.searchParams.has("format")) {
        const noFmt = new URL(target);
        noFmt.searchParams.delete("format");
        candidates.push(noFmt.toString());
        const pngFmt = new URL(target);
        pngFmt.searchParams.set("format", "png");
        candidates.push(pngFmt.toString());
      }
    } catch { /* ignore */ }

    const browserUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    let upstream: Response | null = null;
    let lastStatus = 0;
    for (const cand of candidates) {
      try {
        const r = await fetch(cand, {
          headers: {
            accept: "image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8",
            "user-agent": browserUA,
            referer: "https://dexscreener.com/",
          },
          redirect: "follow",
        });
        lastStatus = r.status;
        if (r.ok && r.body) { upstream = r; break; }
        try { await r.body?.cancel(); } catch { /* noop */ }
      } catch (_) { /* try next */ }
    }
    if (!upstream) {
      return new Response(
        JSON.stringify({ error: "UPSTREAM_FAILED", status: lastStatus, fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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