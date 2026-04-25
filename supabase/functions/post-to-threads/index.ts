import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Post to Threads (Meta Threads API)
 * 
 * Threads publishing is a 2-step flow:
 * 1. Create a media container (text, image, or video)
 * 2. Publish the container
 * 
 * Supports: text-only, text+image, text+link
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const THREADS_ACCESS_TOKEN = Deno.env.get("THREADS_ACCESS_TOKEN")?.trim();
    const THREADS_USER_ID = Deno.env.get("THREADS_USER_ID")?.trim();

    if (!THREADS_ACCESS_TOKEN || !THREADS_USER_ID) {
      throw new Error("Missing THREADS_ACCESS_TOKEN or THREADS_USER_ID. Configure in Edge Function secrets.");
    }

    const body = await req.json();
    const { text, imageUrl, linkUrl, action } = body;

    // ── Poll for insights on a specific post ──
    if (action === 'get_insights' && body.mediaId) {
      const insightsUrl = `https://graph.threads.net/v1.0/${body.mediaId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${THREADS_ACCESS_TOKEN}`;
      const insightsResp = await fetch(insightsUrl);
      const insightsData = await insightsResp.json();

      if (!insightsResp.ok) {
        throw new Error(`Threads Insights error: ${JSON.stringify(insightsData)}`);
      }

      return new Response(JSON.stringify({ success: true, insights: insightsData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Get user profile info ──
    if (action === 'get_profile') {
      const profileUrl = `https://graph.threads.net/v1.0/${THREADS_USER_ID}?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${THREADS_ACCESS_TOKEN}`;
      const profileResp = await fetch(profileUrl);
      const profileData = await profileResp.json();

      if (!profileResp.ok) {
        throw new Error(`Threads Profile error: ${JSON.stringify(profileData)}`);
      }

      return new Response(JSON.stringify({ success: true, profile: profileData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── List recent threads ──
    if (action === 'list_posts') {
      const limit = body.limit || 25;
      const listUrl = `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads?fields=id,text,timestamp,media_type,shortcode,permalink,is_quote_post&limit=${limit}&access_token=${THREADS_ACCESS_TOKEN}`;
      const listResp = await fetch(listUrl);
      const listData = await listResp.json();

      if (!listResp.ok) {
        throw new Error(`Threads List error: ${JSON.stringify(listData)}`);
      }

      return new Response(JSON.stringify({ success: true, posts: listData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Publish a new thread ──
    if (!text) {
      throw new Error("Missing 'text' in request body");
    }

    // Step 1: Create media container
    const createParams: Record<string, string> = {
      text,
      media_type: 'TEXT',
      access_token: THREADS_ACCESS_TOKEN,
    };

    // If image provided, switch to IMAGE type
    if (imageUrl) {
      createParams.media_type = 'IMAGE';
      createParams.image_url = imageUrl;
    }

    // Link attachment (appended to text by Threads)
    if (linkUrl) {
      createParams.link_attachment = linkUrl;
    }

    const createUrl = `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads`;
    const createResp = await fetch(createUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createParams),
    });

    const createData = await createResp.json();
    if (!createResp.ok) {
      throw new Error(`Threads Create error: ${JSON.stringify(createData)}`);
    }

    const containerId = createData.id;
    console.log("Threads container created:", containerId);

    // Step 2: Publish the container
    const publishUrl = `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish`;
    const publishResp = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: THREADS_ACCESS_TOKEN,
      }),
    });

    const publishData = await publishResp.json();
    if (!publishResp.ok) {
      throw new Error(`Threads Publish error: ${JSON.stringify(publishData)}`);
    }

    console.log("Thread published:", publishData.id);

    // Log to DB
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from('social_posts_log').insert({
        platform: 'threads',
        post_id: publishData.id,
        content: text.substring(0, 500),
        metadata: { containerId, imageUrl, linkUrl },
      });
    } catch (logErr) {
      console.warn("Failed to log thread post (non-blocking):", logErr);
    }

    return new Response(JSON.stringify({
      success: true,
      postId: publishData.id,
      containerId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Threads posting error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: (error as Error).message || String(error),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
