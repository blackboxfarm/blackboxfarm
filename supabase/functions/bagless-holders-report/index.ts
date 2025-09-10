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

    // Get Helius API key from environment
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) {
      return new Response(
        JSON.stringify({ error: 'Helius API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching all token holders for: ${tokenMint}`);

    const rpcUrl = `https://rpc.helius.xyz/?api-key=${heliusApiKey}`;
    
    // Use manual price if provided, otherwise try to fetch from APIs
    let tokenPriceUSD = manualPrice || 0;
    
    if (!manualPrice || manualPrice === 0) {
      console.log('No manual price provided, trying to fetch from APIs...');
      try {
        // Try Jupiter v6 first
        const priceResponse = await fetch(`https://price.jup.ag/v6/price?ids=${tokenMint}`);
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          tokenPriceUSD = priceData.data?.[tokenMint]?.price || 0;
          console.log(`Token price from Jupiter v6: $${tokenPriceUSD}`);
        }
        
        // If Jupiter fails or returns 0, try DexScreener as fallback
        if (tokenPriceUSD === 0) {
          console.log('Jupiter failed, trying DexScreener...');
          const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`);
          if (dexResponse.ok) {
            const dexData = await dexResponse.json();
            if (dexData.pairs && dexData.pairs.length > 0) {
              tokenPriceUSD = parseFloat(dexData.pairs[0].priceUsd) || 0;
              console.log(`Token price from DexScreener: $${tokenPriceUSD}`);
            }
          }
        }
      } catch (e) {
        console.warn('Could not fetch token price from any source:', e);
      }
    } else {
      console.log(`Using manual price: $${tokenPriceUSD}`);
    }
    
    if (tokenPriceUSD === 0) {
      console.warn('WARNING: Token price is $0 - USD calculations will be incorrect');
    }
    
    // Get all token accounts for this mint
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getProgramAccounts',
        params: [
          'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program ID
          {
            encoding: 'jsonParsed',
            filters: [
              {
                dataSize: 165, // Size of token account
              },
              {
                memcmp: {
                  offset: 0,
                  bytes: tokenMint,
                },
              },
            ],
          },
        ],
      })
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(`RPC error: ${data.error.message}`);
    }

    const holders = [];
    
    if (data.result && data.result.length > 0) {
      for (const account of data.result) {
        try {
          const parsedInfo = account.account.data.parsed.info;
          const balance = parseFloat(parsedInfo.tokenAmount.uiAmount || 0);
          const owner = parsedInfo.owner;
          
          if (balance > 0) {
            // Calculate USD value
            const usdValue = balance * tokenPriceUSD;
            
            // Categorize wallets
            const isDustWallet = balance < 1;
            const isSmallWallet = balance >= 1 && usdValue < 1; // Between 1 token and $1 USD
            const isMediumWallet = usdValue >= 1 && usdValue < 5; // $1-$5 USD
            const isLargeWallet = usdValue >= 5 && usdValue < 50; // $5-$50 USD
            
            holders.push({
              owner,
              balance,
              usdValue,
              balanceRaw: parsedInfo.tokenAmount.amount,
              isDustWallet,
              isSmallWallet,
              isMediumWallet,
              isLargeWallet,
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

    const dustWallets = rankedHolders.filter(h => h.isDustWallet).length;
    const smallWallets = rankedHolders.filter(h => h.isSmallWallet).length;
    const mediumWallets = rankedHolders.filter(h => h.isMediumWallet).length;
    const largeWallets = rankedHolders.filter(h => h.isLargeWallet).length;
    const realWallets = rankedHolders.filter(h => !h.isDustWallet && !h.isSmallWallet && !h.isMediumWallet && !h.isLargeWallet).length;
    const totalBalance = rankedHolders.reduce((sum, h) => sum + h.balance, 0);

    console.log(`Found ${rankedHolders.length} token holders`);
    console.log(`Real wallets: ${realWallets}, Large wallets: ${largeWallets}, Medium wallets: ${mediumWallets}, Small wallets: ${smallWallets}, Dust wallets: ${dustWallets}`);

    const result = {
      tokenMint,
      totalHolders: rankedHolders.length,
      realWallets,
      largeWallets,
      mediumWallets,
      smallWallets,
      dustWallets,
      totalBalance,
      tokenPriceUSD,
      holders: rankedHolders,
      summary: `Found ${rankedHolders.length} total holders. ${realWallets} real wallets (≥$50), ${largeWallets} large wallets ($5-$50), ${mediumWallets} medium wallets ($1-$5), ${smallWallets} small wallets (<$1), ${dustWallets} dust wallets (<1 token). Total tokens distributed: ${totalBalance.toLocaleString()}`
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