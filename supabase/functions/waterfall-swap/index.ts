import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_SLIPPAGE_BPS = 1500;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isSuper } = await admin.rpc("is_super_admin", { _user_id: user.id });
    if (!isSuper) return new Response(JSON.stringify({ error: "Super admin required" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const walletId: string = body.walletId;
    const mint: string = body.mint;
    const side: "buy" | "sell" = body.side;
    const buyLamports: number = Number(body.buyLamports ?? 10_000_000); // default 0.01 SOL
    const buyPct: number = Number(body.buyPct ?? body.buySizePct ?? 0);
    const buySellFeeReserveLamports: number = Number(body.buySellFeeReserveLamports ?? 0);
    const minBuyLamports: number = Number(body.minBuyLamports ?? 0);
    const slippageBps: number = Number(body.slippageBps ?? DEFAULT_SLIPPAGE_BPS);

    if (!walletId) throw new Error("walletId required");
    if (!mint || mint.length < 32) throw new Error("mint required");
    if (side !== "buy" && side !== "sell") throw new Error("side must be 'buy' or 'sell'");
    if (mint === SOL_MINT) throw new Error("cannot swap SOL → SOL");

    const { data: w, error: werr } = await admin
      .from("waterfall_wallets")
      .select("pubkey")
      .eq("id", walletId)
      .single();
    if (werr || !w) throw new Error("wallet not found");

    // Delegate to the venue-aware raydium-swap function — same path FlipIt uses.
    // raydium-swap routes pump.fun curves to PumpPortal, bags.fm to Meteora DBC,
    // bonk.fun to Raydium Launchlab, and graduated tokens to Jupiter — always
    // fetching the cheapest executable on-chain price for the actual venue.
    const swapBody: Record<string, unknown> = {
      side,
      tokenMint: mint,
      slippageBps,
      priorityFeeMode: body.priorityFeeMode ?? "low",
      walletId,
      walletSource: "waterfall_wallets",
    };
    if (side === "buy") {
      swapBody.buyWithSol = true;
      swapBody.solAmountLamports = buyLamports;
      if (Number.isFinite(buyPct) && buyPct > 0) swapBody.buyPct = buyPct;
      if (Number.isFinite(buySellFeeReserveLamports) && buySellFeeReserveLamports > 0) swapBody.buySellFeeReserveLamports = Math.floor(buySellFeeReserveLamports);
      if (Number.isFinite(minBuyLamports) && minBuyLamports > 0) swapBody.minBuyLamports = Math.floor(minBuyLamports);
    }

    console.log(`[waterfall-swap] delegating to raydium-swap: side=${side} mint=${mint.slice(0,8)} wallet=${(w.pubkey as string).slice(0,8)} lamports=${side === "buy" ? buyLamports : "ALL"} buyPct=${side === "buy" ? (buyPct || "explicit") : "n/a"}`);

    const { data: swapResult, error: swapError } = await admin.functions.invoke("raydium-swap", {
      body: swapBody,
    });

    if (swapError) {
      const details = (swapError as any)?.context?.json ?? (swapError as any)?.context?.body ?? null;
      const detailError = details && typeof details === "object" ? (details.error ?? details.message) : null;
      const detailCode = details && typeof details === "object" ? details.error_code : null;
      if (detailCode === "PUMPFUN_CURVE_REJECTED") {
        return new Response(JSON.stringify({ success: false, skipReason: "pumpfun_curve_rejected", wallet: w.pubkey, error: `pump.fun rejected buy (likely curve moved or slippage too tight): ${detailError ?? swapError.message}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`raydium-swap invoke failed${detailError ? `: ${detailError}` : `: ${swapError.message}`}`);
    }
    if (swapResult?.error) {
      if (swapResult.error_code) {
        const skipReason = String(swapResult.error_code).toLowerCase();
        const prefix = swapResult.error_code === "PUMPFUN_CURVE_REJECTED"
          ? "pump.fun rejected buy"
          : "buy skipped";
        return new Response(JSON.stringify({ success: false, skipReason, wallet: w.pubkey, error: `${prefix}: ${swapResult.error}`, liveSolLamports: swapResult.liveSolLamports, reserveLamports: swapResult.reserveLamports, executableLamports: swapResult.executableLamports }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`raydium-swap: ${swapResult.error_code ? `[${swapResult.error_code}] ` : ""}${swapResult.error}`);
    }

    const signature: string | null =
      swapResult?.signature ??
      (Array.isArray(swapResult?.signatures) ? swapResult.signatures[0] : null) ??
      null;
    if (!signature) throw new Error("raydium-swap returned no signature");

    console.log(`[waterfall-swap] ✓ ${side} signed: ${signature.slice(0, 16)}.. venue=${swapResult?.venue ?? swapResult?.source ?? "?"}`);

    return new Response(JSON.stringify({
      success: true,
      side,
      signature,
      buyLamports: side === "buy" ? (swapResult?.solInputLamports ?? buyLamports) : undefined,
      venue: swapResult?.venue ?? swapResult?.source ?? null,
      outAmount: swapResult?.outAmount ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-swap", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});