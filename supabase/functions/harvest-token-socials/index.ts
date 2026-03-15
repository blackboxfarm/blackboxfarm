import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

const TWITTER_RE = /(?:twitter\.com|x\.com)\/(@?[a-zA-Z0-9_]+)/i;
const X_RESERVED_PATHS = new Set(['i','intent','search','hashtag','settings','home','explore','notifications','messages','compose','lists','bookmarks','communities','spaces','tos','privacy','help','about','login','signup','share','status','jobs','download']);

function extractHandle(url: string): string | null {
  if (!url) return null;
  const match = url.match(TWITTER_RE);
  if (!match) return null;
  const handle = match[1].replace(/^@/, '').toLowerCase();
  if (X_RESERVED_PATHS.has(handle)) return null;
  if (url.includes('/communities/')) return null;
  if (url.includes('/status/')) return null; // tweet links, not profile
  if (handle.length === 0 || handle.length > 15) return null;
  return handle;
}

interface MeshLink {
  source_type: string;
  source_id: string;
  linked_type: string;
  linked_id: string;
  relationship: string;
  confidence: number;
  evidence: any;
  discovered_via: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || 'backfill'; // 'backfill' | 'dexscreener' | 'both'
    const batchSize = body.batchSize || 500;
    const offset = body.offset || 0;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const results = { backfill: { processed: 0, linksAdded: 0 }, dexscreener: { processed: 0, linksAdded: 0, communitiesAdded: 0 } };

