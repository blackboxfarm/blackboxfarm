import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface TokenMetadata {
  symbol: string | null;
  name: string | null;
  image: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  source: string;
}

async function fetchPumpFunData(mint: string): Promise<TokenMetadata | null> {
  try {
    const res = await fetch(`https://frontend-api.pump.fun/coins/${mint}`, {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) return null;
    
    const data = await res.json();
    return {
      symbol: data.symbol || null,
      name: data.name || null,
      image: data.image_uri || data.uri || null,
      twitter: data.twitter || null,
      telegram: data.telegram || null,
      website: data.website || null,
      source: 'pump.fun'
    };
  } catch (e) {
    console.log(`[pump.fun] Failed for ${mint.slice(0, 8)}:`, e);
    return null;
  }
}

async function fetchDexScreenerData(mint: string): Promise<TokenMetadata | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!res.ok) return null;
    
    const data = await res.json();
    const pair = data.pairs?.[0];
    if (!pair) return null;
    
    let twitter: string | null = null;
    let telegram: string | null = null;
    let website: string | null = null;
    
    if (pair.info?.socials) {
      for (const social of pair.info.socials) {
        if (!twitter && (social.type === 'twitter' || social.url?.includes('twitter.com') || social.url?.includes('x.com'))) {
          twitter = social.url;
        }
        if (!telegram && (social.type === 'telegram' || social.url?.includes('t.me'))) {
          telegram = social.url;
        }
      }
    }
    
    if (pair.info?.websites?.length > 0) {
      for (const site of pair.info.websites) {
        const url = site.url || site;
        if (url && !url.includes('pump.fun') && !url.includes('bonk.fun') && !url.includes('bags.fm')) {
          website = url;
          break;
        }
      }
    }
    
    return {
      symbol: pair.baseToken?.symbol || null,
      name: pair.baseToken?.name || null,
      image: pair.info?.imageUrl || null,
      twitter,
      telegram,
      website,
      source: 'dexscreener'
    };
  } catch (e) {
    console.log(`[DexScreener] Failed for ${mint.slice(0, 8)}:`, e);
    return null;
  }
}

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

    console.log(`Backfilling metadata & socials for ${tokenMints.length} tokens`);

    let updated = 0;
    const results: { mint: string; success: boolean; metadata?: TokenMetadata }[] = [];

    for (const mint of tokenMints.slice(0, 50)) { // Limit to 50 per call
      try {
        let metadata: TokenMetadata | null = null;

        // Try pump.fun first for pump tokens
        if (mint.endsWith('pump')) {
          metadata = await fetchPumpFunData(mint);
          if (metadata) {
            console.log(`[pump.fun] ${mint.slice(0, 8)}: ${metadata.symbol}, img=${!!metadata.image}`);
          }
        }

        // Fallback/supplement with DexScreener
        if (!metadata || !metadata.symbol || !metadata.image) {
          await delay(100);
          const dexData = await fetchDexScreenerData(mint);
          
          if (dexData) {
            if (!metadata) {
              metadata = dexData;
            } else {
              // Fill in missing fields from DexScreener
              metadata.symbol = metadata.symbol || dexData.symbol;
              metadata.name = metadata.name || dexData.name;
              metadata.image = metadata.image || dexData.image;
              metadata.twitter = metadata.twitter || dexData.twitter;
              metadata.telegram = metadata.telegram || dexData.telegram;
              metadata.website = metadata.website || dexData.website;
              if (dexData.source && !metadata.twitter) metadata.source = 'combined';
            }
            console.log(`[DexScreener] ${mint.slice(0, 8)}: ${dexData.symbol}, img=${!!dexData.image}`);
          }
        }

        if (metadata) {
          // Save to token_socials_history with all metadata
          const { error: socialsError } = await supabase
            .from('token_socials_history')
            .upsert({
              token_mint: mint,
              twitter: metadata.twitter,
              telegram: metadata.telegram,
              website: metadata.website,
              source: metadata.source,
              captured_at: new Date().toISOString()
            }, { onConflict: 'token_mint' });

          if (socialsError) {
            console.error(`Failed to save socials for ${mint.slice(0, 8)}:`, socialsError);
          }

          // Update holders_intel_seen_tokens with symbol/name/image
          if (metadata.symbol || metadata.name || metadata.image) {
            const updateData: Record<string, unknown> = {};
            if (metadata.symbol) updateData.symbol = metadata.symbol;
            if (metadata.name) updateData.name = metadata.name;
            if (metadata.image) updateData.image_uri = metadata.image;

            const { error: seenError } = await supabase
              .from('holders_intel_seen_tokens')
              .upsert({
                token_mint: mint,
                ...updateData,
                last_seen_at: new Date().toISOString()
              }, { onConflict: 'token_mint' });

            if (seenError) {
              console.error(`Failed to update seen_tokens for ${mint.slice(0, 8)}:`, seenError);
            }
          }

          updated++;
          results.push({ mint, success: true, metadata });
          console.log(`✓ Saved metadata for ${mint.slice(0, 8)}: $${metadata.symbol}`);
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
