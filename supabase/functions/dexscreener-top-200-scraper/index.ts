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
  launchpad?: string;
}

// Cloudflare Worker URL - proven to bypass 403s
const CLOUDFLARE_WORKER_URL = 'https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana';

// Fallback: Fetch mint from DexScreener pair endpoint
async function fetchMintFromPair(pairId: string): Promise<{ mint: string | null; symbol: string; name: string; fdv?: number }> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${pairId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
    
    const data = await response.json();
    const pair = data.pair || data.pairs?.[0];
    
    if (pair?.baseToken?.address) {
      return {
        mint: pair.baseToken.address,
        symbol: pair.baseToken.symbol || 'UNKNOWN',
        name: pair.baseToken.name || 'Unknown',
        fdv: pair.fdv,
      };
    }
    return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
  } catch (e) {
    console.error(`[DexCompiler] Failed to fetch pair ${pairId}:`, e);
    return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
  }
}

// Detect launchpad based on pair data
const detectLaunchpad = (pair: any): string | null => {
  if (pair?.url?.includes('pump.fun') || pair?.info?.websites?.some((w: any) => w.url?.includes('pump.fun'))) {
    return 'pump.fun';
  }
  if (pair?.url?.includes('bonk.fun') || pair?.info?.websites?.some((w: any) => w.url?.includes('bonk.fun'))) {
    return 'bonk.fun';
  }
  if (pair?.url?.includes('bags.fm') || pair?.info?.websites?.some((w: any) => w.url?.includes('bags.fm'))) {
    return 'bags.fm';
  }
  if (pair?.dexId === 'raydium') {
    return 'raydium';
  }
  return null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[DexCompiler] 🚀 Multi-Source Token Discovery (Cloudflare Worker Strategy)');
    console.log('[DexCompiler] 📊 Phase 1: Fetching top 50 trending from Cloudflare Worker');

    const discoveredTokens = new Map<string, TokenData>();
    const capturedAt = new Date().toISOString();

    // PRIMARY SOURCE: Cloudflare Worker (bypasses 403s, returns top 50 trending)
    console.log('[DexCompiler] 🌐 Fetching from Cloudflare Worker...');
    try {
      const workerResponse = await fetch(CLOUDFLARE_WORKER_URL);
      
      if (workerResponse.ok) {
        const workerData = await workerResponse.json();
        
        if (workerData.stale) {
          console.warn('[DexCompiler] ⚠️ Warning: Worker data is stale');
        }
        
        console.log(`[DexCompiler] ✅ Got ${workerData.countPairsResolved || 0}/${workerData.countPairsRequested || 0} resolved pairs from worker`);
        
        const allPairs = workerData.pairs || [];
        
        // Process ALL pairs - resolve missing mints ourselves
        for (let i = 0; i < Math.min(allPairs.length, 50); i++) {
          const p = allPairs[i];
          
          if (p.ok && p.tokenMint) {
            // Worker resolved it - use directly
            discoveredTokens.set(p.tokenMint, {
              address: p.tokenMint,
              symbol: p.symbol || 'UNKNOWN',
              name: p.name || 'Unknown Token',
              fdv: p.fdv,
              marketCap: p.fdv,
              discoverySource: 'cf_worker',
            });
          } else if (p.pairId) {
            // Worker didn't resolve - fetch from DexScreener ourselves
            console.log(`[DexCompiler] 🔄 Resolving unresolved pair #${i + 1}: ${p.pairId}`);
            const resolved = await fetchMintFromPair(p.pairId);
            
            if (resolved.mint) {
              discoveredTokens.set(resolved.mint, {
                address: resolved.mint,
                symbol: resolved.symbol,
                name: resolved.name,
                fdv: resolved.fdv,
                marketCap: resolved.fdv,
                discoverySource: 'cf_worker_resolved',
              });
            } else {
              console.warn(`[DexCompiler] ⚠️ Could not resolve pair ${p.pairId}`);
            }
          }
        }
        
        console.log(`[DexCompiler] ✅ Total tokens from Cloudflare Worker: ${discoveredTokens.size}`);
      } else {
        console.error('[DexCompiler] ❌ Cloudflare Worker fetch failed:', workerResponse.status);
      }
    } catch (error) {
      console.error('[DexCompiler] ❌ Failed to fetch from Cloudflare Worker:', error);
    }

    // SECONDARY SOURCE: Top Boosted Tokens (promoted tokens)
    console.log('[DexCompiler] 💰 Fetching top boosted tokens...');
    try {
      const boostsResponse = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
      if (boostsResponse.ok) {
        const boosts = await boostsResponse.json();
        console.log(`[DexCompiler] ✅ Found ${boosts.length} boosted tokens`);
        
        for (const boost of boosts) {
          if (boost.chainId === 'solana' && boost.tokenAddress) {
            const existing = discoveredTokens.get(boost.tokenAddress);
            discoveredTokens.set(boost.tokenAddress, {
              address: boost.tokenAddress,
              symbol: existing?.symbol || boost.description?.split(' ')[0],
              name: existing?.name,
              imageUrl: existing?.imageUrl || boost.icon,
              activeBoosts: boost.amount || 1,
              fdv: existing?.fdv,
              marketCap: existing?.marketCap,
              discoverySource: existing ? `${existing.discoverySource}+boosted` : 'boosted'
            });
          }
        }
      }
    } catch (error) {
      console.error('[DexCompiler] ⚠️ Failed to fetch boosted tokens:', error);
    }

    // TERTIARY SOURCE: Token Profile Updates
    console.log('[DexCompiler] 🎨 Fetching token profile updates...');
    try {
      const profilesResponse = await fetch('https://api.dexscreener.com/token-profiles/latest/v1', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        }
      });
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

    console.log(`[DexCompiler] 📊 Phase 2: Total unique tokens discovered: ${discoveredTokens.size}`);

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

    // Insert new tokens with minimal data (enrichment happens later)
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
        launchpad: token.launchpad,
        first_seen_at: capturedAt,
        last_seen_at: capturedAt,
        last_fetched_at: capturedAt,
        highest_rank: null,
        lowest_rank: null,
        oracle_analyzed: false
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
        if (token.launchpad) updateData.launchpad = token.launchpad;
        
        const { error: updateError } = await supabase
          .from('token_lifecycle')
          .update(updateData)
          .eq('token_mint', token.address);

        if (!updateError) updateCount++;
      }
      console.log(`[DexCompiler] ✅ Updated ${updateCount} existing tokens`);
    }

    // Create ranking snapshot based on discovery order (Cloudflare worker returns in rank order)
    const rankingSnapshot = allTokens.slice(0, 100).map((token, index) => ({
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
        console.log(`[DexCompiler] ✅ Inserted ${rankingSnapshot.length} ranking records`);
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
    
    const sourceBreakdown = allTokens.reduce((acc, t) => {
      acc[t.discoverySource] = (acc[t.discoverySource] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('[DexCompiler] 📈 Discovery breakdown:', JSON.stringify(sourceBreakdown));

    // Trigger Oracle auto-classifier for new tokens (non-blocking)
    if (newTokens.length > 0) {
      console.log('[DexCompiler] 🔮 Triggering Oracle auto-classifier for new tokens...');
      supabase.functions.invoke('oracle-auto-classifier', {
        body: { 
          tokenMints: newTokens.map(t => t.address),
          source: 'dexscreener-hourly-scan'
        }
      }).then(() => {
        console.log('[DexCompiler] ✅ Oracle auto-classifier triggered');
      }).catch(err => {
        console.error('[DexCompiler] ⚠️ Oracle auto-classifier failed:', err);
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        tokensDiscovered: allTokens.length,
        newTokens: newTokens.length,
        updatedTokens: existingToUpdate.length,
        top100Tracked: rankingSnapshot.length,
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
    console.error('[DexCompiler] ❌ Fatal error:', error);
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
