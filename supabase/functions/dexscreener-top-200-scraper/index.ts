import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenData {
  address: string;
  rank: number;
  name?: string;
  symbol?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[DexScreener] 🚀 Starting HTML scrape of top 300 new Solana pairs...');

    const pages = [
      { url: 'https://dexscreener.com/new-pairs/solana', startRank: 1 },
      { url: 'https://dexscreener.com/new-pairs/solana/page-2', startRank: 101 },
      { url: 'https://dexscreener.com/new-pairs/solana/page-3', startRank: 201 }
    ];

    const allTokens: TokenData[] = [];
    const capturedAt = new Date().toISOString();

    for (const page of pages) {
      console.log(`[DexScreener] 📄 Fetching: ${page.url}`);
      
      try {
        const response = await fetch(page.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
          }
        });

        if (!response.ok) {
          console.error(`[DexScreener] ❌ Failed to fetch ${page.url}: ${response.status}`);
          continue;
        }

        const html = await response.text();
        console.log(`[DexScreener] ✅ Fetched ${html.length} bytes from ${page.url}`);
        
        // Extract token addresses from links like /solana/{tokenAddress}
        const tokenLinkRegex = /href="\/solana\/([A-HJ-NP-Za-km-z1-9]{32,44})(?:\?|\"|&)/g;
        const matches = [...html.matchAll(tokenLinkRegex)];
        
        const uniqueTokens = new Set<string>();
        const pageTokens: TokenData[] = [];
        
        console.log(`[DexScreener] 🔍 Found ${matches.length} token link matches`);
        
        for (const match of matches) {
          const tokenAddress = match[1];
          
          // Skip duplicates and non-token addresses
          if (uniqueTokens.has(tokenAddress)) continue;
          if (tokenAddress.length < 32 || tokenAddress.length > 44) continue;
          
          uniqueTokens.add(tokenAddress);
          
          const rank = page.startRank + pageTokens.length;
          if (rank > page.startRank + 99) break; // Max 100 per page
          
          pageTokens.push({
            address: tokenAddress,
            rank: rank
          });
        }
        
        console.log(`[DexScreener] ✨ Extracted ${pageTokens.length} unique tokens from page (ranks ${page.startRank}-${page.startRank + pageTokens.length - 1})`);
        allTokens.push(...pageTokens);
        
        // Be polite - delay between requests
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`[DexScreener] ❌ Error scraping ${page.url}:`, error);
      }
    }
    
    console.log(`[DexScreener] 🎯 Total tokens scraped: ${allTokens.length}`);

    if (allTokens.length === 0) {
      console.warn('[DexScreener] ⚠️ No tokens extracted from HTML');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No tokens found in HTML scrape',
          tokensProcessed: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // Insert rankings into token_rankings table
    const rankingsToInsert = allTokens.map(token => ({
      token_mint: token.address,
      rank: token.rank,
      trending_score: null,
      market_cap: null,
      volume_24h: null,
      price_usd: null,
      price_change_24h: null,
      liquidity_usd: null,
      holder_count: null,
      captured_at: capturedAt,
      data_source: 'dexscreener_html',
      is_in_top_200: token.rank <= 200,
      metadata: {
        scrapedFrom: 'dexscreener.com/new-pairs',
        method: 'html_scrape'
      }
    }));

    const { error: rankingsError } = await supabase
      .from('token_rankings')
      .insert(rankingsToInsert);

    if (rankingsError) {
      console.error('[DexScreener] ❌ Error inserting rankings:', rankingsError);
      throw rankingsError;
    }

    console.log(`[DexScreener] 💾 Inserted ${rankingsToInsert.length} ranking records`);

    // Update or create token_lifecycle records
    const newTokenMints = new Set<string>();
    
    for (const token of allTokens) {
      const { data: lifecycle } = await supabase
        .from('token_lifecycle')
        .select('*')
        .eq('token_mint', token.address)
        .single();

      if (lifecycle) {
        // Update existing lifecycle
        const updates: any = {
          last_seen_at: capturedAt,
          current_status: 'active',
        };

        if (!lifecycle.highest_rank || token.rank < lifecycle.highest_rank) {
          updates.highest_rank = token.rank;
        }
        if (!lifecycle.lowest_rank || token.rank > lifecycle.lowest_rank) {
          updates.lowest_rank = token.rank;
        }

        // Calculate hours in top 200/300
        const hoursSinceLastSeen = 
          (new Date(capturedAt).getTime() - new Date(lifecycle.last_seen_at).getTime()) / (1000 * 60 * 60);
        
        if (token.rank <= 200) {
          updates.total_hours_in_top_200 = lifecycle.total_hours_in_top_200 + Math.min(hoursSinceLastSeen, 0.1);
        }

        await supabase
          .from('token_lifecycle')
          .update(updates)
          .eq('token_mint', token.address);
          
        console.log(`[DexScreener] 🔄 Updated lifecycle for ${token.address} at rank ${token.rank}`);
      } else {
        // Create new lifecycle record
        await supabase
          .from('token_lifecycle')
          .insert({
            token_mint: token.address,
            first_seen_at: capturedAt,
            last_seen_at: capturedAt,
            highest_rank: token.rank,
            lowest_rank: token.rank,
            total_hours_in_top_200: token.rank <= 200 ? 0.1 : 0,
            times_entered_top_200: token.rank <= 200 ? 1 : 0,
            current_status: 'active',
            metadata: {
              firstSeenRank: token.rank,
              source: 'dexscreener_html_scrape'
            }
          });
          
        newTokenMints.add(token.address);
        console.log(`[DexScreener] 🆕 New token discovered: ${token.address} at rank ${token.rank}`);
      }
    }

    // Mark tokens that fell out of top 300
    const currentTop300Mints = allTokens.map(t => t.address);
    const { data: allActive } = await supabase
      .from('token_lifecycle')
      .select('token_mint, last_seen_at')
      .eq('current_status', 'active');

    if (allActive) {
      const exitedCount = 0;
      for (const token of allActive) {
        if (!currentTop300Mints.includes(token.token_mint)) {
          // Only mark as exited if it's been more than 1 hour
          const hoursSinceLastSeen = 
            (new Date(capturedAt).getTime() - new Date(token.last_seen_at).getTime()) / (1000 * 60 * 60);
          
          if (hoursSinceLastSeen > 1) {
            await supabase
              .from('token_lifecycle')
              .update({ 
                current_status: 'exited',
                last_seen_at: capturedAt
              })
              .eq('token_mint', token.token_mint);
          }
        }
      }
      console.log(`[DexScreener] 📉 Marked tokens as exited from rankings`);
    }

    // Trigger creator linking for new tokens
    if (newTokenMints.size > 0) {
      console.log(`[DexScreener] 🔗 ${newTokenMints.size} new tokens to link to creators`);
      
      // Invoke token-creator-linker in background (non-blocking)
      supabase.functions.invoke('token-creator-linker', {
        body: { tokenMints: Array.from(newTokenMints) }
      }).then(() => {
        console.log('[DexScreener] ✅ Creator linking triggered');
      }).catch(err => {
        console.error('[DexScreener] ⚠️ Error triggering creator linker:', err);
      });
    }

    console.log(`[DexScreener] 🎉 Scrape complete! Processed ${allTokens.length} tokens, ${newTokenMints.size} new`);

    return new Response(
      JSON.stringify({
        success: true,
        capturedAt,
        tokensProcessed: allTokens.length,
        newTokens: newTokenMints.size,
        topRanks: allTokens.slice(0, 10).map(t => ({ rank: t.rank, address: t.address })),
        message: `Successfully scraped and ranked ${allTokens.length} tokens`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[DexScreener] ❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message,
        stack: error.stack 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
