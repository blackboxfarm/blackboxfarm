import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

serve(async (req) => {
  const url = new URL(req.url);
  const trackingId = url.searchParams.get('id');
  const redirect = url.searchParams.get('redirect');

  if (trackingId) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      const { data: existing } = await supabase
        .from('email_tracking_events')
        .select('id, clicked_at, click_count')
        .eq('tracking_id', trackingId)
        .single();

      if (existing) {
        const updateData: Record<string, unknown> = {
          click_count: (existing.click_count || 0) + 1,
        };
        if (!existing.clicked_at) {
          updateData.clicked_at = new Date().toISOString();
        }
        await supabase
          .from('email_tracking_events')
          .update(updateData)
          .eq('id', existing.id);
      }
    } catch {
      // Silent
    }
  }

  // Redirect to the actual destination
  const destination = redirect || 'https://blackbox.farm';
  return new Response(null, {
    status: 302,
    headers: {
      'Location': destination,
      'Cache-Control': 'no-store',
    },
  });
});
