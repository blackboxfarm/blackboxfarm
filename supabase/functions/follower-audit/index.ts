import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createApiLogger } from "../_shared/api-logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Bot-farm location keywords
const BOT_FARM_LOCATIONS = new Set([
  "nigeria", "lagos", "abuja", "pakistan", "karachi", "lahore",
  "bangladesh", "dhaka", "india", "mumbai", "delhi", "indonesia",
  "jakarta", "philippines", "manila", "vietnam", "hanoi",
]);

interface FollowerProfile {
  userName?: string;
  name?: string;
  followersCount?: number;
  followingCount?: number;
  statusesCount?: number;
  favouritesCount?: number;
  isVerified?: boolean;
  isBlueVerified?: boolean;
  profileImageUrl?: string;
  description?: string;
  location?: string;
  createdAt?: string;
  [key: string]: unknown;
}

interface BotScore {
  username: string;
  score: number;
  signals: string[];
  location?: string;
}

function scoreFollower(f: FollowerProfile): BotScore {
  let score = 0;
  const signals: string[] = [];
  const username = f.userName || f.name || "unknown";

  // Default avatar
  if (
    !f.profileImageUrl ||
    f.profileImageUrl.includes("default_profile") ||
    f.profileImageUrl.includes("default_pbs")
  ) {
    score += 20;
    signals.push("Default avatar");
  }

  // Random alphanumeric username (8+ chars with lots of digits)
  if (username && /^[a-zA-Z]{1,3}[0-9]{5,}$/.test(username)) {
    score += 15;
    signals.push("Random username");
  }
  // Or pure gibberish: many consecutive consonants
  if (username && /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(username)) {
    score += 10;
    signals.push("Gibberish username");
  }

  // Account age < 90 days
  if (f.createdAt) {
    const age = Date.now() - new Date(f.createdAt).getTime();
    const dayAge = age / (1000 * 60 * 60 * 24);
    if (dayAge < 30) {
      score += 15;
      signals.push(`Account ${Math.round(dayAge)}d old`);
    } else if (dayAge < 90) {
      score += 8;
      signals.push(`Account ${Math.round(dayAge)}d old`);
    }
  }

  // 0 tweets but follows 1000+
  const tweets = f.statusesCount ?? 0;
  const following = f.followingCount ?? 0;
  const followers = f.followersCount ?? 0;

  if (tweets === 0 && following > 500) {
    score += 25;
    signals.push(`0 tweets, follows ${following}`);
  } else if (tweets < 5 && following > 1000) {
    score += 15;
    signals.push(`${tweets} tweets, follows ${following}`);
  }

  // Empty bio
  if (!f.description || f.description.trim().length === 0) {
    score += 10;
    signals.push("No bio");
  }

  // Following/Follower ratio > 50
  if (followers > 0 && following / followers > 50) {
    score += 15;
    signals.push(`Follow ratio ${(following / followers).toFixed(0)}:1`);
  } else if (followers === 0 && following > 100) {
    score += 20;
    signals.push(`0 followers, follows ${following}`);
  }

  // Bot-farm location
  const loc = (f.location || "").toLowerCase();
  if (loc && [...BOT_FARM_LOCATIONS].some((kw) => loc.includes(kw))) {
    score += 10;
    signals.push(`Location: ${f.location}`);
  }

  return { username, score, signals, location: f.location || undefined };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { handle, sampleSize = 500 } = await req.json();

    if (!handle || typeof handle !== "string") {
      return new Response(
        JSON.stringify({ error: "handle is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();

    const apifyToken = Deno.env.get("APIFY_API_TOKEN") || Deno.env.get("APIFY_API_KEY");
    if (!apifyToken) {
      return new Response(
        JSON.stringify({ error: "APIFY_API_TOKEN not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const logger = createApiLogger({
      serviceName: "apify",
      endpoint: "twitter-followers-scraper",
      functionName: "follower-audit",
      requestType: "holders_report",
      metadata: { handle: cleanHandle, sampleSize },
    });

    console.log(`[FollowerAudit] Starting audit for @${cleanHandle}, sample=${sampleSize}`);

    // Run Apify actor
    const actorRunRes = await fetch(
      `https://api.apify.com/v2/acts/x_guru~twitter-follower-scraper/run-sync-get-dataset-items?token=${apifyToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userNameList: [cleanHandle],
          maxItems: sampleSize,
        }),
      }
    );

    if (!actorRunRes.ok) {
      const errText = await actorRunRes.text();
      await logger.fail(`Apify error ${actorRunRes.status}: ${errText}`);
      return new Response(
        JSON.stringify({ error: `Apify request failed: ${actorRunRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const followers: FollowerProfile[] = await actorRunRes.json();
    await logger.complete(200);

    console.log(`[FollowerAudit] Got ${followers.length} followers for @${cleanHandle}`);
    if (followers.length > 0) {
      console.log(`[FollowerAudit] Sample follower keys:`, JSON.stringify(Object.keys(followers[0])));
      console.log(`[FollowerAudit] First follower:`, JSON.stringify(followers[0]).slice(0, 500));
    }

    // Score each follower
    const scored: BotScore[] = followers.map(scoreFollower);

    // Classify
    let botCount = 0;
    let suspiciousCount = 0;
    let realCount = 0;

    for (const s of scored) {
      if (s.score >= 40) botCount++;
      else if (s.score >= 20) suspiciousCount++;
      else realCount++;
    }

    const total = scored.length || 1;
    const realPct = Number(((realCount / total) * 100).toFixed(2));
    const suspiciousPct = Number(((suspiciousCount / total) * 100).toFixed(2));
    const botPct = Number(((botCount / total) * 100).toFixed(2));

    // Geo breakdown
    const geoCounts: Record<string, number> = {};
    for (const s of scored) {
      const loc = (s.location || "Unknown").trim() || "Unknown";
      geoCounts[loc] = (geoCounts[loc] || 0) + 1;
    }
    const geoBreakdown = Object.entries(geoCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([location, count]) => ({ location, count, pct: Number(((count / total) * 100).toFixed(1)) }));

    // Signal summary
    const signalCounts: Record<string, number> = {};
    for (const s of scored) {
      for (const sig of s.signals) {
        const key = sig.replace(/\d+/g, "N"); // normalize numbers
        signalCounts[key] = (signalCounts[key] || 0) + 1;
      }
    }

    // Verdict
    let verdict: string;
    if (realPct >= 70) verdict = "✅ Mostly organic — good candidate for paid promotion";
    else if (realPct >= 40) verdict = "⚠️ Mixed audience — proceed with caution";
    else verdict = "🚫 High bot ratio — not recommended for paid promotion";

    // Top suspects (20 highest scores)
    const topSuspects = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    // Save to DB
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get follower count from first result metadata or estimate
    const followerCount = followers[0]?.followersCount || followers.length;

    const { error: dbError } = await supabase.from("follower_audits").insert({
      handle: cleanHandle,
      follower_count: followerCount,
      sample_size: followers.length,
      real_pct: realPct,
      suspicious_pct: suspiciousPct,
      bot_pct: botPct,
      geo_breakdown: geoBreakdown,
      signals_summary: signalCounts,
      raw_sample: topSuspects, // Only store top suspects, not all 500
      cost_credits: 1,
      verdict,
    });

    if (dbError) console.warn("[FollowerAudit] DB insert error:", dbError);

    const result = {
      handle: cleanHandle,
      followerCount,
      sampleSize: followers.length,
      realPct,
      suspiciousPct,
      botPct,
      geoBreakdown,
      signalsSummary: signalCounts,
      topSuspects,
      verdict,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[FollowerAudit] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
