import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Auto-archive a single freshly-queued HoldersIntel token:
 *   1. Compose tweet_text (holders-intel-compose-preview)
 *   2. Fetch DexScreener banner (holders-intel-fetch-banner)
 *   3. Decorate banner (holders-intel-banner-decorate) — best-effort, skipped on failure
 *   4. Flip manual_status -> 'posted_manual' so it shows on Token Archive
 *
 * Invoked by the AFTER INSERT trigger on holders_intel_post_queue via pg_net.
 * Idempotent: skipped if row is already 'posted_manual'.
 */

async function invokeJson(supabaseUrl: string, key: string, fn: string, body: unknown) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${data?.error || text.slice(0, 240)}`);
  return data;
}

function buildFallbackText(row: { token_mint: string; symbol: string | null; name: string | null }) {
  const ticker = (row.symbol || "TOKEN").trim();
  const name = (row.name || ticker).trim();
  return [
    `🔍 ${ticker} Holder Analysis`,
    name && name !== ticker ? name : null,
    "",
    `👉 https://blackbox.farm/holders?token=${row.token_mint}`,
    "",
    "@blackbox_farm @HoldersIntel @Dead_Tokens",
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const queueId: string | null = body.queue_id || null;
    if (!queueId) {
      return new Response(JSON.stringify({ error: "queue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: row, error } = await supabase
      .from("holders_intel_post_queue")
      .select("id, token_mint, symbol, name, tweet_text, dex_banner_url, decorated_banner_url, banner_used_url, manual_status, trigger_source")
      .eq("id", queueId)
      .maybeSingle();
    if (error) throw error;
    if (!row) return new Response(JSON.stringify({ skipped: "not_found" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (row.manual_status === "posted_manual") {
      return new Response(JSON.stringify({ skipped: "already_archived" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Manual admin adds must stay pending so the user can review/compose/post.
    if (row.trigger_source === "manual_admin") {
      return new Response(JSON.stringify({ skipped: "manual_admin_keep_pending" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const notes: string[] = [];
    let current: any = { ...row };

    // 1. Compose tweet text if missing
    if (!current.tweet_text || !String(current.tweet_text).trim()) {
      try {
        const compose = await invokeJson(supabaseUrl, anonKey, "holders-intel-compose-preview", { queue_id: queueId, force_refresh: false });
        const item = (compose?.results || []).find((r: any) => r.id === queueId);
        if (item?.ok) {
          notes.push("composed");
          const { data: refreshed } = await supabase
            .from("holders_intel_post_queue")
            .select("id, token_mint, symbol, name, tweet_text, dex_banner_url, decorated_banner_url, banner_used_url")
            .eq("id", queueId).maybeSingle();
          if (refreshed) current = refreshed;
        } else {
          notes.push(`compose_failed:${item?.error || "unknown"}`);
        }
      } catch (e: any) {
        notes.push(`compose_failed:${e?.message || String(e)}`);
      }
    }

    // 2. Fetch DexScreener banner if missing
    if (!current.dex_banner_url) {
      try {
        await invokeJson(supabaseUrl, anonKey, "holders-intel-fetch-banner", { queue_id: queueId });
        const { data: refreshed } = await supabase
          .from("holders_intel_post_queue")
          .select("dex_banner_url, decorated_banner_url, banner_used_url")
          .eq("id", queueId).maybeSingle();
        if (refreshed) Object.assign(current, refreshed);
        notes.push("banner_fetched");
      } catch (e: any) {
        notes.push(`banner_failed:${e?.message || String(e)}`);
      }
    }

    // [skipped — banners are manual-only] auto decorate disabled to preserve AI credits.
    notes.push("decorate_skipped:manual-only");

    // 4. Promote to archive
    const tweetText = (current.tweet_text || "").trim() || buildFallbackText(current);
    const bannerUsed = current.decorated_banner_url || current.banner_used_url || current.dex_banner_url || null;
    await assertUpdate(
      supabase.from("holders_intel_post_queue").update({
        tweet_text: tweetText,
        manual_status: "posted_manual",
        manual_posted_at: new Date().toISOString(),
        manual_tweet_url: null,
        posted_handle: "HoldersIntel",
        banner_used_url: bannerUsed,
        error_message: null,
      }).eq("id", queueId),
      "holders_intel_post_queue",
    );

    return new Response(JSON.stringify({ success: true, queue_id: queueId, notes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[holders-intel-auto-archive] error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});