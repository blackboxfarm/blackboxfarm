import { withRunLog } from '../_shared/run-logger.ts';
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
  twitter?: string;
  telegram?: string;
  website?: string;
}

// Cloudflare worker suspended — now using internal dex-top-200 edge function
// const CLOUDFLARE_WORKER_URL = 'https://dex-trending-solana.yayasanjembatanbali.workers.dev/api/trending/solana';

// Fallback: Fetch mint AND socials from DexScreener pair endpoint
async function fetchPairDetails(pairId: string): Promise<{ 
  mint: string | null; 
  symbol: string; 
  name: string; 
  fdv?: number;
  twitter?: string;
  telegram?: string;
  website?: string;
}> {
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
      // Extract socials from info.socials array
      let twitter: string | undefined;
      let telegram: string | undefined;
      let website: string | undefined;
      
      if (pair.info?.socials) {
        for (const social of pair.info.socials) {
          if (social.type === 'twitter') twitter = social.url;
          if (social.type === 'telegram') telegram = social.url;
        }
      }
      if (pair.info?.websites?.[0]?.url) {
        website = pair.info.websites[0].url;
      }
      
      return {
        mint: pair.baseToken.address,
        symbol: pair.baseToken.symbol || 'UNKNOWN',
        name: pair.baseToken.name || 'Unknown',
        fdv: pair.fdv,
        twitter,
        telegram,
        website,
      };
    }
    return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
  } catch (e) {
    console.error(`[DexCompiler] Failed to fetch pair ${pairId}:`, e);
    return { mint: null, symbol: 'UNKNOWN', name: 'Unknown' };
  }
}

// Fetch token socials directly from DexScreener token endpoint
async function fetchTokenSocials(tokenMint: string): Promise<{
  twitter?: string;
  telegram?: string;
  website?: string;
}> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    });
    
    if (!response.ok) return {};
    
    const data = await response.json();
    const pairs = data.pairs || [];
    
    // Find the main pair (highest liquidity)
    const mainPair = pairs.sort((a: any, b: any) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
    
    if (!mainPair?.info) return {};
    
    let twitter: string | undefined;
    let telegram: string | undefined;
    let website: string | undefined;
    
    if (mainPair.info.socials) {
      for (const social of mainPair.info.socials) {
        if (social.type === 'twitter') twitter = social.url;
        if (social.type === 'telegram') telegram = social.url;
      }
    }
    if (mainPair.info.websites?.[0]?.url) {
      website = mainPair.info.websites[0].url;
    }
    
    return { twitter, telegram, website };
  } catch (e) {
    console.error(`[DexCompiler] Failed to fetch token socials for ${tokenMint}:`, e);
    return {};
  }
}

// Add mesh link between entities
async function addMeshLink(
  supabase: any,
  sourceType: string, 
  sourceId: string, 
  linkedType: string, 
  linkedId: string, 
  relationship: string,
  confidence: number = 80,
  discoveredVia: string = 'dex-scraper'
) {
  try {
    // Check if link exists
    const { data: existing } = await supabase
      .from('reputation_mesh')
      .select('id')
      .eq('source_type', sourceType)
      .eq('source_id', sourceId)
      .eq('linked_type', linkedType)
      .eq('linked_id', linkedId)
      .maybeSingle();
    
    if (!existing) {
      await supabase
        .from('reputation_mesh')
        .insert({
          source_type: sourceType,
          source_id: sourceId,
          linked_type: linkedType,
          linked_id: linkedId,
          relationship,
          confidence,
          discovered_via: discoveredVia,
          discovered_at: new Date().toISOString()
        });
      console.log(`[Mesh] Added link: ${sourceType}:${sourceId.slice(0,8)} -> ${linkedType}:${linkedId.slice(0,20)}`);
    }
  } catch (e) {
    console.error('[Mesh] Failed to add link:', e);
  }
}

// Extract X handle from twitter URL (filters out reserved paths like "i")
const X_RESERVED_PATHS = new Set(['i','intent','search','hashtag','settings','home','explore','notifications','messages','compose','lists','bookmarks','communities','spaces','tos','privacy','help','about','login','signup','share','status','jobs','download']);
function extractXHandle(twitterUrl?: string): string | null {
  if (!twitterUrl) return null;
  if (twitterUrl.includes('/communities/')) return null;
  const match = twitterUrl.match(/(?:twitter\.com|x\.com)\/(@?[\w]+)/i);
  if (!match) return null;
  const handle = match[1].replace('@', '').toLowerCase();
  if (X_RESERVED_PATHS.has(handle) || handle.length > 15) return null;
  return handle;
}

