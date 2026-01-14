/**
 * RugCheck Insiders/Graph API - Wallet cluster analysis and bundling detection
 * Uses RugCheck's pre-computed wallet genealogy data
 */

export interface InsiderWallet {
  wallet: string;
  percentage: number;
  insiderType?: string;
}

export interface WalletCluster {
  id: string;
  wallets: string[];
  totalPercentage: number;
  clusterType: string; // 'bundled', 'connected', 'suspicious'
}

export interface InsidersGraphResult {
  hasInsiders: boolean;
  insiderCount: number;
  totalInsiderPercentage: number;
  clusters: WalletCluster[];
  topInsiders: InsiderWallet[];
  bundledWallets: string[];
  bundledPercentage: number;
  warnings: string[];
  fetchTimeMs: number;
  error?: string;
}

const RUGCHECK_TIMEOUT_MS = 10000;

export async function fetchRugCheckInsiders(tokenMint: string): Promise<InsidersGraphResult> {
  const startTime = Date.now();
  const defaultResult: InsidersGraphResult = {
    hasInsiders: false,
    insiderCount: 0,
    totalInsiderPercentage: 0,
    clusters: [],
    topInsiders: [],
    bundledWallets: [],
    bundledPercentage: 0,
    warnings: [],
    fetchTimeMs: 0,
  };

  try {
    console.log(`[RugCheck Insiders] Fetching insiders graph for ${tokenMint}`);
    
    // Fetch insiders graph from RugCheck
    const response = await fetch(
      `https://api.rugcheck.xyz/v1/tokens/${tokenMint}/insiders/graph`,
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(RUGCHECK_TIMEOUT_MS),
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[RugCheck Insiders] No insider data for ${tokenMint}`);
        return { ...defaultResult, fetchTimeMs: Date.now() - startTime };
      }
      throw new Error(`RugCheck API returned ${response.status}`);
    }

    const data = await response.json();
    console.log(`[RugCheck Insiders] Raw response:`, JSON.stringify(data).slice(0, 500));

    // Parse the insiders graph data
    const result = parseInsidersGraph(data);
    result.fetchTimeMs = Date.now() - startTime;
    
    console.log(`[RugCheck Insiders] Completed in ${result.fetchTimeMs}ms - ${result.insiderCount} insiders, ${result.clusters.length} clusters`);
    
    return result;
  } catch (error) {
    console.error(`[RugCheck Insiders] Error:`, error);
    return {
      ...defaultResult,
      fetchTimeMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function parseInsidersGraph(data: any): InsidersGraphResult {
  const result: InsidersGraphResult = {
    hasInsiders: false,
    insiderCount: 0,
    totalInsiderPercentage: 0,
    clusters: [],
    topInsiders: [],
    bundledWallets: [],
    bundledPercentage: 0,
    warnings: [],
    fetchTimeMs: 0,
  };

  if (!data) return result;

  // Handle different API response formats
  // Format 1: { insiders: [...], clusters: [...] }
  // Format 2: { nodes: [...], edges: [...] } (graph format)
  // Format 3: Direct array of insiders

  let insiders: any[] = [];
  let clusters: any[] = [];

  if (Array.isArray(data)) {
    insiders = data;
  } else if (data.insiders && Array.isArray(data.insiders)) {
    insiders = data.insiders;
    clusters = data.clusters || [];
  } else if (data.nodes && Array.isArray(data.nodes)) {
    // Graph format - nodes are wallets, edges show connections
    // Filter nodes that actually have holdings > 0
    const nodesWithHoldings = data.nodes.filter((node: any) => {
      const holdings = parseFloat(node.holdings || node.percentage || node.holding || 0);
      return holdings > 0;
    });
    
    console.log(`[RugCheck Insiders] Found ${nodesWithHoldings.length} nodes with holdings > 0 out of ${data.nodes.length} total nodes`);
    
    insiders = nodesWithHoldings.map((node: any) => ({
      wallet: node.id || node.wallet || node.address,
      percentage: parseFloat(node.holdings || node.percentage || node.holding || 0),
      insiderType: node.participant ? 'bundled' : (node.type || node.label || 'insider'),
    }));
    
    // Build clusters from edges - only include nodes with holdings
    if (data.edges && Array.isArray(data.edges)) {
      const holdingNodeIds = new Set(nodesWithHoldings.map((n: any) => n.id || n.wallet || n.address));
      clusters = buildClustersFromEdges(nodesWithHoldings, data.edges, holdingNodeIds);
    }
    
    // Mark participants as bundled wallets
    for (const node of data.nodes) {
      if (node.participant === true) {
        const wallet = node.id || node.wallet || node.address;
        if (wallet && !result.bundledWallets.includes(wallet)) {
          result.bundledWallets.push(wallet);
        }
      }
    }
  } else if (data.holders && Array.isArray(data.holders)) {
    insiders = data.holders;
  }

  // Process insiders
  const processedInsiders: InsiderWallet[] = insiders
    .filter((i: any) => i && (i.wallet || i.address || i.id))
    .map((i: any) => ({
      wallet: i.wallet || i.address || i.id,
      percentage: parseFloat(i.percentage || i.holding || i.pct || i.holdings || 0),
      insiderType: i.insiderType || i.type || i.label || 'insider',
    }))
    .filter((i: InsiderWallet) => i.percentage > 0) // Only include those with actual holdings
    .sort((a, b) => b.percentage - a.percentage);

  result.topInsiders = processedInsiders.slice(0, 10);
  result.insiderCount = processedInsiders.length;
  result.hasInsiders = processedInsiders.length > 0;
  result.totalInsiderPercentage = processedInsiders.reduce((sum, i) => sum + i.percentage, 0);

  // Process clusters
  result.clusters = clusters.map((c: any, index: number) => ({
    id: c.id || `cluster-${index}`,
    wallets: Array.isArray(c.wallets) ? c.wallets : (c.members || []),
    totalPercentage: parseFloat(c.percentage || c.totalPercentage || 0),
    clusterType: c.type || c.clusterType || 'connected',
  }));

  // Identify bundled wallets (wallets in same block or connected clusters)
  const bundledSet = new Set<string>(result.bundledWallets);
  for (const cluster of result.clusters) {
    if (cluster.clusterType === 'bundled' || cluster.wallets.length >= 2) {
      cluster.wallets.forEach(w => bundledSet.add(w));
    }
  }
  
  // Also check for bundled type in insiders
  for (const insider of processedInsiders) {
    if (insider.insiderType?.toLowerCase().includes('bundle')) {
      bundledSet.add(insider.wallet);
    }
  }

  result.bundledWallets = Array.from(bundledSet);
  result.bundledPercentage = processedInsiders
    .filter(i => bundledSet.has(i.wallet))
    .reduce((sum, i) => sum + i.percentage, 0);

  // Generate warnings
  if (result.bundledPercentage > 10) {
    result.warnings.push(`High bundling: ${result.bundledPercentage.toFixed(1)}% held by bundled wallets`);
  }
  if (result.totalInsiderPercentage > 30) {
    result.warnings.push(`Insider concentration: ${result.totalInsiderPercentage.toFixed(1)}% held by insiders`);
  }
  if (result.clusters.length > 3) {
    result.warnings.push(`Multiple wallet clusters detected (${result.clusters.length} groups)`);
  }

  return result;
}

function buildClustersFromEdges(nodes: any[], edges: any[], holdingNodeIds?: Set<string>): any[] {
  // Build adjacency list
  const adjacency: Map<string, Set<string>> = new Map();
  
  for (const edge of edges) {
    const source = edge.source || edge.from;
    const target = edge.target || edge.to;
    
    // Only include edges where at least one node has holdings (if filter provided)
    if (holdingNodeIds && !holdingNodeIds.has(source) && !holdingNodeIds.has(target)) {
      continue;
    }
    
    if (!adjacency.has(source)) adjacency.set(source, new Set());
    if (!adjacency.has(target)) adjacency.set(target, new Set());
    
    adjacency.get(source)!.add(target);
    adjacency.get(target)!.add(source);
  }

  // Find connected components (clusters)
  const visited = new Set<string>();
  const clusters: any[] = [];

  for (const [nodeId] of adjacency) {
    if (visited.has(nodeId)) continue;
    
    const cluster: string[] = [];
    const stack = [nodeId];
    
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      
      visited.add(current);
      // Only add to cluster if it has holdings (or no filter)
      if (!holdingNodeIds || holdingNodeIds.has(current)) {
        cluster.push(current);
      }
      
      const neighbors = adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    
    if (cluster.length >= 2) {
      clusters.push({
        id: `cluster-${clusters.length}`,
        wallets: cluster,
        type: 'connected',
      });
    }
  }

  return clusters;
}
