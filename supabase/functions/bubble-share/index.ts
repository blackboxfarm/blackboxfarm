import { createClient } from "npm:@supabase/supabase-js@2";

const SITE_URL = "https://blackbox.farm";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanTicker(t?: string | null): string {
  if (!t) return "TOKEN";
  return String(t).replace(/^\$+/, "").trim() || "TOKEN";
}

function isCrawler(ua: string): boolean {
  const s = ua.toLowerCase();
  return /(twitterbot|facebookexternalhit|facebot|linkedinbot|slackbot|discordbot|telegrambot|whatsapp|skypeuripreview|googlebot|bingbot|duckduckbot|embedly|redditbot|pinterest|applebot|opengraph)/i.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Snapshot id may arrive as ?id=... or as the trailing path segment
    let id = url.searchParams.get("id");
    if (!id) {
      const parts = url.pathname.split("/").filter(Boolean);
      id = parts[parts.length - 1] || null;
    }
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      return new Response("Missing or invalid snapshot id", { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: snap, error } = await supabase
      .from("bubble_snapshots")
      .select("id, token_address, ticker, view_mode, public_url, commentary, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error || !snap) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: `${SITE_URL}/bubblemap` },
      });
    }

    const ticker = cleanTicker(snap.ticker);
    const viewLabel = snap.view_mode === "schematic" ? "Schematic Mesh" : "Holder Mesh";
    const title = `$${ticker} — ${viewLabel} · BlackBox.farm`;
    const description =
      (snap.commentary && String(snap.commentary).slice(0, 200)) ||
      `Holder Mesh snapshot for $${ticker}. Mapped on @BlackBox_Farm.`;
    const ogImage = snap.public_url;
    const targetApp = `${SITE_URL}/bubblemap?token=${encodeURIComponent(snap.token_address)}`;
    const canonical = `${SITE_URL}/bubble-snapshot/${snap.id}`;

    const ua = req.headers.get("user-agent") || "";
    const crawler = isCrawler(ua);

    // Humans → bounce straight to the live bubblemap for that token.
    if (!crawler) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: targetApp },
      });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonical)}" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="BlackBox.farm" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(ogImage)}" />
<meta property="og:image:secure_url" content="${esc(ogImage)}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="675" />
<meta property="og:image:alt" content="${esc(`$${ticker} ${viewLabel} snapshot`)}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@BlackBox_Farm" />
<meta name="twitter:creator" content="@BlackBox_Farm" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<meta name="twitter:image:alt" content="${esc(`$${ticker} ${viewLabel} snapshot`)}" />

<meta http-equiv="refresh" content="0; url=${esc(targetApp)}" />
</head>
<body style="background:#0a0a0f;color:#eee;font-family:system-ui,-apple-system,sans-serif;text-align:center;padding:48px;">
  <p>Loading <a style="color:#eab308" href="${esc(targetApp)}">$${esc(ticker)} ${esc(viewLabel)}</a>…</p>
  <img src="${esc(ogImage)}" alt="${esc(`$${ticker} ${viewLabel}`)}" style="max-width:100%;height:auto;border:1px solid rgba(234,179,8,.4);border-radius:8px;margin-top:24px;" />
</body>
</html>`;

    return new Response(html, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bubble-share] error", msg);
    return new Response(`Error: ${msg}`, { status: 500, headers: corsHeaders });
  }
});