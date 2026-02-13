import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusRestUrl } from '../_shared/helius-client.ts';
enableHeliusTracking('offspring-mint-scanner');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface MintedToken {
  tokenMint: string;
  name?: string;
  symbol?: string;
  createdAt?: string;
  creatorWallet: string;
  depth: number;
  fundingPath: string[];
}

interface OffspringWallet {
  wallet: string;
  depth: number;
  amountReceived: number;
  timestamp?: string;
  hasMinted: boolean;
  mintedTokens: MintedToken[];
  children: OffspringWallet[];
}

interface ScanResult {
  parentWallet: string;
  totalOffspring: number;
  totalMinters: number;
  totalTokensMinted: number;
  allMintedTokens: MintedToken[];
  offspringTree: OffspringWallet;
  scanDepth: number;
  scanDuration: number;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 1000 * (i + 1);
        console.log(`Rate limited, waiting ${waitTime}ms...`);
        await delay(waitTime);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      await delay(500 * (i + 1));
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

// Get outgoing SOL transfers from a wallet (children it funded)
async function getOutgoingTransfers(
  wallet: string,
  heliusApiKey: string,
  minAmountSol: number = 0.01
): Promise<Array<{ to: string; amount: number; timestamp: string; signature: string }>> {
  try {
    const url = getHeliusRestUrl(`/v0/addresses/${wallet}/transactions`, { limit: '100' });
    const response = await fetchWithRetry(url, { method: 'GET' });
    
    if (!response.ok) {
      console.error(`Failed to fetch transactions for ${wallet}: ${response.status}`);
      return [];
    }
    
    const transactions = await response.json();
    const outgoing: Array<{ to: string; amount: number; timestamp: string; signature: string }> = [];
    
    for (const tx of transactions) {
      if (tx.nativeTransfers) {
        for (const transfer of tx.nativeTransfers) {
          if (transfer.fromUserAccount === wallet && transfer.toUserAccount !== wallet) {
            const amount = (transfer.amount || 0) / 1e9;
            if (amount >= minAmountSol) {
              outgoing.push({
                to: transfer.toUserAccount,
                amount,
                timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : '',
                signature: tx.signature
              });
            }
          }
        }
      }
    }
    
    // Dedupe by recipient and keep the first (earliest) transfer
    const uniqueRecipients = new Map<string, typeof outgoing[0]>();
    for (const transfer of outgoing.reverse()) {
      if (!uniqueRecipients.has(transfer.to)) {
        uniqueRecipients.set(transfer.to, transfer);
      }
    }
    
    return Array.from(uniqueRecipients.values());
  } catch (error) {
    console.error(`Error getting outgoing transfers for ${wallet}:`, error);
    return [];
  }
}

// Check if a wallet has minted any tokens (especially Pump.fun tokens)
async function getWalletMintedTokens(
  wallet: string,
  heliusApiKey: string
): Promise<MintedToken[]> {
  try {
    const url = getHeliusRestUrl(`/v0/addresses/${wallet}/transactions`, { limit: '100', type: 'CREATE' });
    const response = await fetchWithRetry(url, { method: 'GET' });
    
    if (!response.ok) return [];
    
    const transactions = await response.json();
    const mintedTokens: MintedToken[] = [];
    const seenMints = new Set<string>();
    
    for (const tx of transactions) {
      // Check for Pump.fun token creations
      if (tx.source === 'PUMP_FUN' || tx.instructions?.some((ix: any) => 
        ix.programId === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
      )) {
        // Extract token mint from various places
        let tokenMint = tx.events?.token?.mint || 
                        tx.tokenTransfers?.[0]?.mint ||
                        tx.instructions?.find((ix: any) => ix.accounts?.length > 0)?.accounts?.[0];
        
        if (tokenMint && !seenMints.has(tokenMint)) {
          seenMints.add(tokenMint);
          mintedTokens.push({
            tokenMint,
            name: tx.events?.token?.tokenName || tx.description?.match(/created\s+(\w+)/)?.[1],
            symbol: tx.events?.token?.tokenSymbol,
            createdAt: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : undefined,
            creatorWallet: wallet,
            depth: 0,
            fundingPath: []
          });
        }
      }
      
      // Also check for general token mints
      if (tx.type === 'TOKEN_MINT' || tx.type === 'CREATE') {
        const tokenMint = tx.tokenTransfers?.[0]?.mint || tx.events?.token?.mint;
        if (tokenMint && !seenMints.has(tokenMint)) {
          seenMints.add(tokenMint);
          mintedTokens.push({
            tokenMint,
            name: tx.events?.token?.tokenName,
            symbol: tx.events?.token?.tokenSymbol,
            createdAt: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : undefined,
            creatorWallet: wallet,
            depth: 0,
            fundingPath: []
          });
        }
      }
    }
    
    // Also try to get tokens where this wallet is the update authority/creator
    try {
      const assetsUrl = getHeliusRestUrl(`/v0/addresses/${wallet}/balances`);
      const assetsResponse = await fetchWithRetry(assetsUrl, { method: 'GET' });
      if (assetsResponse.ok) {
        const assets = await assetsResponse.json();
        // Check if wallet has 100% supply of any token (creator pattern)
        for (const token of assets.tokens || []) {
          if (token.amount && token.decimals !== undefined) {
            // This is just a balance check, not definitive creation proof
          }
        }
      }
    } catch {}
    
    return mintedTokens;
  } catch (error) {
    console.error(`Error checking minted tokens for ${wallet}:`, error);
    return [];
  }
}

// Recursively trace offspring wallets and find minted tokens
async function traceOffspring(
  wallet: string,
  heliusApiKey: string,
  maxDepth: number,
  currentDepth: number = 0,
  visited: Set<string> = new Set(),
  fundingPath: string[] = []
): Promise<OffspringWallet> {
  const result: OffspringWallet = {
    wallet,
    depth: currentDepth,
    amountReceived: 0,
    hasMinted: false,
    mintedTokens: [],
    children: []
  };
  
  if (visited.has(wallet)) {
    return result;
  }
  visited.add(wallet);
  
  // Check if this wallet has minted any tokens
  console.log(`[Depth ${currentDepth}] Checking wallet: ${wallet}`);
  await delay(200); // Rate limit
  
  const mintedTokens = await getWalletMintedTokens(wallet, heliusApiKey);
  if (mintedTokens.length > 0) {
    result.hasMinted = true;
    result.mintedTokens = mintedTokens.map(t => ({
      ...t,
      depth: currentDepth,
      fundingPath: [...fundingPath, wallet]
    }));
    console.log(`  ✓ Found ${mintedTokens.length} minted token(s) by ${wallet.slice(0, 8)}...`);
  }
  
  // If we haven't reached max depth, trace children
  if (currentDepth < maxDepth) {
    await delay(200);
    const outgoingTransfers = await getOutgoingTransfers(wallet, heliusApiKey);
    console.log(`  → Found ${outgoingTransfers.length} offspring wallet(s)`);
    
    for (const transfer of outgoingTransfers.slice(0, 20)) { // Limit to 20 children per level
      if (!visited.has(transfer.to)) {
        const child = await traceOffspring(
          transfer.to,
          heliusApiKey,
          maxDepth,
          currentDepth + 1,
          visited,
          [...fundingPath, wallet]
        );
        child.amountReceived = transfer.amount;
        child.timestamp = transfer.timestamp;
        result.children.push(child);
      }
    }
  }
  
  return result;
}

// Flatten the tree to get all minted tokens
function collectAllMintedTokens(node: OffspringWallet): MintedToken[] {
  const tokens: MintedToken[] = [...node.mintedTokens];
  for (const child of node.children) {
    tokens.push(...collectAllMintedTokens(child));
  }
  return tokens;
}

// Count statistics from the tree
function countStats(node: OffspringWallet): { offspring: number; minters: number } {
  let offspring = 1;
  let minters = node.hasMinted ? 1 : 0;
  
  for (const child of node.children) {
    const childStats = countStats(child);
    offspring += childStats.offspring;
    minters += childStats.minters;
  }
  
  return { offspring, minters };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) {
      throw new Error('HELIUS_API_KEY not configured');
    }

