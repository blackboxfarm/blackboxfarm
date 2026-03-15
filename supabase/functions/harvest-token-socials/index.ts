import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { extractXHandle, extractXCommunityId } from '../_shared/x-handle-extractor.ts';
import { resolveXHandle, incrementXUserTokenCount } from '../_shared/x-handle-resolver.ts';
import { resolveTelegramUsername, incrementChannelTokenCount } from '../_shared/telegram-resolver.ts';
import { registerXHandlesForPhanes } from '../_shared/register-x-handle.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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

    const results = {
      backfill: { processed: 0, linksAdded: 0, xResolved: 0, tgResolved: 0, recycledX: 0, recycledTg: 0 },
      dexscreener: { processed: 0, linksAdded: 0, communitiesAdded: 0, xResolved: 0, tgResolved: 0, recycledX: 0, recycledTg: 0 },
    };

    // ============================================
    // Shared: Resolve X handle → immutable ID + mesh links
    // ============================================
    async function resolveAndLinkX(
      handle: string,
      mint: string,
      creatorWallet: string | null,
      confidence: number,
      source: string,
      meshLinks: MeshLink[],
      stats: typeof results.backfill,
    ) {
      // Try to resolve to immutable user ID
      const xRes = await resolveXHandle(handle, supabase);
      if (xRes) {
        stats.xResolved++;
        if (xRes.isRotated) {
          stats.recycledX++;
          console.log(`   ♻️ RECYCLED X handle detected: @${handle} → user ID ${xRes.userId} (${xRes.handleCount} handles seen)`);
        }
        // Link immutable x_user → token
        meshLinks.push({
          source_type: 'x_user',
          source_id: xRes.userId,
          linked_type: 'token',
          linked_id: mint,
          relationship: 'promotes_token',
          confidence: Math.min(confidence + 10, 100),
          evidence: { handle, display_name: xRes.displayName, is_rotated: xRes.isRotated, handle_count: xRes.handleCount, source },
          discovered_via: `harvest-token-socials:${source}`,
        });
        // Link immutable x_user → wallet
        if (creatorWallet) {
          meshLinks.push({
            source_type: 'x_user',
            source_id: xRes.userId,
            linked_type: 'wallet',
            linked_id: creatorWallet,
            relationship: 'social_account_of',
            confidence: Math.min(confidence + 5, 100),
            evidence: { handle, is_rotated: xRes.isRotated, source },
            discovered_via: `harvest-token-socials:${source}`,
          });
        }
        // Increment linked token count
        await incrementXUserTokenCount(xRes.userId, supabase);
      }
    }

    // ============================================
    // Shared: Resolve Telegram username → immutable channel ID + mesh links
    // ============================================
    async function resolveAndLinkTelegram(
      username: string,
      mint: string,
      confidence: number,
      source: string,
      meshLinks: MeshLink[],
      stats: typeof results.backfill,
    ) {
      const tgRes = await resolveTelegramUsername(username, supabase);
      if (tgRes) {
        stats.tgResolved++;
        if (tgRes.isRecycled) {
          stats.recycledTg++;
          console.log(`   ♻️ RECYCLED Telegram channel detected: @${username} → ID ${tgRes.channelId} (${tgRes.linkedTokenCount} tokens linked)`);
        }
        // Link immutable telegram_channel → token
        meshLinks.push({
          source_type: 'telegram_channel',
          source_id: tgRes.channelId,
          linked_type: 'token',
          linked_id: mint,
          relationship: 'telegram_of_token',
          confidence: Math.min(confidence + 10, 100),
          evidence: { username, title: tgRes.title, is_recycled: tgRes.isRecycled, linked_token_count: tgRes.linkedTokenCount, source },
          discovered_via: `harvest-token-socials:${source}`,
        });
        // Increment linked token count
        await incrementChannelTokenCount(tgRes.channelId, supabase);
      }
    }

    // ============================================
    // MODE 1: BACKFILL from pumpfun_watchlist
    // ============================================
    if (mode === 'backfill' || mode === 'both') {
      console.log(`[harvest] Backfill mode: offset=${offset}, batch=${batchSize}`);

      const { data: tokens, error } = await supabase
        .from('pumpfun_watchlist')
        .select('token_mint, token_symbol, creator_wallet, twitter_url, website_url, telegram_url')
        .not('status', 'in', '("rejected","dead")')
        .or('twitter_url.neq.,website_url.neq.')
        .range(offset, offset + batchSize - 1);

      if (error) throw error;
      if (!tokens || tokens.length === 0) {
        return new Response(JSON.stringify({ message: 'No more tokens to backfill', results }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const allLinks: MeshLink[] = [];
      const xHandlesToRegister: string[] = [];

      for (const t of tokens) {
        results.backfill.processed++;

        // Twitter handle → token link (mutable handle link)
        if (t.twitter_url) {
          const handle = extractXHandle(t.twitter_url);
          if (handle) {
            xHandlesToRegister.push(handle);

            // Mutable handle link (kept for backward compat)
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

            // Resolve to immutable ID (rate-limited: only first 20 per batch to avoid X API limits)
            if (results.backfill.xResolved < 20) {
              await resolveAndLinkX(handle, t.token_mint, t.creator_wallet, 70, 'backfill', allLinks, results.backfill);
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

        // Telegram → token link (mutable username link)
        if (t.telegram_url) {
          const tgMatch = t.telegram_url.match(/t\.me\/([a-zA-Z0-9_]+)/i);
          if (tgMatch) {
            const tgUsername = tgMatch[1].toLowerCase();
            allLinks.push({
              source_type: 'telegram',
              source_id: tgUsername,
              linked_type: 'token',
              linked_id: t.token_mint,
              relationship: 'telegram_of_token',
              confidence: 65,
              evidence: { url: t.telegram_url, symbol: t.token_symbol, source: 'pumpfun_watchlist' },
              discovered_via: 'harvest-token-socials:backfill',
            });

            // Resolve to immutable channel ID (rate-limited: first 30 per batch)
            if (results.backfill.tgResolved < 30) {
              await resolveAndLinkTelegram(tgUsername, t.token_mint, 65, 'backfill', allLinks, results.backfill);
            }
          }
        }
      }

      // Register all X handles for Phanes backfill (lightweight, no API calls)
      if (xHandlesToRegister.length > 0) {
        const registered = await registerXHandlesForPhanes(xHandlesToRegister, supabase, 'harvest-backfill');
        console.log(`[harvest] Registered ${registered} new X handles for Phanes backfill`);
      }

      // Batch insert all links (ignore duplicates)
      if (allLinks.length > 0) {
        const CHUNK = 100;
        for (let i = 0; i < allLinks.length; i += CHUNK) {
          const chunk = allLinks.slice(i, i + CHUNK);
          const { error: insertErr } = await supabase
            .from('reputation_mesh')
            .upsert(chunk, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship', ignoreDuplicates: true });
          if (!insertErr) {
            results.backfill.linksAdded += chunk.length;
          }
        }
      }

      console.log(`[harvest] Backfill: ${results.backfill.processed} tokens, ${results.backfill.linksAdded} links, ${results.backfill.xResolved} X resolved (${results.backfill.recycledX} recycled), ${results.backfill.tgResolved} TG resolved (${results.backfill.recycledTg} recycled)`);
    }

    // ============================================
    // MODE 2: DEXSCREENER
    // ============================================
    if (mode === 'dexscreener' || mode === 'both') {
      console.log(`[harvest] DexScreener mode: fetching socials for tokens`);

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
      const xHandlesToRegister: string[] = [];

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
            const bestPair = tokenPairs[0];

            const info = bestPair.info || {};
            const socials = info.socials || [];
            const websites = info.websites || [];

            // Twitter/X from socials
            for (const social of socials) {
              if (social.type === 'twitter' && social.url) {
                const handle = extractXHandle(social.url);
                if (handle) {
                  xHandlesToRegister.push(handle);

                  // Mutable handle link
                  meshLinks.push({
                    source_type: 'x_account',
                    source_id: handle,
                    linked_type: 'token',
                    linked_id: mint,
                    relationship: 'promotes_token',
                    confidence: 85,
                    evidence: { url: social.url, dex_paid: true, source: 'dexscreener' },
                    discovered_via: 'harvest-token-socials:dexscreener',
                  });

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

                  // Resolve to immutable ID (rate-limited: 10 per DexScreener batch)
                  if (results.dexscreener.xResolved < 10) {
                    await resolveAndLinkX(handle, mint, tokenData?.creator_wallet || null, 85, 'dexscreener', meshLinks, results.dexscreener);
                  }
                }
              }

              if (social.type === 'telegram' && social.url) {
                const tgMatch = social.url.match(/t\.me\/([a-zA-Z0-9_]+)/i);
                if (tgMatch) {
                  const tgUsername = tgMatch[1].toLowerCase();

                  // Mutable username link
                  meshLinks.push({
                    source_type: 'telegram',
                    source_id: tgUsername,
                    linked_type: 'token',
                    linked_id: mint,
                    relationship: 'telegram_of_token',
                    confidence: 80,
                    evidence: { url: social.url, dex_paid: true, source: 'dexscreener' },
                    discovered_via: 'harvest-token-socials:dexscreener',
                  });

                  // Resolve to immutable channel ID (rate-limited: 15 per DexScreener run)
                  if (results.dexscreener.tgResolved < 15) {
                    await resolveAndLinkTelegram(tgUsername, mint, 80, 'dexscreener', meshLinks, results.dexscreener);
                  }
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

            // X community detection from websites
            for (const website of websites) {
              const communityId = extractXCommunityId(website.url);
              if (communityId) {
                const { data: existing } = await supabase
                  .from('x_communities')
                  .select('id, linked_token_mints')
                  .eq('community_id', communityId)
                  .maybeSingle();

                if (existing) {
                  if (!existing.linked_token_mints?.includes(mint)) {
                    await supabase
                      .from('x_communities')
                      .update({
                        linked_token_mints: [...(existing.linked_token_mints || []), mint],
                      })
                      .eq('id', existing.id);
                    results.dexscreener.communitiesAdded++;
                  }
                } else {
                  const { error: xcErr } = await supabase
                    .from('x_communities')
                    .insert({
                      community_id: communityId,
                      community_url: website.url.replace(/\/$/, ''),
                      linked_token_mints: [mint],
                      scrape_status: 'pending',
                      is_deleted: false,
                    });
                  if (!xcErr) results.dexscreener.communitiesAdded++;
                }
              }
            }
          }

          // Register X handles for Phanes backfill
          if (xHandlesToRegister.length > 0) {
            await registerXHandlesForPhanes(xHandlesToRegister, supabase, 'harvest-dexscreener');
            xHandlesToRegister.length = 0; // Clear after registering
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

      console.log(`[harvest] DexScreener: ${results.dexscreener.processed} tokens, ${results.dexscreener.linksAdded} links, ${results.dexscreener.communitiesAdded} communities, ${results.dexscreener.xResolved} X resolved (${results.dexscreener.recycledX} recycled), ${results.dexscreener.tgResolved} TG resolved (${results.dexscreener.recycledTg} recycled)`);
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
