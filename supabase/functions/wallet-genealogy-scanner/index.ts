import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
enableHeliusTracking('wallet-genealogy-scanner');

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Known CEX hot wallets (expanded list)
const KNOWN_CEX_WALLETS: Record<string, string[]> = {
  "Binance": [
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S",
    "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2",
    "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
  ],
  "Coinbase": [
    "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE",
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",
    "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm",
  ],
  "Kraken": [
    "CeijuS2rMHqxhbQq6ZvGxV7g7h3MrdKZPdpJR4NRV9WN",
    "EUuHEFLSqdDKirPEoZpTj9sQHgJY6aJB8KumLFXxcmv8",
  ],
  "Bybit": [
    "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWjtW2",
    "6F6DgCxqLY9K7irEpHu97sUvZp8KkWG8rwNDK7dLMT5t",
  ],
  "OKX": [
    "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD",
    "Bi3Ru8krBjCJfKhKqUwdiLJwz4jPNwT1nz9Cg3Ai5gZf",
  ],
  "KuCoin": [
    "BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6",
    "6dKkxsSHdq5QK3D9NB95YLXd3GmjAQJGrHGSBDYcNaff",
  ],
  "Gate.io": [
    "u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w",
  ],
  "MEXC": [
    "ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ",
  ],
  "Huobi": [
    "88xTWZMeKfiTgbfEmPLdsUCQcZinwUfk25EBQZ21XMAZ",
  ],
  "Bitget": [
    "A77HErxSEiyjsLLz6yNMvnA5vKSZwCzLtpAKc1BQy4GL",
  ],
  "Phantom Swap": [
    "PhaNTomSwapProgram11111111111111111111111111",
  ],
  "Jupiter": [
    "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  ],
  "Raydium": [
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  ],
};

interface WalletNode {
  wallet: string;
  depth: number;
  amount_sol: number;
  timestamp: string | null;
  source_type: "cex" | "wallet" | "program" | "unknown";
  cex_name: string | null;
  children: WalletNode[];
  tx_signature?: string;
}

interface GenealogyResult {
  root_wallet: string;
  funding_tree: WalletNode;
  cex_sources: Array<{ cex: string; wallet: string; amount: number; timestamp: string | null }>;
  common_ancestors: string[];
  max_depth_reached: number;
  total_wallets_traced: number;
}

function getCexName(wallet: string): string | null {
  for (const [cex, wallets] of Object.entries(KNOWN_CEX_WALLETS)) {
    if (wallets.includes(wallet)) {
      return cex;
    }
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
        const retryAfter = parseInt(response.headers.get("Retry-After") || "2");
        console.log(`Rate limited, waiting ${retryAfter}s before retry ${i + 1}/${maxRetries}`);
        await delay(retryAfter * 1000);
        continue;
      }
      
      return response;
    } catch (error) {
      lastError = error as Error;
      console.error(`Fetch attempt ${i + 1} failed:`, error);
      await delay(1000 * (i + 1));
    }
  }
  
  throw lastError || new Error("Max retries exceeded");
}

