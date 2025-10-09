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
          console.log(`❌ ${api.name} failed:`, error instanceof Error ? error.message : String(error));
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
        rpcErrors.push(`RPC ${url.includes('helius') ? 'Helius' : url} exception: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }

    if (!data) {
      throw new Error(`All RPC endpoints failed. ${rpcErrors.join(' | ')}`);
    }

    // FETCH HISTORICAL FIRST 25 BUYERS using Helius
    console.log('🔍 Fetching historical first 25 buyers...');
    const firstBuyersData: any[] = [];
    let txCount = 0;
    
    if (heliusApiKey) {
      try {
        console.log(`Calling Helius Enhanced Transactions API (mint search) for token: ${tokenMint}`);

        // Use POST /v0/transactions with tokenTransfers.mint filter + 429 backoff + pagination
        const buyersSeen = new Set<string>();
        let paginationToken: string | undefined = undefined;
        let pages = 0;
        let heliusUsed = false;

        const postWithBackoff = async (attempt = 1): Promise<Response> => {
          const url = `https://api.helius.xyz/v0/transactions?api-key=${heliusApiKey}`;
          const body = {
            query: {
              tokenTransfers: {
                mint: [tokenMint]
              }
            },
            options: {
              limit: 200,
              transactionDetails: 'full',
              paginationToken
            }
          } as any;

          const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(body)
          });

          if (resp.status === 429 && attempt < 6) {
            const wait = 300 * attempt; // ms
            console.log(`Helius 429 rate limit. Retrying in ${wait}ms (attempt ${attempt})`);
            await new Promise((r) => setTimeout(r, wait));
            return postWithBackoff(attempt + 1);
          }

          return resp;
        };

        // Page through up to 10 pages or until 25 buyers are found
        while (firstBuyersData.length < 25 && pages < 10) {
          const txResponse = await postWithBackoff();
          console.log(`Helius response status: ${txResponse.status}`);
          if (!txResponse.ok) {
            const errorText = await txResponse.text();
            console.error(`❌ Helius API error: ${txResponse.status} - ${errorText}`);
            break; // fall back to RPC below
          }

          heliusUsed = true;
          const json = await txResponse.json();
          const transactions: any[] = Array.isArray(json)
            ? json
            : (Array.isArray(json?.result) ? json.result : []);
          const count = transactions.length;
          txCount += count;
          console.log(`📦 Page ${pages + 1}: ${count} transactions`);

          if (count === 0) break;

          // Parse oldest-first within this page
          for (const tx of [...transactions].reverse()) {
            if (firstBuyersData.length >= 25) break;
            try {
              const tokenTransfers = tx.tokenTransfers || [];
              if (!tokenTransfers || tokenTransfers.length === 0) continue;

              for (const transfer of tokenTransfers) {
                if (firstBuyersData.length >= 25) break;
                if (transfer.mint !== tokenMint) continue;
                const recipient: string | undefined = transfer.toUserAccount;
                const amount = Number(transfer.tokenAmount || 0);
                if (!recipient || buyersSeen.has(recipient) || !isFinite(amount) || amount <= 0) continue;
                // Skip burn/system and common program/LP accounts
                if (
                  recipient === '11111111111111111111111111111111' ||
                  recipient === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' ||
                  recipient.startsWith('5Q544fKrF') || // Raydium
                  recipient.startsWith('675kPX9M')    // Orca
                ) continue;

                buyersSeen.add(recipient);
                firstBuyersData.push({
                  wallet: recipient,
                  firstBoughtAt: tx.timestamp || Math.floor(Date.now() / 1000),
                  initialTokens: amount,
                  signature: tx.signature || '',
                  purchaseRank: firstBuyersData.length + 1,
                });
              }
            } catch (e) {
              console.error('❌ Error parsing transaction:', e instanceof Error ? e.message : String(e));
              continue;
            }
          }

          // Prepare pagination for next page (older)
          paginationToken = (Array.isArray(json) ? undefined : json?.paginationToken) || undefined;
          pages += 1;
          if (!paginationToken) break;
        }

        if (firstBuyersData.length === 0) {
          console.warn('⚠️ Helius returned no buyers or was rate-limited. Falling back to RPC scan.');
        }
      } catch (e) {
        console.error('❌ Error fetching historical transactions (Helius phase):', e instanceof Error ? e.message : String(e));
      }
    } else {
      console.warn('⚠️ No Helius API key - skipping Helius phase for historical buyers');
    }

    // RPC FALLBACK: derive buyers by scanning transactions that reference the mint address
    if (firstBuyersData.length === 0) {
      try {
        const rpcUrl = usedRpc || rpcEndpoints[0];
        // 1) Get up to 100 signatures referencing the mint account (most recent first)
        const sigsResp = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getSignaturesForAddress',
            params: [tokenMint, { limit: 100 }]
          })
        });
        const sigsJson = await sigsResp.json();
        const signatures: string[] = sigsJson?.result?.map((r: any) => r.signature) || [];
        console.log(`RPC fallback: fetched ${signatures.length} signatures for mint`);

        // Process oldest first
        const buyersSeen = new Set<string>();
        for (const sig of [...signatures].reverse()) {
          if (firstBuyersData.length >= 25) break;
          // 2) Fetch parsed transaction
          const txResp = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'getTransaction',
              params: [sig, { encoding: 'jsonParsed' }]
            })
          });
          if (!txResp.ok) continue;
          const txJson = await txResp.json();
          const meta = txJson?.result?.meta;
          if (!meta) continue;
          const pre = meta.preTokenBalances || [];
          const post = meta.postTokenBalances || [];

          // Find owners with positive delta for our mint
          for (const postEntry of post) {
            if (postEntry.mint !== tokenMint) continue;
            const idx = postEntry.accountIndex;
            const preEntry = pre.find((p: any) => p.accountIndex === idx);
            const preAmt = Number(preEntry?.uiTokenAmount?.amount || preEntry?.uiTokenAmount?.uiAmount || 0);
            const postAmt = Number(postEntry?.uiTokenAmount?.amount || postEntry?.uiTokenAmount?.uiAmount || 0);
            const delta = postAmt - preAmt;
            const owner = postEntry.owner;
            if (!owner || buyersSeen.has(owner) || !isFinite(delta) || delta <= 0) continue;

            buyersSeen.add(owner);
            firstBuyersData.push({
              wallet: owner,
              firstBoughtAt: txJson?.result?.blockTime || Math.floor(Date.now() / 1000),
              initialTokens: delta,
              signature: sig,
              purchaseRank: firstBuyersData.length + 1,
            });
            if (firstBuyersData.length >= 25) break;
          }
        }
      } catch (e) {
        console.error('❌ RPC fallback failed:', e instanceof Error ? e.message : String(e));
      }
    }

    const holders = [];
    let totalSupply = 0;
    let potentialDevWallet: any = null;
    
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
      
      // Sort accounts by balance to identify earliest/largest holders
      const sortedAccounts = [...data.result].sort((a, b) => {
        const balanceA = parseFloat(a.account.data.parsed.info.tokenAmount.uiAmount || 0);
        const balanceB = parseFloat(b.account.data.parsed.info.tokenAmount.uiAmount || 0);
        return balanceB - balanceA;
      });
      
      for (const account of sortedAccounts) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          const owner = parsedInfo.owner;
          const accountOwner = account.account.owner; // This is the program ID that owns the account
          
          if (balance > 0) {
            // Calculate USD value
            const usdValue = balance * tokenPriceUSD;
            
            // Calculate percentage of total supply
            const percentageOfSupply = (balance / totalSupply) * 100;
            
            // LP Detection Logic - FIXED VERSION
            let isLiquidityPool = false;
            let lpDetectionReason = '';
            let lpConfidence = 0;
            let detectedPlatform = '';
            
            // Known DEX program IDs (the CORRECT way to detect LPs)
            const knownDEXPrograms: Record<string, string> = {
              'Pump.fun AMM': '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
              'Raydium V4': '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
              'Raydium CLMM': 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
              'Raydium V3': '27haf8L6oxUeXrHrgEgsexjSY5hbVUWEmvv9Nyytg3Ct',
              'Orca Whirlpool': 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
              'Meteora': 'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo',
              'Meteora DLMM': 'Eo7WjKq67rjJQSZxS6z3YkapzY3eMj6Xy8X5EQVn5UaB',
              'Lifinity': '2wT8Yq49kHgDzXuPxZSaeLaH1qbmGXtEyPy64bL7aD3c',
              'Phoenix': 'PhoeNiXZ8ByJGLkxNfZRnkUfjvmuYqLR89jjFHGqdXY',
              'Fluxbeam': 'FLUXubRmkEi2q6K3Y9kBPg9248ggaZVsoSFhtJHSrm1X',
              'Aldrin': 'CURVGoZn8zycx6FXwwevgBTB2gVvdbGTEpvMJDbgs2t4',
              'Cropper': 'CTMAxxk34HjKWxQ3QLZK1HpaLXmBveao3ESePXbiyfzh',
              'GooseFX': 'GFXsSL5sSaDfNFQUYsHekbWBW1TsFdjDYzACh62tEHxn',
              'Saber': 'SSwpkEEcbUqx4vtoEByFjSkhKdCT862DNVb52nZg1UZ',
              'Serum': '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin',
              'Bags.fm': 'BagsFxwZx3cKHLGWzgU3fLzGDhgSPrfSHjgQRJZVF9HL',
              'Bonk.fun': 'BonK1YhkXwGnzPqqiM1ycLY61w8HNJ5KHZNsmJJNFbDN'
            };
            
            // PRIMARY DETECTION: Check the account owner (program ID)
            for (const [platform, programId] of Object.entries(knownDEXPrograms)) {
              if (accountOwner === programId) {
                isLiquidityPool = true;
                detectedPlatform = platform;
                lpDetectionReason = `Token account owned by ${platform} program`;
                lpConfidence = 95;
                console.log(`✅ LP Detected: ${owner} is owned by ${platform} (${programId})`);
                break;
              }
            }
            
            // FALLBACK DETECTION: High concentration check for unrecognized LP programs
            if (!isLiquidityPool && percentageOfSupply > 30) {
              isLiquidityPool = true;
              detectedPlatform = 'Unknown Platform';
              lpDetectionReason = `Very high concentration (${percentageOfSupply.toFixed(1)}%) - likely undetected LP`;
              lpConfidence = 60;
              console.log(`⚠️ Potential LP: ${owner} holds ${percentageOfSupply.toFixed(1)}% (owner program: ${accountOwner})`);
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
            
            const holderData = {
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
              tokenAccount: account.pubkey,
              accountOwnerProgram: accountOwner // Include for transparency
            };
            
            holders.push(holderData);
            
            // Note: First buyer tracking moved to historical transactions section
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
    
    // IMPROVED DEV WALLET DETECTION using historical first buyers
    if (firstBuyersData.length > 0) {
      // Look at first 10 buyers for early large allocations (5-20% of supply)
      for (let i = 0; i < Math.min(10, firstBuyersData.length); i++) {
        const earlyBuyer = firstBuyersData[i];
        const currentHolder = rankedHolders.find(h => h.owner === earlyBuyer.wallet);
        
        if (currentHolder && !currentHolder.isLiquidityPool) {
          const initialPercentage = (earlyBuyer.initialTokens / totalSupply) * 100;
          
          // Dev typically gets 5-20% in first few transactions
          if (initialPercentage >= 5 && initialPercentage <= 20) {
            potentialDevWallet = {
              address: currentHolder.owner,
              balance: currentHolder.balance,
              usdValue: currentHolder.usdValue,
              percentageOfSupply: currentHolder.percentageOfSupply,
              initialPercentage,
              purchaseRank: earlyBuyer.purchaseRank,
              firstBoughtAt: earlyBuyer.firstBoughtAt,
              confidence: 90 - (i * 5), // Earlier = higher confidence
              detectionMethod: 'early_large_holder',
              reason: `Early buyer #${earlyBuyer.purchaseRank} with ${initialPercentage.toFixed(1)}% initial allocation`
            };
            console.log(`🔍 Dev Wallet Detected: ${potentialDevWallet.address} (buyer #${earlyBuyer.purchaseRank}, ${initialPercentage.toFixed(1)}% initial)`);
            break;
          }
        }
      }
    }
    
    // Fallback to top holder if no dev detected from history
    if (!potentialDevWallet && nonLpHolders.length > 0) {
      const topNonLpHolder = nonLpHolders[0];
      potentialDevWallet = {
        address: topNonLpHolder.owner,
        balance: topNonLpHolder.balance,
        usdValue: topNonLpHolder.usdValue,
        percentageOfSupply: topNonLpHolder.percentageOfSupply,
        confidence: topNonLpHolder.percentageOfSupply > 10 ? 65 : 45,
        detectionMethod: 'top_holder',
        reason: topNonLpHolder.percentageOfSupply > 10 
          ? `Top holder with ${topNonLpHolder.percentageOfSupply.toFixed(1)}% of supply`
          : 'Top non-LP holder (potential dev)'
      };
      console.log(`🔍 Potential Dev Wallet (fallback): ${potentialDevWallet.address} (${potentialDevWallet.percentageOfSupply.toFixed(1)}%)`);
    }
    
    // CALCULATE SELL TRACKING AND PNL FOR FIRST 25 BUYERS
    const firstBuyersWithPNL: any[] = [];
    
    for (const buyer of firstBuyersData) {
      const currentHolder = rankedHolders.find(h => h.owner === buyer.wallet);
      const currentBalance = currentHolder?.balance || 0;
      const tokensSold = Math.max(0, buyer.initialTokens - currentBalance);
      const percentageSold = buyer.initialTokens > 0 ? (tokensSold / buyer.initialTokens) * 100 : 0;
      
      // Calculate PNL (simplified - assumes initial price was lower)
      // In reality, we'd need historical price data at purchase time
      const initialValueEstimate = buyer.initialTokens * (tokenPriceUSD * 0.1); // Assume bought at 10% of current price
      const currentValue = currentBalance * tokenPriceUSD;
      const soldValue = tokensSold * tokenPriceUSD; // Assumes sold at current price (approximation)
      const totalValue = currentValue + soldValue;
      const pnl = totalValue - initialValueEstimate;
      const pnlPercentage = initialValueEstimate > 0 ? (pnl / initialValueEstimate) * 100 : 0;
      
      firstBuyersWithPNL.push({
        ...buyer,
        currentBalance,
        currentUsdValue: currentValue,
        currentPercentageOfSupply: currentHolder?.percentageOfSupply || 0,
        tokensSold,
        percentageSold,
        hasSold: tokensSold > 0,
        pnl,
        pnlPercentage,
        isLiquidityPool: currentHolder?.isLiquidityPool || false,
        isDevWallet: buyer.wallet === potentialDevWallet?.address
      });
    }
    
    console.log(`📊 First 25 buyers PNL calculated: ${firstBuyersWithPNL.filter(b => b.hasSold).length} have sold`);
    
    
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
      potentialDevWallet,
      firstBuyers: firstBuyersWithPNL, // NEW: Historical first 25 buyers with PNL
      firstBuyersError: firstBuyersData.length === 0 ? 
        (heliusApiKey ? 
          `No buyers found (searched ${txCount} transactions using Enhanced Transactions API)` : 
          'Helius API key not configured - historical buyer tracking unavailable') : 
        null,
      firstBuyersDebug: {
        endpoint: heliusApiKey ? 'POST /v0/transactions + RPC fallback' : 'RPC fallback',
        method: heliusApiKey ? 'mint_search' : 'rpc getSignaturesForAddress + getTransaction',
        buyersFound: firstBuyersData.length,
        totalTransactionsSearched: txCount
      },
      summary: `Found ${rankedHolders.length} total holders (${lpWallets.length} LP detected${lpWallets.length > 0 ? ': ' + lpWallets.map(lp => lp.detectedPlatform).filter(Boolean).join(', ') : ''}). ${trueWhaleWallets} true whale wallets (≥$5K), ${babyWhaleWallets} baby whale wallets ($2K-$5K), ${superBossWallets} super boss wallets ($1K-$2K), ${kingpinWallets} kingpin wallets ($500-$1K), ${bossWallets} boss wallets ($200-$500), ${realWallets} real wallets ($50-$199), ${largeWallets} large wallets ($5-$49), ${mediumWallets} medium wallets ($1-$4), ${smallWallets} small wallets (<$1), ${dustWallets} dust wallets (<1 token). Total tokens distributed: ${totalBalance.toLocaleString()}${priceSource ? ` (Price from ${priceSource})` : ''}${potentialDevWallet ? `. Potential dev: ${potentialDevWallet.address.slice(0, 4)}...${potentialDevWallet.address.slice(-4)} (${potentialDevWallet.percentageOfSupply.toFixed(1)}%)` : ''}. First ${firstBuyersWithPNL.length} buyers tracked with ${firstBuyersWithPNL.filter(b => b.hasSold).length} having sold tokens.`
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
        details: error instanceof Error ? error.message : String(error) 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});