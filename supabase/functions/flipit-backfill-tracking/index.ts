import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UniqueToken {
  token_mint: string;
  token_symbol: string | null;
  token_name: string | null;
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
      .select("token_mint, token_symbol, token_name, twitter_url, website_url, telegram_url, dev_trust_rating, creator_wallet")
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
      tokenProjectsCreated: 0,
      communitiesEnriched: 0,
      upstreamWalletsFetched: 0
    };

    // Process each unique token
    for (const [tokenMint, data] of tokenMap) {
      try {
        console.log(`Processing: ${tokenMint} (${data.token_symbol || 'unknown'})`);

        // Check if token_project already exists
        const { data: existingProject } = await supabase
          .from('token_projects')
          .select('id')
          .eq('token_mint', tokenMint)
          .maybeSingle();

        if (existingProject) {
          console.log(`Token project for ${tokenMint} already exists, skipping`);
          results.skipped++;
          continue;
        }

        // Get creator wallet if not present
        let creatorWallet = data.creator_wallet;
        let launchpadPlatform: string | null = null;
        let upstreamWallets: string[] = [];
        let parentKycWallet: string | null = null;
        
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

        // Try to fetch upstream wallets (funding chain) if we have creator wallet
        if (creatorWallet) {
          try {
            // This would call a function to trace funding - for now we'll skip this
            // as it requires Helius/Solscan API for transfer history
            // upstreamWallets = await traceFundingChain(supabase, creatorWallet);
          } catch (err) {
            console.warn('Failed to fetch upstream wallets:', err);
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

        // Will be populated by x-community-enricher if community
        let communityAdmins: string[] = [];
        let communityMods: string[] = [];

        if (dryRun) {
          console.log(`[DRY RUN] Would create token_project for ${tokenMint}`);
          results.processed++;
          continue;
        }

        // Trigger X community enricher if applicable and wait for result
        if (twitterType === 'community' && data.twitter_url) {
          try {
            const { data: enrichResult } = await supabase.functions.invoke('x-community-enricher', {
              body: { 
                communityUrl: data.twitter_url,
                linkedTokenMint: tokenMint,
                linkedCreatorWallet: creatorWallet
              }
            });
            
            if (enrichResult?.admins) {
              communityAdmins = enrichResult.admins;
            }
            if (enrichResult?.mods) {
              communityMods = enrichResult.mods;
            }
            results.communitiesEnriched++;
          } catch (err) {
            console.warn('X Community enricher failed:', err);
          }
        }

        // Map dev_trust_rating to risk_level
        const rating = data.dev_trust_rating || 'unknown';
        const riskLevel = rating === 'danger' ? 'high' 
          : rating === 'concern' ? 'medium' 
          : rating === 'good' ? 'low' 
          : 'unknown';

        // Create the Token Project entry
        const { error: projectError } = await supabase
          .from('token_projects')
          .insert({
            token_mint: tokenMint,
            token_symbol: data.token_symbol,
            token_name: data.token_name,
            creator_wallet: creatorWallet,
            upstream_wallets: upstreamWallets,
            parent_kyc_wallet: parentKycWallet,
            launchpad_platform: launchpadPlatform,
            primary_twitter_url: data.twitter_url,
            twitter_type: twitterType,
            x_community_id: communityId,
            community_admins: communityAdmins,
            community_mods: communityMods,
            website_url: data.website_url,
            telegram_url: data.telegram_url,
            risk_level: riskLevel,
            trust_rating: rating,
            source: 'flipit_backfill',
            tags: ['backfilled'],
            first_seen_at: new Date().toISOString()
          });

        if (projectError) {
          console.error(`Failed to create token_project for ${tokenMint}:`, projectError.message);
          results.errors++;
        } else {
          results.tokenProjectsCreated++;
          console.log(`Created token_project for ${data.token_symbol || tokenMint.slice(0, 8)}`);
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
