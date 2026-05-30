// leaderboard-regenerate-bg — regenerates a profile's public or private background
// via Lovable AI Gateway (gemini-3-pro-image-preview), uploads to storage,
// updates leaderboard_profiles.bg_{variant}_url.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_PROMPTS = {
  public: `Cinematic 1200x1500 vertical poster background for a crypto top-20 leaderboard.
Matte black, deep teals and cyan neon accents, faint grid + bokeh particles,
Bloomberg Terminal meets Tron HUD. No text, no logos, no characters — pure abstract
texture that leaves the entire canvas usable as a backdrop for 20 overlaid pill rows.
Dark center for legibility, slight vignette.`,
  private: `Cinematic 1200x1500 vertical poster background for a PRIVATE / VIP crypto leaderboard.
Matte black, gold and warm amber accents over deep navy, subtle luxe grain,
raised metallic feel, faint constellation lines. No text, no logos, no characters.
Darker center for legibility, soft vignette.`,
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { profile_id, variant, prompt: overridePrompt } = await req.json();
    if (!profile_id || (variant !== 'public' && variant !== 'private')) {
      throw new Error('profile_id and variant=public|private required');
    }
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing');

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: prof } = await supabase
      .from('leaderboard_profiles')
      .select('bg_public_prompt, bg_private_prompt')
      .eq('id', profile_id)
      .maybeSingle();
    const storedPrompt = variant === 'public' ? prof?.bg_public_prompt : prof?.bg_private_prompt;
    const prompt = (overridePrompt || storedPrompt || DEFAULT_PROMPTS[variant]).slice(0, 4000);

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'google/gemini-3-pro-image-preview',
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        modalities: ['image', 'text'],
      }),
    });
    if (!aiResp.ok) {
      const t = await aiResp.text();
      throw new Error(`AI ${aiResp.status}: ${t.slice(0, 300)}`);
    }
    const aiJson = await aiResp.json();
    const dataUrl: string | undefined = aiJson?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!dataUrl?.startsWith('data:image/')) throw new Error('no image returned');
    const [, b64] = dataUrl.split(',');
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const filename = `leaderboard-bg/${profile_id}_${variant}_${Date.now()}.png`;
    const { error: upErr } = await supabase.storage
      .from('no-lube-rendered-cards')
      .upload(filename, bytes, { contentType: 'image/png', upsert: false });
    if (upErr) throw new Error(`upload: ${upErr.message}`);
    const { data: pub } = supabase.storage.from('no-lube-rendered-cards').getPublicUrl(filename);

    const updateCol = variant === 'public' ? 'bg_public_url' : 'bg_private_url';
    const promptCol = variant === 'public' ? 'bg_public_prompt' : 'bg_private_prompt';
    await supabase.from('leaderboard_profiles')
      .update({ [updateCol]: pub.publicUrl, [promptCol]: prompt })
      .eq('id', profile_id);

    return new Response(JSON.stringify({ ok: true, url: pub.publicUrl, prompt }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[leaderboard-regenerate-bg] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});