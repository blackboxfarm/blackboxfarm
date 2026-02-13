import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getHeliusApiKey, getHeliusRestUrl } from '../_shared/helius-client.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Comprehensive CEX hot wallet database
const KNOWN_CEX_WALLETS: Record<string, string[]> = {
  'Binance': [
    '5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9',
    '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2',
    '2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S',
  ],
  'Coinbase': [
    'H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS',
    'GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE',
    '2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm',
  ],
  'Kraken': [
    'CUcQaP6MbHextoRASwoEoJoSHfSdJLQoydqMDvyjgMSA',
    'FWznbcNXWfZHZyrLLxr9pJQP8rnQmYFwbvhpPPjSEpJT',
  ],
  'Bybit': [
    'AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2',
    'Hzrz6e9n8fG3tLa69jA1RH3Xt1LaC5BbZn9b3tvhoQin',
  ],
  'OKX': [
    '5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD',
    'JCNCMFXo5M5qwUPg2Utu1u6YWp3MbygxqBsBeXXJfrw',
  ],
  'KuCoin': [
    'BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6',
    'HXLN2k7GZNdLUPeFLxQ4uE9jhCy3RHPuLc8oFmQn8RfE',
  ],
  'Gate.io': [
    'u6PJ8DtQuPFnfmwHbGFULQ4u4mBzgkr8WQGBB3dQEQj',
  ],
  'MEXC': [
    'ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ',
  ],
  'Phantom Swap': [
    'PhantomSwap111111111111111111111111111111111',
  ],
  'Jupiter': [
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  ],
  'Raydium': [
    'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr',
    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
  ],
};

interface InvestigationRequest {
  tokenMint: string;
  maxSellers?: number;
  traceDepth?: number;
}

interface SellerInfo {
  wallet: string;
  totalSold: number;
  sellCount: number;
  firstSell: string;
  lastSell: string;
  avgSellSize: number;
}

interface BundleInfo {
  fundingSource: string;
  wallets: string[];
  totalSold: number;
  isCex: boolean;
  cexName?: string;
}

interface WalletTrace {
  wallet: string;
  depth: number;
  fundingSources: { wallet: string; amount: number; cexName?: string }[];
  isCexFunded: boolean;
  cexName?: string;
}

function getCexName(wallet: string): string | null {
  for (const [cex, wallets] of Object.entries(KNOWN_CEX_WALLETS)) {
    if (wallets.includes(wallet)) {
      return cex;
    }
  }
  return null;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    if (response.status === 429) {
      console.log(`Rate limited, waiting ${(i + 1) * 1000}ms before retry...`);
      await delay((i + 1) * 1000);
      continue;
    }
    return response;
  }
  throw new Error('Max retries exceeded');
}

