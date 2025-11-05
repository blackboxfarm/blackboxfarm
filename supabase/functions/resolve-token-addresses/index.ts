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
          console.log(`🌐 Attempting browser scrape for ${token.symbol}...`);
          
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

          console.log(`📡 Browser response status:`, browserError ? 'ERROR' : 'SUCCESS');
          if (browserError) {
            console.error(`❌ Browser error details:`, JSON.stringify(browserError, null, 2));
          }
          if (browserData) {
            console.log(`📊 Browser data keys:`, Object.keys(browserData));
            console.log(`✅ Browser success:`, browserData.success);
            console.log(`📝 Results count:`, browserData.results?.length || 0);
          }

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

          console.log(`📄 HTML length:`, html.length);
          console.log(`🔍 First 500 chars of HTML:`, html.substring(0, 500));
          console.log(`🔍 Last 500 chars of HTML:`, html.substring(Math.max(0, html.length - 500)));
          
          // Check if it's a 404 or error page
          if (html.includes('404') || html.includes('Page not found') || html.includes('cloudflare')) {
            console.warn(`⚠️ Possible 404 or error page detected`);
          }
          
          // Check for Solscan links
          const solscanMatches = html.match(/solscan\.io\/token/gi);
          console.log(`🔎 Solscan link count:`, solscanMatches?.length || 0);
          if (solscanMatches) {
            console.log(`🔗 Sample Solscan context:`, html.substring(html.indexOf('solscan.io/token') - 50, html.indexOf('solscan.io/token') + 150));
          }

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
          console.log(`🔍 Attempting to extract token address...`);
          realAddress = extractTokenAddress(html, lowercaseAddress);
          console.log(`📊 Extraction result:`, realAddress || 'NULL');
          
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
  console.log(`🔍 Starting extraction for lowercase: ${lowercaseAddress}`);
  
  // Primary method: Extract from Solscan link
  // Pattern: href="https://solscan.io/token/{TOKEN_ADDRESS}"
  const solscanRegex = /href="https:\/\/solscan\.io\/token\/([A-HJ-NP-Za-km-z1-9]{32,44})"/gi;
  
  let match;
  const allMatches = [];
  while ((match = solscanRegex.exec(html)) !== null) {
    allMatches.push(match[1]);
  }
  
  console.log(`📊 Found ${allMatches.length} Solscan token links:`, allMatches);
  
  if (allMatches.length > 0) {
    const selectedAddress = allMatches[0];
    console.log(`✅ Selected first match: ${selectedAddress}`);
    return selectedAddress;
  }
  
  console.log(`⚠️ No Solscan links found, trying meta tag fallback...`);
  
  // Fallback: Check meta tags if Solscan link not found
  const metaMatch = html.match(/<meta[^>]*property="og:url"[^>]*content="[^"]*\/solana\/([A-HJ-NP-Za-km-z1-9]{32,44})"[^>]*>/i);
  if (metaMatch && metaMatch[1]) {
    console.log(`✅ Found via meta tag: ${metaMatch[1]}`);
    return metaMatch[1];
  }
  
  console.warn(`❌ Could not extract token address from HTML for lowercase: ${lowercaseAddress}`);
  return null;
}
