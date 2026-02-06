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

// Rate-limited DexScreener fetch with retry
async function fetchDexScreenerWithRateLimit(tokenMint: string, retries = 2): Promise<any> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; BlackBox/1.0)',
          'Referer': 'https://dexscreener.com/'
        }
      });
      
      if (res.status === 429) {
        // Rate limited - wait longer and retry
        console.warn(`[DexScreener] Rate limited, waiting 5s before retry...`);
        await delay(5000);
        continue;
      }
      
      if (!res.ok) {
        console.warn(`[DexScreener] HTTP ${res.status} for ${tokenMint}`);
        return null;
      }
      
      return await res.json();
    } catch (err) {
      console.error(`[DexScreener] Fetch error for ${tokenMint}:`, err);
      if (attempt < retries) await delay(1000);
    }
  }
  return null;
}

// Process a single token
async function enrichSingleToken(
  supabase: any, 
  tokenMint: string, 
  symbol: string | null
): Promise<{ linked: boolean; twitterUrl?: string; bannerCreated?: boolean; error?: string }> {
  const dexData = await fetchDexScreenerWithRateLimit(tokenMint);
  if (!dexData) return { linked: false, error: 'Failed to fetch DexScreener' };
  
  const pair = dexData?.pairs?.[0];
  if (!pair?.info?.socials) return { linked: false, error: 'No socials' };
  
  let twitterUrl: string | null = null;
  for (const social of pair.info.socials) {
    if (social.url && isTwitterUrl(social.url)) {
      twitterUrl = social.url;
      break;
    }
  }
  
  if (!twitterUrl) return { linked: false, error: 'No Twitter URL' };
  
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
    if (!existingMints.includes(tokenMint)) {
      await supabase
        .from('x_communities')
        .update({
          linked_token_mints: [...existingMints, tokenMint],
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
        name: symbol ? `$${symbol} Community` : null,
        linked_token_mints: [tokenMint],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
  }
  
  // Also create/update token_banners if a banner exists
  let bannerCreated = false;
  const bannerUrl = pair?.info?.header;
  if (bannerUrl && communityId) {
    // Check if token_banners entry already exists
    const { data: existingBanner } = await supabase
      .from('token_banners')
      .select('id')
      .eq('token_address', tokenMint)
      .single();
    
    if (!existingBanner) {
      const { error: bannerError } = await supabase
        .from('token_banners')
        .insert({
          token_address: tokenMint,
          symbol: symbol || 'TOKEN',
          banner_url: bannerUrl,
          link_url: `https://dexscreener.com/solana/${tokenMint}`,
          x_community_id: communityId,
          is_active: true
        });
      
      if (!bannerError) {
        bannerCreated = true;
        console.log(`[enrich] Created token_banners entry for ${symbol || tokenMint}`);
      }
    }
  }
  
  return { linked: true, twitterUrl, bannerCreated };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));

    // BULK MODE - process all missing tokens with proper rate limiting
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

    // Process SEQUENTIALLY with 300ms delay between each (DexScreener rate limit safe)
    const maxTokens = Math.min(missingTokens.length, 50); // Limit to 50 per run for safety

    for (let i = 0; i < maxTokens; i++) {
      const token = missingTokens[i];
      
      // Rate limit: 300ms between requests
      if (i > 0) await delay(300);
      
      try {
        const result = await enrichSingleToken(supabase, token.token_mint, token.symbol);
        
        if (result.linked) {
          enriched++;
          results.push({ mint: token.token_mint, symbol: token.symbol || '?', twitterUrl: result.twitterUrl, linked: true });
          console.log(`[enrich] ${i+1}/${maxTokens} Linked ${token.symbol || token.token_mint.slice(0,8)} -> ${result.twitterUrl}`);
        } else {
          noTwitter++;
          results.push({ mint: token.token_mint, symbol: token.symbol || '?', linked: false });
        }
      } catch (e) {
        console.error(`[enrich] Error for ${token.token_mint}:`, e);
        results.push({ mint: token.token_mint, symbol: token.symbol || '?', linked: false });
      }
    }

    console.log(`[enrich-token-communities] Complete: ${enriched} enriched, ${noTwitter} no Twitter URL`);

    return new Response(JSON.stringify({ 
      success: true, 
      totalTokens: allTokens?.length || 0,
      alreadyLinked: linkedTokens.size,
      missing: missingTokens.length,
      processed: maxTokens,
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
