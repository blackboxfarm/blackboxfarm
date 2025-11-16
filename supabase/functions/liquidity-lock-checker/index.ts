import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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
      lpAccount: null as string | null, // Verified LP account address
      lpSource: 'heuristic' as 'solscan' | 'dexscreener' | 'heuristic' // Source of LP detection
    };

    // Method 0: Solscan-first LP detection (primary source)
    const SOLSCAN_API_KEY = Deno.env.get('SOLSCAN_API_KEY');
    if (SOLSCAN_API_KEY) {
      try {
        console.log('🔍 [Solscan Primary] Fetching LP from Solscan markets...');
        const solscanHeaders = {
          'token': SOLSCAN_API_KEY,
          'accept': 'application/json'
        };

        // Get markets for this token
        const marketsResponse = await fetch(
          `https://pro-api.solscan.io/v2.0/token/markets?address=${tokenMint}`,
          { headers: solscanHeaders }
        );

        if (marketsResponse.ok) {
          const marketsData = await marketsResponse.json();
          console.log(`✅ Solscan markets found: ${marketsData?.data?.length || 0}`);
          
          if (marketsData?.data && marketsData.data.length > 0) {
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
              
              // Find AMM pool in holders (tagged with owner program matching known AMMs)
              const knownAmmPrograms = [
                '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM v4
                '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', // Pump.fun
                'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo', // Meteora
              ];

              const ammHolder = holders.find((h: any) => {
                const ownerProgram = h.owner_program || h.owner;
                return knownAmmPrograms.some(amm => ownerProgram?.includes(amm)) ||
                       h.address === topMarket.pool_address ||
                       h.address === topMarket.market_id;
              });

              if (ammHolder) {
                result.lpAccount = ammHolder.address;
                result.lpSource = 'solscan';
                result.dataQuality = 'verified';
                result.actualData.solscanLP = ammHolder;
                console.log(`✅ [Solscan Verified] LP Account: ${result.lpAccount}`);
                
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
              } else {
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
    let dexPairs = [];
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
          
          console.log(`✅ Token info: ${result.tokenInfo.name} (${result.tokenInfo.symbol})`);
          console.log(`📊 Found ${dexPairs.length} DEX pairs`);
          
          // Check DexScreener's liquidity lock information
          for (const dexPair of dexPairs) {
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
          
          // Get real Meteora pool data - NO ASSUMPTIONS
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
                  
                  // Try to get actual percentage if available in the data
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
                console.log(`❌ NO DATA: Meteora API response missing lock data`);
              }
            } else {
              result.error = `Meteora API failed with status ${meteoraResponse.status}`;
              result.dataQuality = 'failed';
              console.log(`❌ API FAILED: Meteora API returned ${meteoraResponse.status}`);
            }
          } catch (e) {
            result.error = `Meteora API error: ${e instanceof Error ? e.message : String(e)}`;
            result.dataQuality = 'failed';
            console.log(`❌ ERROR: Failed to check Meteora: ${e instanceof Error ? e.message : String(e)}`);
          }
        } else if (dexId === 'raydium') {
          console.log(`💧 Raydium pool detected: ${pairAddress}`);
          // Raydium pools can have burned LP tokens or time locks
          // We'll check this more thoroughly in the LP analysis
          result.dexInfo = 'Raydium';
        }
      }
      
      result.checkedMethods.push('Meteora/Raydium Pool Detection');
    } catch (e) {
      console.log('⚠️ Meteora/Raydium check failed:', e instanceof Error ? e.message : String(e));
    }

    // Method 3: Enhanced LP token distribution and pool analysis
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (heliusApiKey && !result.isLocked) {
      try {
        console.log('🔍 Analyzing LP token distribution and pool contracts...');
        
        const rpcUrl = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
        
        // First, check for LP token accounts
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
            
            totalSupply += balance;
            
            // Enhanced burn address detection
            const burnAddresses = [
              '11111111111111111111111111111111', // System Program
              'So11111111111111111111111111111111111111112', // Native SOL
              '1nc1nerator11111111111111111111111111111111', // Incinerator
              'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token Program itself
            ];
            
            // Known DEX program addresses for pool identification
            const dexPrograms = [
              '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
              'EyGdBX4EHWvZhG8kEF39yvEPBHcEF2ZaKGrYdcBCTm6h', // Meteora
              'DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1', // Orca
              'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK', // Raydium CLMM
            ];
            
            if (burnAddresses.includes(owner)) {
              lockedAmount += balance;
              lpAccounts.push({ owner, balance, type: 'burned' });
              console.log(`🔥 Found burned tokens: ${balance} to ${owner}`);
            } else if (dexPrograms.includes(owner)) {
              // This is likely a pool contract holding liquidity
              poolContracts.push({ owner, balance, type: 'pool_contract' });
              console.log(`💧 Found pool contract: ${owner} with ${balance} tokens`);
              
              // For pool contracts, we assume they're locked unless proven otherwise
              lockedAmount += balance;
            } else if (balance > totalSupply * 0.05) { // Large holders (5%+)
              lpAccounts.push({ owner, balance, type: 'large_holder' });
            }
          }
          
          // Enhanced pool contract analysis
          for (const pool of poolContracts) {
            try {
              // Get account info to determine the pool type
              const accountInfoResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 'account-info',
                  method: 'getAccountInfo',
                  params: [pool.owner, { encoding: 'base64' }]
                })
              });
              
              if (accountInfoResponse.ok) {
                const accountData = await accountInfoResponse.json();
                if (accountData.result?.value?.owner) {
                  const programId = accountData.result.value.owner;
                  
                  if (programId === '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8') {
                    result.lockMechanism = 'raydium_pool';
                    console.log(`💧 Raydium pool detected with ${pool.balance} tokens`);
                  } else if (programId === 'EyGdBX4EHWvZhG8kEF39yvEPBHcEF2ZaKGrYdcBCTm6h') {
                    result.lockMechanism = 'meteora_pool';
                    result.isLocked = true; // Meteora pools are typically locked
                    console.log(`🌊 Meteora pool detected with ${pool.balance} tokens`);
                  }
                }
              }
            } catch (e) {
              console.log(`⚠️ Failed to analyze pool ${pool.owner}:`, e instanceof Error ? e.message : String(e));
            }
          }
          
          if (totalSupply > 0) {
            const calculatedLockPercentage = Math.round((lockedAmount / totalSupply) * 100);
            
            // Update result only if we found higher lock percentage or confirmed pool locks
            if (calculatedLockPercentage > (result.lockPercentage || 0)) {
              result.lockPercentage = calculatedLockPercentage;
            }
            
            // Consider locked if >80% in pools/burned OR if it's a known locked pool type
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
        
        // Check for LP token creation and burn events
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
                
                let lpBurnFound = false;
                let liquidityLockFound = false;
                
                for (const sig of signatures.slice(0, 20)) { // Check recent transactions
                  try {
                    const txDetailResponse = await fetch(rpcUrl, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 'lp-tx-detail',
                        method: 'getTransaction',
                        params: [sig.signature, { encoding: 'jsonParsed' }]
                      })
                    });
                    
                    if (txDetailResponse.ok) {
                      const txDetail = await txDetailResponse.json();
                      const logMessages = txDetail.result?.meta?.logMessages || [];
                      const instructions = txDetail.result?.transaction?.message?.instructions || [];
                      
                      // Look for LP token burn or lock patterns
                      const hasLpBurn = logMessages.some((log: any) => 
                        log.toLowerCase().includes('burn') && log.toLowerCase().includes('liquidity') ||
                        log.toLowerCase().includes('lp') && log.toLowerCase().includes('burn')
                      );
                      
                      const hasLockInstruction = logMessages.some((log: any) =>
                        log.toLowerCase().includes('lock') ||
                        log.toLowerCase().includes('freeze') ||
                        log.toLowerCase().includes('time') && log.toLowerCase().includes('lock')
                      );
                      
                      if (hasLpBurn) {
                        lpBurnFound = true;
                        console.log(`🔥 LP burn detected in transaction: ${sig.signature.slice(0, 8)}...`);
                      }
                      
                      if (hasLockInstruction) {
                        liquidityLockFound = true;
                        console.log(`🔒 Lock instruction detected in transaction: ${sig.signature.slice(0, 8)}...`);
                      }
                    }
                  } catch (e) {
                    // Skip failed transaction details
                  }
                }
                
                if (lpBurnFound) {
                  result.isLocked = true;
                  result.lockMechanism = 'lp_tokens_burned';
                  result.lockPercentage = Math.max(result.lockPercentage || 0, 90); // Assume high lock if LP burned
                  console.log(`✅ LP tokens burned for ${pair.dexId} pair`);
                } else if (liquidityLockFound) {
                  result.isLocked = true;
                  result.lockMechanism = 'time_locked';
                  result.lockPercentage = Math.max(result.lockPercentage || 0, 85); // Assume high lock for time locks
                  console.log(`✅ Time lock detected for ${pair.dexId} pair`);
                }
              }
            } catch (e) {
              console.log(`⚠️ Failed to check LP transactions for ${pair.pairAddress}:`, e instanceof Error ? e.message : String(e));
            }
          }
        }
        
        result.checkedMethods.push('LP Transaction & Burn Analysis');
      } catch (e) {
        console.log('⚠️ LP transaction analysis failed:', e instanceof Error ? e.message : String(e));
        result.checkedMethods.push('LP Transaction Analysis (FAILED)');
      }
    }

    // Final status determination
    if (result.isLocked) {
      console.log(`✅ LOCKED: ${result.lockPercentage}% via ${result.lockMechanism}`);
    } else {
      console.log(`❌ NOT LOCKED: Could not detect significant liquidity lock`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Liquidity lock checker error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});