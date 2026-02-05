// Backfill banner_url, image_uri, and x_community links for existing posted tokens
import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get tokens missing banner_url OR image_uri
    const { data: tokens, error: fetchError } = await supabase
      .from("holders_intel_seen_tokens")
      .select("token_mint, symbol, banner_url, image_uri")
      .eq("was_posted", true);

    if (fetchError) {
      throw new Error(`Failed to fetch tokens: ${fetchError.message}`);
    }

    // Filter to those needing updates
    const tokensToProcess = (tokens || []).filter(t => !t.banner_url || !t.image_uri);
    console.log(`[backfill] Found ${tokensToProcess.length} tokens needing updates (of ${tokens?.length || 0} total)`);

    const results = {
      total: tokensToProcess.length,
      bannersUpdated: 0,
      imagesUpdated: 0,
      communitiesLinked: 0,
      noHeader: 0,
      errors: 0,
      details: [] as { mint: string; symbol: string; status: string; banner?: string; image?: string; community?: string }[],
    };

    // Process in batches to avoid rate limits
    const BATCH_SIZE = 10;
    const DELAY_MS = 1000;

    for (let i = 0; i < tokensToProcess.length; i += BATCH_SIZE) {
      const batch = tokensToProcess.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (token) => {
        try {
          const updates: { banner_url?: string; image_uri?: string } = {};
          let detailStatus = "";
          let bannerUrl: string | null = null;
          let imageUrl: string | null = null;

          // Fetch from Dexscreener
          const response = await fetch(
            `https://api.dexscreener.com/tokens/v1/solana/${token.token_mint}`,
            { headers: { "Accept": "application/json" } }
          );

          if (response.ok) {
            const data = await response.json();
            const pairs = Array.isArray(data) ? data : [];
            
            // Get header and image from first pair with them
            for (const pair of pairs) {
              if (!bannerUrl && pair?.info?.header) {
                bannerUrl = pair.info.header;
              }
              if (!imageUrl && pair?.info?.imageUrl) {
                imageUrl = pair.info.imageUrl;
              }
              if (bannerUrl && imageUrl) break;
            }
          }

          // Update banner_url if missing and found
          if (!token.banner_url && bannerUrl) {
            updates.banner_url = bannerUrl;
            results.bannersUpdated++;
            detailStatus += "banner ";
          }

          // Update image_uri if missing and found
          if (!token.image_uri && imageUrl) {
            updates.image_uri = imageUrl;
            results.imagesUpdated++;
            detailStatus += "image ";
          }

          // Apply updates if any
          if (Object.keys(updates).length > 0) {
            const { error: updateError } = await supabase
              .from("holders_intel_seen_tokens")
              .update(updates)
              .eq("token_mint", token.token_mint);

            if (updateError) {
              results.errors++;
              results.details.push({ mint: token.token_mint, symbol: token.symbol, status: "update_error" });
              return;
            }
          }

          // Check if X Community is already linked
          const { data: existingCommunity } = await supabase
            .from("x_communities")
            .select("community_id")
            .contains("linked_token_mints", [token.token_mint])
            .limit(1);

          if (!existingCommunity || existingCommunity.length === 0) {
            // No community linked - this is expected, just note it
            detailStatus += "no_community";
          } else {
            results.communitiesLinked++;
            detailStatus += `community:${existingCommunity[0].community_id}`;
          }

          if (!detailStatus) {
            results.noHeader++;
            detailStatus = "no_new_data";
          }

          results.details.push({ 
            mint: token.token_mint, 
            symbol: token.symbol, 
            status: detailStatus.trim(),
            banner: bannerUrl || undefined,
            image: imageUrl || undefined,
            community: existingCommunity?.[0]?.community_id,
          });
        } catch (err) {
          results.errors++;
          results.details.push({ mint: token.token_mint, symbol: token.symbol, status: `error: ${err}` });
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches
      if (i + BATCH_SIZE < tokensToProcess.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }

      console.log(`[backfill] Processed ${Math.min(i + BATCH_SIZE, tokensToProcess.length)}/${tokensToProcess.length}`);
    }

    console.log(`[backfill] Complete: ${results.bannersUpdated} banners, ${results.imagesUpdated} images, ${results.communitiesLinked} with communities`);

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
