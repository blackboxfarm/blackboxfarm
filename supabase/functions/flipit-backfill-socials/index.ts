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
        // Fetch metadata from DexScreener
        const dexResponse = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${position.token_mint}`
        );
        
        let tokenImage: string | null = null;
        let twitterUrl: string | null = null;
        let websiteUrl: string | null = null;
        let telegramUrl: string | null = null;

        if (dexResponse.ok) {
          const dexData = await dexResponse.json();
          const pair = dexData.pairs?.[0];
          
          if (pair) {
            tokenImage = pair.info?.imageUrl || null;
            
            // Extract socials
            if (pair.info?.socials) {
              for (const social of pair.info.socials) {
                if (social.type === 'twitter') twitterUrl = social.url;
                else if (social.type === 'telegram') telegramUrl = social.url;
              }
            }
            
            // Extract website
            if (pair.info?.websites?.length > 0) {
              websiteUrl = pair.info.websites[0].url;
            }
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
