import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { ingestPublicCAQuery } from "../_shared/mesh-ingest.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAILY_LIMIT_ANON = 1;
const DAILY_LIMIT_FREE_AUTH = 3;

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    "unknown"
  );
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function failOpen(reason: string, limit: number) {
  // Per project policy: fail-open. Never block a legitimate user because of infra hiccups.
  return new Response(
    JSON.stringify({
      allowed: true,
      remaining: limit,
      limit,
      reason: `fail-open:${reason}`,
      degraded: true,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: {
    visitorId?: string;
    action?: "check" | "consume";
    tier?: "anon" | "free" | "pro";
    mint?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const tier = body.tier === "pro" || body.tier === "free" ? body.tier : "anon";
  const action = body.action === "consume" ? "consume" : "check";
  const limit = tier === "pro" ? Number.POSITIVE_INFINITY : tier === "free" ? DAILY_LIMIT_FREE_AUTH : DAILY_LIMIT_ANON;
  const mint = typeof body.mint === "string" ? body.mint.trim() : "";

  // Pro: unlimited, never tracked here.
  if (tier === "pro") {
    // Pro users still feed the mesh — fire-and-forget ingest if a mint was provided.
    if (mint) {
      try {
        const sbUrl = Deno.env.get("SUPABASE_URL");
        const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (sbUrl && sbKey) {
          const sbProIngest = createClient(sbUrl, sbKey, { auth: { persistSession: false } });
          ingestPublicCAQuery(sbProIngest, { mint, source: "web:/bubblemap" });
        }
      } catch { /* fail-open */ }
    }
    return new Response(
      JSON.stringify({ allowed: true, remaining: -1, limit: -1, reason: "pro" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Free authenticated users are still bounded; we count them too but key by visitorId only.
  const ip = getClientIp(req);
  const visitorId = (body.visitorId || "").slice(0, 128) || "no-vid";
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 80);

  let identifierHash: string;
  let ipHash: string;
  let visitorHash: string;
  try {
    const salt = Deno.env.get("BUBBLE_QUOTA_SALT") || "bbf-default-salt-v1";
    ipHash = await sha256Hex(`${salt}|ip|${ip}`);
    visitorHash = await sha256Hex(`${salt}|vid|${visitorId}`);
    identifierHash = await sha256Hex(`${salt}|id|${ip}|${visitorId}|${tier}`);
  } catch (e) {
    return failOpen("hash", Number.isFinite(limit) ? (limit as number) : 1);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!supabaseUrl || !serviceKey) return failOpen("env", limit as number);

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const day = todayUTC();

  try {
    // Read current count
    const { data: row, error: readErr } = await sb
      .from("bubble_map_anon_usage")
      .select("count")
      .eq("identifier_hash", identifierHash)
      .eq("day", day)
      .maybeSingle();
    if (readErr) {
      console.warn("[check-bubble-quota] read err:", readErr.message);
      return failOpen("read", limit as number);
    }

    const currentCount = row?.count ?? 0;
    const remainingNow = Math.max(0, (limit as number) - currentCount);

    if (action === "check") {
      return new Response(
        JSON.stringify({
          allowed: remainingNow > 0,
          remaining: remainingNow,
          limit,
          reason: remainingNow > 0 ? "ok" : "exhausted",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // consume
    if (remainingNow <= 0) {
      return new Response(
        JSON.stringify({ allowed: false, remaining: 0, limit, reason: "exhausted" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const newCount = currentCount + 1;
    const { error: upErr } = await sb
      .from("bubble_map_anon_usage")
      .upsert(
        {
          identifier_hash: identifierHash,
          ip_hash: ipHash,
          visitor_hash: visitorHash,
          day,
          count: newCount,
          user_agent_short: userAgent,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "identifier_hash,day" },
      );
    if (upErr) {
      console.warn("[check-bubble-quota] upsert err:", upErr.message);
      return failOpen("write", limit as number);
    }

    // Fire-and-forget: stamp the token in the public-demand mesh.
    if (mint) {
      ingestPublicCAQuery(sb, { mint, source: "web:/bubblemap" });
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        remaining: Math.max(0, (limit as number) - newCount),
        limit,
        reason: "consumed",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[check-bubble-quota] fatal:", (e as Error).message);
    return failOpen("exception", limit as number);
  }
});