import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Extract community ID from X community URL
function extractCommunityId(url: string): string | null {
  const match = url.match(/communities\/(\d+)/);
  return match ? match[1] : null;
}

// Check if a URL is an X/Twitter link
function isTwitterUrl(url: string): boolean {
  return url.includes('twitter.com') || url.includes('x.com');
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get all tokens from holders_intel_seen_tokens that are was_posted = true
    const { data: allTokens, error: fetchError } = await supabase
      .from('holders_intel_seen_tokens')
      .select('token_mint, symbol')
      .eq('was_posted', true);

    if (fetchError) throw fetchError;

    // Get all existing community links
    const { data: communities } = await supabase
      .from('x_communities')
      .select('community_id, linked_token_mints');

    // Build set of already-linked tokens
    const linkedTokens = new Set<string>();
    for (const comm of communities || []) {
      const mints = comm.linked_token_mints as string[] || [];
      for (const mint of mints) {
        linkedTokens.add(mint);
      }
    }

    // Filter to tokens missing community link
    const missingTokens = (allTokens || []).filter(t => !linkedTokens.has(t.token_mint));
    
    console.log(`[enrich-token-communities] ${missingTokens.length} tokens missing community links`);

    if (missingTokens.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'All tokens already have community links',
        checked: allTokens?.length || 0,
        enriched: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let enriched = 0;
    let noTwitter = 0;
    const results: { mint: string; symbol: string; twitterUrl?: string; linked: boolean }[] = [];

    // Process in batches of 5 with rate limiting
    const batchSize = 5;
    const maxTokens = Math.min(missingTokens.length, 100); // Limit to 100 per run

    for (let i = 0; i < maxTokens; i += batchSize) {
      const batch = missingTokens.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (token) => {
        try {
          let twitterUrl: string | null = null;
          
          // Fetch from DexScreener
          const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.token_mint}`, {
            headers: {
              'Accept': 'application/json',
              'User-Agent': 'BlackBox-Enricher/1.0'
            }
          });
          
          if (dexRes.ok) {
            const dexData = await dexRes.json();
            const pair = dexData?.pairs?.[0];
            
            if (pair?.info?.socials) {
              for (const social of pair.info.socials) {
                if (social.url && isTwitterUrl(social.url)) {
                  twitterUrl = social.url;
                  break;
                }
              }
            }
          }

          if (!twitterUrl) {
            noTwitter++;
            results.push({ mint: token.token_mint, symbol: token.symbol || '?', linked: false });
            return;
          }

          // Link to x_communities
          const communityId = extractCommunityId(twitterUrl);
          const effectiveId = communityId || twitterUrl.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 50);

          // Check if community exists
          const { data: existingCommunity } = await supabase
            .from('x_communities')
            .select('id, linked_token_mints')
            .eq('community_id', effectiveId)
            .single();

          if (existingCommunity) {
            const existingMints = existingCommunity.linked_token_mints || [];
            if (!existingMints.includes(token.token_mint)) {
              await supabase
                .from('x_communities')
                .update({
                  linked_token_mints: [...existingMints, token.token_mint],
                  updated_at: new Date().toISOString()
                })
                .eq('id', existingCommunity.id);
            }
          } else {
            await supabase
              .from('x_communities')
              .insert({
                community_id: effectiveId,
                community_url: twitterUrl,
                name: token.symbol ? `$${token.symbol} Community` : null,
                linked_token_mints: [token.token_mint],
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
          }

          enriched++;
          results.push({ mint: token.token_mint, symbol: token.symbol || '?', twitterUrl, linked: true });
          console.log(`[enrich] Linked ${token.symbol || token.token_mint.slice(0,8)} -> ${twitterUrl}`);

        } catch (e) {
          console.error(`[enrich] Error for ${token.token_mint}:`, e);
          results.push({ mint: token.token_mint, symbol: token.symbol || '?', linked: false });
        }
      }));

      // Rate limit between batches
      if (i + batchSize < maxTokens) {
        await delay(500);
      }
    }

    console.log(`[enrich-token-communities] Complete: ${enriched} enriched, ${noTwitter} no Twitter URL`);

    return new Response(JSON.stringify({ 
      success: true, 
      totalTokens: allTokens?.length || 0,
      alreadyLinked: linkedTokens.size,
      missing: missingTokens.length,
      processed: Math.min(missingTokens.length, maxTokens),
      enriched,
      noTwitterUrl: noTwitter,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('[enrich-token-communities] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
