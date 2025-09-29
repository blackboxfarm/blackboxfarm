import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const heliusRpcUrl = Deno.env.get('SOLANA_RPC_URL');
    
    let solPrice = null;
    
    // Try Helius RPC first if available
    if (heliusRpcUrl) {
      try {
        console.log('Fetching SOL price from Helius RPC...');
        
        // Use Jupiter's price API with Helius as backup
        const jupiterResponse = await fetch('https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112');
        
        if (jupiterResponse.ok) {
          const jupiterData = await jupiterResponse.json();
          const price = jupiterData?.data?.['So11111111111111111111111111111111111111112']?.price;
          
          if (price && typeof price === 'number') {
            solPrice = Math.ceil(price * 100) / 100; // Round up to nearest penny
            console.log(`SOL price from Jupiter: $${solPrice}`);
          }
        }
      } catch (error) {
        console.log('Helius/Jupiter fetch failed:', error instanceof Error ? error.message : String(error));
      }
    }
    
    // Fallback to CoinGecko if Helios/Jupiter fails
    if (!solPrice) {
      try {
        console.log('Falling back to CoinGecko...');
        const coinGeckoResponse = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
        );
        
        if (coinGeckoResponse.ok) {
          const coinGeckoData = await coinGeckoResponse.json();
          const price = coinGeckoData?.solana?.usd;
          
          if (price && typeof price === 'number') {
            solPrice = Math.ceil(price * 100) / 100; // Round up to nearest penny
            console.log(`SOL price from CoinGecko: $${solPrice}`);
          }
        }
      } catch (error) {
        console.log('CoinGecko fetch failed:', error instanceof Error ? error.message : String(error));
      }
    }
    
    // Final fallback to a reasonable default
    if (!solPrice) {
      solPrice = 201.00; // Default fallback price
      console.log('Using fallback price: $201.00');
    }
    
    return new Response(
      JSON.stringify({ 
        price: solPrice,
        timestamp: new Date().toISOString(),
        source: heliusRpcUrl ? 'helius/jupiter' : 'coingecko'
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
    
  } catch (error) {
    console.error('Error fetching SOL price:', error);
    
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch SOL price',
        price: 201.00, // Fallback price
        timestamp: new Date().toISOString(),
        source: 'fallback'
      }),
      { 
        status: 500, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});