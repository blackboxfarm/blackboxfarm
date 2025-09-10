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
    const { tokenMint } = await req.json();
    
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
    
    // Get token price in USD from Jupiter API
    let tokenPriceUSD = 0;
    try {
      const priceResponse = await fetch(`https://price.jup.ag/v4/price?ids=${tokenMint}`);
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        tokenPriceUSD = priceData.data?.[tokenMint]?.price || 0;
        console.log(`Token price: $${tokenPriceUSD}`);
      }
    } catch (e) {
      console.warn('Could not fetch token price, using $0:', e);
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
            
            holders.push({
              owner,
              balance,
              usdValue,
              balanceRaw: parsedInfo.tokenAmount.amount,
              isDustWallet,
              isSmallWallet,
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
    const realWallets = rankedHolders.filter(h => !h.isDustWallet && !h.isSmallWallet).length;
    const totalBalance = rankedHolders.reduce((sum, h) => sum + h.balance, 0);

    console.log(`Found ${rankedHolders.length} token holders`);
    console.log(`Real wallets: ${realWallets}, Small wallets: ${smallWallets}, Dust wallets: ${dustWallets}`);

    const result = {
      tokenMint,
      totalHolders: rankedHolders.length,
      realWallets,
      smallWallets,
      dustWallets,
      totalBalance,
      tokenPriceUSD,
      holders: rankedHolders,
      summary: `Found ${rankedHolders.length} total holders. ${realWallets} real wallets (≥$1), ${smallWallets} small wallets (≥1 token, <$1), ${dustWallets} dust wallets (<1 token). Total tokens distributed: ${totalBalance.toLocaleString()}`
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