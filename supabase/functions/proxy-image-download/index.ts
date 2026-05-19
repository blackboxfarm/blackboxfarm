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
    // Force JPEG: strip any format param, only accept image/jpeg.
    // DexScreener CDN honours the Accept header when format is absent.
    const candidates: string[] = [];
    try {
      const t = new URL(target);
      t.searchParams.delete("format");
      candidates.push(t.toString());
      // fallback: explicit format=jpg
      const jpg = new URL(t.toString());
      jpg.searchParams.set("format", "jpg");
      candidates.push(jpg.toString());
      // last resort: original untouched
      candidates.push(target);
    } catch {
      candidates.push(target);
    }

    const browserUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    let upstream: Response | null = null;
    let lastStatus = 0;
    for (const cand of candidates) {
      try {
        const r = await fetch(cand, {
          headers: {
            accept: "image/jpeg",
            "user-agent": browserUA,
          },
          redirect: "follow",
        });
        lastStatus = r.status;
        if (r.ok && r.body) {
          const ct = (r.headers.get("content-type") || "").toLowerCase();
          // Only accept jpeg; otherwise try next candidate
          if (ct.includes("jpeg") || ct.includes("jpg")) { upstream = r; break; }
          try { await r.body.cancel(); } catch { /* noop */ }
          continue;
        }
        try { await r.body?.cancel(); } catch { /* noop */ }
      } catch (_) { /* try next */ }
    }
    if (!upstream) {
      return new Response(
        JSON.stringify({ error: "UPSTREAM_FAILED", status: lastStatus, fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    let safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    safeName = safeName.replace(/\.[a-z0-9]+$/i, "") + ".jpg";
    return new Response(upstream.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "image/jpeg",
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (e) {
    return new Response(`Error: ${(e as Error).message}`, { status: 500, headers: corsHeaders });
  }
});