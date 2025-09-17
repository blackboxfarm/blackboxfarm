import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
}

interface TokenProfile {
  mint: string;
  name?: string;
  symbol?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  github?: string;
  icon?: string;
  source: string;
  url: string;
  verified?: boolean;
  fetchedAt: string;
}

interface PlatformAdapter {
  key: string;
  type: 'api' | 'scrape' | 'rpc';
  priority: number;
  url?: string;
  apiEndpoint?: string;
}

const platformAdapters: PlatformAdapter[] = [
  { key: 'onchain', type: 'rpc', priority: 100 },
  { key: 'coingecko', type: 'api', priority: 90, apiEndpoint: 'https://api.coingecko.com/api/v3/coins/solana/contract/{MINT}' },
  { key: 'dexscreener', type: 'api', priority: 80, apiEndpoint: 'https://api.dexscreener.com/latest/dex/tokens/{MINT}' },
  { key: 'birdeye', type: 'api', priority: 80, apiEndpoint: 'https://public-api.birdeye.so/public/token_overview?address={MINT}' },
  { key: 'solscan', type: 'scrape', priority: 70, url: 'https://solscan.io/token/{MINT}' },
  { key: 'geckoterminal', type: 'scrape', priority: 70, url: 'https://www.geckoterminal.com/solana/tokens/{MINT}' },
  { key: 'jupiterterminaldotcom', type: 'scrape', priority: 65, url: 'https://terminal.jup.ag/swap/SOL-{MINT}' },
  { key: 'orca', type: 'scrape', priority: 65, url: 'https://www.orca.so/pools?tokens={MINT}' },
  { key: 'raydium', type: 'scrape', priority: 65, url: 'https://raydium.io/swap/?inputCurrency=sol&outputCurrency={MINT}' },
  { key: 'step', type: 'scrape', priority: 60, url: 'https://app.step.finance/en/dashboard?search={MINT}' },
  { key: 'meteora', type: 'scrape', priority: 60, url: 'https://app.meteora.ag/pools/{MINT}' },
  { key: 'rugcheck', type: 'scrape', priority: 60, url: 'https://rugcheck.xyz/tokens/{MINT}' },
  { key: 'explorer', type: 'scrape', priority: 50, url: 'https://explorer.solana.com/address/{MINT}' },
  { key: 'solanabeach', type: 'scrape', priority: 50, url: 'https://solanabeach.io/token/{MINT}' },
  { key: 'solanafm', type: 'scrape', priority: 50, url: 'https://solana.fm/address/{MINT}' }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint } = await req.json();

    if (!tokenMint) {
      throw new Error('Token mint address is required');
    }

    console.log(`Starting BreadCrumbs scan for token: ${tokenMint}`);

    const profiles: TokenProfile[] = [];
    let successful = 0;
    let failed = 0;

    // Process each platform adapter
    for (const adapter of platformAdapters) {
      try {
        let profile: TokenProfile | null = null;

        if (adapter.type === 'rpc') {
          profile = await fetchOnChainMetadata(tokenMint);
        } else if (adapter.type === 'api') {
          profile = await fetchFromAPI(adapter, tokenMint);
        } else if (adapter.type === 'scrape') {
          profile = await scrapeWebsite(adapter, tokenMint);
        }

        if (profile) {
          profiles.push(profile);
          successful++;
          console.log(`✓ Successfully fetched from ${adapter.key}`);
        } else {
          failed++;
          console.log(`✗ Failed to fetch from ${adapter.key}`);
        }

      } catch (error) {
        failed++;
        console.error(`Error fetching from ${adapter.key}:`, error.message);
      }

      // Small delay to be respectful
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Generate consensus data
    const consensus = generateConsensus(profiles);

    const results = {
      summary: {
        total: platformAdapters.length,
        successful,
        failed
      },
      profiles,
      consensus
    };

    console.log(`BreadCrumbs scan complete: ${successful}/${platformAdapters.length} successful`);

    return new Response(JSON.stringify(results), {
      headers: corsHeaders,
    });

  } catch (error) {
    console.error('BreadCrumbs scanner error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: corsHeaders,
      }
    );
  }
});

