import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Post to Instagram (Graph API)
 * 
 * Instagram publishing is a 2-step flow (image required):
 * 1. Create a media container with image_url + caption
 * 2. Publish the container
 * 
 * Supports: image+caption, carousel (future)
 * NOTE: Instagram requires an image — text-only posts are NOT supported.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const IG_ACCESS_TOKEN = Deno.env.get("INSTAGRAM_ACCESS_TOKEN")?.trim();
    const IG_USER_ID = Deno.env.get("INSTAGRAM_USER_ID")?.trim();

    if (!IG_ACCESS_TOKEN || !IG_USER_ID) {
      throw new Error("Missing INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID. Configure in Edge Function secrets.");
    }

    const body = await req.json();
    const { caption, imageUrl, action } = body;

    // ── Get insights on a specific post ──
    if (action === 'get_insights' && body.mediaId) {
      const insightsUrl = `https://graph.facebook.com/v21.0/${body.mediaId}/insights?metric=impressions,reach,engagement,saved&access_token=${IG_ACCESS_TOKEN}`;
      const insightsResp = await fetch(insightsUrl);
      const insightsData = await insightsResp.json();

      if (!insightsResp.ok) {
        throw new Error(`IG Insights error: ${JSON.stringify(insightsData)}`);
      }

      return new Response(JSON.stringify({ success: true, insights: insightsData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Get account info ──
    if (action === 'get_profile') {
      const profileUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}?fields=id,username,name,profile_picture_url,followers_count,media_count&access_token=${IG_ACCESS_TOKEN}`;
      const profileResp = await fetch(profileUrl);
      const profileData = await profileResp.json();

      if (!profileResp.ok) {
        throw new Error(`IG Profile error: ${JSON.stringify(profileData)}`);
      }

      return new Response(JSON.stringify({ success: true, profile: profileData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── List recent media ──
    if (action === 'list_posts') {
      const limit = body.limit || 25;
      const listUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media?fields=id,caption,timestamp,media_type,media_url,permalink,like_count,comments_count&limit=${limit}&access_token=${IG_ACCESS_TOKEN}`;
      const listResp = await fetch(listUrl);
      const listData = await listResp.json();

      if (!listResp.ok) {
        throw new Error(`IG List error: ${JSON.stringify(listData)}`);
      }

      return new Response(JSON.stringify({ success: true, posts: listData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Publish a new post ──
    if (!imageUrl) {
      throw new Error("Instagram requires an image_url. Text-only posts are not supported.");
    }

    // Step 1: Create media container
    const createUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media`;
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption || '',
        access_token: IG_ACCESS_TOKEN,
      }),
    });

    const createData = await createResp.json();
    if (!createResp.ok) {
      throw new Error(`IG Create error: ${JSON.stringify(createData)}`);
    }

    const containerId = createData.id;
    console.log("IG container created:", containerId);

    // Step 2: Publish the container
    const publishUrl = `https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`;
    const publishResp = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: IG_ACCESS_TOKEN,
      }),
    });

    const publishData = await publishResp.json();
    if (!publishResp.ok) {
      throw new Error(`IG Publish error: ${JSON.stringify(publishData)}`);
    }

    console.log("IG post published:", publishData.id);

    // Log to DB
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from('social_posts_log').insert({
        platform: 'instagram',
        post_id: publishData.id,
        content: (caption || '').substring(0, 500),
        metadata: { containerId, imageUrl },
      });
    } catch (logErr) {
      console.warn("Failed to log IG post (non-blocking):", logErr);
    }

    return new Response(JSON.stringify({
      success: true,
      postId: publishData.id,
      containerId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Instagram posting error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message || String(error),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
