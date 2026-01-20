/**
 * Unified CoinGecko API Helper
 * Supports Demo and Pro tiers with automatic authentication
 * 
 * Demo tier: 10k calls/month, 30 req/min, 60s freshness
 * Basic tier: 100k calls/month, 250 req/min, 10s freshness
 */

export interface CoinGeckoConfig {
  baseUrl: string;
  headers: Record<string, string>;
  tier: 'pro' | 'demo' | 'free';
}

/**
 * Get CoinGecko API configuration based on environment
 */
export function getCoinGeckoConfig(): CoinGeckoConfig {
  const apiKey = Deno.env.get('COINGECKO_API_KEY');
  
  // Pro keys start with CG- and don't contain 'demo'
  // Demo keys also start with CG- but we'll use demo endpoint to be safe
  const isPro = apiKey && apiKey.startsWith('CG-') && apiKey.length > 20;
  
  // For now, always use demo endpoint unless explicitly configured
  // When upgrading to Basic/Pro, this can be changed
  const useProEndpoint = isPro && Deno.env.get('COINGECKO_USE_PRO') === 'true';
  
  return {
    baseUrl: useProEndpoint 
      ? 'https://pro-api.coingecko.com/api/v3'
      : 'https://api.coingecko.com/api/v3',
    headers: apiKey ? {
      'x-cg-demo-api-key': apiKey,
      'Accept': 'application/json',
    } : {
      'Accept': 'application/json',
    },
    tier: useProEndpoint ? 'pro' : (apiKey ? 'demo' : 'free'),
  };
}

/**
 * Fetch data from CoinGecko API with authentication
 */
export async function fetchCoinGecko<T = any>(
  endpoint: string, 
  timeout = 5000
): Promise<T> {
  const config = getCoinGeckoConfig();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  const url = `${config.baseUrl}${endpoint}`;
  console.log(`[CoinGecko] Fetching ${endpoint} (tier: ${config.tier})`);
  
  try {
    const response = await fetch(url, {
      headers: config.headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`CoinGecko ${config.tier}: HTTP ${response.status} - ${errorText}`);
    }
    
    return response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`CoinGecko ${config.tier}: Request timeout (${timeout}ms)`);
    }
    throw error;
  }
}

/**
 * Get SOL price in USD
 */
export async function getSolPrice(): Promise<number> {
  const data = await fetchCoinGecko<{ solana?: { usd?: number } }>(
    '/simple/price?ids=solana&vs_currencies=usd'
  );
  const price = data?.solana?.usd;
  if (!price || typeof price !== 'number' || price <= 0) {
    throw new Error('Invalid SOL price from CoinGecko');
  }
  return price;
}

/**
 * Get ETH price in USD
 */
export async function getEthPrice(): Promise<number> {
  const data = await fetchCoinGecko<{ ethereum?: { usd?: number } }>(
    '/simple/price?ids=ethereum&vs_currencies=usd'
  );
  const price = data?.ethereum?.usd;
  if (!price || typeof price !== 'number' || price <= 0) {
    throw new Error('Invalid ETH price from CoinGecko');
  }
  return price;
}

/**
 * Get multiple token prices by CoinGecko IDs
 */
export async function getTokenPrices(
  ids: string[]
): Promise<Record<string, { usd: number }>> {
  const data = await fetchCoinGecko<Record<string, { usd?: number }>>(
    `/simple/price?ids=${ids.join(',')}&vs_currencies=usd`
  );
  return data;
}

/**
 * Get token price by Solana contract address
 */
export async function getTokenPriceByContract(
  contractAddress: string
): Promise<number> {
  const data = await fetchCoinGecko<Record<string, { usd?: number }>>(
    `/simple/token_price/solana?contract_addresses=${contractAddress}&vs_currencies=usd`
  );
  return data?.[contractAddress.toLowerCase()]?.usd || 0;
}

/**
 * Get SOL price with detailed result for logging
 */
export async function getSolPriceWithDetails(): Promise<{
  price: number;
  tier: string;
  timestamp: string;
}> {
  const config = getCoinGeckoConfig();
  const price = await getSolPrice();
  return {
    price,
    tier: config.tier,
    timestamp: new Date().toISOString(),
  };
}
