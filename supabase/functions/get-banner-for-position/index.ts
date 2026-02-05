import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fetch trending Dexscreener banners for position 1 fallback
async function fetchDexscreenerBanner(): Promise<{ banner: any } | null> {
  try {
    const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    if (!response.ok) return null;
    
    const boosts = await response.json();
    
    // Filter for Solana tokens with header banners
    const tokensWithBanners = boosts
      .filter((token: any) => 
        token.chainId === 'solana' && 
        token.header && 
        token.header.length > 0
      )
      .slice(0, 10);

    if (tokensWithBanners.length === 0) return null;

    // Random selection
    const randomToken = tokensWithBanners[Math.floor(Math.random() * tokensWithBanners.length)];
    
    // Fetch the real token symbol from DexScreener token endpoint
    let tokenSymbol = 'TOKEN';
    try {
      const tokenResponse = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${randomToken.tokenAddress}`);
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        // API returns array of pairs, get symbol from first pair
        if (Array.isArray(tokenData) && tokenData.length > 0 && tokenData[0].baseToken?.symbol) {
          tokenSymbol = tokenData[0].baseToken.symbol;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch token symbol, using fallback:', e);
    }
    
    return {
      banner: {
        id: `dex-${randomToken.tokenAddress}`,
        title: tokenSymbol, // Use actual ticker as title
        description: randomToken.description || '',
        image_url: randomToken.header,
        link_url: randomToken.url,
        position: 1,
        is_active: true,
        is_dexscreener: true,
        token_address: randomToken.tokenAddress,
        token_symbol: tokenSymbol, // Add explicit symbol field
      }
    };
  } catch (error) {
    console.error('Error fetching Dexscreener banners:', error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { position, includeDexscreener, tokenAddress, xCommunityId } = await req.json();

    if (!position || position < 1 || position > 4) {
      return new Response(
        JSON.stringify({ error: 'Valid position (1-4) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // PRIORITY 1: Check for community-specific or token-specific banner (position 1 only)
    if (position === 1 && (xCommunityId || tokenAddress)) {
      // First try lookup by X community ID, then fallback to token address
      let tokenBanner = null;
      
      if (xCommunityId) {
        const { data, error } = await supabase
          .from('token_banners')
          .select('*')
          .eq('x_community_id', xCommunityId)
          .eq('is_active', true)
          .single();
        if (data && !error) tokenBanner = data;
      }
      
      // Fallback to token address lookup if no community match
      if (!tokenBanner && tokenAddress) {
        const { data, error } = await supabase
          .from('token_banners')
          .select('*')
          .eq('token_address', tokenAddress)
          .eq('is_active', true)
          .single();
        if (data && !error) tokenBanner = data;
      }

      if (tokenBanner) {
        console.log('Serving community/token banner:', xCommunityId || tokenAddress, tokenBanner.symbol);
        return new Response(
          JSON.stringify({
            banner: {
              id: tokenBanner.id,
              title: tokenBanner.symbol || 'TOKEN',
              description: '',
              image_url: tokenBanner.banner_url,
              link_url: tokenBanner.link_url,
              position: 1,
              is_active: true,
              is_dexscreener: false,
              is_token_banner: true,
              token_address: tokenBanner.token_address,
              token_symbol: tokenBanner.symbol,
              x_community_id: tokenBanner.x_community_id,
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Get active banners for this position
    const now = new Date().toISOString();
    const { data: banners, error: bannersError } = await supabase
      .from('banner_ads')
      .select('*')
      .eq('position', position)
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('weight', { ascending: false });

    if (bannersError) {
      throw bannersError;
    }

    // If position 1 and includeDexscreener is true, mix in Dexscreener banners
    if (position === 1 && includeDexscreener !== false) {
      // If no scheduled banners, maybe show a Dexscreener banner (50% chance)
      const scheduledBanners = (banners || []).filter((b: any) => Boolean(b.start_date) || Boolean(b.end_date));
      
      if (scheduledBanners.length === 0 && Math.random() < 0.5) {
        const dexBanner = await fetchDexscreenerBanner();
        if (dexBanner) {
          console.log('Serving Dexscreener banner for position 1:', dexBanner.banner.title);
          return new Response(
            JSON.stringify(dexBanner),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    if (!banners || banners.length === 0) {
      // Try Dexscreener as fallback for position 1
      if (position === 1 && includeDexscreener !== false) {
        const dexBanner = await fetchDexscreenerBanner();
        if (dexBanner) {
          console.log('Serving Dexscreener fallback for position 1');
          return new Response(
            JSON.stringify(dexBanner),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ banner: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If any scheduled/paid banners are active (have a start/end window), prefer those
    // so the "default" always-on banner doesn't steal impressions.
    const scheduledBanners = banners.filter((b: any) => Boolean(b.start_date) || Boolean(b.end_date));
    const eligibleBanners = scheduledBanners.length > 0 ? scheduledBanners : banners;

    // Weighted random selection
    const totalWeight = eligibleBanners.reduce((sum: number, b: any) => sum + (b.weight || 1), 0);
    let random = Math.random() * totalWeight;

    let selectedBanner = eligibleBanners[0];
    for (const banner of eligibleBanners) {
      random -= (banner.weight || 1);
      if (random <= 0) {
        selectedBanner = banner;
        break;
      }
    }

    console.log('Selected banner', {
      position,
      eligibleCount: eligibleBanners.length,
      selectedId: selectedBanner?.id,
      selectedTitle: selectedBanner?.title,
    });

    // Log impression
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    
    if (authHeader) {
      const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userSupabase.auth.getUser();
      userId = user?.id || null;
    }

    await supabase.from('banner_impressions').insert({
      banner_id: selectedBanner.id,
      user_id: userId,
      session_id: req.headers.get('x-session-id') || null,
    });

    return new Response(
      JSON.stringify({ banner: selectedBanner }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error getting banner:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
