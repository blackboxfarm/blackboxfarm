import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch ALL holding positions (not just missing socials)
    const { data: positions, error: fetchError } = await supabase
      .from('flip_positions')
      .select('id, token_mint, token_image, twitter_url, website_url, telegram_url')
      .eq('status', 'holding');

    if (fetchError) {
      throw new Error(`Failed to fetch positions: ${fetchError.message}`);
    }

    console.log(`Found ${positions?.length || 0} holding positions to backfill`);

    const results: { id: string; token_mint: string; success: boolean; error?: string; socials?: any }[] = [];

    for (const position of positions || []) {
      try {
        let tokenImage: string | null = null;
        let twitterUrl: string | null = null;
        let websiteUrl: string | null = null;
        let telegramUrl: string | null = null;

        // PRIMARY: For pump.fun tokens, try pump.fun API first (most reliable for socials)
        if (position.token_mint.endsWith('pump')) {
          try {
            console.log(`Trying pump.fun API for ${position.token_mint}`);
            const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${position.token_mint}`);
            if (pumpRes.ok) {
              const pumpData = await pumpRes.json();
              tokenImage = pumpData.image_uri || pumpData.metadata?.image || null;
              twitterUrl = pumpData.twitter || null;
              websiteUrl = pumpData.website || null;
              telegramUrl = pumpData.telegram || null;
              console.log(`pump.fun API socials: twitter=${twitterUrl}, website=${websiteUrl}, telegram=${telegramUrl}`);
            }
          } catch (e) {
            console.log(`pump.fun API failed for ${position.token_mint}:`, e);
          }
        }

        // FALLBACK: DexScreener for any missing data
        if (!tokenImage || !twitterUrl || !websiteUrl || !telegramUrl) {
          try {
            const dexResponse = await fetch(
              `https://api.dexscreener.com/latest/dex/tokens/${position.token_mint}`
            );
            
            if (dexResponse.ok) {
              const dexData = await dexResponse.json();
              const pair = dexData.pairs?.[0];
              
              if (pair) {
                if (!tokenImage) tokenImage = pair.info?.imageUrl || null;
                
                // Extract socials if missing
                if (pair.info?.socials) {
                  for (const social of pair.info.socials) {
                    if (!twitterUrl && (social.type === 'twitter' || social.url?.includes('twitter.com') || social.url?.includes('x.com'))) {
                      twitterUrl = social.url;
                    }
                    if (!telegramUrl && (social.type === 'telegram' || social.url?.includes('t.me'))) {
                      telegramUrl = social.url;
                    }
                  }
                }
                
                // Extract website if missing (skip launchpad sites)
                if (!websiteUrl && pair.info?.websites?.length > 0) {
                  for (const site of pair.info.websites) {
                    const url = site.url || site;
                    if (url && !url.includes('pump.fun') && !url.includes('bonk.fun') && !url.includes('bags.fm')) {
                      websiteUrl = url;
                      break;
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.log(`DexScreener failed for ${position.token_mint}:`, e);
          }
        }

        console.log(`Token ${position.token_mint}: image=${tokenImage}, twitter=${twitterUrl}, website=${websiteUrl}, telegram=${telegramUrl}`);

        // Update the position
        const { error: updateError } = await supabase
          .from('flip_positions')
          .update({
            token_image: tokenImage,
            twitter_url: twitterUrl,
            website_url: websiteUrl,
            telegram_url: telegramUrl,
          })
          .eq('id', position.id);

        if (updateError) {
          results.push({ id: position.id, token_mint: position.token_mint, success: false, error: updateError.message });
        } else {
          results.push({ 
            id: position.id, 
            token_mint: position.token_mint, 
            success: true,
            socials: { tokenImage, twitterUrl, websiteUrl, telegramUrl }
          });
          console.log(`Updated position ${position.id} with socials`);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 300));

      } catch (err) {
        results.push({ id: position.id, token_mint: position.token_mint, success: false, error: String(err) });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return new Response(JSON.stringify({
      success: true,
      message: `Backfilled ${successCount} positions, ${failCount} failed`,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
