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

// Normalize common SOL aliases to the canonical wSOL mint
function normalizeMint(mint: string) {
  const t = mint.trim();
  if (t.toLowerCase() === "sol" || t.toLowerCase() === "wsol") {
    return "So11111111111111111111111111111111111111112";
  }
  return t;
}

// Use Jupiter v2 API (current, supported)
async function getPriceUSDFromJupV2(id: string): Promise<number | null> {
  try {
    const url = `https://api.jup.ag/price/v2?ids=${encodeURIComponent(id)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.data?.[id]?.price;
    if (typeof p === "number" && isFinite(p) && p > 0) return p;
    return null;
  } catch (e) {
    console.log("Jupiter v2 price fetch failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function getPriceUSDFromDexScreener(mint: string): Promise<number | null> {
  try {
    const id = normalizeMint(mint);
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(id)}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!r.ok) return null;
    const j = await r.json();
    const pairs = Array.isArray(j?.pairs) ? j.pairs : [];
    if (!pairs.length) return null;
    // Choose the pair with the highest USD liquidity
    let best = pairs[0];
    for (const p of pairs) {
      if ((p?.liquidity?.usd ?? 0) > (best?.liquidity?.usd ?? 0)) best = p;
    }
    const priceUsd = Number(best?.priceUsd);
    if (Number.isFinite(priceUsd) && priceUsd > 0) return priceUsd;
    return null;
  } catch (e) {
    console.log("DexScreener price fetch failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// For pump.fun tokens, try pump.fun API first
async function getPriceUSDFromPumpFun(mint: string): Promise<number | null> {
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      console.log(`pump.fun API returned ${res.status} for ${mint}`);
      return null;
    }

    const data = await res.json();

    // Method 1: Use market cap and supply
    if (data.usd_market_cap && data.total_supply) {
      const price = data.usd_market_cap / (data.total_supply / 1e6);
      return price;
    }

    // Method 2: Use bonding curve reserves
    if (data.virtual_sol_reserves && data.virtual_token_reserves) {
      // Get SOL price
      const solPrice = await getSolPrice();
      const priceInSol = (data.virtual_sol_reserves / 1e9) / (data.virtual_token_reserves / 1e6);
      return priceInSol * solPrice;
    }

    return null;
  } catch (e) {
    console.log("pump.fun API failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

// Get SOL price for calculations
async function getSolPrice(): Promise<number> {
  try {
    const res = await fetch('https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112', {
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const json = await res.json();
      const price = Number(json?.data?.['So11111111111111111111111111111111111111112']?.price);
      if (price > 0) return price;
    }
  } catch (e) {
    console.log('Jupiter SOL price failed:', e instanceof Error ? e.message : String(e));
  }
  return 180; // Fallback
}

async function getPriceUSD(mint: string): Promise<{ price: number; source: string } | null> {
  const isPumpToken = mint.toLowerCase().endsWith('pump');
  
  // For pump.fun tokens, try pump.fun API first (pre-Raydium tokens)
  if (isPumpToken) {
    const fromPump = await getPriceUSDFromPumpFun(mint);
    if (fromPump != null) {
      console.log(`Price for ${mint.slice(0, 8)}: $${fromPump} from pump.fun`);
      return { price: fromPump, source: 'pumpfun' };
    }
  }
  
  // Try DexScreener (best for graduated tokens)
  const fromDex = await getPriceUSDFromDexScreener(mint);
  if (fromDex != null) {
    console.log(`Price for ${mint.slice(0, 8)}: $${fromDex} from DexScreener`);
    return { price: fromDex, source: 'dexscreener' };
  }
  
  // Fallback to Jupiter v2
  const fromJup = await getPriceUSDFromJupV2(mint);
  if (fromJup != null) {
    console.log(`Price for ${mint.slice(0, 8)}: $${fromJup} from Jupiter`);
    return { price: fromJup, source: 'jupiter' };
  }
  
  console.log(`No price found for ${mint.slice(0, 8)} from any source`);
  return null;
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
      const result = await getPriceUSD(priceMint);
      if (result == null) return bad("Price fetch failed (all sources)", 502);
      return ok({ priceUSD: result.price, source: result.source });
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
