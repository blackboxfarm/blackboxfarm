import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Known CEX hot wallets
const KNOWN_CEX_WALLETS: Record<string, string[]> = {
  "Binance": [
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S",
  ],
  "Coinbase": [
    "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE",
    "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS",
  ],
  "Kraken": [
    "CeijuS2rMHqxhbQq6ZvGxV7g7h3MrdKZPdpJR4NRV9WN",
  ],
  "Bybit": [
    "6F6DgCxqLY9K7irEpHu97sUvZp8KkWG8rwNDK7dLMT5t",
  ],
  "OKX": [
    "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD",
  ],
};

interface EnrichmentResult {
  linked_wallets: string[];
  linked_token_mints: string[];
  linked_twitter: string[];
  funding_trace: any;
  cex_sources: Array<{ cex: string; wallet: string; amount: number }>;
  cross_linked_entries: string[];
  tags: string[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCexName(wallet: string): string | null {
  for (const [cex, wallets] of Object.entries(KNOWN_CEX_WALLETS)) {
    if (wallets.includes(wallet)) return cex;
  }
  return null;
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        await delay(2000 * (i + 1));
        continue;
      }
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await delay(1000 * (i + 1));
    }
  }
  throw new Error("Max retries exceeded");
}

async function getWalletCreatedTokens(wallet: string, heliusApiKey: string): Promise<string[]> {
  try {
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&limit=100`;
    const response = await fetchWithRetry(url, { method: "GET" });
    if (!response.ok) return [];
    
    const transactions = await response.json();
    const createdTokens: string[] = [];
    
    for (const tx of transactions) {
      // Look for token creation patterns
      if (tx.type === "TOKEN_MINT" || tx.description?.includes("created")) {
        const tokenMints = tx.tokenTransfers?.map((t: any) => t.mint).filter(Boolean) || [];
        createdTokens.push(...tokenMints);
      }
      // Check for pump.fun token creations
      if (tx.source === "PUMP_FUN" && tx.type === "CREATE") {
        const mint = tx.events?.token?.mint;
        if (mint) createdTokens.push(mint);
      }
    }
    
    return [...new Set(createdTokens)];
  } catch (error) {
    console.error("Error fetching created tokens:", error);
    return [];
  }
}

async function traceWalletFunding(
  wallet: string,
  heliusApiKey: string,
  maxDepth: number = 3,
  visited: Set<string> = new Set(),
  currentDepth: number = 0
): Promise<any> {
  if (currentDepth >= maxDepth || visited.has(wallet)) {
    return { wallet, depth: currentDepth, children: [], source_type: "max_depth" };
  }
  
  const cexName = getCexName(wallet);
  if (cexName) {
    return { wallet, depth: currentDepth, children: [], source_type: "cex", cex_name: cexName };
  }
  
  visited.add(wallet);
  await delay(300); // Rate limiting
  
  try {
    const url = `https://api.helius.xyz/v0/addresses/${wallet}/transactions?api-key=${heliusApiKey}&limit=50`;
    const response = await fetchWithRetry(url, { method: "GET" });
    if (!response.ok) return { wallet, depth: currentDepth, children: [], source_type: "error" };
    
    const transactions = await response.json();
    
    // Find incoming SOL transfers
    const incomingTransfers: Array<{ from: string; amount: number }> = [];
    for (const tx of transactions) {
      if (tx.nativeTransfers) {
        for (const transfer of tx.nativeTransfers) {
          if (transfer.toUserAccount === wallet && transfer.fromUserAccount !== wallet) {
            const amount = (transfer.amount || 0) / 1e9;
            if (amount >= 0.05) {
              incomingTransfers.push({ from: transfer.fromUserAccount, amount });
            }
          }
        }
      }
    }
    
    // Sort by amount and take top 3
    const topTransfers = incomingTransfers
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 3);
    
    const children = [];
    for (const transfer of topTransfers) {
      const child = await traceWalletFunding(transfer.from, heliusApiKey, maxDepth, visited, currentDepth + 1);
      child.amount_sol = transfer.amount;
      children.push(child);
    }
    
    return { wallet, depth: currentDepth, children, source_type: "wallet" };
  } catch (error) {
    return { wallet, depth: currentDepth, children: [], source_type: "error" };
  }
}