async function getWalletTransactions(
  wallet: string,
  heliusApiKey: string,
  limit = 50
): Promise<any[]> {
  const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&limit=${limit}`;
  
  try {
    const response = await fetchWithRetry(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch transactions for ${wallet}: ${response.status}`);
      return [];
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error fetching transactions for ${wallet}:`, error);
    return [];
  }
}

function findIncomingSolTransfers(
  transactions: any[],
  targetWallet: string,
  minAmountSol = 0.05
): Array<{ from: string; amount: number; timestamp: string; signature: string }> {
  const transfers: Array<{ from: string; amount: number; timestamp: string; signature: string }> = [];
  
  for (const tx of transactions) {
    try {
      // Check native transfers
      if (tx.nativeTransfers && Array.isArray(tx.nativeTransfers)) {
        for (const transfer of tx.nativeTransfers) {
          if (
            transfer.toUserAccount === targetWallet &&
            transfer.fromUserAccount !== targetWallet
          ) {
            const amountSol = (transfer.amount || 0) / 1e9;
            if (amountSol >= minAmountSol) {
              transfers.push({
                from: transfer.fromUserAccount,
                amount: amountSol,
                timestamp: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : null,
                signature: tx.signature,
              });
            }
          }
        }
      }
    } catch (error) {
      console.error("Error parsing transaction:", error);
    }
  }
  
  // Sort by amount descending to prioritize larger transfers
  return transfers.sort((a, b) => b.amount - a.amount);
}

async function traceWalletGenealogy(
  wallet: string,
  heliusApiKey: string,
  maxDepth: number,
  minAmountSol: number,
  visited: Set<string>,
  currentDepth: number
): Promise<WalletNode> {
  const cexName = getCexName(wallet);
  
  // Base case: CEX found or max depth reached
  if (cexName) {
    return {
      wallet,
      depth: currentDepth,
      amount_sol: 0,
      timestamp: null,
      source_type: "cex",
      cex_name: cexName,
      children: [],
    };
  }
  
  if (currentDepth >= maxDepth || visited.has(wallet)) {
    return {
      wallet,
      depth: currentDepth,
      amount_sol: 0,
      timestamp: null,
      source_type: visited.has(wallet) ? "wallet" : "unknown",
      cex_name: null,
      children: [],
    };
  }
  
  visited.add(wallet);
  
  // Add delay to avoid rate limiting
  await delay(200);
  
  const transactions = await getWalletTransactions(wallet, heliusApiKey);
  const incomingTransfers = findIncomingSolTransfers(transactions, wallet, minAmountSol);
  
  const node: WalletNode = {
    wallet,
    depth: currentDepth,
    amount_sol: 0,
    timestamp: null,
    source_type: "wallet",
    cex_name: null,
    children: [],
  };
  
  // Trace top 3 largest incoming transfers to avoid exponential growth
  const topTransfers = incomingTransfers.slice(0, 3);
  
  for (const transfer of topTransfers) {
    const childNode = await traceWalletGenealogy(
      transfer.from,
      heliusApiKey,
      maxDepth,
      minAmountSol,
      visited,
      currentDepth + 1
    );
    
    childNode.amount_sol = transfer.amount;
    childNode.timestamp = transfer.timestamp;
    childNode.tx_signature = transfer.signature;
    
    node.children.push(childNode);
  }
  
  return node;
}

function extractCexSources(node: WalletNode): Array<{ cex: string; wallet: string; amount: number; timestamp: string | null }> {
  const sources: Array<{ cex: string; wallet: string; amount: number; timestamp: string | null }> = [];
  
  if (node.source_type === "cex" && node.cex_name) {
    sources.push({
      cex: node.cex_name,
      wallet: node.wallet,
      amount: node.amount_sol,
      timestamp: node.timestamp,
    });
  }
  
  for (const child of node.children) {
    sources.push(...extractCexSources(child));
  }
  
  return sources;
}

function extractAllWallets(node: WalletNode): string[] {
  const wallets: string[] = [node.wallet];
  for (const child of node.children) {
    wallets.push(...extractAllWallets(child));
  }
  return wallets;
}

function getMaxDepth(node: WalletNode): number {
  if (node.children.length === 0) {
    return node.depth;
  }
  return Math.max(...node.children.map(getMaxDepth));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { wallets, maxDepth = 5, minAmountSol = 0.05 } = await req.json();

    if (!wallets || !Array.isArray(wallets) || wallets.length === 0) {
      return new Response(
        JSON.stringify({ error: "wallets array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
    if (!heliusApiKey) {
      return new Response(
        JSON.stringify({ error: "HELIUS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Starting genealogy scan for ${wallets.length} wallet(s), maxDepth=${maxDepth}`);

    const results: GenealogyResult[] = [];
    const allWalletSets: string[][] = [];

    for (const wallet of wallets) {
      console.log(`Tracing wallet: ${wallet}`);
      
      const visited = new Set<string>();
      const fundingTree = await traceWalletGenealogy(
        wallet,
        heliusApiKey,
        maxDepth,
        minAmountSol,
        visited,
        0
      );

      const cexSources = extractCexSources(fundingTree);
      const allWallets = extractAllWallets(fundingTree);
      allWalletSets.push(allWallets);

      results.push({
        root_wallet: wallet,
        funding_tree: fundingTree,
        cex_sources: cexSources,
        common_ancestors: [], // Will be filled after all wallets are traced
        max_depth_reached: getMaxDepth(fundingTree),
        total_wallets_traced: visited.size,
      });

      console.log(`Traced ${visited.size} wallets for ${wallet}, found ${cexSources.length} CEX sources`);
    }

    // Find common ancestors between all wallet sets
    if (allWalletSets.length > 1) {
      const firstSet = new Set(allWalletSets[0]);
      const commonAncestors = allWalletSets.slice(1).reduce((common, walletSet) => {
        const setB = new Set(walletSet);
        return common.filter((w) => setB.has(w));
      }, Array.from(firstSet));

      // Update all results with common ancestors
      for (const result of results) {
        result.common_ancestors = commonAncestors.filter((w) => w !== result.root_wallet);
      }
    }

    // Check if any CEX sources match between wallets
    const cexMatches: Array<{ wallet1: string; wallet2: string; cex: string; cex_wallet: string }> = [];
    if (results.length > 1) {
      for (let i = 0; i < results.length; i++) {
        for (let j = i + 1; j < results.length; j++) {
          for (const source1 of results[i].cex_sources) {
            for (const source2 of results[j].cex_sources) {
              if (source1.wallet === source2.wallet) {
                cexMatches.push({
                  wallet1: results[i].root_wallet,
                  wallet2: results[j].root_wallet,
                  cex: source1.cex,
                  cex_wallet: source1.wallet,
                });
              }
            }
          }
        }
      }
    }

    // Store results in database for each wallet
    for (const result of results) {
      // Update dev_wallet_reputation if exists
      const upstreamWallets = extractAllWallets(result.funding_tree)
        .filter((w) => w !== result.root_wallet)
        .slice(0, 20); // Limit to 20 upstream wallets

      await supabase
        .from("dev_wallet_reputation")
        .upsert({
          wallet_address: result.root_wallet,
          upstream_wallets: upstreamWallets,
          updated_at: new Date().toISOString(),
        }, { onConflict: "wallet_address" });
    }

    const response = {
      success: true,
      results,
      cex_matches: cexMatches,
      summary: {
        wallets_analyzed: wallets.length,
        total_cex_sources_found: results.reduce((sum, r) => sum + r.cex_sources.length, 0),
        common_cex_sources: cexMatches.length,
        likely_same_owner: cexMatches.length > 0,
      },
    };

    console.log("Genealogy scan complete:", response.summary);

    return new Response(JSON.stringify(response, null, 2), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in wallet-genealogy-scanner:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
