import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenData {
  address: string;
  rank: number;
  pageUrl: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[TokenCollector] 🚀 Building Top 1,000 Token Database...');
    console.log('[TokenCollector] 📊 Strategy: Cumulative forever-growing list (never subtract)');

    // Scrape 10 pages to get top 1,000 tokens
    const pages = [];
    for (let i = 1; i <= 10; i++) {
      const url = i === 1 
        ? 'https://dexscreener.com/new-pairs/solana'
        : `https://dexscreener.com/new-pairs/solana/page-${i}`;
      pages.push({ 
        url, 
        startRank: ((i - 1) * 100) + 1,
        pageNum: i
      });
    }

    const allTokens: TokenData[] = [];
    const capturedAt = new Date().toISOString();

    const browserlessApiKey = Deno.env.get('BROWSERLESS_API_KEY');
    if (!browserlessApiKey) {
      console.error('[TokenCollector] ❌ BROWSERLESS_API_KEY not found in environment');
      throw new Error('BROWSERLESS_API_KEY required for scraping');
    }

    for (const page of pages) {
      console.log(`[TokenCollector] 📄 Page ${page.pageNum}/10: Fetching ranks ${page.startRank}-${page.startRank + 99}`);
      
      try {
        // Use Browserless to bypass 403 blocks
        const browserlessUrl = `https://production-sfo.browserless.io/content?token=${browserlessApiKey}`;
        const response = await fetch(browserlessUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            url: page.url,
            gotoOptions: {
              waitUntil: 'networkidle0',
              timeout: 30000
            }
          })
        });

        if (!response.ok) {
          console.error(`[TokenCollector] ❌ Browserless error ${response.status} for ${page.url}`);
          continue;
        }

        const html = await response.text();
        
        // Extract all Solana token addresses from links
        const tokenLinkRegex = /href="\/solana\/([A-HJ-NP-Za-km-z1-9]{32,44})(?:\?|\"|&)/g;
        const matches = [...html.matchAll(tokenLinkRegex)];
        
        const uniqueTokens = new Set<string>();
        const pageTokens: TokenData[] = [];
        
        for (const match of matches) {
          const tokenAddress = match[1];
          if (uniqueTokens.has(tokenAddress)) continue;
          if (tokenAddress.length < 32 || tokenAddress.length > 44) continue;
          
          uniqueTokens.add(tokenAddress);
          
          const rank = page.startRank + pageTokens.length;
          if (rank > page.startRank + 99) break;
          
          pageTokens.push({
            address: tokenAddress,
            rank: rank,
            pageUrl: page.url
          });
        }
        
        console.log(`[TokenCollector] ✨ Page ${page.pageNum}: Found ${pageTokens.length} tokens`);
        allTokens.push(...pageTokens);
        
        // Polite delay between pages
        await new Promise(resolve => setTimeout(resolve, 800));
        
      } catch (error) {
        console.error(`[TokenCollector] ❌ Error on page ${page.pageNum}:`, error.message);
      }
    }
    
    console.log(`[TokenCollector] 🎯 Scraped ${allTokens.length} total tokens from 10 pages`);

    // Get existing tokens to calculate NEW tokens
    const { data: existingTokens } = await supabase
      .from('token_lifecycle')
      .select('token_mint')
      .in('token_mint', allTokens.map(t => t.address));

    const existingMints = new Set(existingTokens?.map(t => t.token_mint) || []);
    const newTokens = allTokens.filter(t => !existingMints.has(t.address));
    
    console.log(`[TokenCollector] 🆕 Found ${newTokens.length} NEW tokens (not in database)`);
    console.log(`[TokenCollector] 📦 Already tracking ${existingMints.size} tokens`);

    // Insert rankings snapshot for ALL tokens (for historical tracking)
    const rankingsToInsert = allTokens.map(token => ({
      token_mint: token.address,
      rank: token.rank,
      captured_at: capturedAt,
      data_source: 'dexscreener_top1k',
      is_in_top_200: token.rank <= 200,
      metadata: {
        page: Math.ceil(token.rank / 100),
        scrapeRun: capturedAt
      }
    }));

    const { error: rankingsError } = await supabase
      .from('token_rankings')
      .insert(rankingsToInsert);

    if (rankingsError) {
      console.error('[TokenCollector] ⚠️ Rankings insert error:', rankingsError.message);
    }

    // Add only NEW tokens to token_lifecycle (cumulative forever-growing list)
    let addedCount = 0;
    const newMints = [];

    for (const token of newTokens) {
      console.log(`[TokenCollector] 🔍 Adding new token: ${token.address} (rank ${token.rank})`);
      
      const { error } = await supabase
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
            discoveredAt: capturedAt,
            source: 'dexscreener_top1k_scrape'
          }
        });

      if (!error) {
        addedCount++;
        newMints.push(token.address);
      } else {
        console.error(`[TokenCollector] ⚠️ Failed to add ${token.address}:`, error.message);
      }
    }

    console.log(`[TokenCollector] ✅ Added ${addedCount} new tokens to permanent collection`);

    // Update existing tokens with latest rank data
    let updatedCount = 0;
    for (const token of allTokens) {
      if (existingMints.has(token.address)) {
        const { data: existing } = await supabase
          .from('token_lifecycle')
          .select('highest_rank, lowest_rank, total_hours_in_top_200')
          .eq('token_mint', token.address)
          .single();

        if (existing) {
          const updates: any = {
            last_seen_at: capturedAt,
          };

          if (!existing.highest_rank || token.rank < existing.highest_rank) {
            updates.highest_rank = token.rank;
          }
          if (!existing.lowest_rank || token.rank > existing.lowest_rank) {
            updates.lowest_rank = token.rank;
          }

          await supabase
            .from('token_lifecycle')
            .update(updates)
            .eq('token_mint', token.address);
          
          updatedCount++;
        }
      }
    }

    console.log(`[TokenCollector] 🔄 Updated ${updatedCount} existing token records`);

    // Trigger creator linking for new tokens (non-blocking)
    if (newMints.length > 0) {
      console.log(`[TokenCollector] 🔗 Triggering creator linking for ${newMints.length} new tokens`);
      
      supabase.functions.invoke('token-creator-linker', {
        body: { tokenMints: newMints }
      }).then(() => {
        console.log('[TokenCollector] ✅ Creator linking job dispatched');
      }).catch(err => {
        console.error('[TokenCollector] ⚠️ Creator linking error:', err.message);
      });
    }

    // Get total count in database
    const { count: totalTracked } = await supabase
      .from('token_lifecycle')
      .select('*', { count: 'exact', head: true });

    console.log(`[TokenCollector] 🎉 COMPLETE!`);
    console.log(`[TokenCollector] 📊 Database now contains ${totalTracked} total tokens`);
    console.log(`[TokenCollector] 🆕 ${addedCount} new tokens added this run`);
    console.log(`[TokenCollector] 🔄 ${updatedCount} existing tokens refreshed`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: capturedAt,
        scrapedThisRun: allTokens.length,
        newTokensAdded: addedCount,
        existingTokensUpdated: updatedCount,
        totalInDatabase: totalTracked,
        topNewTokens: newTokens.slice(0, 5).map(t => ({ 
          address: t.address.substring(0, 8) + '...', 
          rank: t.rank 
        })),
        message: `Cumulative token collection growing: ${totalTracked} total tokens tracked`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[TokenCollector] ❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
