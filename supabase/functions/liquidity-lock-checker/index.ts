import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { getHeliusRpcUrl, getHeliusApiKey } from '../_shared/helius-client.ts';
enableHeliusTracking('liquidity-lock-checker');
import {
  KNOWN_DEX_PROGRAMS,
  BONDING_CURVE_PROGRAMS,
  KNOWN_LP_WALLETS,
  BURN_ADDRESSES,
  detectLP,
  detectLaunchpad,
} from "../_shared/lp-detection.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tokenMint } = await req.json();

    if (!tokenMint) {
      return new Response(JSON.stringify({ error: 'Token mint address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Checking liquidity lock status for token: ${tokenMint}`);

    // Initialize result object
    let result = {
      tokenMint,
      isLocked: false,
      lockPercentage: null as number | null,
      lockMechanism: 'unknown',
      lockDuration: null as string | null,
      lockExpiry: null as string | null,
      dexInfo: 'unknown',
      tokenInfo: null as { name: any; symbol: any; price: number } | null,
      error: null as string | null,
      checkedMethods: [] as string[],
      dataQuality: 'unverified',
      actualData: {} as any,
      assumptions: [] as string[],
      lpAccount: null as string | null,
      lpSource: 'heuristic' as 'solscan' | 'dexscreener' | 'heuristic',
      detectedPlatforms: [] as string[],
    };

    // ============================================
    // Collect all pool addresses from multiple sources
    // ============================================
    const allPoolAddresses: Set<string> = new Set();
    const dexScreenerPairAddresses: Set<string> = new Set();

    // Method 0: Solscan-first LP detection (primary source)
    const SOLSCAN_API_KEY = Deno.env.get('SOLSCAN_API_KEY');
    if (SOLSCAN_API_KEY) {
      try {
        console.log('🔍 [Solscan Primary] Fetching LP from Solscan markets...');
        const solscanHeaders = {
          'token': SOLSCAN_API_KEY,
          'accept': 'application/json'
        };

        // Get ALL markets for this token
        const marketsResponse = await fetch(
          `https://pro-api.solscan.io/v2.0/token/markets?address=${tokenMint}`,
          { headers: solscanHeaders }
        );

        if (marketsResponse.ok) {
          const marketsData = await marketsResponse.json();
          console.log(`✅ Solscan markets found: ${marketsData?.data?.length || 0}`);
          
          if (marketsData?.data && marketsData.data.length > 0) {
            // Add ALL pool addresses
            for (const market of marketsData.data) {
              if (market.pool_address) allPoolAddresses.add(market.pool_address);
              if (market.market_id) allPoolAddresses.add(market.market_id);
              if (market.lp_address) allPoolAddresses.add(market.lp_address);
            }
            
            // Pick highest liquidity market
            const topMarket = marketsData.data.reduce((prev: any, curr: any) => 
              (curr.liquidity_usd > prev.liquidity_usd) ? curr : prev
            );
            
            result.actualData.solscanMarket = topMarket;
            result.dexInfo = topMarket.market_name || 'Unknown DEX';
            
            // Get top holders to confirm LP
            const holdersResponse = await fetch(
              `https://pro-api.solscan.io/v2.0/token/holders?address=${tokenMint}&page=1&page_size=50`,
              { headers: solscanHeaders }
            );

            if (holdersResponse.ok) {
              const holdersData = await holdersResponse.json();
              const holders = holdersData?.data || [];
              
              // Find AMM pool in holders using shared constants
              const allDexPrograms = [...Object.values(KNOWN_DEX_PROGRAMS), ...Object.values(BONDING_CURVE_PROGRAMS)];

              for (const holder of holders) {
                const holderAddress = holder.address || holder.owner;
                const ownerProgram = holder.owner_program || holder.owner || '';
                
                const isPoolMatch = allPoolAddresses.has(holderAddress) ||
                                    allDexPrograms.includes(ownerProgram);

                if (isPoolMatch) {
                  allPoolAddresses.add(holderAddress);
                  
                  if (!result.lpAccount) {
                    result.lpAccount = holderAddress;
                    result.lpSource = 'solscan';
                    result.dataQuality = 'verified';
                    result.actualData.solscanLP = holder;
                    
                    // Identify platform
                    for (const [platform, programId] of Object.entries(KNOWN_DEX_PROGRAMS)) {
                      if (ownerProgram === programId) {
                        result.detectedPlatforms.push(platform);
                        break;
                      }
                    }
                    
                    console.log(`✅ [Solscan Verified] LP Account: ${result.lpAccount}`);
                  }
                  
                  // Check if Solscan indicates locked liquidity
                  if (topMarket.lock_info || topMarket.is_locked) {
                    result.isLocked = true;
                    result.lockMechanism = 'solscan_verified';
                    result.lockPercentage = topMarket.locked_percentage || 100;
                    if (topMarket.lock_expiry) {
                      result.lockExpiry = topMarket.lock_expiry;
                    }
                    console.log(`🔒 [Solscan] Liquidity locked via ${result.lockMechanism}`);
                  }
                }
              }
              
              if (!result.lpAccount) {
                console.log('⚠️ No AMM holder found in Solscan top holders, will use fallback');
              }
            }
          }
        }
        result.checkedMethods.push('Solscan - Markets & Holders (Primary)');
      } catch (e) {
        console.log('⚠️ Solscan primary method failed:', e instanceof Error ? e.message : String(e));
      }
    } else {
      console.log('⚠️ SOLSCAN_API_KEY not configured, skipping Solscan primary method');
    }

    // Method 1: Get token info and DEX liquidity data from DexScreener
    let dexPairs: any[] = [];
    try {
      console.log('📊 Fetching token info and liquidity data from DexScreener...');
      const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        if (dexData.pairs && dexData.pairs.length > 0) {
          dexPairs = dexData.pairs;
          const pair = dexPairs[0];
          
          result.tokenInfo = {
            name: pair.baseToken?.name || 'Unknown',
            symbol: pair.baseToken?.symbol || 'Unknown',
            price: parseFloat(pair.priceUsd) || 0
          };
          result.dexInfo = pair.dexId || 'Unknown DEX';
          
          // Detect launchpad
          const launchpadInfo = detectLaunchpad(pair, tokenMint);
          if (launchpadInfo.detected) {
            result.detectedPlatforms.push(launchpadInfo.name);
          }
          
          console.log(`✅ Token info: ${result.tokenInfo.name} (${result.tokenInfo.symbol})`);
          console.log(`📊 Found ${dexPairs.length} DEX pairs`);
          
          // Add all pair addresses to pool detection
          for (const dexPair of dexPairs) {
            if (dexPair.pairAddress) {
              dexScreenerPairAddresses.add(dexPair.pairAddress);
              allPoolAddresses.add(dexPair.pairAddress);
            }
            
            if (dexPair.liquidity?.usd) {
              console.log(`💧 ${dexPair.dexId} liquidity: $${dexPair.liquidity.usd.toLocaleString()}`);
              
              // DexScreener sometimes provides lock information in pair data
              if (dexPair.info?.includes('locked') || dexPair.info?.includes('burnt')) {
                result.isLocked = true;
                result.lockMechanism = 'dexscreener_detected';
                console.log(`🔒 DexScreener indicates locked liquidity on ${dexPair.dexId}`);
              }
            }
          }
        }
      }
      result.checkedMethods.push('DexScreener - Token Info & Liquidity');
    } catch (e) {
      console.log('⚠️ DexScreener token info failed:', e instanceof Error ? e.message : String(e));
    }

    // Method 2: Check for Meteora and Raydium specific pools
    try {
      console.log('🌊 Checking for Meteora and Raydium pool locks...');
      
      for (const pair of dexPairs) {
        const dexId = pair.dexId?.toLowerCase();
        const pairAddress = pair.pairAddress;
        
        if (dexId === 'meteora') {
          console.log(`🌊 Meteora pool detected: ${pairAddress}`);
          result.detectedPlatforms.push('Meteora');
          
          try {
            const meteoraResponse = await fetch(`https://app.meteora.ag/dlmm-api/pair/${pairAddress}`);
            if (meteoraResponse.ok) {
              const meteoraData = await meteoraResponse.json();
              result.actualData.meteora = meteoraData;
              
              if (meteoraData.pair_data && meteoraData.pair_data.lock_end_timestamp) {
                const lockEndTime = meteoraData.pair_data.lock_end_timestamp;
                const currentTime = Math.floor(Date.now() / 1000);
                
                if (lockEndTime > currentTime) {
                  const lockDurationDays = Math.floor((lockEndTime - currentTime) / (24 * 60 * 60));
                  result.lockMechanism = 'meteora_time_lock';
                  result.lockDuration = `${lockDurationDays} days`;
                  result.lockExpiry = new Date(lockEndTime * 1000).toISOString();
                  result.isLocked = true;
                  result.dataQuality = 'verified';
                  
                  if (meteoraData.pair_data.locked_percentage !== undefined) {
                    result.lockPercentage = meteoraData.pair_data.locked_percentage;
                  } else {
                    result.lockPercentage = null;
                    result.assumptions.push('Lock percentage not provided by Meteora API');
                  }
                  
                  console.log(`🔒 VERIFIED: Meteora pool locked until ${result.lockExpiry} (${lockDurationDays} days)`);
                } else {
                  result.lockMechanism = 'meteora_lock_expired';
                  result.isLocked = false;
                  result.dataQuality = 'verified';
                  console.log(`❌ VERIFIED: Meteora lock expired on ${new Date(lockEndTime * 1000).toISOString()}`);
                }
              } else {
                result.lockMechanism = 'meteora_no_lock_data';
                result.dataQuality = 'failed';
                result.assumptions.push('Meteora API returned data but no lock information found');
              }
            }
          } catch (e) {
            result.error = `Meteora API error: ${e instanceof Error ? e.message : String(e)}`;
            result.dataQuality = 'failed';
          }
        } else if (dexId === 'raydium') {
          console.log(`💧 Raydium pool detected: ${pairAddress}`);
          result.dexInfo = 'Raydium';
          result.detectedPlatforms.push('Raydium');
        }
      }
      
      result.checkedMethods.push('Meteora/Raydium Pool Detection');
    } catch (e) {
      console.log('⚠️ Meteora/Raydium check failed:', e instanceof Error ? e.message : String(e));
    }

    // Method 3: Enhanced LP token distribution and pool analysis
    const heliusApiKey = getHeliusApiKey();
    if (heliusApiKey && !result.isLocked) {
      try {
        console.log('🔍 Analyzing LP token distribution and pool contracts...');
        
        const rpcUrl = getHeliusRpcUrl(heliusApiKey);
        
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'liquidity-check',
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
          })
        });

        if (response.ok) {
          const data = await response.json();
          const accounts = data.result || [];
          
          console.log(`📈 Found ${accounts.length} token accounts`);
          
          let totalSupply = 0;
          let lockedAmount = 0;
          let lpAccounts = [];
          let poolContracts = [];

          for (const account of accounts) {
            const balance = parseInt(account.account.data.parsed.info.tokenAmount.amount);
            const owner = account.account.data.parsed.info.owner;
            const accountOwner = account.account.owner;
            
            totalSupply += balance;
            
            // Check burn addresses
            if (BURN_ADDRESSES.has(owner)) {
              lockedAmount += balance;
              lpAccounts.push({ owner, balance, type: 'burned' });
              console.log(`🔥 Found burned tokens: ${balance} to ${owner}`);
            }
            
            // Check known LP wallets
            if (KNOWN_LP_WALLETS.has(owner)) {
              lockedAmount += balance;
              lpAccounts.push({ owner, balance, type: 'known_lp' });
              console.log(`💧 Found known LP wallet: ${owner} with ${balance} tokens`);
            }
            
            // Check if owned by DEX program
            const allDexPrograms = Object.values(KNOWN_DEX_PROGRAMS);
            if (allDexPrograms.includes(accountOwner)) {
              poolContracts.push({ owner, balance, accountOwner, type: 'pool_contract' });
              lockedAmount += balance;
              
              // Identify which platform
              for (const [platform, programId] of Object.entries(KNOWN_DEX_PROGRAMS)) {
                if (accountOwner === programId) {
                  if (!result.detectedPlatforms.includes(platform)) {
                    result.detectedPlatforms.push(platform);
                  }
                  console.log(`💧 Found ${platform} pool contract: ${owner} with ${balance} tokens`);
                  break;
                }
              }
            }
            
            // Check bonding curves
            const bondingPrograms = Object.values(BONDING_CURVE_PROGRAMS);
            if (bondingPrograms.includes(accountOwner)) {
              poolContracts.push({ owner, balance, accountOwner, type: 'bonding_curve' });
              lockedAmount += balance;
              
              for (const [platform, programId] of Object.entries(BONDING_CURVE_PROGRAMS)) {
                if (accountOwner === programId) {
                  if (!result.detectedPlatforms.includes(platform)) {
                    result.detectedPlatforms.push(platform);
                  }
                  console.log(`🔄 Found ${platform} bonding curve: ${owner} with ${balance} tokens`);
                  break;
                }
              }
            }
          }
          
          if (totalSupply > 0) {
            const calculatedLockPercentage = Math.round((lockedAmount / totalSupply) * 100);
            
            if (calculatedLockPercentage > (result.lockPercentage || 0)) {
              result.lockPercentage = calculatedLockPercentage;
            }
            
            if ((result.lockPercentage || 0) > 80 || result.lockMechanism.includes('meteora')) {
              result.isLocked = true;
            }
            
            console.log(`🔥 Enhanced lock analysis: ${result.lockPercentage}% locked via ${result.lockMechanism}`);
            console.log(`📊 Pool contracts found: ${poolContracts.length}, Burned tokens: ${lpAccounts.filter(a => a.type === 'burned').length}`);
          }
        }
        
        result.checkedMethods.push('Enhanced LP & Pool Contract Analysis');
      } catch (e) {
        console.log('⚠️ Enhanced LP analysis failed:', e instanceof Error ? e.message : String(e));
        result.checkedMethods.push('Enhanced LP & Pool Analysis (FAILED)');
      }
    }

    // Method 4: Enhanced transaction and LP burn analysis (only if not already locked)
    if (heliusApiKey && !result.isLocked) {
      try {
        console.log('🔍 Final check: LP burn transactions and lock events...');
        
        const rpcUrl = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
        
        for (const pair of dexPairs) {
          if (pair.pairAddress) {
            try {
              const txResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 'lp-tx-history',
                  method: 'getSignaturesForAddress',
                  params: [pair.pairAddress, { limit: 50 }]
                })
              });

              if (txResponse.ok) {
                const txData = await txResponse.json();
                const signatures = txData.result || [];
                
                console.log(`📜 Found ${signatures.length} transactions for pair ${pair.pairAddress}`);
                
                // Check for burn transactions
                for (const sig of signatures.slice(0, 20)) {
                  try {
                    const detailResp = await fetch(rpcUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'tx-detail',
                        method: 'getTransaction',
                        params: [sig.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]
                      })
                    });
                    
                    if (detailResp.ok) {
                      const detailData = await detailResp.json();
                      const tx = detailData.result;
                      
                      if (tx?.meta?.logMessages) {
                        const logs = tx.meta.logMessages.join(' ').toLowerCase();
                        
                        if (logs.includes('burn') || logs.includes('lock') || logs.includes('close')) {
                          result.isLocked = true;
                          result.lockMechanism = 'lp_burn_detected';
                          result.dataQuality = 'verified';
                          console.log(`🔥 LP burn/lock transaction detected: ${sig.signature}`);
                          break;
                        }
                      }
                    }
                  } catch (e) {
                    // Skip failed transaction lookups
                  }
                }
                
                if (result.isLocked) break;
              }
            } catch (e) {
              console.log(`⚠️ Failed to analyze pair ${pair.pairAddress}:`, e instanceof Error ? e.message : String(e));
            }
          }
        }
        
        result.checkedMethods.push('LP Transaction & Burn Analysis');
      } catch (e) {
        console.log('⚠️ Transaction analysis failed:', e instanceof Error ? e.message : String(e));
        result.checkedMethods.push('LP Transaction Analysis (FAILED)');
      }
    }

    // Final summary
    console.log(`\n📊 Liquidity Lock Check Complete:`);
    console.log(`  Token: ${result.tokenInfo?.symbol || tokenMint}`);
    console.log(`  Locked: ${result.isLocked ? 'YES' : 'NO'}`);
    console.log(`  Lock %: ${result.lockPercentage || 'Unknown'}%`);
    console.log(`  Mechanism: ${result.lockMechanism}`);
    console.log(`  Platforms: ${result.detectedPlatforms.join(', ') || 'Unknown'}`);
    console.log(`  Methods checked: ${result.checkedMethods.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error checking liquidity lock:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to check liquidity lock status',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
