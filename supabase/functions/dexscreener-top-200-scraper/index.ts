import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenData {
  address: string;
  symbol?: string;
  name?: string;
  pairAddress?: string;
  dexId?: string;
  liquidityUsd?: number;
  volume24h?: number;
  marketCap?: number;
  fdv?: number;
  priceUsd?: number;
  pairCreatedAt?: string;
  activeBoosts?: number;
  imageUrl?: string;
  discoverySource: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[DexCompiler] 🚀 Multi-Source Token Discovery');
    console.log('[DexCompiler] 📊 Phase 1: Discovering tokens from multiple sources');

    const discoveredTokens = new Map<string, TokenData>();
    const capturedAt = new Date().toISOString();

    // SOURCE 1: Top Boosted Tokens (promoted tokens)
    console.log('[DexCompiler] 💰 Fetching top boosted tokens...');
    try {
      const boostsResponse = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
      if (boostsResponse.ok) {
        const boosts = await boostsResponse.json();
        console.log(`[DexCompiler] ✅ Found ${boosts.length} boosted tokens`);
        
        for (const boost of boosts) {
          if (boost.chainId === 'solana' && boost.tokenAddress) {
            discoveredTokens.set(boost.tokenAddress, {
              address: boost.tokenAddress,
              symbol: boost.icon ? undefined : boost.description?.split(' ')[0],
              imageUrl: boost.icon,
              activeBoosts: boost.amount || 1,
              discoverySource: 'boosted'
            });
          }
        }
      }
    } catch (error) {
      console.error('[DexCompiler] ⚠️ Failed to fetch boosted tokens:', error);
    }

    // SOURCE 2: Recent SOL Pairs (new launches)
    console.log('[DexCompiler] 🔍 Searching for recent SOL pairs...');
    try {
      const searchResponse = await fetch('https://api.dexscreener.com/latest/dex/search?q=SOL');
      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        console.log(`[DexCompiler] ✅ Found ${searchData.pairs?.length || 0} SOL pairs`);
        
        if (searchData.pairs) {
          for (const pair of searchData.pairs.slice(0, 50)) { // Top 50 results
            if (pair.chainId === 'solana' && pair.baseToken?.address) {
              const existing = discoveredTokens.get(pair.baseToken.address);
              discoveredTokens.set(pair.baseToken.address, {
                address: pair.baseToken.address,
                symbol: pair.baseToken.symbol,
                name: pair.baseToken.name,
                pairAddress: pair.pairAddress,
                dexId: pair.dexId,
                liquidityUsd: pair.liquidity?.usd,
                volume24h: pair.volume?.h24,
                marketCap: pair.marketCap,
                fdv: pair.fdv,
                priceUsd: parseFloat(pair.priceUsd),
                pairCreatedAt: pair.pairCreatedAt ? new Date(pair.pairCreatedAt).toISOString() : undefined,
                imageUrl: existing?.imageUrl || pair.info?.imageUrl,
                activeBoosts: existing?.activeBoosts || 0,
                discoverySource: existing?.discoverySource === 'boosted' ? 'boosted+search' : 'search'
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('[DexCompiler] ⚠️ Failed to search SOL pairs:', error);
    }

    // SOURCE 3: Token Profile Updates
    console.log('[DexCompiler] 🎨 Fetching token profile updates...');
    try {
      const profilesResponse = await fetch('https://api.dexscreener.com/token-profiles/latest/v1');
      if (profilesResponse.ok) {
        const profiles = await profilesResponse.json();
        console.log(`[DexCompiler] ✅ Found ${profiles.length} profile updates`);
        
        for (const profile of profiles) {
          if (profile.chainId === 'solana' && profile.tokenAddress) {
            const existing = discoveredTokens.get(profile.tokenAddress);
            if (existing) {
              existing.imageUrl = existing.imageUrl || profile.icon;
            } else {
              discoveredTokens.set(profile.tokenAddress, {
                address: profile.tokenAddress,
                imageUrl: profile.icon,
                discoverySource: 'profile',
                activeBoosts: 0
              });
            }
          }
        }
      }
    } catch (error) {
      console.error('[DexCompiler] ⚠️ Failed to fetch profiles:', error);
    }

    console.log(`[DexCompiler] 📊 Phase 2: Enriching ${discoveredTokens.size} unique tokens with full data`);

    // PHASE 2: Batch fetch complete data for tokens missing details
    const tokensNeedingEnrichment = Array.from(discoveredTokens.entries())
      .filter(([_, data]) => !data.symbol || !data.liquidityUsd)
      .map(([address]) => address);

    if (tokensNeedingEnrichment.length > 0) {
      console.log(`[DexCompiler] 🔄 Enriching ${tokensNeedingEnrichment.length} tokens...`);
      
      // Batch process in groups of 30
      for (let i = 0; i < tokensNeedingEnrichment.length; i += 30) {
        const batch = tokensNeedingEnrichment.slice(i, i + 30);
        const addresses = batch.join(',');
        
        try {
          const tokensResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addresses}`);
          if (tokensResponse.ok) {
            const tokensData = await tokensResponse.json();
            
            for (const [address, pairData] of Object.entries(tokensData.pairs || {})) {
              const pairs = pairData as any[];
              if (pairs && pairs.length > 0) {
                // Get best pair by liquidity
                const bestPair = pairs.reduce((best, current) => 
                  (current.liquidity?.usd || 0) > (best.liquidity?.usd || 0) ? current : best
                );
                
                const tokenData = discoveredTokens.get(address);
                if (tokenData) {
                  tokenData.symbol = tokenData.symbol || bestPair.baseToken?.symbol;
                  tokenData.name = tokenData.name || bestPair.baseToken?.name;
                  tokenData.pairAddress = tokenData.pairAddress || bestPair.pairAddress;
                  tokenData.dexId = tokenData.dexId || bestPair.dexId;
                  tokenData.liquidityUsd = tokenData.liquidityUsd || bestPair.liquidity?.usd;
                  tokenData.volume24h = tokenData.volume24h || bestPair.volume?.h24;
                  tokenData.marketCap = tokenData.marketCap || bestPair.marketCap;
                  tokenData.fdv = tokenData.fdv || bestPair.fdv;
                  tokenData.priceUsd = tokenData.priceUsd || parseFloat(bestPair.priceUsd);
                  tokenData.pairCreatedAt = tokenData.pairCreatedAt || (bestPair.pairCreatedAt ? new Date(bestPair.pairCreatedAt).toISOString() : undefined);
                  tokenData.imageUrl = tokenData.imageUrl || bestPair.info?.imageUrl;
                }
              }
            }
          }
          
          // Rate limiting - wait 200ms between batches
          if (i + 30 < tokensNeedingEnrichment.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (error) {
          console.error(`[DexCompiler] ⚠️ Failed to enrich batch ${i}-${i+30}:`, error);
        }
      }
    }

    console.log(`[DexCompiler] 💾 Phase 3: Saving to database`);

    // Get existing tokens from database
    const { data: existingTokens } = await supabase
      .from('token_lifecycle')
      .select('token_mint');

    const existingSet = new Set(
      (existingTokens || []).map((t: any) => t.token_mint)
    );

    const allTokens = Array.from(discoveredTokens.values());
    const newTokens = allTokens.filter(t => !existingSet.has(t.address));
    const existingToUpdate = allTokens.filter(t => existingSet.has(t.address));
    
    console.log(`[DexCompiler] 🆕 Found ${newTokens.length} NEW tokens`);
    console.log(`[DexCompiler] 🔄 Updating ${existingToUpdate.length} existing tokens`);
    console.log(`[DexCompiler] 📦 Already tracking ${existingSet.size} total tokens`);

    // Insert new tokens with full data
    if (newTokens.length > 0) {
      const tokenInserts = newTokens.map(token => ({
        token_mint: token.address,
        symbol: token.symbol,
        name: token.name,
        pair_address: token.pairAddress,
        dex_id: token.dexId,
        liquidity_usd: token.liquidityUsd,
        volume_24h: token.volume24h,
        market_cap: token.marketCap,
        fdv: token.fdv,
        price_usd: token.priceUsd,
        pair_created_at: token.pairCreatedAt,
        active_boosts: token.activeBoosts || 0,
        image_url: token.imageUrl,
        discovery_source: token.discoverySource,
        first_seen_at: capturedAt,
        last_seen_at: capturedAt,
        last_fetched_at: capturedAt,
        highest_rank: null, // Will be calculated from liquidity rankings
        lowest_rank: null
      }));

      const { error: insertError } = await supabase
        .from('token_lifecycle')
        .insert(tokenInserts);

      if (insertError) {
        console.error('[DexCompiler] ❌ Failed to insert new tokens:', insertError);
      } else {
        console.log(`[DexCompiler] ✅ Inserted ${newTokens.length} new tokens`);
      }
    }

    // Update existing tokens with latest data
    if (existingToUpdate.length > 0) {
      let updateCount = 0;
      for (const token of existingToUpdate) {
        const updateData: any = {
          last_seen_at: capturedAt,
          last_fetched_at: capturedAt
        };
        
        // Only update if we have new data
        if (token.symbol) updateData.symbol = token.symbol;
        if (token.name) updateData.name = token.name;
        if (token.pairAddress) updateData.pair_address = token.pairAddress;
        if (token.dexId) updateData.dex_id = token.dexId;
        if (token.liquidityUsd) updateData.liquidity_usd = token.liquidityUsd;
        if (token.volume24h) updateData.volume_24h = token.volume24h;
        if (token.marketCap) updateData.market_cap = token.marketCap;
        if (token.fdv) updateData.fdv = token.fdv;
        if (token.priceUsd) updateData.price_usd = token.priceUsd;
        if (token.pairCreatedAt) updateData.pair_created_at = token.pairCreatedAt;
        if (token.activeBoosts !== undefined) updateData.active_boosts = token.activeBoosts;
        if (token.imageUrl) updateData.image_url = token.imageUrl;
        
        const { error: updateError } = await supabase
          .from('token_lifecycle')
          .update(updateData)
          .eq('token_mint', token.address);

        if (!updateError) updateCount++;
      }
      console.log(`[DexCompiler] ✅ Updated ${updateCount} existing tokens`);
    }

    // Create ranking snapshot based on liquidity
    const tokensWithLiquidity = allTokens
      .filter(t => t.liquidityUsd && t.liquidityUsd > 0)
      .sort((a, b) => (b.liquidityUsd || 0) - (a.liquidityUsd || 0));

    const rankingSnapshot = tokensWithLiquidity.slice(0, 500).map((token, index) => ({
      token_mint: token.address,
      rank: index + 1,
      captured_at: capturedAt,
      liquidity_usd: token.liquidityUsd,
      volume_24h: token.volume24h,
      market_cap: token.marketCap,
      metadata: {
        symbol: token.symbol,
        name: token.name,
        dex_id: token.dexId,
        discovery_source: token.discoverySource
      }
    }));

    if (rankingSnapshot.length > 0) {
      const { error: snapshotError } = await supabase
        .from('token_rankings')
        .insert(rankingSnapshot);

      if (snapshotError) {
        console.error('[DexCompiler] ❌ Failed to insert rankings:', snapshotError);
      } else {
        console.log(`[DexCompiler] ✅ Inserted ${rankingSnapshot.length} ranking records (Top ${rankingSnapshot.length} by liquidity)`);
      }
    }

    // Trigger token-creator-linker for new tokens
    if (newTokens.length > 0) {
      console.log('[DexCompiler] 🔗 Triggering token-creator-linker...');
      try {
        const { error: funcError } = await supabase.functions.invoke('token-creator-linker', {
          body: { 
            tokens: newTokens.map(t => t.address),
            source: 'dexscreener-compiler'
          }
        });
        
        if (funcError) {
          console.error('[DexCompiler] ⚠️ token-creator-linker error:', funcError);
        } else {
          console.log('[DexCompiler] ✅ token-creator-linker triggered');
        }
      } catch (err) {
        console.error('[DexCompiler] ⚠️ Failed to trigger token-creator-linker:', err);
      }
    }

    // Get total tokens in database
    const { count: totalCount } = await supabase
      .from('token_lifecycle')
      .select('*', { count: 'exact', head: true });

    console.log(`[DexCompiler] 📊 Total tokens in database: ${totalCount}`);
    console.log(`[DexCompiler] 🎉 Collection complete!`);
    console.log(`[DexCompiler] 📈 Discovery breakdown:`);
    const sourceBreakdown = allTokens.reduce((acc, t) => {
      acc[t.discoverySource] = (acc[t.discoverySource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log(JSON.stringify(sourceBreakdown, null, 2));

    // Trigger enrichment in background (don't wait for it)
    if (newTokens.length > 0) {
      console.log('[DexCompiler] 🎨 Triggering background enrichment for scraped_tokens...');
      fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/enrich-scraped-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
        },
        body: JSON.stringify({ batchSize: 50 })
      }).catch(err => console.error('[DexCompiler] Background enrichment failed:', err));
    }

    return new Response(
      JSON.stringify({
        success: true,
        tokensDiscovered: allTokens.length,
        newTokens: newTokens.length,
        updatedTokens: existingToUpdate.length,
        top500Tracked: rankingSnapshot.length,
        totalInDatabase: totalCount,
        discoveryBreakdown: sourceBreakdown,
        timestamp: capturedAt
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('[TokenCollector] ❌ Fatal error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
