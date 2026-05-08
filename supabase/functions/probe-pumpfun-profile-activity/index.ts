/**
 * probe-pumpfun-profile-activity
 * Hits Pump.fun's frontend public endpoints to count creator profile activity:
 *  - lives hosted (count)
 *  - posts/replies on the profile
 * Writes pumpfun_live_count + pumpfun_post_count into token_lifecycle.metadata.
 */
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token_mint, dev_wallet: dev_in } = await req.json();
    if (!token_mint) return json({ error: "token_mint required" }, 400);

    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    let dev_wallet = dev_in as string | undefined;
    if (!dev_wallet) {
      const { data: lc } = await supa.from("token_lifecycle").select("creator_wallet").eq("token_mint", token_mint).maybeSingle();
      dev_wallet = (lc as any)?.creator_wallet;
    }
    if (!dev_wallet) return json({ ok: false, reason: "no_dev_wallet" }, 200);

    let pumpfun_live_count = 0;
    let pumpfun_post_count = 0;
    let profile: any = null;
    try {
      const r = await fetch(`https://frontend-api-v3.pump.fun/users/${dev_wallet}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) profile = await r.json().catch(() => null);
    } catch { /* best-effort */ }

    if (profile) {
      pumpfun_live_count = Number(profile?.total_lives ?? profile?.live_count ?? 0);
      pumpfun_post_count = Number(profile?.num_posts ?? profile?.posts_count ?? 0);
    }

    const { data: lc2 } = await supa.from("token_lifecycle").select("metadata").eq("token_mint", token_mint).maybeSingle();
    const meta = {
      ...(lc2?.metadata ?? {}),
      pumpfun_live_count,
      pumpfun_post_count,
      pumpfun_profile_checked_at: new Date().toISOString(),
    };
    await supa.from("token_lifecycle").update({ metadata: meta }).eq("token_mint", token_mint);

    return json({ ok: true, token_mint, dev_wallet, pumpfun_live_count, pumpfun_post_count });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}