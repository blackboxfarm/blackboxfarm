import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Raydium Aggregator hosts (per docs)
const SWAP_HOST = "https://transaction-v1.raydium.io"; // compute + transaction

function ok(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function bad(message: string, status = 400) {
  return ok({ error: message }, status);
}

async function getJson<T>(req: Request): Promise<T | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const isGet = req.method === "GET";

    // Simple health check
    if (url.searchParams.get("ping")) {
      return ok({ ok: true });
    }

    if (url.searchParams.get("probe") === "ray") {
      const r = await fetch(SWAP_HOST);
      return ok({ status: r.status });
    }

    // Server-side price proxy (avoids CORS/network issues in browser)
    const priceMint = url.searchParams.get("priceMint");
    if (priceMint) {
      const r = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(priceMint)}&vsToken=USDC`);
      if (!r.ok) return bad(`Price fetch failed: ${r.status}`, 502);
      const j = await r.json();
      const p = j?.data?.[priceMint]?.price;
      if (typeof p !== 'number' || !isFinite(p) || p <= 0) return bad("Invalid price data", 502);
      return ok({ priceUSD: p });
    }

    const body = (await getJson<any>(req)) ?? {};
    const inputMint = (isGet ? url.searchParams.get("inputMint") : body.inputMint) as string | null;
    const outputMint = (isGet ? url.searchParams.get("outputMint") : body.outputMint) as string | null;
    const amountStr = (isGet ? url.searchParams.get("amount") : body.amount) as string | number | null;
    const slippageBpsStr = (isGet ? url.searchParams.get("slippageBps") : body.slippageBps) as string | number | null;
    const txVersion = ((isGet ? url.searchParams.get("txVersion") : body.txVersion) ?? "V0") as string;

    if (!inputMint || !outputMint || amountStr == null || slippageBpsStr == null) {
      return bad("Missing required params: inputMint, outputMint, amount, slippageBps");
    }

    const amount = typeof amountStr === "string" ? Number(amountStr) : amountStr;
    const slippageBps = typeof slippageBpsStr === "string" ? Number(slippageBpsStr) : slippageBpsStr;

    if (!Number.isFinite(amount) || amount <= 0) return bad("Invalid amount");
    if (!Number.isFinite(slippageBps) || slippageBps < 0) return bad("Invalid slippageBps");

    const computeUrl = `${SWAP_HOST}/compute/swap-base-in?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&txVersion=${txVersion}`;

    const res = await fetch(computeUrl, { method: "GET" });
    if (!res.ok) {
      const text = await res.text();
      return bad(`Raydium compute failed: ${res.status} ${text}`, 502);
    }
    const swapResponse = await res.json();

    return ok({ txVersion, swapResponse });
  } catch (e) {
    console.error("raydium-quote error", e);
    return bad(`Unexpected error: ${(e as Error).message}`, 500);
  }
});
