// Backfill banner_url for tokens with Paid DEX boost only
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// Check if token has Paid DEX (boosted) and get banner
async function checkTokenDexStatus(tokenMint: string): Promise<{ hasPaidDex: boolean; bannerUrl: string | null; imageUrl: string | null }> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/tokens/v1/solana/${tokenMint}`,
      { headers: { "Accept": "application/json", "User-Agent": "Mozilla/5.0 (compatible; BlackBox/1.0)" } }
    );

    if (!response.ok) return { hasPaidDex: false, bannerUrl: null, imageUrl: null };

    const data = await response.json();
    const pairs = Array.isArray(data) ? data : [];
    
    let bannerUrl: string | null = null;
    let imageUrl: string | null = null;
    let hasPaidDex = false;

    for (const pair of pairs) {
      // Check for paid boost indicators
      if (pair?.boosts?.active > 0 || pair?.info?.header) {
        hasPaidDex = true;
      }
      if (!bannerUrl && pair?.info?.header) {
        bannerUrl = pair.info.header;
      }
      if (!imageUrl && pair?.info?.imageUrl) {
        imageUrl = pair.info.imageUrl;
      }
    }

    return { hasPaidDex, bannerUrl, imageUrl };
  } catch (err) {
    console.error(`[checkTokenDexStatus] Error for ${tokenMint}:`, err);
    return { hasPaidDex: false, bannerUrl: null, imageUrl: null };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json().catch(() => ({}));
    const { singleMint } = body;

    // SINGLE TOKEN MODE - check one token for Paid DEX + banner
    if (singleMint) {
      console.log(`[backfill] Single token mode: ${singleMint}`);
      
      const status = await checkTokenDexStatus(singleMint);
      
      if (status.hasPaidDex || status.bannerUrl) {
        const updates: Record<string, any> = {};
        if (status.bannerUrl) updates.banner_url = status.bannerUrl;
        if (status.imageUrl) updates.image_uri = status.imageUrl;
        
        if (Object.keys(updates).length > 0) {
          await supabase
            .from("holders_intel_seen_tokens")
            .update(updates)
            .eq("token_mint", singleMint);
        }
        
        return new Response(JSON.stringify({ 
          success: true, 
          hasPaidDex: status.hasPaidDex,
          bannerFound: !!status.bannerUrl,
          bannerUrl: status.bannerUrl
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        hasPaidDex: false,
        bannerFound: false
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // BULK MODE - process tokens missing banners, check Paid DEX first
    const { data: tokens, error: fetchError } = await supabase
      .from("holders_intel_seen_tokens")
      .select("token_mint, symbol, banner_url, image_uri")
      .eq("was_posted", true);

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`);
    }

    // Filter to those needing banner check (missing banner_url)
    const tokensToProcess = (tokens || []).filter(t => !t.banner_url);
    console.log(`[backfill] Found ${tokensToProcess.length} tokens missing banners (of ${tokens?.length || 0} total)`);

    const results = {
      total: tokensToProcess.length,
      processed: 0,
      bannersUpdated: 0,
      imagesUpdated: 0,
      paidDexFound: 0,
      noPaidDex: 0,
      errors: 0,
      details: [] as { mint: string; symbol: string; hasPaidDex: boolean; bannerFound: boolean }[],
    };

    // Process SEQUENTIALLY with 300ms delay (rate limit safe)
    const maxTokens = Math.min(tokensToProcess.length, 50);

    for (let i = 0; i < maxTokens; i++) {
      const token = tokensToProcess[i];
      
      if (i > 0) await delay(300);
      
      try {
        const status = await checkTokenDexStatus(token.token_mint);
        results.processed++;
        
        if (status.hasPaidDex) {
          results.paidDexFound++;
        } else {
          results.noPaidDex++;
        }
        
        // Only update if we found data
        const updates: Record<string, any> = {};
        if (!token.banner_url && status.bannerUrl) {
          updates.banner_url = status.bannerUrl;
          results.bannersUpdated++;
        }
        if (!token.image_uri && status.imageUrl) {
          updates.image_uri = status.imageUrl;
          results.imagesUpdated++;
        }
        
        if (Object.keys(updates).length > 0) {
          await supabase
            .from("holders_intel_seen_tokens")
            .update(updates)
            .eq("token_mint", token.token_mint);
        }
        
        results.details.push({
          mint: token.token_mint,
          symbol: token.symbol,
          hasPaidDex: status.hasPaidDex,
          bannerFound: !!status.bannerUrl
        });
        
        console.log(`[backfill] ${i+1}/${maxTokens} ${token.symbol}: paidDex=${status.hasPaidDex}, banner=${!!status.bannerUrl}`);
      } catch (err) {
        results.errors++;
        console.error(`[backfill] Error for ${token.token_mint}:`, err);
      }
    }

    console.log(`[backfill] Complete: ${results.bannersUpdated} banners found, ${results.paidDexFound} with Paid DEX`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[backfill] Error:", error);
    return new Response(JSON.stringify({ success: false, error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