    // ============================================
    // MODE 1: BACKFILL from pumpfun_watchlist
    // Push twitter_url and website_url into reputation_mesh
    // ============================================
    if (mode === 'backfill' || mode === 'both') {
      console.log(`[harvest] Backfill mode: offset=${offset}, batch=${batchSize}`);

      const { data: tokens, error } = await supabase
        .from('pumpfun_watchlist')
        .select('token_mint, token_symbol, creator_wallet, twitter_url, website_url, telegram_url')
        .or('twitter_url.neq.,website_url.neq.')
        .range(offset, offset + batchSize - 1);

      if (error) throw error;
      if (!tokens || tokens.length === 0) {
        return new Response(JSON.stringify({ message: 'No more tokens to backfill', results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const allLinks: MeshLink[] = [];

      for (const t of tokens) {
        results.backfill.processed++;

        // Twitter handle → token link
        if (t.twitter_url) {
          const handle = extractHandle(t.twitter_url);
          if (handle) {
            allLinks.push({
              source_type: 'x_account',
              source_id: handle,
              linked_type: 'token',
              linked_id: t.token_mint,
              relationship: 'promotes_token',
              confidence: 70,
              evidence: { url: t.twitter_url, symbol: t.token_symbol, source: 'pumpfun_watchlist' },
              discovered_via: 'harvest-token-socials:backfill',
            });

            // Twitter → creator wallet
            if (t.creator_wallet) {
              allLinks.push({
                source_type: 'x_account',
                source_id: handle,
                linked_type: 'wallet',
                linked_id: t.creator_wallet,
                relationship: 'social_account_of',
                confidence: 75,
                evidence: { url: t.twitter_url, token: t.token_mint, source: 'pumpfun_watchlist' },
                discovered_via: 'harvest-token-socials:backfill',
              });
            }
          }
        }

        // Website → token link
        if (t.website_url) {
          allLinks.push({
            source_type: 'website',
            source_id: t.website_url.trim(),
            linked_type: 'token',
            linked_id: t.token_mint,
            relationship: 'website_of_token',
            confidence: 70,
            evidence: { symbol: t.token_symbol, source: 'pumpfun_watchlist' },
            discovered_via: 'harvest-token-socials:backfill',
          });
        }

        // Telegram → token link  
        if (t.telegram_url) {
          const tgMatch = t.telegram_url.match(/t\.me\/([a-zA-Z0-9_]+)/i);
          if (tgMatch) {
            allLinks.push({
              source_type: 'telegram',
              source_id: tgMatch[1].toLowerCase(),
              linked_type: 'token',
              linked_id: t.token_mint,
              relationship: 'telegram_of_token',
              confidence: 65,
              evidence: { url: t.telegram_url, symbol: t.token_symbol, source: 'pumpfun_watchlist' },
              discovered_via: 'harvest-token-socials:backfill',
            });
          }
        }
      }

      // Batch insert all links (ignore duplicates)
      if (allLinks.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < allLinks.length; i += CHUNK) {
          const chunk = allLinks.slice(i, i + CHUNK);
          const { data, error: insertErr } = await supabase
            .from('reputation_mesh')
            .upsert(chunk, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
          if (!insertErr) {
            results.backfill.linksAdded += chunk.length;
          }
        }
      }

      console.log(`[harvest] Backfill: ${results.backfill.processed} tokens, ${results.backfill.linksAdded} links`);
    }

    // ============================================
    // MODE 2: DEXSCREENER - Fetch socials for graduated/paired tokens
    // ============================================
    if (mode === 'dexscreener' || mode === 'both') {
      console.log(`[harvest] DexScreener mode: fetching socials for tokens`);

      // Get tokens that need DexScreener enrichment
      // Find tokens in master_token_directory that have no X community data
      // and are likely graduated (not on bonding curve)
      const { data: tokensToEnrich, error: enrichErr } = await supabase
        .from('master_token_directory')
        .select('token_mint, symbol, creator_wallet')
        .is('x_community_urls', null)
        .not('token_mint', 'is', null)
        .limit(batchSize);

      if (enrichErr) {
        console.error('[harvest] Error fetching tokens to enrich:', enrichErr);
      }

      const mints = tokensToEnrich?.map(t => t.token_mint) || [];
      
      // DexScreener batch endpoint: up to 30 tokens per call
      const DEX_BATCH = 30;
      for (let i = 0; i < Math.min(mints.length, 300); i += DEX_BATCH) {
        const batch = mints.slice(i, i + DEX_BATCH);
        const mintList = batch.join(',');

        try {
          const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintList}`, {
            signal: AbortSignal.timeout(10000),
          });

          if (!dexRes.ok) {
            console.warn(`[harvest] DexScreener ${dexRes.status} for batch`);
            await delay(2000);
            continue;
          }

          const dexData = await dexRes.json();
          const pairs = dexData.pairs || [];

          // Group pairs by base token mint
          const pairsByMint = new Map<string, any[]>();
          for (const pair of pairs) {
            const mint = pair.baseToken?.address;
            if (!mint) continue;
            if (!pairsByMint.has(mint)) pairsByMint.set(mint, []);
            pairsByMint.get(mint)!.push(pair);
          }

          const meshLinks: MeshLink[] = [];

          for (const [mint, tokenPairs] of pairsByMint) {
            results.dexscreener.processed++;
            const bestPair = tokenPairs[0]; // First pair usually has most data

            // Extract socials from DexScreener info
            const info = bestPair.info || {};
            const socials = info.socials || [];
            const websites = info.websites || [];

            // Twitter/X from socials
            for (const social of socials) {
              if (social.type === 'twitter' && social.url) {
                const handle = extractHandle(social.url);
                if (handle) {
                  meshLinks.push({
                    source_type: 'x_account',
                    source_id: handle,
                    linked_type: 'token',
                    linked_id: mint,
                    relationship: 'promotes_token',
                    confidence: 85, // DexScreener paid = higher confidence
                    evidence: { url: social.url, dex_paid: true, source: 'dexscreener' },
                    discovered_via: 'harvest-token-socials:dexscreener',
                  });

                  // Find creator wallet for this token
                  const tokenData = tokensToEnrich?.find(t => t.token_mint === mint);
                  if (tokenData?.creator_wallet) {
                    meshLinks.push({
                      source_type: 'x_account',
                      source_id: handle,
                      linked_type: 'wallet',
                      linked_id: tokenData.creator_wallet,
                      relationship: 'social_account_of',
                      confidence: 80,
                      evidence: { url: social.url, token: mint, dex_paid: true, source: 'dexscreener' },
                      discovered_via: 'harvest-token-socials:dexscreener',
                    });
                  }
                }
              }

              if (social.type === 'telegram' && social.url) {
                const tgMatch = social.url.match(/t\.me\/([a-zA-Z0-9_]+)/i);
                if (tgMatch) {
                  meshLinks.push({
                    source_type: 'telegram',
                    source_id: tgMatch[1].toLowerCase(),
                    linked_type: 'token',
                    linked_id: mint,
                    relationship: 'telegram_of_token',
                    confidence: 80,
                    evidence: { url: social.url, dex_paid: true, source: 'dexscreener' },
                    discovered_via: 'harvest-token-socials:dexscreener',
                  });
                }
              }
            }

            // Websites
            for (const website of websites) {
              if (website.url) {
                meshLinks.push({
                  source_type: 'website',
                  source_id: website.url.trim(),
                  linked_type: 'token',
                  linked_id: mint,
                  relationship: 'website_of_token',
                  confidence: 85,
                  evidence: { label: website.label, dex_paid: true, source: 'dexscreener' },
                  discovered_via: 'harvest-token-socials:dexscreener',
                });
              }
            }

            // Check for X community URL pattern in websites
            for (const website of websites) {
              if (website.url?.includes('x.com/i/communities/')) {
                const communityId = website.url.match(/communities\/(\d+)/)?.[1];
                if (communityId) {
                  // Upsert into x_communities if not exists
                  const { error: xcErr } = await supabase
                    .from('x_communities')
                    .upsert({
                      community_url: website.url,
                      linked_token_mints: [mint],
                      scrape_status: 'pending',
                      is_deleted: false,
                    }, { onConflict: 'community_url', ignoreDuplicates: false });

                  if (!xcErr) {
                    results.dexscreener.communitiesAdded++;
                  } else {
                    // If exists, add this mint to linked_token_mints
                    const { data: existing } = await supabase
                      .from('x_communities')
                      .select('id, linked_token_mints')
                      .eq('community_url', website.url)
                      .maybeSingle();
                    
                    if (existing && !existing.linked_token_mints?.includes(mint)) {
                      await supabase
                        .from('x_communities')
                        .update({
                          linked_token_mints: [...(existing.linked_token_mints || []), mint],
                        })
                        .eq('id', existing.id);
                    }
                  }
                }
              }
            }
          }

          // Batch insert mesh links
          if (meshLinks.length > 0) {
            const CHUNK = 100;
            for (let j = 0; j < meshLinks.length; j += CHUNK) {
              const chunk = meshLinks.slice(j, j + CHUNK);
              await supabase
                .from('reputation_mesh')
                .upsert(chunk, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
              results.dexscreener.linksAdded += chunk.length;
            }
          }

        } catch (e) {
          console.error(`[harvest] DexScreener batch error:`, e);
        }

        await delay(500); // DexScreener rate limit
      }

      console.log(`[harvest] DexScreener: ${results.dexscreener.processed} tokens, ${results.dexscreener.linksAdded} links, ${results.dexscreener.communitiesAdded} communities`);
    }

    return new Response(
      JSON.stringify({
        message: 'Harvest complete',
        results,
        nextOffset: offset + batchSize,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[harvest] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
