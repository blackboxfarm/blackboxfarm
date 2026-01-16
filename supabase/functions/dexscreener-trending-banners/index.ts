import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BoostedToken {
  url: string;
  chainId: string;
  tokenAddress: string;
  amount?: number;
  totalAmount?: number;
  icon?: string;
  header?: string;
  description?: string;
  links?: Array<{ type: string; label: string; url: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Fetch top boosted tokens from Dexscreener
    const response = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    
    if (!response.ok) {
      throw new Error(`Dexscreener API error: ${response.status}`);
    }

    const boosts: BoostedToken[] = await response.json();
    
    // Filter for Solana tokens that have header banners
    const tokensWithBanners = boosts
      .filter(token => 
        token.chainId === 'solana' && 
        token.header && 
        token.header.length > 0
      )
      .slice(0, 10) // Top 10
      .map(token => ({
        tokenAddress: token.tokenAddress,
        dexUrl: token.url,
        bannerUrl: token.header,
        iconUrl: token.icon,
        description: token.description,
        boostAmount: token.totalAmount || token.amount || 0,
      }));

    console.log(`Found ${tokensWithBanners.length} Solana tokens with banners`);

    // Return a random one for rotation, plus the full list
    const randomIndex = Math.floor(Math.random() * tokensWithBanners.length);
    const randomBanner = tokensWithBanners[randomIndex] || null;

    return new Response(
      JSON.stringify({
        success: true,
        count: tokensWithBanners.length,
        randomBanner,
        allBanners: tokensWithBanners,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error fetching trending banners:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
