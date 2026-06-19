import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_SLIPPAGE_BPS = 500;

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
    const slippageBps: number = Number(body.slippageBps ?? DEFAULT_SLIPPAGE_BPS);

    if (!walletId) throw new Error("walletId required");
    if (!mint || mint.length < 32) throw new Error("mint required");
    if (side !== "buy" && side !== "sell") throw new Error("side must be 'buy' or 'sell'");
    if (mint === SOL_MINT) throw new Error("cannot swap SOL → SOL");

    const { data: w, error: werr } = await admin
      .from("waterfall_wallets")
      .select("pubkey,secret_key_encrypted")
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
      priorityFeeMode: body.priorityFeeMode ?? "medium",
    };
    if (side === "buy") {
      swapBody.buyWithSol = true;
      swapBody.solAmountLamports = buyLamports;
    }

    console.log(`[waterfall-swap] delegating to raydium-swap: side=${side} mint=${mint.slice(0,8)} wallet=${(w.pubkey as string).slice(0,8)} lamports=${side === "buy" ? buyLamports : "ALL"}`);

    const { data: swapResult, error: swapError } = await admin.functions.invoke("raydium-swap", {
      body: swapBody,
      headers: { "x-owner-secret": w.secret_key_encrypted as string },
    });

    if (swapError) throw new Error(`raydium-swap invoke failed: ${swapError.message}`);
    if (swapResult?.error) throw new Error(`raydium-swap: ${swapResult.error_code ? `[${swapResult.error_code}] ` : ""}${swapResult.error}`);

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
      buyLamports: side === "buy" ? buyLamports : undefined,
      venue: swapResult?.venue ?? swapResult?.source ?? null,
      outAmount: swapResult?.outAmount ?? null,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("waterfall-swap", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});