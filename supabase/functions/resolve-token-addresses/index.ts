import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batchSize = 5 } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get tokens that need address resolution (lowercase addresses from html_scrape)
    const { data: tokensToResolve, error: fetchError } = await supabase
      .from('scraped_tokens')
      .select('id, token_mint, symbol, name')
      .eq('discovery_source', 'html_scrape')
      .order('created_at', { ascending: false })
      .limit(batchSize);

    if (fetchError) {
      console.error('Error fetching tokens:', fetchError);
      return new Response(JSON.stringify({ error: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tokensToResolve || tokensToResolve.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No tokens to resolve',
        resolved: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Resolving ${tokensToResolve.length} token addresses...`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const token of tokensToResolve) {
      try {
        const lowercaseAddress = token.token_mint;
        const dexScreenerUrl = `https://dexscreener.com/solana/${lowercaseAddress}`;
        
        console.log(`Resolving ${token.symbol} (${lowercaseAddress})...`);

        let realAddress: string | null = null;
        let resolutionMethod = 'unknown';

        // 1) Try DexScreener API first (avoids Cloudflare/browser timeouts)
        try {
          const apiRes = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(lowercaseAddress)}`, {
            method: 'GET',
            headers: { 'accept': 'application/json' }
          });
          if (apiRes.ok) {
            const apiJson = await apiRes.json();
            const pairs = apiJson?.pairs ?? [];
            const solPair = pairs.find((p: any) =>
              p?.chainId === 'solana' ||
              p?.baseToken?.chainId === 'solana' ||
              p?.quoteToken?.chainId === 'solana'
            );
            if (solPair?.baseToken?.address) {
              realAddress = solPair.baseToken.address;
              resolutionMethod = 'api';
              console.log(`API resolved ${token.symbol}: ${realAddress}`);
            }
          } else {
            console.warn(`DexScreener API responded with ${apiRes.status} for ${token.symbol}`);
          }
        } catch (e) {
          console.warn(`DexScreener API lookup failed for ${token.symbol}:`, e);
        }

        // 2) Fallback to agentic-browser scrape if API did not resolve
        if (!realAddress) {
          // Call agentic-browser to scrape the page
          const { data: browserData, error: browserError } = await supabase.functions.invoke('agentic-browser', {
            body: {
              url: dexScreenerUrl,
              actions: [
                { type: 'cloudflare_challenge' },
                { type: 'scrape' }
              ],
              timeout: 30000
            }
          });

          if (browserError || !browserData?.success) {
            console.error(`Browser error for ${token.symbol}:`, browserError?.message || 'Unknown error');
            failCount++;
            results.push({
              symbol: token.symbol,
              oldAddress: lowercaseAddress,
              success: false,
              error: browserError?.message || 'Browser failed'
            });
            continue;
          }

          // Extract HTML from the scrape action result
          const scrapeResult = browserData.results?.find((r: any) => r.action === 'scrape');
          const html = scrapeResult?.html || '';

          if (!html) {
            console.error(`No HTML returned for ${token.symbol}`);
            failCount++;
            results.push({
              symbol: token.symbol,
              oldAddress: lowercaseAddress,
              success: false,
              error: 'No HTML content'
            });
            continue;
          }

          // Parse HTML to find the real token address
          realAddress = extractTokenAddress(html, lowercaseAddress);
          if (realAddress && realAddress !== lowercaseAddress) {
            resolutionMethod = 'browser';
          }
        }

        if (!realAddress || realAddress === lowercaseAddress) {
          console.error(`Could not extract real address for ${token.symbol}`);
          failCount++;
          results.push({
            symbol: token.symbol,
            oldAddress: lowercaseAddress,
            success: false,
            error: 'Could not find real address in API/HTML'
          });
          continue;
        }

        // Update the database with the correct address
        const { error: updateError } = await supabase
          .from('scraped_tokens')
          .update({ 
            token_mint: realAddress,
            updated_at: new Date().toISOString()
          })
          .eq('id', token.id);

        if (updateError) {
          console.error(`Update error for ${token.symbol}:`, updateError);
          failCount++;
          results.push({
            symbol: token.symbol,
            oldAddress: lowercaseAddress,
            success: false,
            error: updateError.message
          });
        } else {
          console.log(`✓ Resolved ${token.symbol}: ${realAddress}`);
          successCount++;
          results.push({
            symbol: token.symbol,
            oldAddress: lowercaseAddress,
            newAddress: realAddress,
            method: resolutionMethod,
            success: true
          });
        }

        // Rate limiting - wait 2 seconds between requests
        if (tokensToResolve.indexOf(token) < tokensToResolve.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch (error: any) {
        console.error(`Error processing ${token.symbol}:`, error);
        failCount++;
        results.push({
          symbol: token.symbol,
          oldAddress: token.token_mint,
          success: false,
          error: error.message
        });
      }
    }

    console.log(`Resolution complete: ${successCount} succeeded, ${failCount} failed`);

    return new Response(JSON.stringify({
      message: `Resolved ${successCount} of ${tokensToResolve.length} token addresses`,
      resolved: successCount,
      failed: failCount,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('Error in resolve-token-addresses:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

function extractTokenAddress(html: string, lowercaseAddress: string): string | null {
  // Try multiple patterns to find the real token address
  
  // Pattern 1: Look for the token address in meta tags or data attributes
  const metaMatch = html.match(/data-token-address="([A-HJ-NP-Za-km-z1-9]{32,44})"/);
  if (metaMatch) return metaMatch[1];

  // Pattern 2: Look for base58 address that's NOT the lowercase one
  // Solana addresses are 32-44 chars, base58 encoded (no 0, O, I, l)
  const base58Regex = /\b([A-HJ-NP-Za-km-z1-9]{32,44})\b/g;
  const matches = html.match(base58Regex) || [];
  
  for (const match of matches) {
    // Skip if it's the lowercase version we already have
    if (match.toLowerCase() === lowercaseAddress.toLowerCase()) continue;
    
    // Check if it looks like a valid Solana address (has mixed case and valid chars)
    if (match.match(/[A-Z]/) && match.match(/[a-z]/) && match.match(/[1-9]/)) {
      return match;
    }
  }

  // Pattern 3: Look for copy button content or title attributes
  const copyButtonMatch = html.match(/title="Copy token address"[^>]*>([A-HJ-NP-Za-km-z1-9]{32,44})</);
  if (copyButtonMatch) return copyButtonMatch[1];

  // Pattern 4: Look in class names that suggest token address display
  const addressClassMatch = html.match(/class="[^"]*token[_-]?address[^"]*"[^>]*>([A-HJ-NP-Za-km-z1-9]{32,44})</i);
  if (addressClassMatch) return addressClassMatch[1];

  return null;
}
