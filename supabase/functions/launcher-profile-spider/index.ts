// Launcher Profile Spider — accepts xHandle | devWallet | tokenMint and returns/creates a
// launcher_profiles row populated with the wallet family (ranked by recent activity) and the
// dossier signals already in the system.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { assertUpsert } from "../_shared/db-assert.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ok = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { xHandle: rawHandle, devWallet, tokenMint, profileId } = await req.json().catch(() => ({} as any));
  const xHandle = rawHandle ? String(rawHandle).replace(/^@/, "").toLowerCase() : null;
  if (!xHandle && !devWallet && !tokenMint && !profileId) return ok({ error: "need xHandle, devWallet, tokenMint, or profileId" }, 400);

  // 1) Resolve a primary dev wallet
  let primaryDev: string | null = devWallet || null;
  let resolvedHandle: string | null = xHandle;
  let xUserId: string | null = null;

  if (!primaryDev && tokenMint) {
    const { data } = await sb.from("proven_dev_tokens").select("dev_wallet").eq("token_mint", tokenMint).maybeSingle();
    primaryDev = data?.dev_wallet ?? null;
  }
  if (!primaryDev && xHandle) {
    // Use dev_wallet_reputation to find a wallet associated with this handle
    const { data } = await sb.from("dev_wallet_reputation")
      .select("wallet_address, last_activity_at, twitter_accounts")
      .contains("twitter_accounts", [xHandle])
      .order("last_activity_at", { ascending: false })
      .limit(1);
    primaryDev = data?.[0]?.wallet_address ?? null;
  }

  if (xHandle) {
    const { data: xa } = await sb.from("x_account_registry").select("x_user_id, current_handle").eq("current_handle", xHandle).maybeSingle();
    xUserId = xa?.x_user_id ?? null;
    resolvedHandle = xa?.current_handle ?? xHandle;
  }

  // 2) Build wallet family for this handle (all dev_wallet_reputation rows tagged with this handle)
  const family = new Set<string>();
  if (primaryDev) family.add(primaryDev);
  if (resolvedHandle) {
    const { data: fam } = await sb.from("dev_wallet_reputation")
      .select("wallet_address, last_activity_at, total_tokens_launched")
      .contains("twitter_accounts", [resolvedHandle])
      .order("last_activity_at", { ascending: false });
    for (const r of (fam || [])) if (r.wallet_address) family.add(r.wallet_address);
  }
  // Pull tokens minted by these wallets to find any sister wallets we missed
  if (family.size > 0) {
    const { data: tokens } = await sb.from("proven_dev_tokens")
      .select("dev_wallet, mint_timestamp")
      .in("dev_wallet", Array.from(family))
      .order("mint_timestamp", { ascending: false, nullsFirst: false })
      .limit(200);
    for (const t of (tokens || [])) if (t.dev_wallet) family.add(t.dev_wallet);
  }

  // Rank family by real mint activity (most recent + most prolific first).
  // Sources: developer_tokens (creator_wallet, launch_date) + launcher_mint_events for THIS profile.
  const familyArr = Array.from(family);
  const actMap: Record<string, { ts: number; n: number }> = {};
  for (const w of familyArr) actMap[w] = { ts: 0, n: 0 };

  if (familyArr.length) {
    const { data: devTok } = await sb.from("developer_tokens")
      .select("creator_wallet, launch_date")
      .in("creator_wallet", familyArr);
    for (const r of (devTok || []) as any[]) {
      const m = actMap[r.creator_wallet];
      if (!m) continue;
      m.n += 1;
      const t = r.launch_date ? new Date(r.launch_date).getTime() : 0;
      if (t > m.ts) m.ts = t;
    }
    // also reputation as a tie-breaker
    const { data: rep } = await sb.from("dev_wallet_reputation")
      .select("wallet_address, last_activity_at, total_tokens_launched")
      .in("wallet_address", familyArr);
    for (const r of (rep || []) as any[]) {
      const m = actMap[r.wallet_address]; if (!m) continue;
      const t = r.last_activity_at ? new Date(r.last_activity_at).getTime() : 0;
      if (t > m.ts) m.ts = t;
      m.n = Math.max(m.n, Number(r.total_tokens_launched || 0));
    }
  }
  familyArr.sort((a, b) => {
    const A = actMap[a]; const B = actMap[b];
    return (B.n - A.n) || (B.ts - A.ts);
  });
  const linked = familyArr.slice(0, 50);
  // Primary dev = most active wallet (unless explicitly provided)
  const computedPrimary = devWallet || linked[0] || primaryDev || null;

  // 3) Upsert profile
  const name = resolvedHandle || primaryDev?.slice(0, 8) || tokenMint?.slice(0, 8) || "unnamed";
  let upsertPayload: any = {
    name,
    x_handle: resolvedHandle,
    x_user_id: xUserId,
    primary_dev_wallet: computedPrimary,
    linked_wallets: linked,
    last_spidered_at: new Date().toISOString(),
  };
  if (profileId) {
    const { data, error } = await sb.from("launcher_profiles").update(upsertPayload).eq("id", profileId).select().single();
    if (error) return ok({ error: error.message }, 500);
    return ok({ profile: data, walletCount: linked.length });
  }
  const created = await assertUpsert(
    sb.from("launcher_profiles").upsert(upsertPayload, { onConflict: "name" }).select().single(),
    "launcher_profiles"
  );
  // Default rule row
  await sb.from("launcher_trade_rules").upsert({ launcher_profile_id: (created as any).id }, { onConflict: "launcher_profile_id" });

  return ok({ profile: created, walletCount: linked.length });
});