    const { 
      parentWallet, 
      maxDepth = 3, 
      minAmountSol = 0.01,
      includeKnownChildWallet 
    } = await req.json();

    if (!parentWallet) {
      throw new Error('parentWallet is required');
    }

    console.log(`
========================================`);
    console.log(`Offspring Mint Scanner`);
    console.log(`Parent Wallet: ${parentWallet}`);
    console.log(`Max Depth: ${maxDepth}`);
    console.log(`========================================
`);

    // Start the trace from the parent wallet
    const visited = new Set<string>();
    const offspringTree = await traceOffspring(
      parentWallet,
      heliusApiKey,
      maxDepth,
      0,
      visited,
      []
    );

    // If a known child wallet was provided, also scan it directly
    if (includeKnownChildWallet && !visited.has(includeKnownChildWallet)) {
      console.log(`
Also checking known child wallet: ${includeKnownChildWallet}`);
      const childResult = await traceOffspring(
        includeKnownChildWallet,
        heliusApiKey,
        maxDepth - 1,
        1,
        visited,
        [parentWallet]
      );
      childResult.amountReceived = 0;
      offspringTree.children.push(childResult);
    }

    // Collect all results
    const allMintedTokens = collectAllMintedTokens(offspringTree);
    const stats = countStats(offspringTree);

    const result: ScanResult = {
      parentWallet,
      totalOffspring: stats.offspring - 1, // Exclude parent
      totalMinters: stats.minters,
      totalTokensMinted: allMintedTokens.length,
      allMintedTokens: allMintedTokens.sort((a, b) => 
        (a.createdAt || '').localeCompare(b.createdAt || '')
      ),
      offspringTree,
      scanDepth: maxDepth,
      scanDuration: Date.now() - startTime
    };

    console.log(`
========================================`);
    console.log(`Scan Complete!`);
    console.log(`Total Offspring: ${result.totalOffspring}`);
    console.log(`Total Minters: ${result.totalMinters}`);
    console.log(`Total Tokens Minted: ${result.totalTokensMinted}`);
    console.log(`Duration: ${result.scanDuration}ms`);
    console.log(`========================================
`);

    if (allMintedTokens.length > 0) {
      console.log(`Minted Tokens Found:`);
      for (const token of allMintedTokens) {
        console.log(`  - ${token.tokenMint} (by ${token.creatorWallet.slice(0, 8)}... at depth ${token.depth})`);
      }
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Offspring Mint Scanner error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        scanDuration: Date.now() - startTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
