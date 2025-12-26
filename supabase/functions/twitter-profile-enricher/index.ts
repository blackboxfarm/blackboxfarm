import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApifyTwitterProfile {
  id: string;
  userName: string;
  name: string;
  description: string;
  location: string;
  url: string;
  // Actual field names from apidojo/twitter-user-scraper
  profilePicture: string;
  coverPicture: string;
  followers: number;
  following: number;
  statusesCount: number;
  favouritesCount: number;
  listedCount: number;
  mediaCount: number;
  createdAt: string;
  isVerified: boolean;
  isBlueVerified: boolean;
  verifiedType?: string;
  protected: boolean;
  canDm?: boolean;
  canMediaTag?: boolean;
  fastFollowersCount?: number;
  hasCustomTimelines?: boolean;
  isTranslator?: boolean;
  withheldInCountries?: string[];
  entities?: {
    description?: { urls?: Array<{ display_url: string; expanded_url: string; url: string }> };
    url?: { urls?: Array<{ display_url: string; expanded_url: string; url: string }> };
  };
  professional?: {
    category?: Array<{ name?: string }>;
    professional_type?: string;
    rest_id?: string;
  };
}

interface EnrichmentResult {
  username: string;
  success: boolean;
  error?: string;
  data?: ApifyTwitterProfile;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
    if (!APIFY_API_KEY) {
      throw new Error("APIFY_API_KEY not configured");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { usernames } = await req.json();
    
    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      throw new Error("usernames array is required");
    }

    console.log(`Enriching ${usernames.length} Twitter profiles:`, usernames);

    // Call Apify Twitter profile scraper
    const actorId = "apidojo~twitter-user-scraper";
    
    console.log("Calling Apify with twitterHandles:", usernames);
    
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitterHandles: usernames,
          maxItems: usernames.length,
          getFollowers: false,
          getFollowing: false,
          getRetweeters: false
        }),
      }
    );

    if (!runResponse.ok) {
      const errorText = await runResponse.text();
      console.error("Apify error:", errorText);
      throw new Error(`Apify API error: ${runResponse.status} - ${errorText}`);
    }

    const profiles: ApifyTwitterProfile[] = await runResponse.json();
    console.log(`Got ${profiles.length} profiles from Apify`);
    if (profiles.length > 0) {
      console.log("Sample profile fields:", Object.keys(profiles[0]));
      console.log("Sample followers value:", profiles[0].followers);
    }

    const results: EnrichmentResult[] = [];

    for (const profile of profiles) {
      try {
        const username = profile.userName?.toLowerCase();
        if (!username) {
          console.warn("Profile missing userName:", profile);
          continue;
        }

        console.log(`Processing @${username}: ${profile.followers} followers, ${profile.following} following`);

        // Parse join date
        let joinDate: string | null = null;
        if (profile.createdAt) {
          try {
            joinDate = new Date(profile.createdAt).toISOString();
          } catch (e) {
            console.warn(`Failed to parse date for @${username}:`, profile.createdAt);
          }
        }

        // Extract professional category names
        const professionalCategories = profile.professional?.category
          ?.map(c => c.name)
          .filter(Boolean) || null;

        // Extract URLs from entities
        const bioUrls = profile.entities?.description?.urls || null;
        const profileUrls = profile.entities?.url?.urls || null;

        // Update the database - use correct field names from Apify
        const { error: updateError } = await supabase
          .from("twitter_accounts")
          .update({
            twitter_id: profile.id,
            display_name: profile.name || null,
            bio: profile.description || null,
            location: profile.location || null,
            website: profile.url || null,
            profile_image_url: profile.profilePicture?.replace("_normal", "_400x400") || null,
            banner_image_url: profile.coverPicture || null,
            follower_count: profile.followers || 0,
            following_count: profile.following || 0,
            tweet_count: profile.statusesCount || 0,
            likes_count: profile.favouritesCount || 0,
            listed_count: profile.listedCount || 0,
            media_count: profile.mediaCount || 0,
            join_date: joinDate,
            is_verified: profile.isVerified || profile.isBlueVerified || false,
            is_protected: profile.protected || false,
            // New fields
            verified_type: profile.verifiedType || null,
            can_dm: profile.canDm || false,
            can_media_tag: profile.canMediaTag || false,
            fast_followers_count: profile.fastFollowersCount || 0,
            has_custom_timelines: profile.hasCustomTimelines || false,
            is_translator: profile.isTranslator || false,
            professional_type: profile.professional?.professional_type || null,
            professional_category: professionalCategories,
            bio_urls: bioUrls,
            profile_urls: profileUrls,
            withheld_countries: profile.withheldInCountries || null,
            last_enriched_at: new Date().toISOString(),
          })
          .ilike("username", username);

        if (updateError) {
          console.error(`Failed to update @${username}:`, updateError);
          results.push({ username, success: false, error: updateError.message });
        } else {
          results.push({ username, success: true, data: profile });
        }
      } catch (err: any) {
        console.error(`Error processing profile:`, err);
        results.push({ 
          username: profile.userName || "unknown", 
          success: false, 
          error: err.message 
        });
      }
    }

    // Check for usernames that weren't found
    const foundUsernames = profiles.map(p => p.userName?.toLowerCase());
    for (const username of usernames) {
      if (!foundUsernames.includes(username.toLowerCase())) {
        results.push({ 
          username, 
          success: false, 
          error: "Profile not found on Twitter" 
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    console.log(`Enrichment complete: ${successCount}/${usernames.length} successful`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        enriched: successCount,
        total: usernames.length,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Enrichment error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
