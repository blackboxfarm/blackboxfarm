// leaderboard-post — posts a rendered leaderboard run to TG public + private channels
// via the existing no-lube-push function (sendPhoto path).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { run_id, only } = await req.json();
    if (!run_id) throw new Error('run_id required');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: run, error } = await supabase
      .from('leaderboard_daily_runs')
      .select('id, profile_id, local_date, entry_count, image_public_url, image_private_url')
      .eq('id', run_id).maybeSingle();
    if (error || !run) throw new Error('run not found');

    const { data: profile } = await supabase
      .from('leaderboard_profiles')
      .select('display_name, brand_tagline, post_to_tg_public, post_to_tg_private')
      .eq('id', run.profile_id).maybeSingle();
    if (!profile) throw new Error('profile not found');

    const captionFor = (variant: 'public' | 'private') => {
      const tag = variant === 'private' ? 'PRIVATE' : 'PUBLIC';
      return `🏆 *${profile.brand_tagline || profile.display_name} — Daily Top 20*\n${run.local_date} · 6am→6am Toronto\n_${run.entry_count} qualifying calls_ · ${tag}`;
    };

    const out: Record<string, any> = {};
    const targets: Array<['public' | 'private', string | null, boolean]> = [
      ['public', run.image_public_url, profile.post_to_tg_public && only !== 'private'],
      ['private', run.image_private_url, profile.post_to_tg_private && only !== 'public'],
    ];
    for (const [variant, imageUrl, enabled] of targets) {
      if (!enabled) { out[variant] = { skipped: true }; continue; }
      if (!imageUrl) { out[variant] = { skipped: true, reason: 'no_image' }; continue; }
      const r = await fetch(`${supabaseUrl}/functions/v1/no-lube-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: JSON.stringify({
          text: captionFor(variant),
          channel: variant,
          image_url: imageUrl,
          override: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      out[variant] = { ok: r.ok && j?.ok !== false, message_id: j?.message_id, raw: j };
      if (out[variant].ok && j?.message_id) {
        const col = variant === 'public' ? 'tg_public_message_id' : 'tg_private_message_id';
        await supabase.from('leaderboard_daily_runs').update({ [col]: j.message_id }).eq('id', run_id);
      }
    }

    await supabase.from('leaderboard_daily_runs').update({
      status: 'posted', posted_at: new Date().toISOString(),
    }).eq('id', run_id);

    return new Response(JSON.stringify({ ok: true, ...out }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[leaderboard-post] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});