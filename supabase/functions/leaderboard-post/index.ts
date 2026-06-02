// leaderboard-post — posts a rendered leaderboard run to TG public + private channels
// via the existing no-lube-push function (sendPhoto path).
// Supports cadences: daily | weekly | monthly. Builds an information-heavy
// caption so Telegram's pin preview tells the story, then pins the post
// in the destination channel (rotating off the previous recap pin per cadence).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { buildRecapCaption, pinAndRotate, tableForCadence, RecapCadence } from '../_shared/leaderboard-recap.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { run_id, only, cadence: rawCadence } = await req.json();
    if (!run_id) throw new Error('run_id required');
    const cadence: RecapCadence =
      rawCadence === 'weekly' || rawCadence === 'monthly' ? rawCadence : 'daily';
    const table = tableForCadence(cadence);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: run, error } = await supabase
      .from(table)
      .select('*')
      .eq('id', run_id).maybeSingle();
    if (error || !run) throw new Error('run not found');

    const { data: profile } = await supabase
      .from('leaderboard_profiles')
      .select('display_name, brand_tagline, post_to_tg_public, post_to_tg_private, auto_pin_daily, auto_pin_weekly, auto_pin_monthly, auto_unpin_previous')
      .eq('id', run.profile_id).maybeSingle();
    if (!profile) throw new Error('profile not found');

    const brand = (profile.brand_tagline || profile.display_name || 'NO LUBE').toString();
    const entries = Array.isArray(run.entries) ? run.entries : [];
    const size = entries.length;

    let dateLabel = '';
    let windowLabel = '';
    if (cadence === 'daily') {
      dateLabel = String(run.local_date);
      windowLabel = '6am→6am Toronto';
    } else if (cadence === 'weekly') {
      dateLabel = `${run.week_start_date} → ${run.week_end_date}`;
      windowLabel = '7-day window';
    } else {
      dateLabel = String(run.month_label || run.month_start_date);
      windowLabel = 'Full month';
    }

    const recapFor = (variant: 'public' | 'private') => buildRecapCaption({
      cadence, brand, size, dateLabel, windowLabel,
      entries, entryCount: run.entry_count,
      variantTag: variant === 'private' ? 'PRIVATE' : 'PUBLIC',
    });

    // Persist the (public) caption text on the run for archival/debug
    try {
      const pub = recapFor('public');
      const archived = pub.followUp ? `${pub.caption}\n\n${pub.followUp}` : pub.caption;
      await supabase.from(table).update({ caption_text: archived }).eq('id', run_id);
    } catch {}

    // Resolve destination chat IDs (for pin/unpin)
    const { data: pubProf } = await supabase
      .from('no_lube_channel_profiles').select('telegram_chat_id').eq('kind', 'public').maybeSingle();
    const { data: privProf } = await supabase
      .from('no_lube_channel_profiles').select('telegram_chat_id').eq('kind', 'private').maybeSingle();
    const chatIds: Record<'public' | 'private', string | null> = {
      public: pubProf?.telegram_chat_id ?? null,
      private: privProf?.telegram_chat_id ?? null,
    };

    const botToken = Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN') || '';
    const pinFlag =
      cadence === 'weekly' ? profile.auto_pin_weekly :
      cadence === 'monthly' ? profile.auto_pin_monthly :
      profile.auto_pin_daily;
    const unpinPrev = !!profile.auto_unpin_previous;

    // Look up previous-recap message_id (same cadence + same profile) for each channel
    const { data: prev } = await supabase
      .from(table)
      .select('tg_public_message_id, tg_private_message_id, pinned_message_id_public, pinned_message_id_private')
      .eq('profile_id', run.profile_id)
      .neq('id', run_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const out: Record<string, any> = {};
    const targets: Array<['public' | 'private', string | null, boolean]> = [
      ['public', run.image_public_url, profile.post_to_tg_public && only !== 'private'],
      ['private', run.image_private_url, profile.post_to_tg_private && only !== 'public'],
    ];
    for (const [variant, imageUrl, enabled] of targets) {
      if (!enabled) { out[variant] = { skipped: true }; continue; }
      if (!imageUrl) { out[variant] = { skipped: true, reason: 'no_image' }; continue; }
      const recap = recapFor(variant);
      const r = await fetch(`${supabaseUrl}/functions/v1/no-lube-push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
        body: JSON.stringify({
          text: recap.caption,
          channel: variant,
          image_url: imageUrl,
          override: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      out[variant] = { ok: r.ok && j?.ok !== false, message_id: j?.message_id, raw: j };
      if (out[variant].ok && j?.message_id) {
        const col = variant === 'public' ? 'tg_public_message_id' : 'tg_private_message_id';
        await supabase.from(table).update({ [col]: j.message_id }).eq('id', run_id);

        // Send the full ranked list as a follow-up text message when it
        // didn't fit inside the photo caption (Top 20 / Top 25 cases).
        if (recap.followUp) {
          try {
            const fr = await fetch(`${supabaseUrl}/functions/v1/no-lube-push`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${anonKey}`, apikey: anonKey },
              body: JSON.stringify({
                text: recap.followUp,
                channel: variant,
                override: true,
              }),
            });
            const fj = await fr.json().catch(() => ({}));
            out[variant].followup = { ok: fr.ok && fj?.ok !== false, message_id: fj?.message_id };
          } catch (e: any) {
            out[variant].followup = { ok: false, error: String(e?.message || e) };
          }
        }

        // Pin (and rotate off the previous pin for this cadence)
        if (pinFlag && botToken && chatIds[variant]) {
          const prevMsgId = variant === 'public'
            ? (prev?.pinned_message_id_public ?? prev?.tg_public_message_id ?? null)
            : (prev?.pinned_message_id_private ?? prev?.tg_private_message_id ?? null);
          const pinRes = await pinAndRotate({
            botToken,
            chatId: chatIds[variant]!,
            newMessageId: j.message_id,
            previousMessageId: prevMsgId,
            unpinPrevious: unpinPrev,
          });
          out[variant].pin = pinRes;
          if (pinRes.pinned) {
            const pinCol = variant === 'public' ? 'pinned_message_id_public' : 'pinned_message_id_private';
            await supabase.from(table).update({
              [pinCol]: j.message_id,
              pinned_at: new Date().toISOString(),
            }).eq('id', run_id);
          }
        }
      }
    }

    await supabase.from(table).update({
      status: 'posted', posted_at: new Date().toISOString(),
    }).eq('id', run_id);

    return new Response(JSON.stringify({ ok: true, cadence, ...out }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('[leaderboard-post] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});