import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Post to Facebook Page (Graph API)
 * 
 * Requires: FACEBOOK_PAGE_ACCESS_TOKEN and FACEBOOK_PAGE_ID
 * Supports: text, text+image, text+link
 */
Deno.serve(withRunLog('post-to-facebook', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const FB_ACCESS_TOKEN = Deno.env.get("FACEBOOK_PAGE_ACCESS_TOKEN")?.trim();
    const FB_PAGE_ID = Deno.env.get("FACEBOOK_PAGE_ID")?.trim();

    if (!FB_ACCESS_TOKEN || !FB_PAGE_ID) {
      throw new Error("Missing FACEBOOK_PAGE_ACCESS_TOKEN or FACEBOOK_PAGE_ID. Configure in Edge Function secrets.");
    }

    const body = await req.json();
    const { message, imageUrl, linkUrl, action } = body;

    // ── Get page info ──
    if (action === 'get_profile') {
      const profileUrl = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}?fields=id,name,fan_count,picture&access_token=${FB_ACCESS_TOKEN}`;
      const profileResp = await fetch(profileUrl);
      const profileData = await profileResp.json();

      if (!profileResp.ok) {
        throw new Error(`FB Profile error: ${JSON.stringify(profileData)}`);
      }

      return new Response(JSON.stringify({ success: true, profile: profileData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Publish a post ──
    if (!message && !imageUrl) {
      throw new Error("Provide 'message' or 'imageUrl'");
    }

    let postData: any;

    if (imageUrl) {
      // Photo post
      const photoUrl = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/photos`;
      const photoResp = await fetch(photoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: imageUrl,
          message: message || '',
          access_token: FB_ACCESS_TOKEN,
        }),
      });
      postData = await photoResp.json();
      if (!photoResp.ok) throw new Error(`FB Photo error: ${JSON.stringify(postData)}`);
    } else {
      // Text/link post
      const feedUrl = `https://graph.facebook.com/v21.0/${FB_PAGE_ID}/feed`;
      const params: Record<string, string> = {
        message: message || '',
        access_token: FB_ACCESS_TOKEN,
      };
      if (linkUrl) params.link = linkUrl;

      const feedResp = await fetch(feedUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      postData = await feedResp.json();
      if (!feedResp.ok) throw new Error(`FB Feed error: ${JSON.stringify(postData)}`);
    }

    console.log("FB post published:", postData.id || postData.post_id);

    // Log to DB
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase.from('social_posts_log').insert({
        platform: 'facebook',
        post_id: postData.id || postData.post_id || '',
        content: (message || '').substring(0, 500),
        metadata: { imageUrl, linkUrl },
      });
    } catch (logErr) {
      console.warn("Failed to log FB post:", logErr);
    }

    return new Response(JSON.stringify({
      success: true,
      postId: postData.id || postData.post_id,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error("Facebook posting error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || String(error),
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}));
