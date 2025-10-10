// Utility functions for first buyers detection across multiple venues

export type Venue = {
  name: string;
  type: "bonding_curve" | "amm";
  programIds: string[];
  logoUrl?: string;
  api?: {
    enabled: boolean;
    provider?: string;
    method?: string;
    envKey?: string;
    endpoint?: string;
  };
};

export type BuyerRow = {
  rank?: number;
  wallet: string;
  tx_sig: string;
  amount_in?: string;
  venue: string;
  timestamp: string;
  source: "api" | "onchain";
  currentBalance?: number;
  currentUsdValue?: number;
  pnl?: number;
  hasSold?: boolean;
};

export function resolveVenues(venuesConfig: Record<string, Venue>, filter?: string[]): Venue[] {
  const list = Object.values(venuesConfig);
  if (!filter?.length) return list;
  const set = new Set(filter.map(s => s.toLowerCase()));
  return list.filter(v => set.has(v.name.toLowerCase()));
}

export async function* pageProgramSignaturesOldestFirst(
  rpcUrl: string,
  programIds: string[],
  _startTimeHint?: string,
  limit = 1000
): AsyncGenerator<string> {
  for (const pid of programIds) {
    let before: string | undefined = undefined;
    let iterations = 0;
    const maxIterations = 10; // Safety limit
    
    while (iterations < maxIterations) {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [pid, { limit, before }]
          })
        });

        const data = await response.json();
        const signatures = data.result || [];
        
        if (!signatures.length) break;
        
        // Yield in oldest-first order
        for (const sig of [...signatures].reverse()) {
          yield sig.signature;
        }
        
        before = signatures[signatures.length - 1].signature;
        iterations++;
      } catch (error) {
        console.error(`Error paging signatures for ${pid}:`, error);
        break;
      }
    }
  }
}

export async function* pageAccountSignaturesOldestFirst(
  rpcUrl: string,
  account: string,
  _startTimeHint?: string,
  limit = 1000
): AsyncGenerator<string> {
  let before: string | undefined = undefined;
  let iterations = 0;
  const maxIterations = 10; // Safety limit
  
  while (iterations < maxIterations) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [account, { limit, before }]
        })
      });

      const data = await response.json();
      const signatures = data.result || [];
      
      if (!signatures.length) break;
      
      // Yield in oldest-first order
      for (const sig of [...signatures].reverse()) {
        yield sig.signature;
      }
      
      before = signatures[signatures.length - 1].signature;
      iterations++;
    } catch (error) {
      console.error(`Error paging signatures for ${account}:`, error);
      break;
    }
  }
}

export async function safeGetParsedTransaction(
  rpcUrl: string,
  signature: string
): Promise<any | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
      })
    });

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error(`Error fetching transaction ${signature}:`, error);
    return null;
  }
}

export function rankBuyers(rows: Omit<BuyerRow, "rank">[]): BuyerRow[] {
  const sorted = rows.slice().sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function deduplicateByWallet(rows: BuyerRow[]): BuyerRow[] {
  const seen = new Set<string>();
  const unique: BuyerRow[] = [];
  
  for (const row of rows) {
    if (!seen.has(row.wallet)) {
      unique.push(row);
      seen.add(row.wallet);
    }
  }
  
  return unique;
}
