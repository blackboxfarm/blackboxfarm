import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertInsert } from "../_shared/db-assert.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BUCKET = 'social-gallery';
const PATH_PREFIX = 'bubble-snapshots';

function safeTicker(t?: string): string {
  if (!t) return 'token';
  return t.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) || 'token';
}

function decodeBase64Png(b64: string): Uint8Array {
  // Strip data: prefix if present
  const clean = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(clean);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json() as {
      pngBase64: string;
      tokenAddress: string;
      ticker?: string;
      viewMode: 'bubble' | 'schematic';
      commentary?: string;
    };

    if (!body.pngBase64 || !body.tokenAddress || !body.viewMode) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: pngBase64, tokenAddress, viewMode' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!['bubble', 'schematic'].includes(body.viewMode)) {
      return new Response(
        JSON.stringify({ error: 'viewMode must be "bubble" or "schematic"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Try to identify the user (optional — anon snapshots allowed)
    let userId: string | null = null;
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (user) userId = user.id;
      } catch { /* unauth — that's fine */ }
    }

    // Decode PNG
    let bytes: Uint8Array;
    try {
      bytes = decodeBase64Png(body.pngBase64);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Invalid base64 PNG payload' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sanity size check (5MB hard cap to prevent abuse)
    if (bytes.length > 5 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ error: 'Image too large (max 5MB)' }),
        { status: 413, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload to storage
    const ticker = safeTicker(body.ticker);
    const ts = Date.now();
    const folder = userId || 'anon';
    const path = `${PATH_PREFIX}/${folder}/${ts}-${ticker}-${body.viewMode}.png`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: 'image/png', upsert: false });

    if (uploadError) {
      console.error('[upload-bubble-snapshot] storage error', uploadError);
      return new Response(
        JSON.stringify({ error: `Storage upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    // Log the snapshot
    const inserted = await assertInsert(
      supabase
        .from('bubble_snapshots')
        .insert({
          user_id: userId,
          token_address: body.tokenAddress,
          ticker: ticker,
          view_mode: body.viewMode,
          public_url: publicUrl,
          storage_path: path,
          commentary: body.commentary || null,
        })
        .select('id')
        .single(),
      'bubble_snapshots'
    );

    return new Response(
      JSON.stringify({
        success: true,
        snapshotId: (inserted as any).id,
        publicUrl,
        storagePath: path,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-bubble-snapshot] error', msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});