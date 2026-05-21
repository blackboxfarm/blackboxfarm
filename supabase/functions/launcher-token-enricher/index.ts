// Launcher Token Enricher — non-blocking. Pulls pump.fun page + DexScreener for links/socials
// and writes them to launcher_enrichment + token_social_links so the dev's dossier grows.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchDexScreenerData } from "../_shared/dexscreener-api.ts";
import { assertUpsert } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const { mint, launcherProfileId } = body;
  if (!mint) return ok({ error: "missing mint" }, 400);

  const dex = await fetchDexScreenerData(mint).catch(() => null);
  const links = {
    twitter: dex?.socials?.twitter || null,
    telegram: dex?.socials?.telegram || null,
    website: dex?.socials?.website || null,
    priceUsd: dex?.priceUsd || null,
    foundAt: new Date().toISOString(),
  };

  await assertUpsert(
    sb.from("launcher_enrichment").upsert({
      mint_address: mint,
      launcher_profile_id: launcherProfileId ?? null,
      links_found: links,
      found_at: links.foundAt,
    }, { onConflict: "mint_address,launcher_profile_id" }).select(),
    "launcher_enrichment"
  );

  // Also feed token_social_links so the dossier picks them up
  for (const [platform, handleOrUrl] of [["twitter", links.twitter], ["telegram", links.telegram], ["website", links.website]] as const) {
    if (!handleOrUrl) continue;
    await sb.from("token_social_links").upsert({
      token_mint: mint,
      platform,
      url: handleOrUrl,
      extracted_handle: platform === "website" ? null : String(handleOrUrl).replace(/^@/, "").replace(/^https?:\/\/(t\.me\/|x\.com\/|twitter\.com\/)/i, ""),
      source: "launcher-enricher",
      is_current: true,
      discovered_at: new Date().toISOString(),
    }, { onConflict: "token_mint,url" }).catch(() => {});
  }

  return ok({ ok: true, links });
});