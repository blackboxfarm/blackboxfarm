// Launcher Token Enricher — non-blocking. Pulls pump.fun page + DexScreener for links/socials
// and writes them to launcher_enrichment + token_social_links so the dev's dossier grows.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchDexScreenerData } from "../_shared/dexscreener-api.ts";
import { fetchPumpFunCoin } from "../_shared/pumpfun-fetch.ts";
import { fetchSolscanFreeTokenMeta } from "../_shared/solscan-free.ts";
import { assertUpdate, assertUpsert } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const bestDexPair = (dex: any, mint: string) => {
  const pairs = Array.isArray(dex?.pairs) ? dex.pairs : [];
  const solanaPairs = pairs.filter((p: any) => p?.chainId === "solana" && p?.baseToken?.address === mint);
  const candidates = solanaPairs.length ? solanaPairs : pairs;
  return candidates.reduce((best: any, p: any) => (p?.liquidity?.usd || 0) > (best?.liquidity?.usd || 0) ? p : best, candidates[0] || null);
};

const cleanUrl = (value: string | null | undefined, platform?: "twitter" | "telegram") => {
  if (!value) return null;
  const v = String(value).trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, "");
  if (platform === "twitter") return `https://x.com/${handle}`;
  if (platform === "telegram") return `https://t.me/${handle}`;
  return v;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const { mint, launcherProfileId } = body;
  if (!mint) return ok({ error: "missing mint" }, 400);

  const [dex, pump, solscan] = await Promise.all([
    fetchDexScreenerData(mint).catch(() => null),
    mint.endsWith("pump") ? fetchPumpFunCoin(mint, "launcher-token-enricher").catch(() => null) : Promise.resolve(null),
    fetchSolscanFreeTokenMeta(mint).catch(() => null),
  ]);
  const dexPair = bestDexPair(dex, mint);
  const links = {
    twitter: dex?.socials?.twitter || cleanUrl(pump?.twitter, "twitter") || cleanUrl(solscan?.twitter, "twitter"),
    telegram: dex?.socials?.telegram || cleanUrl(pump?.telegram, "telegram"),
    website: dex?.socials?.website || cleanUrl(pump?.website) || cleanUrl(solscan?.website),
    priceUsd: dex?.priceUsd || null,
    foundAt: new Date().toISOString(),
  };

  // Persist token name/symbol/image so accordion rows stop showing "unknown".
  const symbol = pump?.symbol || dexPair?.baseToken?.symbol || solscan?.symbol || null;
  const name = pump?.name || dexPair?.baseToken?.name || solscan?.name || null;
  const image = pump?.image_uri || pump?.profile_image || dexPair?.info?.imageUrl || dexPair?.baseToken?.logoURI || solscan?.icon || null;
  const description = pump?.description || null;
  if (symbol || name || image || description) {
    await assertUpsert(
      sb.from("token_metadata").upsert({
        mint_address: mint,
        symbol: symbol ?? null,
        name: name ?? null,
        logo_uri: image ?? null,
        description: description ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "mint_address" }).select(),
      "token_metadata"
    );
  }
  // Mirror onto launcher_mint_events row if present
  if (launcherProfileId) {
    await assertUpdate(
      sb.from("launcher_mint_events")
        .update({ symbol: symbol ?? null, name: name ?? null, metadata: { image, ...links } })
        .eq("launcher_profile_id", launcherProfileId)
        .eq("mint_address", mint)
        .select(),
      "launcher_mint_events"
    );
  }

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
    try {
      await sb.from("token_social_links").upsert({
        token_mint: mint,
        platform,
        url: handleOrUrl,
        extracted_handle: platform === "website" ? null : String(handleOrUrl).replace(/^@/, "").replace(/^https?:\/\/(t\.me\/|x\.com\/|twitter\.com\/)/i, ""),
        source: "launcher-enricher",
        is_current: true,
        discovered_at: new Date().toISOString(),
      }, { onConflict: "token_mint,url" });
    } catch {}
  }

  return ok({ ok: true, links });
});