/**
 * autopsy-tg-deep-pull
 *
 * Pulls deep Telegram metadata for a candidate's TG channel using the
 * Telegram Bot API via the Lovable connector gateway. Stores the raw
 * payload in autopsy_evidence_blobs(kind='tg_deep_pull') so the writer
 * can include it on the next (re-)generate.
 *
 * Body: { candidate_id: uuid }
 */
import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { assertInsert, assertUpdate } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function extractTgUsername(url: string): string | null {
  if (!url) return null;
  const m = url.match(/t\.me\/(?:joinchat\/|\+)?([a-zA-Z0-9_]+)/);
  if (!m) return null;
  // Skip invite-only links (joinchat / +) — bot can't query those by username
  if (/joinchat|\+/.test(url)) return null;
  return '@' + m[1];
}

async function tg(method: string, payload: any): Promise<{ ok: boolean; data: any }> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN');
  if (!botToken) {
    return { ok: false, data: { error: 'TELEGRAM_BOT_TOKEN missing' } };
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data?.ok !== false, data };
}

Deno.serve(withRunLog('autopsy-tg-deep-pull', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { candidate_id } = await req.json().catch(() => ({}));
  if (!candidate_id) {
    return new Response(JSON.stringify({ error: 'candidate_id required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: cand } = await supabase
    .from('autopsy_candidates')
    .select('id, token_mint')
    .eq('id', candidate_id)
    .maybeSingle();
  if (!cand) {
    return new Response(JSON.stringify({ error: 'candidate not found' }), {
      status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: socials } = await supabase
    .from('token_social_links')
    .select('platform, link_type, url, extracted_handle, is_current')
    .eq('token_mint', cand.token_mint)
    .neq('is_current', false);

  const tgRow = (socials ?? []).find((s: any) => /telegram|t\.me/i.test(`${s.platform ?? ''} ${s.link_type ?? ''} ${s.url ?? ''}`));
  if (!tgRow?.url) {
    return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no telegram url on token' }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const username = extractTgUsername(tgRow.url);
  if (!username) {
    return new Response(JSON.stringify({ success: true, skipped: true, reason: 'invite-only or unparseable TG link', url: tgRow.url }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const [chat, members, admins] = await Promise.all([
    tg('getChat', { chat_id: username }),
    tg('getChatMemberCount', { chat_id: username }),
    tg('getChatAdministrators', { chat_id: username }),
  ]);

  const payload = {
    username,
    url: tgRow.url,
    getChat: chat.data,
    getChatMemberCount: members.data,
    getChatAdministrators: admins.data,
    captured_at: new Date().toISOString(),
  };

  await assertInsert(
    supabase.from('autopsy_evidence_blobs').insert({
      candidate_id: cand.id,
      token_mint: cand.token_mint,
      kind: 'tg_deep_pull',
      payload,
    }).select('id').single(),
    'autopsy_evidence_blobs',
  );

  // Also update the live subscriber_count on the candidate if we got it
  const memberCount: number | null = members?.data?.result ?? null;
  if (memberCount && memberCount > 0) {
    await assertUpdate(supabase.from('autopsy_candidates')
      .update({ telegram_subscriber_count: memberCount, manual_tg_join_completed: true })
      .eq('id', cand.id)
      .select('id').single(), 'autopsy_candidates');
  } else {
    await assertUpdate(supabase.from('autopsy_candidates')
      .update({ manual_tg_join_completed: true })
      .eq('id', cand.id)
      .select('id').single(), 'autopsy_candidates');
  }

  return new Response(JSON.stringify({ success: true, payload }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}));