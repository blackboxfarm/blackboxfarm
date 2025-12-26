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
  profileImageUrl: string;
  profileBannerUrl: string;
  followersCount: number;
  friendsCount: number;
  statusesCount: number;
  favouritesCount: number;
  listedCount: number;
  mediaCount: number;
  createdAt: string;
  isVerified: boolean;
  isProtected: boolean;
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
    // Using danek/twitter-profile which is simple and returns profile data
    const actorId = "apidojo~twitter-user-scraper";
    
    const runResponse = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handles: usernames,
          tweetsDesired: 0,
          proxyConfig: { useApifyProxy: true }
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

    const results: EnrichmentResult[] = [];

    for (const profile of profiles) {
      try {
        const username = profile.userName?.toLowerCase();
        if (!username) {
          console.warn("Profile missing userName:", profile);
          continue;
        }

        console.log(`Processing @${username}: ${profile.followersCount} followers`);

        // Parse join date
        let joinDate: string | null = null;
        if (profile.createdAt) {
          try {
            joinDate = new Date(profile.createdAt).toISOString();
          } catch (e) {
            console.warn(`Failed to parse date for @${username}:`, profile.createdAt);
          }
        }

        // Update the database
        const { error: updateError } = await supabase
          .from("twitter_accounts")
          .update({
            twitter_id: profile.id,
            display_name: profile.name || null,
            bio: profile.description || null,
            location: profile.location || null,
            website: profile.url || null,
            profile_image_url: profile.profileImageUrl?.replace("_normal", "_400x400") || null,
            banner_image_url: profile.profileBannerUrl || null,
            follower_count: profile.followersCount || 0,
            following_count: profile.friendsCount || 0,
            tweet_count: profile.statusesCount || 0,
            likes_count: profile.favouritesCount || 0,
            listed_count: profile.listedCount || 0,
            media_count: profile.mediaCount || 0,
            join_date: joinDate,
            is_verified: profile.isVerified || false,
            is_protected: profile.isProtected || false,
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
