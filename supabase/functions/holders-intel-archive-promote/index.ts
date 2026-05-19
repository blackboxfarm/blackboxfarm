import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { assertUpdate } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type QueueRow = {
  id: string;
  token_mint: string;
  symbol: string | null;
  name: string | null;
  created_at: string;
  tweet_text: string | null;
  dex_banner_url: string | null;
  decorated_banner_url: string | null;
  banner_used_url: string | null;
};

function cleanLimit(value: unknown): number {
  const n = Number(value ?? 500);
  if (!Number.isFinite(n)) return 500;
  return Math.max(1, Math.min(500, Math.floor(n)));
}

function buildFallbackText(row: QueueRow): string {
  const ticker = (row.symbol || "TOKEN").trim();
  const name = (row.name || ticker).trim();
  return [
    `🔍 ${ticker} Holder Analysis`,
    name && name !== ticker ? name : null,
    "",
    `👉 https://blackbox.farm/holders?token=${row.token_mint}`,
    "",
    "@blackbox_farm @HoldersIntel @Dead_Tokens",
  ].filter((line) => line !== null).join("\n");
}

async function invokeJson(supabaseUrl: string, anonKey: string, fn: string, body: unknown) {
  const res = await fetch(`${supabaseUrl}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${anonKey}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`${fn} ${res.status}: ${data?.error || text.slice(0, 240)}`);
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const limit = cleanLimit(body.limit);
    const decorateLimit = Math.max(0, Math.min(25, Number(body.decorateLimit ?? 0) || 0));
    const composeMissing = body.composeMissing !== false;
    const archiveExistingOnly = body.archiveExistingOnly === true;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || serviceKey;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isSuperAdmin, error: adminErr } = await supabase.rpc("is_super_admin", { _user_id: userData.user.id });
    if (adminErr || isSuperAdmin !== true) {
      return new Response(JSON.stringify({ error: "Super Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let query = supabase
      .from("holders_intel_post_queue")
      .select("id, token_mint, symbol, name, created_at, tweet_text, dex_banner_url, decorated_banner_url, banner_used_url")
      .eq("manual_status", "pending")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (archiveExistingOnly) {
      query = query.not("tweet_text", "is", null);
    }

    const { data: rows, error } = await query;
    if (error) throw error;

    if (archiveExistingOnly) {
      const ids = ((rows || []) as QueueRow[]).map((row) => row.id);
      if (ids.length > 0) {
        await assertUpdate(
          supabase
            .from("holders_intel_post_queue")
            .update({
              manual_status: "posted_manual",
              manual_posted_at: new Date().toISOString(),
              manual_tweet_url: null,
              posted_handle: "HoldersIntel",
              error_message: null,
            })
            .in("id", ids),
          "holders_intel_post_queue",
        );
      }

      return new Response(JSON.stringify({
        success: true,
        mode: "archive_existing_only",
        selected: ids.length,
        promoted: ids.length,
        composed: 0,
        decorated: 0,
        failed: 0,
        results: ((rows || []) as QueueRow[]).map((row) => ({
          id: row.id,
          token_mint: row.token_mint,
          symbol: row.symbol,
          ok: true,
          notes: ["bulk_archived"],
        })),
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const results: any[] = [];
    let promoted = 0;
    let composed = 0;
    let decorated = 0;
    let failed = 0;

    for (const row of (rows || []) as QueueRow[]) {
      const notes: string[] = [];
      try {
        let current = { ...row };

        if (composeMissing && (!current.tweet_text || !current.tweet_text.trim())) {
          try {
            const compose = await invokeJson(supabaseUrl, anonKey, "holders-intel-compose-preview", { queue_id: current.id, force_refresh: false });
            const item = (compose?.results || []).find((r: any) => r.id === current.id);
            if (item?.ok) {
              composed++;
              notes.push("composed");
              const { data: refreshed, error: refreshErr } = await supabase
                .from("holders_intel_post_queue")
                .select("id, token_mint, symbol, name, created_at, tweet_text, dex_banner_url, decorated_banner_url, banner_used_url")
                .eq("id", current.id)
                .maybeSingle();
              if (refreshErr) throw refreshErr;
              if (refreshed) current = refreshed as QueueRow;
            } else {
              notes.push(`compose_failed:${item?.error || "unknown"}`);
            }
          } catch (e: any) {
            notes.push(`compose_failed:${e?.message || String(e)}`);
          }
        }

        // [skipped — banners are manual-only] auto decorate disabled to preserve AI credits.
        notes.push("decorate_skipped:manual-only");

        const tweetText = current.tweet_text?.trim() || buildFallbackText(current);
        const bannerUsed = current.decorated_banner_url || current.banner_used_url || current.dex_banner_url || null;
        await assertUpdate(
          supabase
            .from("holders_intel_post_queue")
            .update({
              tweet_text: tweetText,
              manual_status: "posted_manual",
              manual_posted_at: new Date().toISOString(),
              manual_tweet_url: null,
              posted_handle: "HoldersIntel",
              banner_used_url: bannerUsed,
              error_message: null,
            })
            .eq("id", current.id),
          "holders_intel_post_queue",
        );

        promoted++;
        results.push({ id: current.id, token_mint: current.token_mint, symbol: current.symbol, ok: true, notes });
      } catch (e: any) {
        failed++;
        results.push({ id: row.id, token_mint: row.token_mint, symbol: row.symbol, ok: false, error: e?.message || String(e), notes });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      selected: rows?.length || 0,
      promoted,
      composed,
      decorated,
      failed,
      results,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("[holders-intel-archive-promote] error:", e);
    return new Response(JSON.stringify({ error: e?.message || String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
