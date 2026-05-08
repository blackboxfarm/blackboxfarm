import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { getHeliusRpcUrl, getHeliusApiKey, redactHeliusSecrets } from './helius-client.ts';

export interface ProviderConfig {
  provider_name: string;
  is_enabled: boolean;
  priority: number;
}

export interface RpcResult<T> {
  data: T | null;
  error: string | null;
  provider: string;
}

// Get enabled providers sorted by priority
export async function getEnabledProviders(): Promise<ProviderConfig[]> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from('api_provider_config')
    .select('provider_name, is_enabled, priority')
    .eq('is_enabled', true)
    .order('priority', { ascending: true });

  if (error) {
    console.error('Failed to fetch provider config:', error);
    // Fallback: assume public_rpc is available
    return [{ provider_name: 'public_rpc', is_enabled: true, priority: 99 }];
  }

  return data || [];
}

// Check if a specific provider is enabled
export async function isProviderEnabled(providerName: string): Promise<boolean> {
  const providers = await getEnabledProviders();
  return providers.some(p => p.provider_name === providerName);
}

// Get the best available provider for a specific capability
export async function getBestProvider(capability: 'rpc' | 'tx_history' | 'token_metadata'): Promise<string> {
  const providers = await getEnabledProviders();
  
  const capabilityMap: Record<string, string[]> = {
    'rpc': ['helius', 'shyft', 'public_rpc'],
    // Solscan Pro v2.0 is preferred for tx history & meta — cheaper than Helius credits
    // and returns labelled CEX/program data we use downstream.
    'tx_history': ['solscan', 'helius', 'shyft'],
    'token_metadata': ['solscan', 'helius', 'shyft'],
  };

  const supportedProviders = capabilityMap[capability] || ['public_rpc'];
  
  for (const provider of providers) {
    if (supportedProviders.includes(provider.provider_name)) {
      return provider.provider_name;
    }
  }

  return 'public_rpc';
}

// Log provider error and update config
export async function logProviderError(providerName: string, error: string): Promise<void> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  await supabase
    .from('api_provider_config')
    .update({
      last_error_at: new Date().toISOString(),
      error_count: supabase.rpc('increment', { x: 1 }) // Will fallback to raw increment
    })
    .eq('provider_name', providerName);

  console.error(`[${providerName}] Error: ${error}`);
}

// Get RPC URL based on enabled providers
export async function getRpcUrl(): Promise<string> {
  const provider = await getBestProvider('rpc');
  
  switch (provider) {
    case 'helius':
      const heliusKey = getHeliusApiKey();
      return heliusKey ? getHeliusRpcUrl(heliusKey) : getPublicRpcUrl();
    case 'shyft':
      const shyftKey = Deno.env.get('SHYFT_API_KEY');
      return shyftKey ? `https://rpc.shyft.to?api_key=${shyftKey}` : getPublicRpcUrl();
    case 'public_rpc':
    default:
      return getPublicRpcUrl();
  }
}

// Public RPC endpoints (free, rate-limited)
const PUBLIC_RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://rpc.ankr.com/solana',
];

let currentRpcIndex = 0;

export function getPublicRpcUrl(): string {
  // Round-robin through public endpoints
  const url = PUBLIC_RPC_ENDPOINTS[currentRpcIndex];
  currentRpcIndex = (currentRpcIndex + 1) % PUBLIC_RPC_ENDPOINTS.length;
  return url;
}

// Fetch transaction history with provider fallback
export async function fetchTransactionHistory(
  walletAddress: string,
  limit: number = 100
): Promise<RpcResult<any[]>> {
  const provider = await getBestProvider('tx_history');
  
  try {
    switch (provider) {
      case 'helius':
        return await fetchHeliusTransactions(walletAddress, limit);
      case 'solscan':
        return await fetchSolscanTransactions(walletAddress, limit);
      default:
        return await fetchRpcTransactions(walletAddress, limit);
    }
  } catch (error) {
    await logProviderError(provider, (error as Error).message);
    // Try fallback
    if (provider !== 'public_rpc') {
      console.log(`Falling back from ${provider} to public_rpc`);
      return await fetchRpcTransactions(walletAddress, limit);
    }
    return { data: null, error: (error as Error).message, provider };
  }
}

