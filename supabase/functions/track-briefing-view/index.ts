import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyUserAgent, parseReferrerSource } from "../_shared/bot-detector.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * track-briefing-view
 * --------------------
 * Server-side replacement for the broken browser-side insert into
 * intel_briefing_views. Runs as service_role so RLS allows the write.
 *
 * - Classifies UA → human / crawler / ai_bot
 * - Captures IP from forwarded headers
 * - Parses referrer hostname → referrer_source (instagram.com, facebook.com…)
 * - Captures utm_source / utm_medium / utm_campaign from the page URL
 * - Per-session dedup: skip if same (briefing_id, session_id) seen in last 30 min
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const briefing_id: string | undefined = body.briefing_id;
    const slug: string | undefined = body.slug;
    const session_id: string | undefined = body.session_id;
    const clientReferer: string | undefined = body.referer;
    const search: string | undefined = body.search; // e.g. "?utm_source=ig&utm_campaign=nov19"

    if (!briefing_id || !slug) {
      return json({ error: "briefing_id and slug required" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false },
    });

    // Classify UA
    const ua = req.headers.get("user-agent") || "";
    const { visitorType, botName } = classifyUserAgent(ua);

    // IP
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("cf-connecting-ip")
      || req.headers.get("x-real-ip")
      || null;

    // Referrer parsing — prefer client-supplied document.referrer, fall back to header.
    const refererHeader = req.headers.get("referer") || null;
    const effectiveReferer = clientReferer || refererHeader;
    const referrerSource = parseReferrerSource(effectiveReferer);

    // UTM extraction
    let utm_source: string | null = null;
    let utm_medium: string | null = null;
    let utm_campaign: string | null = null;
    if (search) {
      try {
        const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
        utm_source = params.get("utm_source");
        utm_medium = params.get("utm_medium");
        utm_campaign = params.get("utm_campaign");
      } catch {
        // ignore malformed search string
      }
    }

    // Per-session dedup (30 min window) — only when we have a session_id
    if (session_id) {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: existing } = await supabase
        .from("intel_briefing_views")
        .select("id")
        .eq("briefing_id", briefing_id)
        .eq("session_id", session_id)
        .gte("created_at", cutoff)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return json({ ok: true, deduped: true });
      }
    }

    const insertPayload = {
      briefing_id,
      slug,
      visitor_type: visitorType,
      bot_name: botName,
      user_agent: ua.slice(0, 500),
      ip_address: ipAddress,
      referer: (effectiveReferer || "").slice(0, 500) || null,
      referrer_source: referrerSource,
      utm_source: utm_source?.slice(0, 100) || null,
      utm_medium: utm_medium?.slice(0, 100) || null,
      utm_campaign: utm_campaign?.slice(0, 100) || null,
      session_id: session_id || null,
    };

    const { error: insErr } = await supabase
      .from("intel_briefing_views")
      .insert(insertPayload);

    if (insErr) {
      // Per zero-tolerance silent-fails policy: throw, do not swallow.
      console.error("[track-briefing-view] insert failed:", insErr.message, insertPayload);
      return json({ error: insErr.message }, 500);
    }

    return json({ ok: true, visitor_type: visitorType, referrer_source: referrerSource });
  } catch (err) {
    console.error("[track-briefing-view] error:", err);
    return json({ error: (err as Error).message || "internal error" }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}