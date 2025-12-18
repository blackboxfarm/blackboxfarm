import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { position } = await req.json();

    if (!position || position < 1 || position > 4) {
      return new Response(
        JSON.stringify({ error: 'Valid position (1-4) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get active banners for this position
    const now = new Date().toISOString();
    const { data: banners, error: bannersError } = await supabase
      .from('banner_ads')
      .select('*')
      .eq('position', position)
      .eq('is_active', true)
      .or(`start_date.is.null,start_date.lte.${now}`)
      .or(`end_date.is.null,end_date.gte.${now}`)
      .order('weight', { ascending: false });

    if (bannersError) {
      throw bannersError;
    }

    if (!banners || banners.length === 0) {
      return new Response(
        JSON.stringify({ banner: null }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If any scheduled/paid banners are active (have a start/end window), prefer those
    // so the "default" always-on banner doesn't steal impressions.
    const scheduledBanners = banners.filter((b: any) => Boolean(b.start_date) || Boolean(b.end_date));
    const eligibleBanners = scheduledBanners.length > 0 ? scheduledBanners : banners;

    // Weighted random selection
    const totalWeight = eligibleBanners.reduce((sum: number, b: any) => sum + (b.weight || 1), 0);
    let random = Math.random() * totalWeight;

    let selectedBanner = eligibleBanners[0];
    for (const banner of eligibleBanners) {
      random -= (banner.weight || 1);
      if (random <= 0) {
        selectedBanner = banner;
        break;
      }
    }

    console.log('Selected banner', {
      position,
      eligibleCount: eligibleBanners.length,
      selectedId: selectedBanner?.id,
      selectedTitle: selectedBanner?.title,
    });

    // Log impression
    const authHeader = req.headers.get('Authorization');
    let userId = null;
    
    if (authHeader) {
      const userSupabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userSupabase.auth.getUser();
      userId = user?.id || null;
    }

    await supabase.from('banner_impressions').insert({
      banner_id: selectedBanner.id,
      user_id: userId,
      session_id: req.headers.get('x-session-id') || null,
    });

    return new Response(
      JSON.stringify({ banner: selectedBanner }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error getting banner:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
