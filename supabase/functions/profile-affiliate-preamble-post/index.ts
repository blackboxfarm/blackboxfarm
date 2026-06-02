// Hourly: rotates an affiliate marketing message into each profile's private channel,
// no more often than affiliate_preamble_interval_hours (default 12h).
import { withRunLog } from '../_shared/run-logger.ts';
import { getSupabaseAdmin, tgCall, getProfileBotToken } from '../_shared/profile-subscription.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('profile-affiliate-preamble-post', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = getSupabaseAdmin();

  const { data: cfgs } = await supabase
    .from('profile_subscription_configs')
    .select('profile_key,private_chat_id,affiliate_enabled,affiliate_preamble_variants,affiliate_preamble_interval_hours,affiliate_preamble_last_posted_at')
    .eq('is_active', true);

  let posted = 0;
  const results: Array<Record<string, unknown>> = [];
  for (const c of cfgs ?? []) {
    if (!c.affiliate_enabled) continue;
    if (!c.private_chat_id) continue;
    const variants: string[] = c.affiliate_preamble_variants ?? [];
    if (!variants.length) continue;
    const intervalH = Number(c.affiliate_preamble_interval_hours ?? 12);
    if (intervalH <= 0) continue;
    if (c.affiliate_preamble_last_posted_at) {
      const ageMs = Date.now() - new Date(c.affiliate_preamble_last_posted_at).getTime();
      if (ageMs < intervalH * 3600_000) continue;
    }
    const pick = variants[Math.floor(Math.random() * variants.length)];
    try {
      const token = await getProfileBotToken(c.profile_key);
      if (!token) continue;
      const sent = await tgCall(token, 'sendMessage', {
        chat_id: c.private_chat_id,
        text: pick,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      });
      await supabase.from('profile_subscription_configs')
        .update({ affiliate_preamble_last_posted_at: new Date().toISOString() })
        .eq('profile_key', c.profile_key);
      posted++;
      results.push({ profile_key: c.profile_key, message_id: sent?.message_id });
    } catch (e) {
      results.push({ profile_key: c.profile_key, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, posted, results }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}));