async function getTokenInfo(tokenMint: string): Promise<any> {
  try {
    // Try DexScreener first
    const dexResponse = await fetchWithRetry(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (dexResponse.ok) {
      const data = await dexResponse.json();
      if (data.pairs && data.pairs.length > 0) {
        const pair = data.pairs[0];
        return {
          name: pair.baseToken?.name || 'Unknown',
          symbol: pair.baseToken?.symbol || 'UNKNOWN',
          priceUsd: parseFloat(pair.priceUsd) || 0,
          liquidity: pair.liquidity?.usd || 0,
          marketCap: pair.marketCap || 0,
          priceChange24h: pair.priceChange?.h24 || 0,
          volume24h: pair.volume?.h24 || 0,
        };
      }
    }
    
    // Fallback to Solana Tracker
    const trackerResponse = await fetchWithRetry(
      `https://data.solanatracker.io/tokens/${tokenMint}`,
      { headers: { 'x-api-key': Deno.env.get('SOLANA_TRACKER_API_KEY') || '' } }
    );
    
    if (trackerResponse.ok) {
      const data = await trackerResponse.json();
      return {
        name: data.name || 'Unknown',
        symbol: data.symbol || 'UNKNOWN',
        priceUsd: data.price || 0,
        liquidity: data.pools?.[0]?.liquidity?.usd || 0,
        marketCap: data.market_cap || 0,
        priceChange24h: 0,
        volume24h: 0,
      };
    }
    
    return null;
  } catch (error) {
    console.error('Error fetching token info:', error);
    return null;
  }
}

async function getTokenHolders(tokenMint: string): Promise<any[]> {
  try {
    const response = await fetchWithRetry(
      `https://data.solanatracker.io/tokens/${tokenMint}/holders`,
      { headers: { 'x-api-key': Deno.env.get('SOLANA_TRACKER_API_KEY') || '' } }
    );
    
    if (response.ok) {
      const data = await response.json();
      // Handle different response formats
      if (Array.isArray(data)) return data;
      if (data?.holders && Array.isArray(data.holders)) return data.holders;
      if (data?.data && Array.isArray(data.data)) return data.data;
      return [];
    }
    return [];
  } catch (error) {
    console.error('Error fetching holders:', error);
    return [];
  }
}

async function getTokenTransactions(tokenMint: string, heliusApiKey: string): Promise<any[]> {
  try {
    // Use Helius to get token transactions
    const response = await fetchWithRetry(
      getHeliusRestUrl(`/v0/addresses/${tokenMint}/transactions`, { type: 'SWAP' }),
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
}

async function getWalletFundingHistory(wallet: string, heliusApiKey: string): Promise<any[]> {
  try {
    const response = await fetchWithRetry(
      getHeliusRestUrl(`/v0/addresses/${wallet}/transactions`, { limit: '50' }),
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (response.ok) {
      return await response.json();
    }
    return [];
  } catch (error) {
    console.error('Error fetching wallet history:', error);
    return [];
  }
}

async function traceWalletFunding(
  wallet: string, 
  heliusApiKey: string, 
  maxDepth: number,
  visited: Set<string> = new Set()
): Promise<WalletTrace> {
  const trace: WalletTrace = {
    wallet,
    depth: 0,
    fundingSources: [],
    isCexFunded: false,
  };
  
  // Check if this wallet itself is a CEX
  const cexName = getCexName(wallet);
  if (cexName) {
    trace.isCexFunded = true;
    trace.cexName = cexName;
    return trace;
  }
  
  if (visited.has(wallet) || maxDepth <= 0) {
    return trace;
  }
  
  visited.add(wallet);
  
  try {
    const transactions = await getWalletFundingHistory(wallet, heliusApiKey);
    await delay(100); // Rate limiting
    
    // Find incoming SOL transfers
    for (const tx of transactions.slice(0, 20)) {
      if (tx.type === 'TRANSFER' && tx.nativeTransfers) {
        for (const transfer of tx.nativeTransfers) {
          if (transfer.toUserAccount === wallet && transfer.amount > 0.01 * 1e9) {
            const sourceWallet = transfer.fromUserAccount;
            const sourceCex = getCexName(sourceWallet);
            
            trace.fundingSources.push({
              wallet: sourceWallet,
              amount: transfer.amount / 1e9,
              cexName: sourceCex || undefined,
            });
            
            if (sourceCex) {
              trace.isCexFunded = true;
              trace.cexName = sourceCex;
            }
          }
        }
      }
    }
    
    // Recursive trace if no CEX found yet and depth allows
    if (!trace.isCexFunded && maxDepth > 1) {
      for (const source of trace.fundingSources.slice(0, 3)) {
        const deepTrace = await traceWalletFunding(
          source.wallet, 
          heliusApiKey, 
          maxDepth - 1,
          visited
        );
        
        if (deepTrace.isCexFunded) {
          trace.isCexFunded = true;
          trace.cexName = deepTrace.cexName;
          trace.depth = deepTrace.depth + 1;
          break;
        }
      }
    }
  } catch (error) {
    console.error(`Error tracing wallet ${wallet}:`, error);
  }
  
  return trace;
}

function detectBundles(traces: WalletTrace[]): BundleInfo[] {
  const fundingMap = new Map<string, string[]>();
  
  // Group wallets by their primary funding source
  for (const trace of traces) {
    if (trace.fundingSources.length > 0) {
      const primaryFunder = trace.fundingSources[0].wallet;
      if (!fundingMap.has(primaryFunder)) {
        fundingMap.set(primaryFunder, []);
      }
      fundingMap.get(primaryFunder)!.push(trace.wallet);
    }
  }
  
  const bundles: BundleInfo[] = [];
  
  // Only consider bundles with 3+ wallets
  for (const [funder, wallets] of fundingMap) {
    if (wallets.length >= 3) {
      const cexName = getCexName(funder);
      bundles.push({
        fundingSource: funder,
        wallets,
        totalSold: 0, // Will be calculated later
        isCex: !!cexName,
        cexName: cexName || undefined,
      });
    }
  }
  
  return bundles;
}

function calculateRiskScore(
  priceDropPercent: number,
  liquidityUsd: number,
  bundlesDetected: number,
  cexTracesFound: number,
  topSellerConcentration: number
): { score: number; factors: string[] } {
  let score = 0;
  const factors: string[] = [];
  
  // Price drop severity (0-30 points)
  if (priceDropPercent >= 90) {
    score += 30;
    factors.push('Catastrophic price drop (90%+)');
  } else if (priceDropPercent >= 70) {
    score += 25;
    factors.push('Severe price drop (70-90%)');
  } else if (priceDropPercent >= 50) {
    score += 20;
    factors.push('Major price drop (50-70%)');
  } else if (priceDropPercent >= 30) {
    score += 10;
    factors.push('Significant price drop (30-50%)');
  }
  
  // Liquidity status (0-25 points)
  if (liquidityUsd === 0) {
    score += 25;
    factors.push('Zero liquidity (rug confirmed)');
  } else if (liquidityUsd < 100) {
    score += 20;
    factors.push('Near-zero liquidity');
  } else if (liquidityUsd < 1000) {
    score += 10;
    factors.push('Very low liquidity');
  }
  
  // Bundle detection (0-20 points)
  if (bundlesDetected >= 3) {
    score += 20;
    factors.push(`Multiple wallet bundles detected (${bundlesDetected})`);
  } else if (bundlesDetected >= 1) {
    score += 10;
    factors.push(`Wallet bundle detected (${bundlesDetected})`);
  }
  
  // CEX traces (can reduce score by up to 10 points)
  if (cexTracesFound >= 5) {
    score -= 10;
    factors.push(`Multiple CEX-linked wallets (accountability possible)`);
  } else if (cexTracesFound >= 1) {
    score -= 5;
    factors.push(`Some CEX-linked wallets found`);
  } else {
    score += 15;
    factors.push('No CEX traces found (anonymized sellers)');
  }
  
  // Top seller concentration (0-10 points)
  if (topSellerConcentration >= 80) {
    score += 10;
    factors.push('Top 10 sellers control 80%+ of sells');
  } else if (topSellerConcentration >= 50) {
    score += 5;
    factors.push('Top 10 sellers control 50%+ of sells');
  }
  
  return { score: Math.max(0, Math.min(100, score)), factors };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    const heliusApiKey = getHeliusApiKey();
    
    const body = await req.json();
    const { tokenMint, maxSellers = 30, traceDepth = 2 }: InvestigationRequest = body;
    
    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'tokenMint is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Starting rug investigation for ${tokenMint}`);
    console.log(`HELIUS_API_KEY configured: ${!!heliusApiKey}`);
    
    // Create investigation record
    const { data: investigation, error: insertError } = await supabase
      .from('rug_investigations')
      .insert({
        token_mint: tokenMint,
        status: 'in_progress',
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error creating investigation:', insertError);
    }
    
    const investigationId = investigation?.id;
    
    // Helper to update status on failure
    const failInvestigation = async (errorMessage: string) => {
      console.error('Investigation failed:', errorMessage);
      if (investigationId) {
        await supabase
          .from('rug_investigations')
          .update({ status: 'failed', error_message: errorMessage })
          .eq('id', investigationId);
      }
    };
    
    // Step 1: Get token info
    console.log('Fetching token info...');
    let tokenInfo;
    try {
      tokenInfo = await getTokenInfo(tokenMint);
    } catch (error) {
      await failInvestigation(`Failed to fetch token info: ${error.message}`);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch token info', details: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!tokenInfo) {
      await failInvestigation('Could not fetch token info - token may not exist');
      return new Response(
        JSON.stringify({ error: 'Could not fetch token info', tokenMint, status: 'failed' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Token info:', tokenInfo);
    
    // Step 2: Get current holders
    console.log('Fetching holders...');
    const holders = await getTokenHolders(tokenMint);
    console.log(`Found ${holders.length} holders`);
    
    // Step 3: Get transaction history (if Helius key available)
    let transactions: any[] = [];
    let sellerAnalysis: SellerInfo[] = [];
    let walletTraces: WalletTrace[] = [];
    let bundles: BundleInfo[] = [];
    let cexTracesFound = 0;
    
    if (heliusApiKey) {
      console.log('Fetching transaction history from Helius...');
      try {
        transactions = await getTokenTransactions(tokenMint, heliusApiKey);
        console.log(`Found ${transactions.length} transactions`);
      } catch (error) {
        console.error('Error fetching transactions:', error);
        transactions = [];
      }
      
      // Analyze sellers
      const sellerMap = new Map<string, SellerInfo>();
      
      for (const tx of transactions) {
        // Look for sell transactions
        if (tx.tokenTransfers) {
          for (const transfer of tx.tokenTransfers) {
            if (transfer.mint === tokenMint) {
              const seller = transfer.fromUserAccount;
              if (seller && transfer.tokenAmount > 0) {
                if (!sellerMap.has(seller)) {
                  sellerMap.set(seller, {
                    wallet: seller,
                    totalSold: 0,
                    sellCount: 0,
                    firstSell: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
                    lastSell: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
                    avgSellSize: 0,
                  });
                }
                
                const info = sellerMap.get(seller)!;
                info.totalSold += transfer.tokenAmount;
                info.sellCount++;
                info.lastSell = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : info.lastSell;
              }
            }
          }
        }
      }
      
      // Calculate average sell sizes
      sellerAnalysis = Array.from(sellerMap.values())
        .map(s => ({ ...s, avgSellSize: s.totalSold / s.sellCount }))
        .sort((a, b) => b.totalSold - a.totalSold)
        .slice(0, maxSellers);
      
      console.log(`Identified ${sellerAnalysis.length} sellers`);
      
      // Step 4: Trace wallet funding for top sellers (limit to 10 to avoid timeout)
      console.log('Tracing wallet funding sources...');
      const sellersToTrace = sellerAnalysis.slice(0, 10);
      for (const seller of sellersToTrace) {
        try {
          const trace = await traceWalletFunding(seller.wallet, heliusApiKey, traceDepth);
          walletTraces.push(trace);
          
          if (trace.isCexFunded) {
            cexTracesFound++;
          }
          
          await delay(150); // Rate limiting
        } catch (error) {
          console.error(`Error tracing wallet ${seller.wallet}:`, error);
        }
      }
      
      // Step 5: Detect bundles
      console.log('Detecting wallet bundles...');
      bundles = detectBundles(walletTraces);
      console.log(`Detected ${bundles.length} bundles`);
    } else {
      console.warn('HELIUS_API_KEY not configured - skipping transaction analysis');
    }
    
    // Calculate risk score
    const priceDropPercent = tokenInfo.priceChange24h < 0 ? Math.abs(tokenInfo.priceChange24h) : 0;
    const topSellerConcentration = sellerAnalysis.length > 0 
      ? (sellerAnalysis.slice(0, 10).reduce((sum, s) => sum + s.totalSold, 0) / 
         sellerAnalysis.reduce((sum, s) => sum + s.totalSold, 0)) * 100
      : 0;
    
    const riskAssessment = calculateRiskScore(
      priceDropPercent,
      tokenInfo.liquidity,
      bundles.length,
      cexTracesFound,
      topSellerConcentration
    );
    
    // Build full report
    const report = {
      token: {
        mint: tokenMint,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        priceUsd: tokenInfo.priceUsd,
        liquidityUsd: tokenInfo.liquidity,
        marketCapUsd: tokenInfo.marketCap,
        priceChange24h: tokenInfo.priceChange24h,
      },
      holders: {
        total: holders.length,
        topHolders: holders.slice(0, 10),
      },
      sellers: {
        total: sellerAnalysis.length,
        topSellers: sellerAnalysis.slice(0, 20),
        totalSold: sellerAnalysis.reduce((sum, s) => sum + s.totalSold, 0),
      },
      bundles: {
        detected: bundles.length,
        details: bundles,
      },
      cexTraces: {
        found: cexTracesFound,
        traces: walletTraces.filter(t => t.isCexFunded).map(t => ({
          wallet: t.wallet,
          cex: t.cexName,
          depth: t.depth,
        })),
      },
      riskAssessment: {
        score: riskAssessment.score,
        level: riskAssessment.score >= 70 ? 'CRITICAL' 
             : riskAssessment.score >= 50 ? 'HIGH'
             : riskAssessment.score >= 30 ? 'MEDIUM'
             : 'LOW',
        factors: riskAssessment.factors,
      },
      investigatedAt: new Date().toISOString(),
    };
    
    // Update investigation record
    if (investigationId) {
      try {
        await supabase
          .from('rug_investigations')
          .update({
            token_name: tokenInfo.name,
            token_symbol: tokenInfo.symbol,
            price_at_investigation: tokenInfo.priceUsd,
            liquidity_usd: tokenInfo.liquidity,
            market_cap_usd: tokenInfo.marketCap,
            price_drop_percent: priceDropPercent,
            total_sellers: sellerAnalysis.length,
            total_sold_usd: 0,
            top_seller_wallets: sellerAnalysis.slice(0, 20),
            bundles_detected: bundles.length,
            bundle_details: bundles,
            cex_traces_found: cexTracesFound,
            cex_trace_details: walletTraces.filter(t => t.isCexFunded),
            rug_risk_score: riskAssessment.score,
            risk_factors: riskAssessment.factors,
            full_report: report,
            status: 'completed',
          })
          .eq('id', investigationId);
      } catch (error) {
        console.error('Error updating investigation:', error);
      }
    }
    
    console.log('Investigation complete');
    
    return new Response(
      JSON.stringify(report),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Investigation error:', error);
    
    // Try to update investigation status to failed
    try {
      await supabase
        .from('rug_investigations')
        .update({ status: 'failed', error_message: String(error.message || error) })
        .eq('status', 'in_progress');
    } catch {}
    
    return new Response(
      JSON.stringify({ error: error.message || 'Investigation failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