async function fetchHeliusTransactions(wallet: string, limit: number): Promise<RpcResult<any[]>> {
  const heliusKey = getHeliusApiKey();
  if (!heliusKey) {
    throw new Error('HELIUS_API_KEY not configured');
  }

  const response = await fetch(
    `https://api.helius.xyz/v0/addresses/${wallet}/transactions?limit=${limit}`,
    { headers: { 'X-Api-Key': heliusKey } }
  );

  if (!response.ok) {
    throw new Error(`Helius API error: ${response.status}`);
  }

  const data = await response.json();
  return { data, error: null, provider: 'helius' };
}

async function fetchSolscanTransactions(wallet: string, limit: number): Promise<RpcResult<any[]>> {
  const solscanKey = Deno.env.get('SOLSCAN_API_KEY');
  if (!solscanKey) {
    throw new Error('SOLSCAN_API_KEY not configured');
  }

  // Pro v2.0 transfer feed — labelled, faster than Helius DAS, and routed through the
  // shared rate-limiter (800rpm self-throttle + LRU cache).
  const { solscanFetch } = await import('./solscan-rate-limiter.ts');
  const url = `https://pro-api.solscan.io/v2.0/account/transfer?address=${wallet}&page=1&page_size=${Math.min(limit, 100)}&sort_by=block_time&sort_order=desc`;
  const resp = await solscanFetch(url, {
    headers: { Accept: 'application/json', token: solscanKey },
    cacheTtlMs: 60_000, // 60s — transfers are time-sensitive
    timeoutMs: 8000,
  });

  if (!resp.ok) {
    throw new Error(`Solscan Pro transfer ${resp.status}`);
  }

  const raw = (resp.body as any)?.data || [];
  // Normalize Pro v2.0 shape into the legacy `{ lamport, src, txHash, blockTime }` shape
  // that downstream consumers (developer-wallet-tracer, etc.) already understand.
  const data = raw.map((row: any) => ({
    lamport: typeof row.amount === 'number' ? row.amount : Number(row.amount || 0),
    src: row.from_address,
    dst: row.to_address,
    txHash: row.trans_id,
    signature: row.trans_id,
    blockTime: row.block_time,
    timestamp: row.block_time,
    activity_type: row.activity_type,
    token_address: row.token_address,
    _provider: 'solscan_pro',
  }));

  return { data, error: null, provider: 'solscan_pro' };
}

async function fetchRpcTransactions(wallet: string, limit: number): Promise<RpcResult<any[]>> {
  const rpcUrl = getPublicRpcUrl();
  
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getSignaturesForAddress',
      params: [wallet, { limit }]
    })
  });

  if (!response.ok) {
    throw new Error(`RPC error: ${response.status}`);
  }

  const json = await response.json();
  if (json.error) {
    throw new Error(json.error.message);
  }

  return { data: json.result, error: null, provider: 'public_rpc' };
}

// Fetch token balance with provider fallback
export async function fetchTokenBalance(
  walletAddress: string,
  tokenMint: string
): Promise<RpcResult<{ balance: number; decimals: number }>> {
  const rpcUrl = await getRpcUrl();
  
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          walletAddress,
          { mint: tokenMint },
          { encoding: 'jsonParsed' }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`RPC error: ${response.status}`);
    }

    const json = await response.json();
    if (json.error) {
      throw new Error(json.error.message);
    }

    const accounts = json.result?.value || [];
    if (accounts.length === 0) {
      return { data: { balance: 0, decimals: 0 }, error: null, provider: 'public_rpc' };
    }

    const tokenInfo = accounts[0].account.data.parsed.info;
    return {
      data: {
        balance: tokenInfo.tokenAmount.uiAmount || 0,
        decimals: tokenInfo.tokenAmount.decimals
      },
      error: null,
      provider: 'public_rpc'
    };
  } catch (error) {
    return { data: null, error: (error as Error).message, provider: 'public_rpc' };
  }
}
