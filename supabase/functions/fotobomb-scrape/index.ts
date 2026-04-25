import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { action, targetId, pageUrl, maxPhotos } = await req.json();

    // ACTION: Start scraping a Facebook page for photos
    if (action === 'scrape') {
      if (!pageUrl) {
        return new Response(JSON.stringify({ error: 'pageUrl is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const APIFY_API_KEY = Deno.env.get('APIFY_API_KEY');
      if (!APIFY_API_KEY) {
        return new Response(JSON.stringify({ error: 'APIFY_API_KEY not configured' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Create or update target
      let target;
      if (targetId) {
        const { data, error } = await supabase
          .from('fotobomb_targets')
          .update({ status: 'scraping', error_message: null, updated_at: new Date().toISOString() })
          .eq('id', targetId)
          .select()
          .single();
        if (error) throw error;
        target = data;
      } else {
        // Extract page name from URL
        const pageName = pageUrl.replace(/https?:\/\/(www\.)?facebook\.com\/?/i, '').replace(/\/$/, '') || 'Unknown';
        const { data, error } = await supabase
          .from('fotobomb_targets')
          .insert({ page_url: pageUrl, page_name: pageName, status: 'scraping' })
          .select()
          .single();
        if (error) throw error;
        target = data;
      }

      console.log(`[FOTOBOMB] Starting scrape for ${pageUrl}, target=${target.id}`);

      // Use the official apify/facebook-photos-scraper
      const actorId = 'apify~facebook-photos-scraper';
      const limit = maxPhotos || 500;

      const response = await fetch(
        `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=300`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startUrls: [{ url: pageUrl }],
            resultsLimit: limit,
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        console.error(`[FOTOBOMB] Apify error ${response.status}: ${errText.slice(0, 300)}`);
        
        await supabase.from('fotobomb_targets').update({
          status: 'failed',
          error_message: `Apify ${response.status}: ${errText.slice(0, 200)}`,
          updated_at: new Date().toISOString(),
        }).eq('id', target.id);

        return new Response(JSON.stringify({ error: `Apify error: ${response.status}` }), {
          status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const photos = await response.json();
      console.log(`[FOTOBOMB] Got ${photos.length} photos from Apify`);

      // Sort oldest-first by timestamp if available
      const sorted = photos.sort((a: any, b: any) => {
        const dateA = a.timestamp || a.date || a.created_time || '';
        const dateB = b.timestamp || b.date || b.created_time || '';
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });

      // Insert images in batches
      const images = sorted.map((photo: any) => ({
        target_id: target.id,
        image_url: photo.imageUrl || photo.url || photo.image || photo.full_picture || '',
        thumbnail_url: photo.thumbnailUrl || photo.thumbnail || null,
        facebook_photo_id: photo.id || photo.photoId || photo.photo_id || null,
        caption: (photo.caption || photo.text || photo.message || '').slice(0, 5000) || null,
        posted_at: photo.timestamp || photo.date || photo.created_time || null,
        album_name: photo.albumName || photo.album || null,
        review_status: 'pending',
        metadata: {
          likes: photo.likes || photo.likesCount || null,
          comments: photo.comments || photo.commentsCount || null,
          shares: photo.shares || photo.sharesCount || null,
          link: photo.link || photo.url || null,
        },
      })).filter((img: any) => img.image_url);

      // Batch insert (max 500 at a time)
      let inserted = 0;
      for (let i = 0; i < images.length; i += 500) {
        const batch = images.slice(i, i + 500);
        const { error } = await supabase.from('fotobomb_images').insert(batch);
        if (error) {
          console.error(`[FOTOBOMB] Insert batch error:`, error);
        } else {
          inserted += batch.length;
        }
      }

      // Update target
      await supabase.from('fotobomb_targets').update({
        status: 'completed',
        total_photos_found: inserted,
        last_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', target.id);

      // Log API usage
      await supabase.from('api_usage_log').insert({
        service_name: 'apify',
        endpoint: 'apify~facebook-photos-scraper',
        method: 'POST',
        function_name: 'fotobomb-scrape',
        success: true,
        metadata: { target_id: target.id, photos_found: inserted, page_url: pageUrl },
      });

      return new Response(JSON.stringify({
        success: true,
        targetId: target.id,
        photosFound: inserted,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[FOTOBOMB] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? (error as Error).message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
