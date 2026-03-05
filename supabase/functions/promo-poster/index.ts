import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWITTER_HANDLE = 'HoldersIntel';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ||
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1) Check if promo system is running
    const { data: config, error: cfgErr } = await supabase
      .from('promo_tweet_config')
      .select('*')
      .limit(1)
      .single();

    if (cfgErr || !config) {
      console.log('[promo-poster] No config found');
      return new Response(JSON.stringify({ success: true, message: 'No config' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!config.is_running) {
      console.log('[promo-poster] Promo system is stopped');
      return new Response(JSON.stringify({ success: true, message: 'Stopped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Check if enough time has passed since last post
    const intervalMs = (config.interval_hours || 3) * 60 * 60 * 1000;
    if (config.last_posted_at) {
      const elapsed = Date.now() - new Date(config.last_posted_at).getTime();
      if (elapsed < intervalMs) {
        const nextIn = Math.round((intervalMs - elapsed) / 60000);
        console.log(`[promo-poster] Not due yet, next in ${nextIn}m`);
        return new Response(JSON.stringify({ success: true, message: `Next in ${nextIn}m` }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 3) Get all enabled promo templates
    const { data: templates, error: tmplErr } = await supabase
      .from('promo_tweet_templates')
      .select('*')
      .eq('is_enabled', true)
      .order('template_type');

    if (tmplErr || !templates || templates.length === 0) {
      console.log('[promo-poster] No enabled promo templates');
      return new Response(JSON.stringify({ success: true, message: 'No enabled templates' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 4) Find next template in rotation
    const lastType = config.last_posted_type;
    let nextTemplate;
    if (!lastType) {
      nextTemplate = templates[0];
    } else {
      const lastIdx = templates.findIndex(t => t.template_type === lastType);
      nextTemplate = templates[(lastIdx + 1) % templates.length];
    }

    console.log(`[promo-poster] Posting ${nextTemplate.template_type}: "${nextTemplate.template_text.substring(0, 60)}..."`);

    // 5) Post the tweet via post-share-card-twitter
    const tweetText = nextTemplate.template_text;
    const response = await fetch(
      `${supabaseUrl}/functions/v1/post-share-card-twitter`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          tweetText,
          twitterHandle: TWITTER_HANDLE,
        }),
      }
    );

    const result = await response.json();

    if (!result.success) {
      console.error(`[promo-poster] Tweet failed:`, result.error);
      return new Response(JSON.stringify({ success: false, error: result.error }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[promo-poster] ✅ Posted ${nextTemplate.template_type}, tweet ID: ${result.tweetId}`);

    // 6) Update config with last posted info
    await supabase
      .from('promo_tweet_config')
      .update({
        last_posted_type: nextTemplate.template_type,
        last_posted_at: new Date().toISOString(),
      })
      .eq('id', config.id);

    return new Response(JSON.stringify({
      success: true,
      posted: nextTemplate.template_type,
      tweetId: result.tweetId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[promo-poster] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
