import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMints } = await req.json();
    
    if (!tokenMints || !Array.isArray(tokenMints) || tokenMints.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: 'No tokens to backfill' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Backfilling socials for ${tokenMints.length} tokens`);

    let updated = 0;
    const results: { mint: string; success: boolean; socials?: any }[] = [];

    for (const mint of tokenMints.slice(0, 50)) { // Limit to 50 per call
      try {
        let twitter: string | null = null;
        let telegram: string | null = null;
        let website: string | null = null;
        let source = 'unknown';

        // Try pump.fun first for pump tokens
        if (mint.endsWith('pump')) {
          try {
            const pumpRes = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
              headers: { 'Accept': 'application/json' }
            });
            if (pumpRes.ok) {
              const pumpData = await pumpRes.json();
              twitter = pumpData.twitter || null;
              telegram = pumpData.telegram || null;
              website = pumpData.website || null;
              source = 'pump.fun';
              console.log(`[pump.fun] ${mint.slice(0, 8)}: twitter=${!!twitter}, tg=${!!telegram}, web=${!!website}`);
            }
          } catch (e) {
            console.log(`pump.fun API failed for ${mint.slice(0, 8)}:`, e);
          }
        }

        // Fallback to DexScreener for missing socials
        if (!twitter || !telegram || !website) {
          try {
            await delay(100);
            const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
            if (dexRes.ok) {
              const dexData = await dexRes.json();
              const pair = dexData.pairs?.[0];
              
              if (pair?.info) {
                if (pair.info.socials) {
                  for (const social of pair.info.socials) {
                    if (!twitter && (social.type === 'twitter' || social.url?.includes('twitter.com') || social.url?.includes('x.com'))) {
                      twitter = social.url;
                    }
                    if (!telegram && (social.type === 'telegram' || social.url?.includes('t.me'))) {
                      telegram = social.url;
                    }
                  }
                }
                
                if (!website && pair.info.websites?.length > 0) {
                  for (const site of pair.info.websites) {
                    const url = site.url || site;
                    if (url && !url.includes('pump.fun') && !url.includes('bonk.fun') && !url.includes('bags.fm')) {
                      website = url;
                      break;
                    }
                  }
                }
                
                if (source === 'unknown') source = 'dexscreener';
              }
            }
          } catch (e) {
            console.log(`DexScreener API failed for ${mint.slice(0, 8)}:`, e);
          }
        }

        // Only save if we found any socials
        if (twitter || telegram || website) {
          const { error } = await supabase
            .from('token_socials_history')
            .insert({
              token_mint: mint,
              twitter,
              telegram,
              website,
              source,
              captured_at: new Date().toISOString()
            });

          if (!error) {
            updated++;
            results.push({ mint, success: true, socials: { twitter, telegram, website } });
            console.log(`✓ Saved socials for ${mint.slice(0, 8)}`);
          } else {
            console.error(`Failed to save for ${mint.slice(0, 8)}:`, error);
            results.push({ mint, success: false });
          }
        } else {
          results.push({ mint, success: false });
        }

        await delay(200); // Rate limiting

      } catch (err) {
        console.error(`Error processing ${mint}:`, err);
        results.push({ mint, success: false });
      }
    }

    console.log(`Backfill complete: ${updated}/${tokenMints.length} tokens updated`);

    return new Response(
      JSON.stringify({ success: true, updated, total: tokenMints.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
