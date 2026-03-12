import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveTelegramUsername, incrementChannelTokenCount } from "../_shared/telegram-resolver.ts";
import { resolveXHandle, incrementXUserTokenCount } from "../_shared/x-handle-resolver.ts";

/**
 * SOCIAL MESH LINKER — Background cron (every 10min)
 * 
 * Scans pumpfun_watchlist for tokens with social data not yet linked to the mesh.
 * Auto-links:
 *   - Twitter/X handles → creator wallet (reputation_mesh)
 *   - Website URLs → creator wallet (reputation_mesh)
 *   - Telegram groups → creator wallet (reputation_mesh)
 *   - Discord/Twitch/GitHub discovered in website URLs → reputation_mesh
 *   - Auto-creates dev_wallet_reputation if creator doesn't exist yet
 * 
 * Also scrapes website_url for additional social links (Discord, GitHub, Twitch)
 * using simple URL pattern matching (no Firecrawl needed).
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_SIZE = 20;

// Regex patterns for social URLs
const SOCIAL_PATTERNS = {
  discord: [
    /discord\.gg\/([a-zA-Z0-9-]+)/i,
    /discord\.com\/invite\/([a-zA-Z0-9-]+)/i,
    /discord\.com\/servers\/([a-zA-Z0-9-]+)/i,
  ],
  github: [
    /github\.com\/([a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_.-]+)?)/i,
  ],
  twitch: [
    /twitch\.tv\/([a-zA-Z0-9_]+)/i,
  ],
  medium: [
    /medium\.com\/@?([a-zA-Z0-9_.-]+)/i,
  ],
  youtube: [
    /youtube\.com\/(channel|c|@)\/([a-zA-Z0-9_-]+)/i,
    /youtube\.com\/([a-zA-Z0-9_-]+)/i,
  ],
};

// Extract Twitter handle from URL (filters out reserved paths like "i")
const X_RESERVED = new Set(['i','intent','search','hashtag','settings','home','explore','notifications','messages','compose','lists','bookmarks','communities','spaces','tos','privacy','help','about','login','signup','share','status','jobs','download']);
function extractTwitterHandle(url: string | null): string | null {
  if (!url) return null;
  if (url.includes('/communities/')) return null;
  const match = url.match(/(?:twitter\.com|x\.com)\/(@?[a-zA-Z0-9_]+)/i);
  if (!match) return null;
  const handle = match[1].replace(/^@/, '').toLowerCase();
  if (X_RESERVED.has(handle) || handle.length > 15) return null;
  return handle;
}

// Extract Telegram group from URL
function extractTelegramHandle(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/t\.me\/([a-zA-Z0-9_]+)/i);
  return match ? match[1].toLowerCase() : null;
}

// Extract extra socials from a URL string (check if URL itself contains social patterns)
function extractExtraSocials(url: string | null): { type: string; id: string; fullUrl: string }[] {
  if (!url) return [];
  const found: { type: string; id: string; fullUrl: string }[] = [];

  for (const [platform, patterns] of Object.entries(SOCIAL_PATTERNS)) {
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        found.push({
          type: platform,
          id: match[1] || match[2] || '',
          fullUrl: url,
        });
        break;
      }
    }
  }
  return found;
}

// Try to fetch website and extract social links from HTML
async function discoverSocialsFromWebsite(websiteUrl: string): Promise<{ type: string; id: string; fullUrl: string }[]> {
  const found: { type: string; id: string; fullUrl: string }[] = [];

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(websiteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SocialBot/1.0)' },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (!response.ok) return found;

    const html = await response.text();
    if (!html || html.length > 500_000) return found; // Skip huge pages

    // Extract all href values
    const hrefRegex = /href=["']([^"']+)/gi;
    let match;
    const urls = new Set<string>();

    while ((match = hrefRegex.exec(html)) !== null) {
      urls.add(match[1]);
    }

    // Check each URL for social patterns
    for (const href of urls) {
      // Twitter/X
      const twitterHandle = extractTwitterHandle(href);
      if (twitterHandle) {
        found.push({ type: 'x_account', id: twitterHandle, fullUrl: href });
      }

      // Telegram
      const telegramHandle = extractTelegramHandle(href);
      if (telegramHandle) {
        found.push({ type: 'telegram', id: telegramHandle, fullUrl: href });
      }

      // Other platforms
      const extras = extractExtraSocials(href);
      found.push(...extras);
    }
  } catch (err) {
    // Timeout or network error — skip silently
  }

  // Deduplicate by type+id
  const seen = new Set<string>();
  return found.filter(s => {
    const key = `${s.type}:${s.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get tokens with socials that haven't been mesh-linked yet
    const { data: tokens, error: fetchErr } = await supabase
      .from("pumpfun_watchlist")
      .select("id, token_mint, token_symbol, token_name, creator_wallet, twitter_url, telegram_url, website_url")
      .eq("socials_mesh_linked", false)
      .not("creator_wallet", "is", null)
      .or("twitter_url.neq.,telegram_url.neq.,website_url.neq.")
      .order("created_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!tokens?.length) {
      return new Response(JSON.stringify({ message: "No tokens to link", linked: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`🔗 Social Mesh Linker: Processing ${tokens.length} tokens`);

    let linked = 0;
    let meshInserts = 0;
    let devProfilesCreated = 0;
    let websitesScraped = 0;
    const details: any[] = [];

    for (const token of tokens) {
      const { creator_wallet, twitter_url, telegram_url, website_url, token_mint, token_symbol } = token;
      if (!creator_wallet) continue;

      const meshLinks: any[] = [];
      const discoveredSocials: string[] = [];

      // 1. Twitter/X → wallet (handle or community)
      const twitterHandle = extractTwitterHandle(twitter_url);
      if (twitterHandle) {
        // Try to resolve handle → immutable numeric user ID
        const xResolved = await resolveXHandle(twitterHandle, supabase);
        
        if (xResolved) {
          // Primary link: immutable user ID → wallet
          meshLinks.push({
            source_type: "x_user",
            source_id: xResolved.userId,
            linked_type: "wallet",
            linked_id: creator_wallet,
            relationship: "social_account_of",
            confidence: 80,
            evidence: {
              source: "watchlist_enrichment",
              token_mint, token_symbol,
              url: twitter_url,
              display_name: xResolved.displayName,
              resolved_handle: xResolved.handle,
              is_verified: xResolved.isVerified,
              is_rotated: xResolved.isRotated,
              handle_count: xResolved.handleCount,
              linked_token_count: xResolved.linkedTokenCount,
            },
            discovered_via: "social-mesh-linker",
          });
          
          // Secondary link: handle → user ID (so both are searchable)
          meshLinks.push({
            source_type: "x_account",
            source_id: twitterHandle,
            linked_type: "x_user",
            linked_id: xResolved.userId,
            relationship: "handle_of",
            confidence: 95,
            evidence: { source: "x_api_resolution", display_name: xResolved.displayName, url: twitter_url },
            discovered_via: "social-mesh-linker",
          });
          
          // Increment token count for rotation detection
          await incrementXUserTokenCount(xResolved.userId, supabase);
          
          discoveredSocials.push(`x_user:${xResolved.userId}(@${xResolved.handle})`);
          if (xResolved.isRotated) {
            console.log(`   🔄 ROTATED X HANDLE detected: @${xResolved.handle} has ${xResolved.handleCount} known handles`);
          }
        } else {
          // Fallback: handle-only (API failed, rate limited, etc.)
          meshLinks.push({
            source_type: "x_account",
            source_id: twitterHandle,
            linked_type: "wallet",
            linked_id: creator_wallet,
            relationship: "social_account_of",
            confidence: 55,
            evidence: { source: "watchlist_enrichment", token_mint, token_symbol, url: twitter_url, resolution_failed: true },
            discovered_via: "social-mesh-linker",
          });
          discoveredSocials.push(`x:@${twitterHandle}(unresolved)`);
        }
      }

      // 1b. X Community URL → community + token + wallet mesh links
      if (twitter_url && twitter_url.includes('/communities/')) {
        const communityMatch = twitter_url.match(/communities\/(\d+)/);
        if (communityMatch) {
          const communityId = communityMatch[1];
          // Community → token link
          meshLinks.push({
            source_type: "x_community",
            source_id: communityId,
            linked_type: "token",
            linked_id: token_mint,
            relationship: "community_for",
            confidence: 95,
            evidence: { source: "watchlist_enrichment", token_symbol, url: twitter_url },
            discovered_via: "social-mesh-linker",
          });
          // Community → wallet link
          meshLinks.push({
            source_type: "x_community",
            source_id: communityId,
            linked_type: "wallet",
            linked_id: creator_wallet,
            relationship: "community_for",
            confidence: 85,
            evidence: { source: "watchlist_enrichment", token_symbol, url: twitter_url },
            discovered_via: "social-mesh-linker",
          });
          discoveredSocials.push(`x_community:${communityId}`);

          // Trigger x-community-enricher to scrape admins/mods (fire-and-forget)
          supabase.functions.invoke('x-community-enricher', {
            body: {
              communityUrl: twitter_url,
              linkedTokenMint: token_mint,
              linkedWallet: creator_wallet,
            }
          }).catch(e => console.warn(`[mesh-linker] Community enricher trigger failed: ${e}`));
        }
      }

      // 2. Telegram → wallet (resolve to immutable channel ID when possible)
      const telegramHandle = extractTelegramHandle(telegram_url);
      if (telegramHandle) {
        // Try to resolve username → immutable numeric channel ID
        const resolved = await resolveTelegramUsername(telegramHandle, supabase);
        
        if (resolved) {
          // Primary link: immutable channel ID → wallet
          meshLinks.push({
            source_type: "telegram_channel",
            source_id: resolved.channelId,
            linked_type: "wallet",
            linked_id: creator_wallet,
            relationship: "social_account_of",
            confidence: 75,
            evidence: {
              source: "watchlist_enrichment",
              token_mint, token_symbol,
              url: telegram_url,
              channel_title: resolved.title,
              resolved_username: resolved.username,
              is_recycled: resolved.isRecycled,
              linked_token_count: resolved.linkedTokenCount,
            },
            discovered_via: "social-mesh-linker",
          });
          
          // Secondary link: username → channel ID (so both are searchable)
          meshLinks.push({
            source_type: "telegram",
            source_id: telegramHandle,
            linked_type: "telegram_channel",
            linked_id: resolved.channelId,
            relationship: "username_of",
            confidence: 95,
            evidence: { source: "bot_api_resolution", title: resolved.title, url: telegram_url },
            discovered_via: "social-mesh-linker",
          });
          
          // Increment token count for recycling detection
          await incrementChannelTokenCount(resolved.channelId, supabase);
          
          discoveredSocials.push(`tg_channel:${resolved.channelId}(${resolved.title})`);
          if (resolved.isRecycled) {
            console.log(`   ♻️ RECYCLED GROUP detected: ${resolved.title} (${resolved.linkedTokenCount + 1} tokens)`);
          }
        } else {
          // Fallback: username-only (bot not in group, private, etc.)
          meshLinks.push({
            source_type: "telegram",
            source_id: telegramHandle,
            linked_type: "wallet",
            linked_id: creator_wallet,
            relationship: "social_account_of",
            confidence: 55,
            evidence: { source: "watchlist_enrichment", token_mint, token_symbol, url: telegram_url, resolution_failed: true },
            discovered_via: "social-mesh-linker",
          });
          discoveredSocials.push(`tg:${telegramHandle}(unresolved)`);
        }
      }

      // 3. Website → wallet
      if (website_url && website_url.trim()) {
        meshLinks.push({
          source_type: "website",
          source_id: website_url.trim(),
          linked_type: "wallet",
          linked_id: creator_wallet,
          relationship: "website_of",
          confidence: 70,
          evidence: { source: "watchlist_enrichment", token_mint, token_symbol },
          discovered_via: "social-mesh-linker",
        });
        discoveredSocials.push(`web:${website_url}`);

        // 4. Scrape website for Discord, GitHub, Twitch, etc.
        try {
          const extraSocials = await discoverSocialsFromWebsite(website_url.trim());
          websitesScraped++;

          for (const social of extraSocials) {
            meshLinks.push({
              source_type: social.type,
              source_id: social.id,
              linked_type: "wallet",
              linked_id: creator_wallet,
              relationship: "social_account_of",
              confidence: 60,
              evidence: {
                source: "website_scrape",
                discovered_on: website_url,
                token_mint,
                token_symbol,
                full_url: social.fullUrl,
              },
              discovered_via: "social-mesh-linker",
            });
            discoveredSocials.push(`${social.type}:${social.id}`);
          }
        } catch (e) {
          console.warn(`[mesh-linker] Website scrape failed for ${website_url}: ${e}`);
        }
      }

      // 5. Token → wallet link (if not already there from enricher)
      meshLinks.push({
        source_type: "wallet",
        source_id: creator_wallet,
        linked_type: "token",
        linked_id: token_mint,
        relationship: "created_token",
        confidence: 95,
        evidence: { source: "watchlist_enrichment", token_symbol },
        discovered_via: "social-mesh-linker",
      });

      // 6. Insert all mesh links (ignore duplicates)
      for (const link of meshLinks) {
        const { error: meshErr } = await supabase.from("reputation_mesh").insert(link);
        if (!meshErr || meshErr.message?.includes("duplicate") || meshErr.code?.includes("23505")) {
          meshInserts++;
        } else {
          console.warn(`[mesh-linker] Insert error: ${meshErr.message}`);
        }
      }

      // 7. Auto-create dev_wallet_reputation if doesn't exist
      const { data: existingDev } = await supabase
        .from("dev_wallet_reputation")
        .select("id, twitter_accounts, telegram_groups, discord_servers")
        .eq("wallet_address", creator_wallet)
        .maybeSingle();

      if (!existingDev) {
        // Create new profile
        const now = new Date().toISOString();
        await supabase.from("dev_wallet_reputation").insert({
          wallet_address: creator_wallet,
          total_tokens_launched: 1,
          tokens_rugged: 0,
          tokens_abandoned: 0,
          trust_level: "unknown",
          twitter_accounts: twitterHandle ? [twitterHandle] : [],
          telegram_groups: telegramHandle ? [telegramHandle] : [],
          discord_servers: [],
          first_seen_at: now,
          last_activity_at: now,
          notes: `Auto-created by social-mesh-linker from ${token_symbol} (${token_mint.slice(0, 8)})`,
          metadata: { first_token: token_mint, first_symbol: token_symbol, socials: discoveredSocials },
        });
        devProfilesCreated++;
        console.log(`   👤 Created dev profile: ${creator_wallet.slice(0, 8)} (${token_symbol})`);
      } else {
        // Append new socials to existing profile
        const updates: any = { last_activity_at: new Date().toISOString() };
        
        if (twitterHandle) {
          const existing = existingDev.twitter_accounts || [];
          if (!existing.includes(twitterHandle)) {
            updates.twitter_accounts = [...existing, twitterHandle];
          }
        }
        if (telegramHandle) {
          const existing = existingDev.telegram_groups || [];
          if (!existing.includes(telegramHandle)) {
            updates.telegram_groups = [...existing, telegramHandle];
          }
        }

        if (Object.keys(updates).length > 1) {
          await supabase.from("dev_wallet_reputation").update(updates).eq("id", existingDev.id);
        }
      }

      // 8. Mark as linked
      await supabase
        .from("pumpfun_watchlist")
        .update({ socials_mesh_linked: true })
        .eq("id", token.id);

      linked++;
      details.push({ symbol: token_symbol, socials: discoveredSocials.length, mesh_links: meshLinks.length });
      console.log(`   ✅ ${token_symbol}: ${discoveredSocials.join(", ") || "no socials"}`);
    }

    const summary = {
      linked,
      meshInserts,
      devProfilesCreated,
      websitesScraped,
      total: tokens.length,
      details,
    };

    console.log(`\n📊 Summary: ${linked} linked, ${meshInserts} mesh entries, ${devProfilesCreated} new dev profiles, ${websitesScraped} websites scraped`);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[social-mesh-linker] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
