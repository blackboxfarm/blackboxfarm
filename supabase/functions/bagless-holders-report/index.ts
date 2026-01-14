import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { detectLP, type LPDetectionResult, type LaunchpadInfo } from "../_shared/lp-detection.ts"
import { fetchDexScreenerData } from "../_shared/dexscreener-api.ts"
import { fetchCreatorInfo } from "../_shared/creator-api.ts"
import { fetchSolscanMarkets } from "../_shared/solscan-markets.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  const requestStartTime = Date.now();
  console.log('🚀 [PERF] Edge function started');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint, manualPrice } = await req.json();
    
    if (!tokenMint) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameter: tokenMint' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const heliusApiKey = Deno.env.get('HELIUS_HOLDERS_KEY');
    console.log(`[HELIUS] HOLDERS_KEY ${heliusApiKey ? 'FOUND' : 'NOT FOUND'}`);

    console.log(`⏱️ [PERF] Fetching all token holders for: ${tokenMint}`);

    const rpcEndpoints = heliusApiKey
      ? [`https://rpc.helius.xyz/?api-key=${heliusApiKey}`, 'https://api.mainnet-beta.solana.com']
      : ['https://api.mainnet-beta.solana.com'];

    let usedRpc = '';
    const rpcErrors: string[] = [];
    let tokenPriceUSD = manualPrice || 0;
    let priceSource = '';
    let priceDiscoveryFailed = false;
    let launchpadInfo: LaunchpadInfo = { name: 'unknown', detected: false, confidence: 'low' };
    
    const allPoolAddresses: Set<string> = new Set();
    const dexScreenerPairAddresses: Set<string> = new Set();
    
    // ============================================
    // PARALLEL API FETCHES
    // ============================================
    const [solscanResult, dexResult] = await Promise.all([
      fetchSolscanMarkets(tokenMint),
      fetchDexScreenerData(tokenMint)
    ]);
    
    // Merge pool addresses from Solscan
    for (const addr of solscanResult.poolAddresses) {
      allPoolAddresses.add(addr);
    }
    
    // Merge pool addresses from DexScreener
    for (const addr of dexResult.pairAddresses) {
      allPoolAddresses.add(addr);
      dexScreenerPairAddresses.add(addr);
    }
    
    launchpadInfo = dexResult.launchpadInfo;
    const socials = dexResult.socials;
    const dexStatus = dexResult.dexStatus;
    
    // Use DexScreener price if available
    if (!manualPrice && dexResult.priceUsd > 0) {
      tokenPriceUSD = dexResult.priceUsd;
      priceSource = 'DexScreener';
      console.log(`✅ Got price from DexScreener: $${tokenPriceUSD}`);
    }
    
    // Fetch creator info
    const creatorInfo = await fetchCreatorInfo(launchpadInfo, tokenMint);
    
    console.log(`📊 [LP Detection] Total unique pool addresses: ${allPoolAddresses.size}`);
    
    // ============================================
    // PRICE DISCOVERY (if still needed)
    // ============================================
    if (tokenPriceUSD === 0) {
      const priceAPIs = [
        { name: 'Jupiter', url: `https://price.jup.ag/v4/price?ids=${tokenMint}`, parser: (d: any) => d.data?.[tokenMint]?.price || 0 },
        { name: 'CoinGecko', url: `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${tokenMint}&vs_currencies=usd`, parser: (d: any) => d[tokenMint]?.usd || 0 }
      ];
      
      for (const api of priceAPIs) {
        try {
          const resp = await fetch(api.url, { signal: AbortSignal.timeout(8000) });
          if (resp.ok) {
            const data = await resp.json();
            const price = api.parser(data);
            if (price > 0) {
              tokenPriceUSD = price;
              priceSource = api.name;
              console.log(`✅ Got price from ${api.name}: $${tokenPriceUSD}`);
              break;
            }
          }
        } catch (e) {
          console.log(`${api.name} failed`);
        }
      }
      
      if (tokenPriceUSD === 0) {
        priceDiscoveryFailed = true;
      }
    }
    
    if (manualPrice) {
      priceSource = 'Manual';
    }
    
    // ============================================
    // RPC: Get all token accounts
    // ============================================
    let data: any = null;
    
    for (const url of rpcEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const makeCall = async (programId: string, filters: any[]) => {
          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getProgramAccounts',
              params: [programId, { encoding: 'jsonParsed', filters }]
            }),
            signal: controller.signal
          });
          if (!resp.ok) return { result: [] };
          const json = await resp.json();
          if (json.error) return { result: [] };
          return json;
        };

        let json = await makeCall('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', [
          { dataSize: 165 },
          { memcmp: { offset: 0, bytes: tokenMint } }
        ]);
        let resultCount = Array.isArray(json.result) ? json.result.length : 0;

        if (resultCount === 0) {
          json = await makeCall('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', [
            { memcmp: { offset: 0, bytes: tokenMint } }
          ]);
          resultCount = Array.isArray(json.result) ? json.result.length : 0;
        }

        clearTimeout(timeoutId);

        if (resultCount > 0) {
          data = json;
          usedRpc = url;
          console.log(`✅ RPC SUCCESS — ${resultCount} accounts`);
          break;
        }
      } catch (e) {
        rpcErrors.push(String(e));
        continue;
      }
    }

    if (!data) {
      throw new Error(`All RPC endpoints failed. ${rpcErrors.join(' | ')}`);
    }

    // ============================================
    // PROCESS HOLDERS
    // ============================================
    const holders = [];
    let totalSupply = 0;
    let potentialDevWallet: any = null;
    
    if (data.result && data.result.length > 0) {
      for (const account of data.result) {
        try {
          const balance = parseFloat(account.account.data.parsed.info.tokenAmount.uiAmount || 0);
          if (balance > 0) totalSupply += balance;
        } catch (e) {}
      }
      
      const sortedAccounts = [...data.result].sort((a, b) => {
        const balA = parseFloat(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
        const balB = parseFloat(b.account.data.parsed.info.tokenAmount.uiAmount || 0);
        return balB - balA;
      });
      
      for (const account of sortedAccounts) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          const owner = parsedInfo.owner;
          const accountOwner = account.account.owner;
          
          if (balance > 0) {
            const usdValue = balance * tokenPriceUSD;
            const percentageOfSupply = (balance / totalSupply) * 100;
            
            const lpResult: LPDetectionResult = detectLP(
              owner, accountOwner, percentageOfSupply,
              allPoolAddresses, dexScreenerPairAddresses
            );
            
            const isLiquidityPool = lpResult.isLP;
            const isDustWallet = !isLiquidityPool && usdValue < 1;
            const isSmallWallet = !isLiquidityPool && usdValue >= 1 && usdValue < 12;
            const isMediumWallet = !isLiquidityPool && usdValue >= 12 && usdValue < 25;
            const isLargeWallet = !isLiquidityPool && usdValue >= 25 && usdValue < 49;
            const isBossWallet = !isLiquidityPool && usdValue >= 200 && usdValue < 500;
            const isKingpinWallet = !isLiquidityPool && usdValue >= 500 && usdValue < 1000;
            const isSuperBossWallet = !isLiquidityPool && usdValue >= 1000 && usdValue < 2000;
            const isBabyWhaleWallet = !isLiquidityPool && usdValue >= 2000 && usdValue < 5000;
            const isTrueWhaleWallet = !isLiquidityPool && usdValue >= 5000;
            
            holders.push({
              owner, balance, usdValue,
              balanceRaw: parsedInfo.tokenAmount.amount,
              percentageOfSupply,
              isLiquidityPool,
              lpDetectionReason: lpResult.reason || '',
              lpConfidence: lpResult.confidence,
              detectedPlatform: lpResult.platform || '',
              lpSource: lpResult.source || 'heuristic',
              isDustWallet, isSmallWallet, isMediumWallet, isLargeWallet,
              isBossWallet, isKingpinWallet, isSuperBossWallet, isBabyWhaleWallet, isTrueWhaleWallet,
              tokenAccount: account.pubkey,
              accountOwnerProgram: accountOwner
            });
          }
        } catch (e) {}
      }
    }

    holders.sort((a, b) => b.balance - a.balance);

    const rankedHolders = holders.map((holder, index) => ({ ...holder, rank: index + 1 }));

    const lpWallets = rankedHolders.filter(h => h.isLiquidityPool);
    const nonLpHolders = rankedHolders.filter(h => !h.isLiquidityPool);
    
    // Dev wallet detection (simplified)
    if (nonLpHolders.length > 0) {
      const top = nonLpHolders[0];
      potentialDevWallet = {
        address: top.owner,
        balance: top.balance,
        usdValue: top.usdValue,
        percentageOfSupply: top.percentageOfSupply,
        confidence: top.percentageOfSupply > 10 ? 65 : 45,
        detectionMethod: 'top_holder',
        reason: `Top non-LP holder (${top.percentageOfSupply.toFixed(1)}%)`
      };
    }
    
    const dustWallets = rankedHolders.filter(h => h.isDustWallet).length;
    const smallWallets = rankedHolders.filter(h => h.isSmallWallet).length;
    const mediumWallets = rankedHolders.filter(h => h.isMediumWallet).length;
    const largeWallets = rankedHolders.filter(h => h.isLargeWallet).length;
    const bossWallets = rankedHolders.filter(h => h.isBossWallet).length;
    const kingpinWallets = rankedHolders.filter(h => h.isKingpinWallet).length;
    const superBossWallets = rankedHolders.filter(h => h.isSuperBossWallet).length;
    const babyWhaleWallets = rankedHolders.filter(h => h.isBabyWhaleWallet).length;
    const trueWhaleWallets = rankedHolders.filter(h => h.isTrueWhaleWallet).length;
    const realWallets = rankedHolders.filter(h => !h.isDustWallet && !h.isSmallWallet && !h.isMediumWallet && !h.isLargeWallet && !h.isBossWallet && !h.isKingpinWallet && !h.isSuperBossWallet && !h.isBabyWhaleWallet && !h.isTrueWhaleWallet && !h.isLiquidityPool).length;
    const totalBalance = rankedHolders.reduce((sum, h) => sum + h.balance, 0);
    const lpBalance = lpWallets.reduce((sum, h) => sum + h.balance, 0);
    const nonLpBalance = nonLpHolders.reduce((sum, h) => sum + h.balance, 0);

    const totalTime = Date.now() - requestStartTime;
    console.log(`✅ [PERF] Request complete in ${totalTime}ms — ${rankedHolders.length} holders`);

    const result = {
      tokenMint,
      totalHolders: rankedHolders.length,
      liquidityPoolsDetected: lpWallets.length,
      lpBalance,
      lpPercentageOfSupply: lpWallets.length > 0 ? (lpBalance / totalBalance * 100) : 0,
      nonLpHolders: nonLpHolders.length,
      nonLpBalance,
      realWallets, bossWallets, kingpinWallets, superBossWallets, babyWhaleWallets,
      launchpadInfo, trueWhaleWallets, largeWallets, mediumWallets, smallWallets, dustWallets,
      totalBalance, tokenPriceUSD, priceSource,
      rpcSource: usedRpc,
      priceDiscoveryFailed,
      holders: rankedHolders,
      liquidityPools: lpWallets,
      potentialDevWallet,
      socials: Object.keys(socials).length > 0 ? socials : undefined,
      dexStatus,
      creatorInfo: Object.keys(creatorInfo).length > 0 ? creatorInfo : undefined,
      firstBuyers: [],
      executionTimeMs: totalTime
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Edge function error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
