// Solscan Markets API utilities
import { KNOWN_DEX_PROGRAMS, BONDING_CURVE_PROGRAMS } from "./lp-detection.ts";
import { createApiLogger } from "./api-logger.ts";

export interface SolscanMarketResult {
  poolAddresses: Set<string>;
  verifiedLPAccount: string | null;
  verifiedLPSource: string | null;
}

export async function fetchSolscanMarkets(tokenMint: string): Promise<SolscanMarketResult> {
  const result: SolscanMarketResult = {
    poolAddresses: new Set(),
    verifiedLPAccount: null,
    verifiedLPSource: null
  };

  const solscanApiKey = Deno.env.get('SOLSCAN_API_KEY');
  if (!solscanApiKey) {
    console.log('[Solscan] No API key found, skipping');
    return result;
  }

  try {
    console.log('[Solscan] Fetching ALL token markets...');
    
    const marketsLogger = createApiLogger({
      serviceName: 'solscan',
      endpoint: `/v2.0/token/markets`,
      tokenMint,
      functionName: 'fetchSolscanMarkets',
      requestType: 'lp_detection',
      credits: 1,
    });
    
    const marketsResp = await fetch(`https://pro-api.solscan.io/v2.0/token/markets?address=${tokenMint}`, {
      headers: { 'token': solscanApiKey }
    });
    
    await marketsLogger.complete(marketsResp.status);
    
    if (marketsResp.ok) {
      const marketsData = await marketsResp.json();
      if (marketsData.success && marketsData.data?.length > 0) {
        console.log(`[Solscan] Found ${marketsData.data.length} markets`);
        
        for (const market of marketsData.data) {
          if (market.pool_address) {
            result.poolAddresses.add(market.pool_address);
            console.log(`  [Solscan] Pool: ${market.pool_address} (${market.market_name || 'Unknown DEX'})`);
          }
          if (market.market_id) {
            result.poolAddresses.add(market.market_id);
          }
          if (market.lp_address) {
            result.poolAddresses.add(market.lp_address);
          }
        }
        
        // Verify via holders endpoint
        const topMarket = marketsData.data.sort((a: any, b: any) => (b.liquidity || 0) - (a.liquidity || 0))[0];
        const poolAddress = topMarket.pool_address || topMarket.market_id;
        
        if (poolAddress) {
          console.log(`[Solscan] Top market pool: ${poolAddress}`);
          
          const holdersLogger = createApiLogger({
            serviceName: 'solscan',
            endpoint: `/v2.0/token/holders`,
            tokenMint,
            functionName: 'fetchSolscanMarkets',
            requestType: 'lp_detection',
            credits: 1,
          });
          
          const holdersResp = await fetch(`https://pro-api.solscan.io/v2.0/token/holders?address=${tokenMint}&page=1&page_size=50`, {
            headers: { 'token': solscanApiKey }
          });
          
          await holdersLogger.complete(holdersResp.status);
          
          if (holdersResp.ok) {
            const holdersData = await holdersResp.json();
            if (holdersData.success && holdersData.data?.length > 0) {
              const allDexPrograms = [...Object.values(KNOWN_DEX_PROGRAMS), ...Object.values(BONDING_CURVE_PROGRAMS)];

              const isSolscanLPLabeled = (holder: any): boolean => {
                const hay: string[] = [];
                const push = (v: unknown) => {
                  if (!v) return;
                  if (typeof v === 'string') hay.push(v);
                  else if (Array.isArray(v)) v.forEach(push);
                  else if (typeof v === 'object') {
                    for (const vv of Object.values(v as Record<string, unknown>)) push(vv);
                  }
                };

                push(holder.label);
                push(holder.name);
                push(holder.type);
                push(holder.account_type);
                push(holder.owner_type);
                push(holder.owner_label);
                push(holder.owner_name);
                push(holder.tags);
                push(holder.labels);

                const text = hay.join(' ').toLowerCase();
                return (
                  text.includes('liquidity pool') ||
                  text.includes('amm pool') ||
                  text.includes('pool (lp)') ||
                  (text.includes('pool') && text.includes('lp'))
                );
              };

              for (const holder of holdersData.data) {
                const holderOwner = holder.owner || null;
                const holderAddress = holder.address || null;
                const candidates = [holderOwner, holderAddress].filter(Boolean) as string[];

                const ownerProgram = holder.owner_program || holder.ownerProgram || holder.program_id || '';

                const isAddressMatch = candidates.some((addr) => result.poolAddresses.has(addr));
                const isProgramMatch = typeof ownerProgram === 'string' && allDexPrograms.includes(ownerProgram);
                const isLabelMatch = isSolscanLPLabeled(holder);

                if (isAddressMatch || isProgramMatch || isLabelMatch) {
                  for (const addr of candidates) result.poolAddresses.add(addr);

                  const primary = holderOwner || holderAddress;
                  if (primary) {
                    if (!result.verifiedLPAccount) {
                      result.verifiedLPAccount = primary;
                      result.verifiedLPSource = isLabelMatch ? 'solscan_label' : 'solscan';
                      console.log(`✅ [Solscan Verified] Primary LP: ${result.verifiedLPAccount}`);
                    }
                  }
                }
              }
            }
          }
        }
        
        console.log(`[Solscan] Total pool addresses collected: ${result.poolAddresses.size}`);
      }
    }
  } catch (error) {
    console.error('[Solscan] API error:', error);
  }

  return result;
}
