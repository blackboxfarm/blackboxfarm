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
      priceSource,
      priceDiscoveryFailed,
      holders: rankedHolders,
      summary: `Found ${rankedHolders.length} total holders. ${realWallets} real wallets (≥$50), ${largeWallets} large wallets ($5-$50), ${mediumWallets} medium wallets ($1-$5), ${smallWallets} small wallets (<$1), ${dustWallets} dust wallets (<1 token). Total tokens distributed: ${totalBalance.toLocaleString()}${priceSource ? ` (Price from ${priceSource})` : ''}`
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