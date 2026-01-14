import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UniqueToken {
  token_mint: string;
  token_symbol: string | null;
  twitter_url: string | null;
  website_url: string | null;
  telegram_url: string | null;
  dev_trust_rating: string | null;
  creator_wallet: string | null;
}

// Rating severity order: danger > concern > unknown > good > null
function getRatingSeverity(rating: string | null): number {
  switch (rating) {
    case 'danger': return 4;
    case 'concern': return 3;
    case 'unknown': return 2;
    case 'good': return 1;
    default: return 0;
  }
}

// Detect if Twitter URL is an X Community vs regular account
function detectTwitterType(url: string | null): 'account' | 'community' | null {
  if (!url) return null;
  if (url.includes('/i/communities/') || url.includes('/communities/')) {
    return 'community';
  }
  if (url.includes('x.com/') || url.includes('twitter.com/')) {
    return 'account';
  }
  return null;
}

// Extract X Community ID from URL
function extractCommunityId(url: string): string | null {
  const match = url.match(/\/(?:i\/)?communities\/(\d+)/);
  return match ? match[1] : null;
}

// Extract twitter handle from URL
function extractTwitterHandle(url: string): string | null {
  if (url.includes('/communities/')) return null;
  const match = url.match(/(?:twitter\.com|x\.com)\/([^/?]+)/i);
  return match ? match[1].toLowerCase() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { dryRun = false, limit = 500 } = body;

    console.log(`Starting backfill (dryRun=${dryRun}, limit=${limit})`);

    // Query all sold positions
    const { data: allPositions, error: queryError } = await supabase
      .from("flip_positions")
      .select("token_mint, token_symbol, twitter_url, website_url, telegram_url, dev_trust_rating, creator_wallet")
      .eq("status", "sold")
      .not("token_mint", "is", null)
      .order("sell_executed_at", { ascending: false })
      .limit(limit);

    if (queryError) {
      throw new Error(`Query failed: ${queryError.message}`);
    }

    console.log(`Found ${allPositions?.length || 0} sold positions`);

    // Group by token_mint, pick most severe rating
    const tokenMap = new Map<string, UniqueToken>();
    for (const row of allPositions || []) {
      if (!row.token_mint) continue;
      
      if (!tokenMap.has(row.token_mint)) {
        tokenMap.set(row.token_mint, row as UniqueToken);
      } else {
        const existing = tokenMap.get(row.token_mint)!;
        if (getRatingSeverity(row.dev_trust_rating) > getRatingSeverity(existing.dev_trust_rating)) {
          tokenMap.set(row.token_mint, row as UniqueToken);
        }
      }
    }

    console.log(`Unique tokens to process: ${tokenMap.size}`);

    const results = {
      processed: 0,
      skipped: 0,
      errors: 0,
      creatorWalletsFetched: 0,
      addedToBlacklist: 0,
      addedToWhitelist: 0,
      addedToNeutral: 0,
      teamsDetected: 0,
      communitiesEnriched: 0
    };

    // Process each unique token
    for (const [tokenMint, data] of tokenMap) {
      try {
        console.log(`Processing: ${tokenMint} (${data.token_symbol || 'unknown'})`);

        // Check if already in any list
        const { data: existingBlacklist } = await supabase
          .from('pumpfun_blacklist')
          .select('id')
          .eq('identifier', tokenMint)
          .maybeSingle();

        const { data: existingWhitelist } = await supabase
          .from('pumpfun_whitelist')
          .select('id')
          .eq('identifier', tokenMint)
          .maybeSingle();

        const { data: existingNeutral } = await supabase
          .from('pumpfun_neutrallist')
          .select('id')
          .eq('identifier', tokenMint)
          .maybeSingle();

        if (existingBlacklist || existingWhitelist || existingNeutral) {
          console.log(`Token ${tokenMint} already in a list, skipping`);
          results.skipped++;
          continue;
        }

        // Get creator wallet if not present
        let creatorWallet = data.creator_wallet;
        let launchpadPlatform: string | null = null;
        
        if (!creatorWallet) {
          try {
            const { data: creatorData } = await supabase.functions.invoke('solscan-creator-lookup', {
              body: { tokenMint }
            });
            if (creatorData?.creatorWallet) {
              creatorWallet = creatorData.creatorWallet;
              results.creatorWalletsFetched++;
              console.log(`Fetched creator wallet: ${creatorWallet}`);
              
              // Update position with creator wallet
              await supabase
                .from("flip_positions")
                .update({ creator_wallet: creatorWallet })
                .eq("token_mint", tokenMint);
            }
            if (creatorData?.launchpad) {
              launchpadPlatform = creatorData.launchpad;
            }
          } catch (err) {
            console.warn('Failed to fetch creator wallet:', err);
          }
        }

        // Detect twitter type
        const twitterType = detectTwitterType(data.twitter_url);
        const communityId = twitterType === 'community' && data.twitter_url 
          ? extractCommunityId(data.twitter_url) 
          : null;
        const twitterHandle = twitterType === 'account' && data.twitter_url
          ? extractTwitterHandle(data.twitter_url)
          : null;

        if (dryRun) {
          console.log(`[DRY RUN] Would add ${tokenMint} with rating ${data.dev_trust_rating || 'unrated'}`);
          results.processed++;
          continue;
        }

        // Add to appropriate list based on rating
        const rating = data.dev_trust_rating || 'unknown';
        
        if (rating === 'danger' || rating === 'concern') {
          const riskLevel = rating === 'danger' ? 'high' : 'medium';
          
          await supabase.from('pumpfun_blacklist').upsert({
            entry_type: 'token_mint',
            identifier: tokenMint,
            risk_level: riskLevel,
            blacklist_reason: `Backfilled from FlipIt - rated ${rating.toUpperCase()}`,
            source: 'flipit_backfill',
            tags: ['backfilled', rating],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_websites: data.website_url ? [data.website_url] : [],
            linked_telegram: data.telegram_url ? [data.telegram_url] : [],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : [],
            linked_x_communities: communityId ? [communityId] : []
          }, { onConflict: 'entry_type,identifier' });

          if (creatorWallet) {
            await supabase.from('pumpfun_blacklist').upsert({
              entry_type: 'dev_wallet',
              identifier: creatorWallet,
              risk_level: riskLevel,
              blacklist_reason: `Developer of ${data.token_symbol || tokenMint.slice(0, 8)} - rated ${rating.toUpperCase()}`,
              source: 'flipit_backfill',
              tags: ['backfilled', rating, 'dev_wallet'],
              linked_token_mints: [tokenMint],
              linked_twitter: twitterHandle ? [twitterHandle] : [],
              linked_x_communities: communityId ? [communityId] : []
            }, { onConflict: 'entry_type,identifier' });
          }

          results.addedToBlacklist++;
          
        } else if (rating === 'good') {
          await supabase.from('pumpfun_whitelist').upsert({
            entry_type: 'token_mint',
            identifier: tokenMint,
            trust_level: 'high',
            whitelist_reason: 'Backfilled from FlipIt - rated GOOD',
            source: 'flipit_backfill',
            tags: ['backfilled', 'trusted'],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_websites: data.website_url ? [data.website_url] : [],
            linked_telegram: data.telegram_url ? [data.telegram_url] : [],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : []
          }, { onConflict: 'entry_type,identifier' });

          if (creatorWallet) {
            await supabase.from('pumpfun_whitelist').upsert({
              entry_type: 'dev_wallet',
              identifier: creatorWallet,
              trust_level: 'high',
              whitelist_reason: `Trusted developer of ${data.token_symbol || tokenMint.slice(0, 8)}`,
              source: 'flipit_backfill',
              tags: ['backfilled', 'trusted', 'dev_wallet'],
              linked_token_mints: [tokenMint],
              linked_twitter: twitterHandle ? [twitterHandle] : []
            }, { onConflict: 'entry_type,identifier' });
          }

          results.addedToWhitelist++;
          
        } else {
          // unknown or null - add to neutral
          await supabase.from('pumpfun_neutrallist').upsert({
            entry_type: 'token_mint',
            identifier: tokenMint,
            trust_level: 'unreviewed',
            neutrallist_reason: 'Backfilled from FlipIt - unrated',
            source: 'flipit_backfill',
            tags: ['backfilled', 'pending_review'],
            linked_twitter: twitterHandle ? [twitterHandle] : [],
            linked_websites: data.website_url ? [data.website_url] : [],
            linked_telegram: data.telegram_url ? [data.telegram_url] : [],
            linked_dev_wallets: creatorWallet ? [creatorWallet] : []
          }, { onConflict: 'entry_type,identifier' });

          if (creatorWallet) {
            await supabase.from('pumpfun_neutrallist').upsert({
              entry_type: 'dev_wallet',
              identifier: creatorWallet,
              trust_level: 'unreviewed',
              neutrallist_reason: `Developer of ${data.token_symbol || tokenMint.slice(0, 8)} - unrated`,
              source: 'flipit_backfill',
              tags: ['backfilled', 'pending_review', 'dev_wallet'],
              linked_token_mints: [tokenMint],
              linked_twitter: twitterHandle ? [twitterHandle] : []
            }, { onConflict: 'entry_type,identifier' });
          }

          results.addedToNeutral++;
        }

        // Trigger X community enricher if applicable
        if (twitterType === 'community' && data.twitter_url) {
          supabase.functions.invoke('x-community-enricher', {
            body: { 
              communityUrl: data.twitter_url,
              linkedTokenMint: tokenMint,
              linkedCreatorWallet: creatorWallet
            }
          }).catch(err => console.warn('X Community enricher failed:', err));
          results.communitiesEnriched++;
        }

        // Create ONE team entry per unique token (don't merge during backfill)
        if (creatorWallet || twitterHandle || communityId) {
          // Generate unique team hash per token
          const uniqueTeamHash = `token_${tokenMint.slice(0, 12)}`;
          
          // Check if team already exists for this token
          const { data: existingTeam } = await supabase
            .from('dev_teams')
            .select('id')
            .contains('linked_token_mints', [tokenMint])
            .maybeSingle();
          
          if (!existingTeam) {
            // Create new team entry for this specific token
            const { error: teamError } = await supabase
              .from('dev_teams')
              .insert({
                team_hash: uniqueTeamHash,
                team_name: `${data.token_symbol || tokenMint.slice(0, 8)} Dev`,
                member_wallets: creatorWallet ? [creatorWallet] : [],
                member_twitter_accounts: twitterHandle ? [twitterHandle] : [],
                linked_x_communities: communityId ? [communityId] : [],
                linked_token_mints: [tokenMint],
                tokens_created: 1,
                risk_level: rating === 'danger' ? 'high' : rating === 'concern' ? 'medium' : 'low',
                source: 'flipit_backfill',
                tags: ['backfilled', 'per_token_entry'],
                is_active: true
              });
            
            if (!teamError) {
              results.teamsDetected++;
              console.log(`Created team entry for ${data.token_symbol || tokenMint.slice(0, 8)}`);
            } else {
              console.warn('Failed to create team:', teamError.message);
            }
          } else {
            console.log(`Team already exists for token ${tokenMint.slice(0, 8)}`);
          }
        }

        results.processed++;

        // Rate limiting - don't hammer the APIs
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (err) {
        console.error(`Error processing ${tokenMint}:`, err);
        results.errors++;
      }
    }

    console.log('Backfill complete:', results);

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