function extractCexSources(node: any): Array<{ cex: string; wallet: string; amount: number }> {
  const sources: Array<{ cex: string; wallet: string; amount: number }> = [];
  if (node.source_type === "cex" && node.cex_name) {
    sources.push({ cex: node.cex_name, wallet: node.wallet, amount: node.amount_sol || 0 });
  }
  for (const child of node.children || []) {
    sources.push(...extractCexSources(child));
  }
  return sources;
}

function extractAllWallets(node: any): string[] {
  const wallets = [node.wallet];
  for (const child of node.children || []) {
    wallets.push(...extractAllWallets(child));
  }
  return wallets;
}

async function getTokenCreatorWallet(tokenMint: string, heliusApiKey: string): Promise<string | null> {
  try {
    const url = `https://api.helius.xyz/v0/tokens/${tokenMint}/metadata?api-key=${heliusApiKey}`;
    const response = await fetchWithRetry(url, { method: "GET" });
    if (!response.ok) return null;
    
    const metadata = await response.json();
    return metadata.onChainData?.updateAuthority || metadata.onChainData?.creators?.[0]?.address || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const heliusApiKey = Deno.env.get("HELIUS_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { entry_id, entry_type, identifier, force_reenrich } = await req.json();

    if (!entry_id || !identifier) {
      return new Response(
        JSON.stringify({ error: "entry_id and identifier required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!heliusApiKey) {
      await supabase.from("pumpfun_blacklist").update({
        enrichment_status: "failed",
        enrichment_error: "HELIUS_API_KEY not configured"
      }).eq("id", entry_id);
      
      return new Response(
        JSON.stringify({ error: "HELIUS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Starting enrichment for entry ${entry_id}, type: ${entry_type}, identifier: ${identifier}`);

    // Update status to enriching
    await supabase.from("pumpfun_blacklist").update({
      enrichment_status: "enriching"
    }).eq("id", entry_id);

    const result: EnrichmentResult = {
      linked_wallets: [],
      linked_token_mints: [],
      linked_twitter: [],
      funding_trace: null,
      cex_sources: [],
      cross_linked_entries: [],
      tags: []
    };

    // Enrich based on entry type
    if (entry_type?.includes("wallet")) {
      // Wallet enrichment
      console.log("Enriching wallet:", identifier);
      
      // 1. Find tokens created by this wallet
      const createdTokens = await getWalletCreatedTokens(identifier, heliusApiKey);
      result.linked_token_mints.push(...createdTokens);
      console.log(`Found ${createdTokens.length} tokens created by wallet`);
      
      // 2. Trace funding sources (3 levels deep)
      const fundingTree = await traceWalletFunding(identifier, heliusApiKey, 3);
      result.funding_trace = fundingTree;
      
      // 3. Extract CEX sources
      result.cex_sources = extractCexSources(fundingTree);
      console.log(`Found ${result.cex_sources.length} CEX sources`);
      
      // 4. Extract all upstream wallets
      const upstreamWallets = extractAllWallets(fundingTree).filter(w => w !== identifier);
      result.linked_wallets.push(...upstreamWallets.slice(0, 20)); // Limit to 20
      
      // 5. Auto-tag based on findings
      if (result.cex_sources.length > 0) {
        result.tags.push("cex_funded");
        const cexNames = [...new Set(result.cex_sources.map(s => s.cex.toLowerCase()))];
        result.tags.push(...cexNames.map(c => `funded_via_${c}`));
      }
      if (createdTokens.length > 5) {
        result.tags.push("serial_launcher");
      }
      if (createdTokens.length > 20) {
        result.tags.push("high_volume_launcher");
      }
      
    } else if (entry_type === "token_mint") {
      // Token enrichment - find creator wallet
      console.log("Enriching token:", identifier);
      
      const creatorWallet = await getTokenCreatorWallet(identifier, heliusApiKey);
      if (creatorWallet) {
        result.linked_wallets.push(creatorWallet);
        console.log("Found creator wallet:", creatorWallet);
        
        // Trace creator's funding
        const fundingTree = await traceWalletFunding(creatorWallet, heliusApiKey, 3);
        result.funding_trace = fundingTree;
        result.cex_sources = extractCexSources(fundingTree);
        
        // Find other tokens by same creator
        const otherTokens = await getWalletCreatedTokens(creatorWallet, heliusApiKey);
        result.linked_token_mints.push(...otherTokens.filter(t => t !== identifier));
        
        if (otherTokens.length > 1) {
          result.tags.push("multi_token_dev");
        }
      }
    }

    // Cross-reference with existing blacklist entries
    const { data: existingEntries } = await supabase
      .from("pumpfun_blacklist")
      .select("id, identifier, linked_wallets, linked_token_mints")
      .neq("id", entry_id);

    if (existingEntries) {
      const allNewWallets = new Set(result.linked_wallets);
      const allNewTokens = new Set(result.linked_token_mints);
      allNewWallets.add(identifier);
      
      for (const entry of existingEntries) {
        // Check for wallet overlaps
        const entryWallets = new Set([entry.identifier, ...(entry.linked_wallets || [])]);
        const entryTokens = new Set(entry.linked_token_mints || []);
        
        const walletOverlap = [...allNewWallets].some(w => entryWallets.has(w));
        const tokenOverlap = [...allNewTokens].some(t => entryTokens.has(t));
        
        if (walletOverlap || tokenOverlap) {
          result.cross_linked_entries.push(entry.id);
          
          // Update the existing entry to link back
          const existingLinkedWallets = entry.linked_wallets || [];
          const newLinkedWallets = [...new Set([...existingLinkedWallets, identifier])];
          
          await supabase.from("pumpfun_blacklist").update({
            linked_wallets: newLinkedWallets
          }).eq("id", entry.id);
          
          console.log(`Cross-linked with existing entry: ${entry.id}`);
        }
      }
    }

    // Get current entry data to merge arrays properly
    const { data: currentEntry } = await supabase
      .from("pumpfun_blacklist")
      .select("linked_wallets, linked_token_mints, linked_twitter, tags")
      .eq("id", entry_id)
      .single();

    // Merge new discoveries with existing data
    const mergedWallets = [...new Set([...(currentEntry?.linked_wallets || []), ...result.linked_wallets])];
    const mergedTokens = [...new Set([...(currentEntry?.linked_token_mints || []), ...result.linked_token_mints])];
    const mergedTags = [...new Set([...(currentEntry?.tags || []), ...result.tags])];

    // Update the entry with enriched data
    const { error: updateError } = await supabase.from("pumpfun_blacklist").update({
      enrichment_status: "complete",
      enriched_at: new Date().toISOString(),
      enrichment_error: null,
      funding_trace: result.funding_trace,
      auto_discovered_links: {
        cex_sources: result.cex_sources,
        cross_linked_entries: result.cross_linked_entries,
        discovered_at: new Date().toISOString()
      },
      linked_wallets: mergedWallets.slice(0, 50), // Limit to 50
      linked_token_mints: mergedTokens.slice(0, 50),
      tags: mergedTags
    }).eq("id", entry_id);

    if (updateError) {
      throw updateError;
    }

    console.log(`Enrichment complete for ${entry_id}`);
    console.log(`- Discovered wallets: ${result.linked_wallets.length}`);
    console.log(`- Discovered tokens: ${result.linked_token_mints.length}`);
    console.log(`- CEX sources: ${result.cex_sources.length}`);
    console.log(`- Cross-links: ${result.cross_linked_entries.length}`);

    return new Response(JSON.stringify({
      success: true,
      entry_id,
      enrichment: {
        wallets_discovered: result.linked_wallets.length,
        tokens_discovered: result.linked_token_mints.length,
        cex_sources: result.cex_sources,
        cross_linked_entries: result.cross_linked_entries.length,
        tags_added: result.tags
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error("Enrichment error:", error);
    
    // Try to update status to failed
    try {
      const { entry_id } = await req.json().catch(() => ({}));
      if (entry_id) {
        await supabase.from("pumpfun_blacklist").update({
          enrichment_status: "failed",
          enrichment_error: error.message
        }).eq("id", entry_id);
      }
    } catch {}
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