Deno.serve(withRunLog('dexscreener-top-200-scraper', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('[DexCompiler] 🚀 Multi-Source Token Discovery + Mesh Building');
    console.log('[DexCompiler] 📊 Phase 1: Fetching top 200 trending from dex-top-200');

    const discoveredTokens = new Map<string, TokenData>();
    const capturedAt = new Date().toISOString();

    // PRIMARY SOURCE: Internal dex-top-200 edge function (Firecrawl scrape, 200 tokens)
    console.log('[DexCompiler] 🌐 Fetching from dex-top-200...');
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      
      const topResponse = await fetch(`${supabaseUrl}/functions/v1/dex-top-200`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      
      if (topResponse.ok) {
        const topData = await topResponse.json();
        
        if (topData.success && topData.tokens) {
          console.log(`[DexCompiler] ✅ Got ${topData.tokens.length} ranked tokens from dex-top-200`);
          
          for (const t of topData.tokens) {
            if (t.tokenMint) {
              // Fetch socials for each token
              const socials = await fetchTokenSocials(t.tokenMint);
              discoveredTokens.set(t.tokenMint, {
                address: t.tokenMint,
                symbol: t.symbol || 'UNKNOWN',
                name: t.name || 'Unknown Token',
                fdv: t.fdv,
                marketCap: t.marketCap || t.fdv,
                discoverySource: 'dex_top_200',
                twitter: socials.twitter,
                telegram: socials.telegram,
                website: socials.website,
              });
              
              // Small delay to avoid rate limits on socials fetch
              if (discoveredTokens.size % 10 === 0) await new Promise(r => setTimeout(r, 200));
            }
          }
          
          console.log(`[DexCompiler] ✅ Total tokens from dex-top-200: ${discoveredTokens.size}`);
        } else {
          console.error('[DexCompiler] ❌ dex-top-200 returned error:', topData.error);
        }
      } else {
        console.error('[DexCompiler] ❌ dex-top-200 fetch failed:', topResponse.status);
      }
    } catch (error) {
      console.error('[DexCompiler] ❌ Failed to fetch from dex-top-200:', error);
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
            
            // Fetch socials if new token
            let socials = {};
            if (!existing) {
              socials = await fetchTokenSocials(boost.tokenAddress);
            }
            
            discoveredTokens.set(boost.tokenAddress, {
              address: boost.tokenAddress,
              symbol: existing?.symbol || boost.description?.split(' ')[0],
              name: existing?.name,
              imageUrl: existing?.imageUrl || boost.icon,
              activeBoosts: boost.amount || 1,
              fdv: existing?.fdv,
              marketCap: existing?.marketCap,
              discoverySource: existing ? `${existing.discoverySource}+boosted` : 'boosted',
              twitter: existing?.twitter || (socials as any).twitter,
              telegram: existing?.telegram || (socials as any).telegram,
              website: existing?.website || (socials as any).website,
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

    // Create ranking snapshot based on discovery order (dex-top-200 returns in rank order)
    const rankingSnapshot = allTokens.slice(0, 200).map((token, index) => ({
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

    // ============ PHASE 2.5: MARK TOP 200 STATUS ============
    // Get current top 200 mints
    const currentTop200Mints = allTokens.slice(0, 200).map(t => t.address).filter(Boolean);
    
    if (currentTop200Mints.length > 0) {
      // First, clear all is_currently_top_200 flags
      const { error: clearErr } = await supabase
        .from('token_lifecycle')
        .update({ is_currently_top_200: false })
        .eq('is_currently_top_200', true);
      
      if (clearErr) {
        console.error('[DexCompiler] ⚠️ Failed to clear top 200 flags:', clearErr);
      }

      // Mark current top 200 tokens and update their rank
      let markedCount = 0;
      for (let i = 0; i < currentTop200Mints.length; i++) {
        const mint = currentTop200Mints[i];
        const rank = i + 1;
        
        const { error: markErr } = await supabase
          .from('token_lifecycle')
          .update({ 
            is_currently_top_200: true, 
            last_top_200_rank: rank,
            highest_rank: supabase.rpc ? undefined : rank, // Will use SQL below
          })
          .eq('token_mint', mint);
        
        if (!markErr) markedCount++;
      }
      
      // Update highest_rank where new rank is better (lower number)
      for (let i = 0; i < currentTop200Mints.length; i++) {
        const mint = currentTop200Mints[i];
        const rank = i + 1;
        
        await supabase
          .from('token_lifecycle')
          .update({ highest_rank: rank })
          .eq('token_mint', mint)
          .or(`highest_rank.is.null,highest_rank.gt.${rank}`);
      }

      // Update lowest_rank where new rank is worse (higher number)
      for (let i = 0; i < currentTop200Mints.length; i++) {
        const mint = currentTop200Mints[i];
        const rank = i + 1;
        
        await supabase
          .from('token_lifecycle')
          .update({ lowest_rank: rank })
          .eq('token_mint', mint)
          .or(`lowest_rank.is.null,lowest_rank.lt.${rank}`);
      }

      console.log(`[DexCompiler] ✅ Marked ${markedCount}/${currentTop200Mints.length} tokens as currently in top 200`);
    }

    // ============ PHASE 3: BUILD REPUTATION MESH ============
    console.log('[DexCompiler] 🕸️ Phase 3: Building Reputation Mesh...');
    let meshLinksAdded = 0;
    let communitiesDiscovered = 0;
    const creatorsToSpider: string[] = [];

    // For each token with socials, add mesh links
    for (const token of allTokens) {
      // Check if twitter URL is actually an X Community
      if (token.twitter && token.twitter.includes('/communities/')) {
        const communityMatch = token.twitter.match(/communities\/(\d+)/);
        if (communityMatch) {
          const communityId = communityMatch[1];
          const communityUrl = `https://x.com/i/communities/${communityId}`;
          
          // Link: X Community -> Token
          await addMeshLink(supabase, 'x_community', communityId, 'token', token.address, 'community_for', 95, 'dex-scraper');
          meshLinksAdded++;
          
          // Upsert into x_communities table
          const { error: communityUpsertErr } = await supabase
            .from('x_communities')
            .upsert({
              community_id: communityId,
              community_url: communityUrl,
              linked_token_mints: [token.address],
            }, { onConflict: 'community_id', ignoreDuplicates: false });
          
          if (!communityUpsertErr) {
            communitiesDiscovered++;
            // Also append token_mint to linked_token_mints if community already exists
            const { data: existing } = await supabase
              .from('x_communities')
              .select('linked_token_mints')
              .eq('community_id', communityId)
              .maybeSingle();
            
            if (existing?.linked_token_mints && !existing.linked_token_mints.includes(token.address)) {
              await supabase
                .from('x_communities')
                .update({ linked_token_mints: [...existing.linked_token_mints, token.address] })
                .eq('community_id', communityId);
            }
          }
          
          // Fire-and-forget: trigger community enricher to scrape admins/mods
          supabase.functions.invoke('x-community-enricher', {
            body: {
              communityUrl,
              linkedTokenMint: token.address,
            }
          }).catch(e => console.warn(`[DexCompiler] Community enricher trigger failed: ${e}`));
        }
      } else {
        const xHandle = extractXHandle(token.twitter);
        if (xHandle) {
          // Link: Token -> X Account
          await addMeshLink(supabase, 'token', token.address, 'x_account', xHandle, 'official_twitter');
          meshLinksAdded++;
        }
      }
      
      if (token.telegram) {
        // Link: Token -> Telegram
        await addMeshLink(supabase, 'token', token.address, 'telegram', token.telegram, 'official_telegram');
        meshLinksAdded++;
      }
      
      if (token.website) {
        // Link: Token -> Website
        await addMeshLink(supabase, 'token', token.address, 'website', token.website, 'official_website');
        meshLinksAdded++;
      }
    }
    
    console.log(`[DexCompiler] 🏘️ Discovered ${communitiesDiscovered} X Communities`);
    
    console.log(`[DexCompiler] 🕸️ Added ${meshLinksAdded} mesh links (${communitiesDiscovered} communities)`);

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
    
    // ============ PHASE 4: SPIDER CREATOR WALLETS ============
    // Get creator wallets that need spidering
    console.log('[DexCompiler] 🕷️ Phase 4: Spidering creator wallets...');
    const { data: tokensWithCreators } = await supabase
      .from('token_lifecycle')
      .select('creator_wallet')
      .not('creator_wallet', 'is', null)
      .in('token_mint', allTokens.map(t => t.address));
    
    const uniqueCreators = [...new Set((tokensWithCreators || []).map(t => t.creator_wallet).filter(Boolean))];
    
    if (uniqueCreators.length > 0) {
      console.log(`[DexCompiler] 🕷️ Found ${uniqueCreators.length} unique creators to spider`);
      
      // Spider first 10 creators (don't overwhelm)
      for (const creatorWallet of uniqueCreators.slice(0, 10)) {
        try {
          // Trigger oracle-unified-lookup to spider this wallet
          supabase.functions.invoke('oracle-unified-lookup', {
            body: { 
              query: creatorWallet,
              source: 'dex-mesh-spider'
            }
          }).catch(err => {
            console.error(`[DexCompiler] ⚠️ Spider failed for ${creatorWallet}:`, err);
          });
          
          creatorsToSpider.push(creatorWallet);
        } catch (e) {
          console.error(`[DexCompiler] ⚠️ Failed to spider ${creatorWallet}:`, e);
        }
      }
      
      console.log(`[DexCompiler] 🕷️ Triggered spider for ${creatorsToSpider.length} creators`);
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
        meshLinksAdded,
        communitiesDiscovered,
        creatorsSpidered: creatorsToSpider.length,
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
}));

