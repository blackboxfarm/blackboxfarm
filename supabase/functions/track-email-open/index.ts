import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// 1x1 transparent GIF
const PIXEL_GIF = new Uint8Array([
  0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
  0x01, 0x00, 0x80, 0x00, 0x00, 0xff, 0xff, 0xff,
  0x00, 0x00, 0x00, 0x21, 0xf9, 0x04, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x44,
  0x01, 0x00, 0x3b,
]);

serve(async (req) => {
  const url = new URL(req.url);
  const trackingId = url.searchParams.get('id');

  if (trackingId) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );

      // Update the tracking record — set opened_at on first open, always increment count
      const { data: existing } = await supabase
        .from('email_tracking_events')
        .select('id, opened_at, open_count')
        .eq('tracking_id', trackingId)
        .single();

      if (existing) {
        const updateData: Record<string, unknown> = {
          open_count: (existing.open_count || 0) + 1,
        };
        if (!existing.opened_at) {
          updateData.opened_at = new Date().toISOString();
        }
        await supabase
          .from('email_tracking_events')
          .update(updateData)
          .eq('id', existing.id);
      }
    } catch {
      // Silent — tracking must never fail the pixel response
    }
  }

  return new Response(PIXEL_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
