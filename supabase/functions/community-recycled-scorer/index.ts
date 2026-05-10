import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { evaluateCommunity, BAND_LABEL } from "../_shared/community-rules.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PAID_TIERS = new Set(["x_subscriber", "pro", "dev", "enterprise"]);

interface ReqBody {
  mode: "evaluate" | "read" | "evaluate_recent" | "evaluate_for_token";
  community_id?: string;
  token_mint?: string; // optional override for which "fresh token" to evaluate against
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

async function getCallerTier(authHeader: string | null): Promise<string> {
  if (!authHeader) return "free";
  const token = authHeader.replace("Bearer ", "");
  const { data: userData } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (!userId) return "free";
  const { data: subs } = await supabase
    .from("web_user_subscriptions")
    .select("tier_key, expires_at, is_active")
    .eq("user_id", userId)
    .eq("is_active", true);
  if (!subs || subs.length === 0) return "auth";
  const now = Date.now();
  for (const s of subs) {
    if (s.expires_at && new Date(s.expires_at).getTime() < now) continue;
    if (PAID_TIERS.has(s.tier_key)) return s.tier_key;
  }
  return "auth";
}

async function evaluateOne(communityId: string, tokenMintOverride?: string) {
  const { data: comm, error } = await supabase
    .from("x_communities")
    .select(
      "community_id, created_at_x, name_history, is_renamed, member_count, admin_usernames, linked_token_mints",
    )
    .eq("community_id", communityId)
    .maybeSingle();
  if (error) throw error;
  if (!comm) throw new Error(`Community not found: ${communityId}`);

  // Pick the token to compare against — explicit override, else newest linked mint
  let freshMint = tokenMintOverride;
  if (!freshMint && comm.linked_token_mints && comm.linked_token_mints.length > 0) {
    const { data: tokens } = await supabase
      .from("developer_tokens")
      .select("token_mint, launch_date")
      .in("token_mint", comm.linked_token_mints)
      .order("launch_date", { ascending: false })
      .limit(1);
    if (tokens && tokens.length > 0) freshMint = tokens[0].token_mint;
  }

  let tokenMintAt: string | null = null;
  let holderCount: number | null = null;
  if (freshMint) {
    const { data: dt } = await supabase
      .from("developer_tokens")
      .select("launch_date, holder_count")
      .eq("token_mint", freshMint)
      .maybeSingle();
    if (dt) {
      tokenMintAt = dt.launch_date;
      holderCount = dt.holder_count ?? null;
    }
  }

  // Outcomes view
  const { data: outcome } = await supabase
    .from("v_community_token_outcomes")
    .select("linked_token_count, dead_rate_pct")
    .eq("community_id", communityId)
    .maybeSingle();

  // Admin → dev profile join
  const { data: adminLinks } = await supabase
    .from("v_community_admin_dev_link")
    .select("admin_handle, admin_wallet, prior_tokens, prior_failures")
    .eq("community_id", communityId);

  const maxPriorFailures = (adminLinks ?? []).reduce(
    (m: number, r: any) => Math.max(m, r.prior_failures ?? 0),
    0,
  );
  const maxPriorTokens = (adminLinks ?? []).reduce(
    (m: number, r: any) => Math.max(m, r.prior_tokens ?? 0),
    0,
  );

  // name_history is stored as jsonb array of {name, changed_at}
  const nameHistoryRaw: any[] = Array.isArray(comm.name_history) ? comm.name_history : [];
  const renameEvents = nameHistoryRaw
    .filter((n: any) => n && (n.changed_at || n.at))
    .map((n: any) => ({ at: n.changed_at || n.at }));

  const result = evaluateCommunity({
    community_created_at: comm.created_at_x,
    token_mint_at: tokenMintAt,
    member_count: comm.member_count,
    holder_count: holderCount,
    name_history_count: nameHistoryRaw.length,
    rename_events: renameEvents,
    prior_dead_rate_pct: outcome?.dead_rate_pct ?? 0,
    prior_linked_token_count: outcome?.linked_token_count ?? 0,
    admin_prior_failures: maxPriorFailures,
    admin_prior_tokens: maxPriorTokens,
  });

  const evaluated_at = new Date().toISOString();
  await supabase
    .from("x_communities")
    .update({
      recycled_score: result.score,
      recycled_band: result.band,
      recycled_signals: result.signals as any,
      recycled_evaluated_at: evaluated_at,
    })
    .eq("community_id", communityId);

  // Mesh tagging when likely/confirmed
  if ((result.band === "likely" || result.band === "confirmed") && freshMint) {
    await supabase.from("reputation_mesh").upsert(
      [
        {
          source_type: "token",
          source_id: freshMint,
          linked_type: "x_community",
          linked_id: communityId,
          relationship: "recycled_community_vehicle",
          confidence: result.score,
          discovered_via: "community-recycled-scorer",
          discovered_at: evaluated_at,
        },
      ],
      {
        onConflict: "source_type,source_id,linked_type,linked_id,relationship",
        ignoreDuplicates: true,
      },
    );

    for (const a of adminLinks ?? []) {
      if ((a as any).admin_wallet && (a as any).prior_failures >= 2) {
        await supabase.from("reputation_mesh").upsert(
          [
            {
              source_type: "wallet",
              source_id: (a as any).admin_wallet,
              linked_type: "token",
              linked_id: freshMint,
              relationship: "serial_rug_operator",
              confidence: result.score,
              discovered_via: "community-recycled-scorer",
              discovered_at: evaluated_at,
            },
          ],
          {
            onConflict: "source_type,source_id,linked_type,linked_id,relationship",
            ignoreDuplicates: true,
          },
        );
      }
    }
  }

  return { ...result, community_id: communityId, fresh_token_mint: freshMint, evaluated_at };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const mode = body.mode || "read";

    if (mode === "evaluate") {
      if (!body.community_id) {
        return new Response(JSON.stringify({ error: "community_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await evaluateOne(body.community_id, body.token_mint);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "evaluate_recent") {
      // Sparse fallback (6h cron): only re-score communities that haven't
      // been evaluated in the last 7 days. Real-time scoring is event-driven
      // (mesh-ingest on mint, x-community-resolver on scraper write,
      // insiders-mesh-* on rug, dex-paid-checker on phase flip). This path
      // exists ONLY to catch slow drift on rows no event ever touched.
      const staleCutoff = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
      const { data: rows } = await supabase
        .from("x_communities")
        .select("community_id, recycled_evaluated_at")
        .or(`recycled_evaluated_at.is.null,recycled_evaluated_at.lt.${staleCutoff}`)
        .order("recycled_evaluated_at", { ascending: true, nullsFirst: true })
        .limit(25);
      let processed = 0;
      for (const r of rows ?? []) {
        try {
          await evaluateOne(r.community_id);
          processed++;
        } catch (e) {
          console.warn("[scorer] failed", r.community_id, (e as Error).message);
        }
      }
      return new Response(JSON.stringify({ processed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "evaluate_for_token") {
      // Mesh-pipeline path: given a token mint, evaluate every community linked to it.
      if (!body.token_mint) {
        return new Response(JSON.stringify({ error: "token_mint required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const mint = body.token_mint;
      const seen = new Set<string>();

      // Source 1: x_communities.linked_token_mints contains mint
      const { data: viaArray } = await supabase
        .from("x_communities")
        .select("community_id")
        .contains("linked_token_mints", [mint])
        .limit(20);
      for (const r of viaArray ?? []) seen.add((r as any).community_id);

      // Source 2: token_social_links rows for this mint with a community URL
      const { data: socials } = await supabase
        .from("token_social_links")
        .select("url, platform")
        .eq("token_mint", mint)
        .limit(20);
      for (const s of socials ?? []) {
        const m = (s as any).url?.match?.(/communities\/(\d{6,25})/i);
        if (m) seen.add(m[1]);
      }

      // Source 3: reputation_mesh links token → x_community
      const { data: meshRows } = await supabase
        .from("reputation_mesh")
        .select("linked_id")
        .eq("source_type", "token")
        .eq("source_id", mint)
        .eq("linked_type", "x_community")
        .limit(20);
      for (const r of meshRows ?? []) seen.add((r as any).linked_id);

      const results: any[] = [];
      for (const cid of seen) {
        try {
          results.push(await evaluateOne(cid, mint));
        } catch (e) {
          console.warn("[scorer] eval_for_token failed", cid, (e as Error).message);
        }
      }
      return new Response(
        JSON.stringify({ token_mint: mint, evaluated: results.length, results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // mode === 'read' (tier-gated)
    if (!body.community_id) {
      return new Response(JSON.stringify({ error: "community_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tier = await getCallerTier(req.headers.get("Authorization"));
    const isPaid = PAID_TIERS.has(tier);

    const { data: row } = await supabase
      .from("x_communities")
      .select("community_id, recycled_score, recycled_band, recycled_signals, recycled_evaluated_at")
      .eq("community_id", body.community_id)
      .maybeSingle();

    if (!row || row.recycled_band == null) {
      return new Response(
        JSON.stringify({
          locked: !isPaid,
          tier_required: "x_subscriber",
          band: null,
          message: "Score not yet evaluated",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!isPaid) {
      return new Response(
        JSON.stringify({
          locked: true,
          tier_required: "x_subscriber",
          band_label: BAND_LABEL[row.recycled_band as keyof typeof BAND_LABEL] ?? null,
          // intentionally omit numeric score and signal breakdown
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        locked: false,
        score: row.recycled_score,
        band: row.recycled_band,
        band_label: BAND_LABEL[row.recycled_band as keyof typeof BAND_LABEL] ?? null,
        signals: row.recycled_signals,
        evaluated_at: row.recycled_evaluated_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[community-recycled-scorer]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});