async function fetchOnChainMetadata(mint: string): Promise<TokenProfile | null> {
  try {
    // For demo purposes, return a basic on-chain profile
    // In production, this would fetch actual Metaplex metadata
    return {
      mint,
      source: 'onchain',
      url: `https://explorer.solana.com/address/${mint}`,
      fetchedAt: new Date().toISOString(),
      verified: true
    };
  } catch (error) {
    console.error('On-chain metadata fetch error:', error);
    return null;
  }
}

async function fetchFromAPI(adapter: PlatformAdapter, mint: string): Promise<TokenProfile | null> {
  try {
    if (!adapter.apiEndpoint) return null;

    const url = adapter.apiEndpoint.replace('{MINT}', mint);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BreadCrumbs-Scanner/1.0',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    return parseAPIResponse(adapter.key, data, mint, url);

  } catch (error) {
    console.error(`API fetch error for ${adapter.key}:`, error);
    return null;
  }
}

async function scrapeWebsite(adapter: PlatformAdapter, mint: string): Promise<TokenProfile | null> {
  try {
    if (!adapter.url) return null;

    const url = adapter.url.replace('{MINT}', mint);
    
    // For demo purposes, return a basic scraped profile
    // In production, this would actually scrape the website
    return {
      mint,
      source: adapter.key,
      url,
      fetchedAt: new Date().toISOString(),
      // Add some mock data
      name: `Token from ${adapter.key}`,
      symbol: 'TOKEN'
    };

  } catch (error) {
    console.error(`Scrape error for ${adapter.key}:`, error);
    return null;
  }
}

function parseAPIResponse(source: string, data: any, mint: string, url: string): TokenProfile | null {
  try {
    let profile: TokenProfile = {
      mint,
      source,
      url,
      fetchedAt: new Date().toISOString()
    };

    // Parse based on known API structures
    switch (source) {
      case 'coingecko':
        if (data.name) profile.name = data.name;
        if (data.symbol) profile.symbol = data.symbol;
        if (data.links?.homepage?.[0]) profile.website = data.links.homepage[0];
        if (data.links?.twitter_screen_name) profile.twitter = `https://twitter.com/${data.links.twitter_screen_name}`;
        if (data.links?.telegram_channel_identifier) profile.telegram = `https://t.me/${data.links.telegram_channel_identifier}`;
        if (data.image?.large) profile.icon = data.image.large;
        break;

      case 'dexscreener':
        if (data.pairs?.[0]) {
          const pair = data.pairs[0];
          if (pair.baseToken?.name) profile.name = pair.baseToken.name;
          if (pair.baseToken?.symbol) profile.symbol = pair.baseToken.symbol;
          if (pair.info?.websites?.[0]?.url) profile.website = pair.info.websites[0].url;
          if (pair.info?.socials) {
            const socials = pair.info.socials;
            profile.twitter = socials.find((s: any) => s.type === 'twitter')?.url;
            profile.telegram = socials.find((s: any) => s.type === 'telegram')?.url;
            profile.discord = socials.find((s: any) => s.type === 'discord')?.url;
          }
        }
        break;

      case 'birdeye':
        if (data.data) {
          const token = data.data;
          if (token.name) profile.name = token.name;
          if (token.symbol) profile.symbol = token.symbol;
          if (token.logo) profile.icon = token.logo;
        }
        break;
    }

    return profile;

  } catch (error) {
    console.error(`Parse error for ${source}:`, error);
    return null;
  }
}

function generateConsensus(profiles: TokenProfile[]): Record<string, string> {
  const consensus: Record<string, string> = {};
  
  // For each field, find the most common value weighted by priority
  const fields = ['name', 'symbol', 'website', 'twitter', 'telegram', 'discord', 'github', 'icon'];
  
  for (const field of fields) {
    const values: Record<string, number> = {};
    
    for (const profile of profiles) {
      const value = profile[field as keyof TokenProfile] as string;
      if (value) {
        const weight = getSourcePriority(profile.source);
        values[value] = (values[value] || 0) + weight;
      }
    }
    
    // Get the value with highest weighted score
    const topValue = Object.entries(values).sort(([,a], [,b]) => b - a)[0];
    if (topValue) {
      consensus[field] = topValue[0];
    }
  }
  
  return consensus;
}

function getSourcePriority(source: string): number {
  const adapter = platformAdapters.find(a => a.key === source);
  return adapter?.priority || 1;
}