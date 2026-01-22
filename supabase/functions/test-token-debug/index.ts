import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const tokenMint = "44qC6Zv9FEFE9g3eV4tSDaQk56YQHeAcWEhYQ9Lkpump";
    
    console.log("Testing token:", tokenMint);
    
    // Test Raydium compute endpoint
    const SWAP_HOST = "https://transaction-v1.raydium.io";
    const computeUrl = `${SWAP_HOST}/compute/swap-base-in?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenMint}&amount=1000000&slippageBps=100&txVersion=V0`;
    
    console.log("Testing Raydium compute with URL:", computeUrl);
    
    const computeRes = await fetch(computeUrl);
    const computeText = await computeRes.text();
    
    console.log("Raydium response status:", computeRes.status);
    console.log("Raydium response:", computeText);
    
    let computeResult;
    try {
      computeResult = JSON.parse(computeText);
    } catch (e) {
      computeResult = { error: "Failed to parse JSON", raw: computeText };
    }
    
    // Test Jupiter quote with auth
    const jupiterApiKey = Deno.env.get("JUPITER_API_KEY") || "";
    const jupiterUrl = `https://api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenMint}&amount=1000000&slippageBps=100`;
    
    console.log("Testing Jupiter quote with URL:", jupiterUrl);
    
    const jupiterRes = await fetch(jupiterUrl, {
      headers: jupiterApiKey ? { "x-api-key": jupiterApiKey } : {}
    });
    const jupiterText = await jupiterRes.text();
    
    console.log("Jupiter response status:", jupiterRes.status);
    console.log("Jupiter response:", jupiterText);
    
    let jupiterResult;
    try {
      jupiterResult = JSON.parse(jupiterText);
    } catch (e) {
      jupiterResult = { error: "Failed to parse JSON", raw: jupiterText };
    }
    
    return new Response(JSON.stringify({
      tokenMint,
      raydium: {
        status: computeRes.status,
        result: computeResult
      },
      jupiter: {
        status: jupiterRes.status,
        result: jupiterResult
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
    
  } catch (e) {
    console.error("Debug function error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : String(e)
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});