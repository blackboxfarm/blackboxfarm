import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
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

    // Get Helius API key from environment (optional)
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');

    console.log(`Fetching all token holders for: ${tokenMint}`);

    const rpcEndpoints = heliusApiKey
      ? [`https://rpc.helius.xyz/?api-key=${heliusApiKey}`, 'https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com']
      : ['https://api.mainnet-beta.solana.com', 'https://solana-api.projectserum.com'];

    let usedRpc = '';
    const rpcErrors: string[] = [];
    // Use manual price if provided, otherwise try multiple APIs
    let tokenPriceUSD = manualPrice || 0;
    let priceSource = '';
    let priceDiscoveryFailed = false;
    
    if (!manualPrice || manualPrice === 0) {
      console.log('No manual price provided, trying multiple price sources...');
      
      // Try multiple price sources in order of reliability
      const priceAPIs = [
        {
          name: 'CoinGecko',
          url: `https://api.coingecko.com/api/v3/simple/token_price/solana?contract_addresses=${tokenMint}&vs_currencies=usd`,
          parser: (data: any) => data[tokenMint]?.usd || 0
        },
        {
          name: 'Jupiter v4',
          url: `https://price.jup.ag/v4/price?ids=${tokenMint}`,
          parser: (data: any) => data.data?.[tokenMint]?.price || 0
        },
        {
          name: 'Jupiter v6',
          url: `https://price.jup.ag/v6/price?ids=${tokenMint}`,
          parser: (data: any) => data.data?.[tokenMint]?.price || 0
        },
        {
          name: 'DexScreener',
          url: `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
          parser: (data: any) => {
            if (data.pairs && data.pairs.length > 0) {
              return parseFloat(data.pairs[0].priceUsd) || 0;
            }
            return 0;
          }
        },
        {
          name: 'Birdeye',
          url: `https://public-api.birdeye.so/defi/price?address=${tokenMint}`,
          parser: (data: any) => data.value || 0
        }
      ];
      
      for (const api of priceAPIs) {
        try {
          console.log(`Trying ${api.name}...`);
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          const response = await fetch(api.url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Supabase Edge Function',
              'Accept': 'application/json'
            }
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            const price = api.parser(data);
            
            if (price > 0) {
              tokenPriceUSD = price;
              priceSource = api.name;
              console.log(`✅ Got price from ${api.name}: $${tokenPriceUSD}`);
              break;
            } else {
              console.log(`⚠️ ${api.name} returned 0 price`);
            }
          } else {
            console.log(`❌ ${api.name} HTTP error: ${response.status}`);
          }
        } catch (error) {
          console.log(`❌ ${api.name} failed:`, error.message);
          continue;
        }
      }
      
      if (tokenPriceUSD === 0) {
        priceDiscoveryFailed = true;
      }
    } else {
      console.log(`Using manual price: $${tokenPriceUSD}`);
      priceSource = 'Manual';
    }
    
    if (tokenPriceUSD === 0) {
      console.warn('⚠️ WARNING: All price sources failed or returned $0 - USD calculations will be incorrect');
    }
    
    // Get all token accounts for this mint (try multiple RPCs)
    let data: any = null;
    for (const url of rpcEndpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getProgramAccounts',
            params: [
              'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
              {
                encoding: 'jsonParsed',
                filters: [
                  { dataSize: 165 },
                  { memcmp: { offset: 0, bytes: tokenMint } }
                ]
              }
            ]
          }),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!resp.ok) {
          const msg = `RPC ${url.includes('helius') ? 'Helius' : url} failed: ${resp.status}`;
          rpcErrors.push(msg);
          continue;
        }
        const json = await resp.json();
        if (json.error) {
          const msg = `RPC ${url.includes('helius') ? 'Helius' : url} error: ${json.error.message}`;
          rpcErrors.push(msg);
          continue;
        }
        data = json;
        usedRpc = url;
        break;
      } catch (e) {
        rpcErrors.push(`RPC ${url.includes('helius') ? 'Helius' : url} exception: ${e?.message || e}`);
        continue;
      }
    }

    if (!data) {
      throw new Error(`All RPC endpoints failed. ${rpcErrors.join(' | ')}`);
    }

    const holders = [];
    let totalSupply = 0;
    
    if (data.result && data.result.length > 0) {
      // Calculate total supply first
      for (const account of data.result) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          if (balance > 0) {
            totalSupply += balance;
          }
        } catch (e) {
          // Skip invalid accounts
        }
      }
      
      for (const account of data.result) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          const owner = parsedInfo.owner;
          
          if (balance > 0) {
            // Calculate USD value
            const usdValue = balance * tokenPriceUSD;
            
            // Calculate percentage of total supply
            const percentageOfSupply = (balance / totalSupply) * 100;
            
            // LP Detection Logic
            let isLiquidityPool = false;
            let lpDetectionReason = '';
            let lpConfidence = 0;
            let detectedPlatform = '';
            
            // Detection 1: Large percentage ownership (likely LP)
            if (percentageOfSupply > 20) {
              isLiquidityPool = true;
              lpDetectionReason = 'Large percentage ownership';
              lpConfidence += 40;
            }
            
            // Detection 2: Check if address looks like a PDA (starts with specific patterns)
            const isPotentialPDA = !owner.match(/^[1-9A-HJ-NP-Za-km-z]{44}$/) || 
                                   owner.length !== 44 ||
                                   owner.startsWith('11111') ||
                                   owner.includes('aaaa') ||
                                   owner.includes('1111');
            
            if (isPotentialPDA) {
              lpConfidence += 20;
              if (!isLiquidityPool) {
                lpDetectionReason = 'PDA-like address pattern';
              }
            }
            
            // Detection 3: Known DEX program patterns (simplified heuristics)
            const knownDEXPatterns = {
              'raydium': /^5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1$/,
              'orca': /^whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc$/,
              'meteora': /^Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB$/,
              'jupiter': /^JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4$/,
              'pump_fun': /^6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P$/
            };
            
            for (const [platform, pattern] of Object.entries(knownDEXPatterns)) {
              if (pattern.test(owner)) {
                isLiquidityPool = true;
                detectedPlatform = platform;
                lpDetectionReason = `Known ${platform} program address`;
                lpConfidence = 90;
                break;
              }
            }
            
            // Detection 4: Very high token balance combined with round numbers (LP characteristics)
            if (balance > 1000000 && (balance % 1000000 === 0 || balance % 100000 === 0)) {
              lpConfidence += 15;
              if (!isLiquidityPool && lpConfidence > 30) {
                isLiquidityPool = true;
                lpDetectionReason = 'Large round number balance';
              }
            }
            
            // Final confidence adjustment
            if (isLiquidityPool && lpConfidence > 50) {
              lpConfidence = Math.min(95, lpConfidence);
            } else if (lpConfidence > 30) {
              isLiquidityPool = true;
              lpConfidence = Math.min(75, lpConfidence);
            }
            
            // Categorize wallets (excluding confirmed LPs from main categories)
            const isDustWallet = !isLiquidityPool && usdValue < 1; // Less than $1 USD
            const isSmallWallet = !isLiquidityPool && usdValue >= 1 && usdValue < 12; // $1-$12 USD
            const isMediumWallet = !isLiquidityPool && usdValue >= 12 && usdValue < 25; // $12-$25 USD
            const isLargeWallet = !isLiquidityPool && usdValue >= 25 && usdValue < 49; // $25-$49 USD
            const isBossWallet = !isLiquidityPool && usdValue >= 200 && usdValue < 500; // $200-$500 USD
            const isKingpinWallet = !isLiquidityPool && usdValue >= 500 && usdValue < 1000; // $500-$1K USD
            const isSuperBossWallet = !isLiquidityPool && usdValue >= 1000 && usdValue < 2000; // $1K-$2K USD
            const isBabyWhaleWallet = !isLiquidityPool && usdValue >= 2000 && usdValue < 5000; // $2K-$5K USD
            const isTrueWhaleWallet = !isLiquidityPool && usdValue >= 5000; // $5K+ USD
            
            holders.push({
              owner,
              balance,
              usdValue,
              balanceRaw: parsedInfo.tokenAmount.amount,
              percentageOfSupply,
              isLiquidityPool,
              lpDetectionReason,
              lpConfidence,
              detectedPlatform,
              isDustWallet,
              isSmallWallet,
              isMediumWallet,
              isLargeWallet,
              isBossWallet,
              isKingpinWallet,
              isSuperBossWallet,
              isBabyWhaleWallet,
              isTrueWhaleWallet,
              tokenAccount: account.pubkey
            });
          }
        } catch (e) {
          console.error(`Error processing account ${account.pubkey}:`, e);
        }
      }
    }

    // Sort by balance descending
    holders.sort((a, b) => b.balance - a.balance);

    // Add rank
    const rankedHolders = holders.map((holder, index) => ({
      ...holder,
      rank: index + 1
    }));

    // Separate LP and non-LP wallets
    const lpWallets = rankedHolders.filter(h => h.isLiquidityPool);
    const nonLpHolders = rankedHolders.filter(h => !h.isLiquidityPool);
    
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

    console.log(`Found ${rankedHolders.length} token holders`);
    console.log(`LP wallets detected: ${lpWallets.length} (${(lpBalance/totalBalance*100).toFixed(1)}% of supply)`);
    console.log(`Real wallets: ${realWallets}, Boss wallets: ${bossWallets}, Kingpin wallets: ${kingpinWallets}, Super Boss wallets: ${superBossWallets}, Baby Whale wallets: ${babyWhaleWallets}, True Whale wallets: ${trueWhaleWallets}, Large wallets: ${largeWallets}, Medium wallets: ${mediumWallets}, Small wallets: ${smallWallets}, Dust wallets: ${dustWallets}`);

    const result = {
      tokenMint,
      totalHolders: rankedHolders.length,
      liquidityPoolsDetected: lpWallets.length,
      lpBalance,
      lpPercentageOfSupply: lpWallets.length > 0 ? (lpBalance / totalBalance * 100) : 0,
      nonLpHolders: nonLpHolders.length,
      nonLpBalance,
      realWallets,
      bossWallets,
      kingpinWallets,
      superBossWallets,
      babyWhaleWallets,
      trueWhaleWallets,
      largeWallets,
      mediumWallets,
      smallWallets,
      dustWallets,
      totalBalance,
      tokenPriceUSD,
      priceSource,
      rpcSource: usedRpc,
      priceDiscoveryFailed,
      holders: rankedHolders,
      liquidityPools: lpWallets,
      summary: `Found ${rankedHolders.length} total holders (${lpWallets.length} LP detected). ${trueWhaleWallets} true whale wallets (≥$5K), ${babyWhaleWallets} baby whale wallets ($2K-$5K), ${superBossWallets} super boss wallets ($1K-$2K), ${kingpinWallets} kingpin wallets ($500-$1K), ${bossWallets} boss wallets ($200-$500), ${realWallets} real wallets ($50-$199), ${largeWallets} large wallets ($5-$49), ${mediumWallets} medium wallets ($1-$4), ${smallWallets} small wallets (<$1), ${dustWallets} dust wallets (<1 token). Total tokens distributed: ${totalBalance.toLocaleString()}${priceSource ? ` (Price from ${priceSource})` : ''}`
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Holders report error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Holders report failed', 
        details: error.message 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});