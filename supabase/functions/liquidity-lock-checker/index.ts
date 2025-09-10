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
      lockPercentage: 0,
      lockMechanism: 'unknown',
      dexInfo: 'unknown',
      tokenInfo: null,
      error: null,
      checkedMethods: []
    };

    // Method 1: Try to get basic token info from DexScreener first
    try {
      console.log('📊 Fetching token info from DexScreener...');
      const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
      
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        if (dexData.pairs && dexData.pairs.length > 0) {
          const pair = dexData.pairs[0];
          result.tokenInfo = {
            name: pair.baseToken?.name || 'Unknown',
            symbol: pair.baseToken?.symbol || 'Unknown',
            price: parseFloat(pair.priceUsd) || 0
          };
          result.dexInfo = pair.dexId || 'Unknown DEX';
          console.log(`✅ Token info: ${result.tokenInfo.name} (${result.tokenInfo.symbol})`);
        }
      }
      result.checkedMethods.push('DexScreener - Token Info');
    } catch (e) {
      console.log('⚠️ DexScreener token info failed:', e.message);
    }

    // Method 2: Check Helius for LP token distribution analysis
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (heliusApiKey) {
      try {
        console.log('🔍 Analyzing LP token distribution via Helius...');
        
        // Get all token accounts for this mint to find LP tokens
        const rpcUrl = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
        
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
          
          // Look for accounts with very high balances (likely LP positions)
          let totalSupply = 0;
          let lockedAmount = 0;
          let lpAccounts = [];

          for (const account of accounts) {
            const balance = parseInt(account.account.data.parsed.info.tokenAmount.amount);
            const owner = account.account.data.parsed.info.owner;
            
            totalSupply += balance;
            
            // Check if tokens are "burned" (sent to known burn addresses)
            const burnAddresses = [
              '11111111111111111111111111111111', // System Program (burn)
              'So11111111111111111111111111111111111111112', // Native SOL
              '1nc1nerator11111111111111111111111111111111', // Incinerator
            ];
            
            if (burnAddresses.includes(owner)) {
              lockedAmount += balance;
              lpAccounts.push({ owner, balance, type: 'burned' });
            } else if (balance > totalSupply * 0.1) { // Large holders might be LP
              lpAccounts.push({ owner, balance, type: 'large_holder' });
            }
          }
          
          if (totalSupply > 0) {
            result.lockPercentage = Math.round((lockedAmount / totalSupply) * 100);
            result.isLocked = result.lockPercentage > 50; // Consider locked if >50% burned
            result.lockMechanism = lockedAmount > 0 ? 'burned' : 'unknown';
            
            console.log(`🔥 Lock analysis: ${result.lockPercentage}% locked via burning`);
          }
        }
        
        result.checkedMethods.push('Helius - LP Analysis');
      } catch (e) {
        console.log('⚠️ Helius LP analysis failed:', e.message);
        result.checkedMethods.push('Helius - LP Analysis (FAILED)');
      }
    }

    // Method 3: Check transaction history for burn events
    if (heliusApiKey && result.lockPercentage === 0) {
      try {
        console.log('🔍 Checking transaction history for burn events...');
        
        const rpcUrl = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
        
        // Get recent transactions for the token mint
        const txResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'tx-history',
            method: 'getSignaturesForAddress',
            params: [tokenMint, { limit: 100 }]
          })
        });

        if (txResponse.ok) {
          const txData = await txResponse.json();
          const signatures = txData.result || [];
          
          // Look for burn-related transactions
          let burnTransactions = 0;
          for (const sig of signatures.slice(0, 10)) { // Check last 10 transactions
            try {
              const txDetailResponse = await fetch(rpcUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 'tx-detail',
                  method: 'getTransaction',
                  params: [sig.signature, { encoding: 'jsonParsed' }]
                })
              });
              
              if (txDetailResponse.ok) {
                const txDetail = await txDetailResponse.json();
                const logMessages = txDetail.result?.meta?.logMessages || [];
                
                // Look for burn-related log messages
                const hasBurnLogs = logMessages.some(log => 
                  log.toLowerCase().includes('burn') || 
                  log.toLowerCase().includes('close') ||
                  log.toLowerCase().includes('incinerator')
                );
                
                if (hasBurnLogs) {
                  burnTransactions++;
                }
              }
            } catch (e) {
              // Skip failed transaction details
            }
          }
          
          if (burnTransactions > 0) {
            result.lockMechanism = 'burn_detected';
            result.isLocked = true;
            console.log(`🔥 Found ${burnTransactions} burn-related transactions`);
          }
        }
        
        result.checkedMethods.push('Transaction History - Burn Detection');
      } catch (e) {
        console.log('⚠️ Transaction history check failed:', e.message);
        result.checkedMethods.push('Transaction History - Burn Detection (FAILED)');
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
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});