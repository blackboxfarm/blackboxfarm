import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PUBLIC_BASE = "https://blackbox.farm";

function buildAddendum(slug: string): string {
  return `\n\n⚰️ This coin is dead IMHO.\nFull forensic autopsy → ${PUBLIC_BASE}/autopsy/${slug}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { queue_id } = await req.json().catch(() => ({}));
    if (!queue_id) {
      return new Response(JSON.stringify({ error: "queue_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Identify caller (best-effort)
    let userId: string | null = null;
    const auth = req.headers.get("Authorization");
    if (auth) {
      const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      });
      const { data: u } = await anon.auth.getUser();
      userId = u?.user?.id ?? null;
    }

    // 1. Load queue row
    const { data: row, error: rowErr } = await supabase
      .from("holders_intel_post_queue")
      .select("id, token_mint, symbol, name, tweet_text, autopsy_slug")
      .eq("id", queue_id)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) throw new Error("queue row not found");

    const tokenMint = row.token_mint as string;
    const ticker = (row.symbol as string | null) ?? null;
    const tokenName = (row.name as string | null) ?? null;

    // 2. Upsert autopsy_candidate, force pending so writer re-processes
    const { data: candUp, error: candErr } = await supabase
      .from("autopsy_candidates")
      .upsert(
        {
          token_mint: tokenMint,
          ticker,
          token_name: tokenName,
          source_feed: "admin_manual",
          status: "pending",
        },
        { onConflict: "token_mint" }
      )
      .select("id")
      .single();
    if (candErr) throw candErr;
    const candidateId = candUp.id as string;

    // Force back to pending if upsert kept old terminal status
    await supabase
      .from("autopsy_candidates")
      .update({ status: "pending" })
      .eq("id", candidateId);

    // 3. Kick off autopsy-writer (now returns 202 immediately and runs in background)
    const writerRes = await fetch(`${supabaseUrl}/functions/v1/autopsy-writer`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ candidate_id: candidateId }),
    });
    if (!writerRes.ok && writerRes.status !== 202) {
      const t = await writerRes.text().catch(() => "");
      throw new Error(`autopsy-writer ${writerRes.status}: ${t.slice(0, 300)}`);
    }
    await writerRes.text().catch(() => "");

    // Poll autopsy_reports for the slug (writer runs in background, up to ~120s)
    let slug: string | null = null;
    const startedAt = Date.now();
    while (Date.now() - startedAt < 120_000) {
      const { data: rep } = await supabase
        .from("autopsy_reports")
        .select("slug, created_at")
        .eq("token_mint", tokenMint)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (rep?.slug) { slug = rep.slug as string; break; }

      // Bail early if writer marked the candidate as failed
      const { data: cand } = await supabase
        .from("autopsy_candidates")
        .select("status, status_reason")
        .eq("id", candidateId)
        .maybeSingle();
      if (cand?.status === "failed") {
        throw new Error(`autopsy-writer failed: ${cand.status_reason ?? "unknown"}`);
      }

      await new Promise((r) => setTimeout(r, 3000));
    }
    if (!slug) throw new Error("autopsy-writer timed out (no slug after 120s)");

    // 4. Force-approve report
    await supabase
      .from("autopsy_reports")
      .update({ status: "approved", published_at: new Date().toISOString() })
      .eq("slug", slug);

    // 5. Re-run banner overlay (best-effort)
    let bannerWarning: string | null = null;
    try {
      const bannerRes = await fetch(`${supabaseUrl}/functions/v1/autopsy-banner-overlay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
        body: JSON.stringify({ slug, force: true }),
      });
      if (!bannerRes.ok) {
        bannerWarning = `banner ${bannerRes.status}`;
      }
    } catch (e: any) {
      bannerWarning = e?.message || String(e);
    }

    // Re-read hero image
    const { data: finalRep } = await supabase
      .from("autopsy_reports")
      .select("hero_image_path")
      .eq("slug", slug)
      .maybeSingle();
    const heroImage = (finalRep?.hero_image_path as string | null) ?? null;

    const autopsyUrl = `${PUBLIC_BASE}/autopsy/${slug}`;

    // 6. Append addendum to tweet_text (idempotent)
    const existing = (row.tweet_text as string | null) || "";
    const newTweet = existing.includes(slug)
      ? existing
      : (existing + buildAddendum(slug)).trim();

    // 7. Persist linkage + tweet
    const { error: updErr } = await supabase
      .from("holders_intel_post_queue")
      .update({
        tweet_text: newTweet,
        autopsy_slug: slug,
        autopsy_url: autopsyUrl,
        autopsy_hero_image: heroImage,
        autopsy_triggered_at: new Date().toISOString(),
        autopsy_triggered_by: userId,
      })
      .eq("id", queue_id);
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({
        success: true,
        slug,
        autopsy_url: autopsyUrl,
        hero_image_path: heroImage,
        tweet_text: newTweet,
        warning: bannerWarning,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[holders-intel-autopsy-now] error:", err);
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});