// no-lube-push — posts already-composed text to the No Lube channel
// (blackbox_channel_config.role = 'output_channel') via the HoldersIntel bot.
// Markdown first, plaintext fallback so a malformed entity never silently drops.
//
// Hardening (June 2026):
// - Bounded retry (3 attempts) with jittered backoff for transient/5xx errors
// - Honors Telegram 429 Retry-After header
// - Classifies errors as transient | permanent | rate_limited
// - Updates channel_health (last_ok_at, last_error, consecutive_failures, retry_after_at)
// - In-flight push lock via pushing_started_at + partial unique index (DB-enforced)
// - Pre-flight refusal for unconfigured snapshot/private chats with clear error
// - Per-attempt push_attempts + last_push_error persisted on no_lube_post_log
// - Fail-open policy: channel_health is advisory only — never blocks a manual push

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type ErrorClass = 'transient' | 'permanent' | 'rate_limited';

/** Classify a Telegram API failure so the caller knows whether to retry. */
function classifyTgError(status: number, json: any): { kind: ErrorClass; retryAfterSec?: number; detail: string } {
  const desc: string = String(json?.description || json?.error || '').toLowerCase();
  if (status === 429 || /too many requests/.test(desc)) {
    const retryAfterSec = Number(json?.parameters?.retry_after) || 1;
    return { kind: 'rate_limited', retryAfterSec, detail: desc || 'rate limited' };
  }
  // Telegram permanent errors — never retry, flag channel_health
  const permanentPatterns = [
    'chat not found', 'chat_not_found', 'bot was kicked', 'bot was blocked',
    'forbidden', 'user is deactivated', 'group chat was upgraded',
    'have no rights', 'not enough rights', 'message_id_invalid',
    'wrong file identifier', 'photo_invalid_dimensions',
  ];
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    if (permanentPatterns.some(p => desc.includes(p))) {
      return { kind: 'permanent', detail: desc };
    }
    // 400 with unknown desc — treat as permanent (bad payload) to avoid loop
    return { kind: 'permanent', detail: desc || `http ${status}` };
  }
  return { kind: 'transient', detail: desc || `http ${status}` };
}

function jitterMs(attempt: number): number {
  // 500ms, 1500ms, 4500ms ± 30%
  const base = 500 * Math.pow(3, attempt - 1);
  const j = base * 0.3;
  return Math.round(base + (Math.random() * 2 - 1) * j);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { text, log_id, override, channel: rawChannel, image_url, cta, reply_to_message_id } = await req.json();
    if (!text || typeof text !== 'string') {
      return new Response(JSON.stringify({ ok: false, error: 'text required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const channel: 'default' | 'public' | 'private' =
      rawChannel === 'public' || rawChannel === 'private' ? rawChannel : 'default';

    const token = Deno.env.get('TELEGRAM_HOLDERSINTEL_BOT_TOKEN');
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: 'no bot token' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Channel-health advisory: if we know a 429 Retry-After is still pending,
    // surface that to the caller. Fail-open: do NOT block — operator can override.
    const { data: health } = await supabase
      .from('channel_health')
      .select('retry_after_at, last_error, consecutive_failures')
      .eq('profile_kind', channel)
      .maybeSingle();
    const retryAfterAt = health?.retry_after_at ? new Date(health.retry_after_at) : null;
    const rateLimitedUntil = retryAfterAt && retryAfterAt > new Date() ? retryAfterAt : null;

    // Defense-in-depth: re-check eligibility from the log row.
    if (log_id && !override) {
      const { data: logRow } = await supabase
        .from('no_lube_post_log')
        .select('verdict_class, block_reason, posted')
        .eq('id', log_id)
        .maybeSingle();
      if (logRow && logRow.verdict_class !== 'healthy') {
        return new Response(JSON.stringify({
          ok: false,
          error: `blocked: ${logRow.block_reason || logRow.verdict_class}`,
          verdict_class: logRow.verdict_class,
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    // Resolve destination chat_id by channel.
    // - default → existing blackbox_channel_config.output_channel (backward compatible)
    // - public / private → no_lube_channel_profiles[kind].telegram_chat_id
    let chatId: string | null = null;
    if (channel === 'default') {
      const { data: cfg } = await supabase
        .from('blackbox_channel_config')
        .select('role, chat_id')
        .eq('role', 'output_channel')
        .maybeSingle();
      chatId = cfg?.chat_id ?? null;
    } else {
      const { data: prof } = await supabase
        .from('no_lube_channel_profiles')
        .select('telegram_chat_id')
        .eq('kind', channel)
        .maybeSingle();
      chatId = prof?.telegram_chat_id ?? null;
    }
    if (!chatId) {
      return new Response(JSON.stringify({
        ok: false,
        error: channel === 'default'
          ? 'output_channel not configured'
          : `No Lube ${channel} channel has no telegram_chat_id set`,
      }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // In-flight push lock — DB-enforced via partial unique index.
    // Stamp pushing_started_at before any Telegram call; clear on terminal outcome.
    if (log_id) {
      const { error: lockErr } = await supabase
        .from('no_lube_post_log')
        .update({ pushing_started_at: new Date().toISOString() })
        .eq('id', log_id)
        .is('posted', null);
      // The partial unique index makes concurrent writes for the same
      // (mint, channel, post_kind) collide — surface that as 409.
      if (lockErr && /no_lube_push_inflight_uniq/.test(String(lockErr.message))) {
        return new Response(JSON.stringify({
          ok: false, error: 'push already in flight for this (mint, channel)',
        }), { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const post = async (body: Record<string, unknown>) => {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, ok: r.ok, json: await r.json() };
    };

    const postPhoto = async (body: Record<string, unknown>) => {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, ok: r.ok, json: await r.json() };
    };

    // Build optional inline keyboard from cta = { text, url } | [{text,url},...]
    const ctaButtons = Array.isArray(cta) ? cta : (cta && cta.text && cta.url ? [cta] : null);
    const reply_markup = ctaButtons && ctaButtons.length
      ? { inline_keyboard: [ctaButtons.map((b: any) => ({ text: String(b.text), url: String(b.url) }))] }
      : undefined;

    const replyTo = (typeof reply_to_message_id === 'number' && Number.isFinite(reply_to_message_id))
      ? reply_to_message_id : undefined;

    // Build the two candidate payloads (markdown + plaintext fallback)
    const caption = image_url && text.length > 1024 ? text.slice(0, 1020) + '…' : text;
    const plainBody = (image_url ? caption : text).replace(/[*_`\[\]()]/g, '');
    const sendOnce = async (parseMode: 'Markdown' | null) => {
      if (image_url && typeof image_url === 'string') {
        return postPhoto({
          chat_id: chatId, photo: image_url,
          caption: parseMode ? caption : plainBody,
          ...(parseMode ? { parse_mode: parseMode } : {}),
          reply_markup, reply_to_message_id: replyTo, allow_sending_without_reply: true,
        });
      }
      return post({
        chat_id: chatId, text: parseMode ? text : plainBody,
        ...(parseMode ? { parse_mode: parseMode } : {}),
        disable_web_page_preview: true,
        reply_markup, reply_to_message_id: replyTo, allow_sending_without_reply: true,
      });
    };

    // Retry loop: up to 3 attempts. Markdown first; on parse failure flip to plain.
    let result: { status: number; ok: boolean; json: any } | null = null;
    let attempts = 0;
    let lastClass: ErrorClass | null = null;
    let lastDetail = '';
    let usePlain = false;
    for (attempts = 1; attempts <= 3; attempts++) {
      result = await sendOnce(usePlain ? null : 'Markdown');
      if (result.ok && result.json?.ok) break;
      const cls = classifyTgError(result.status, result.json);
      lastClass = cls.kind; lastDetail = cls.detail;
      const isMarkdownErr = /can't parse entities|parse_mode|markdown|byte offset/i.test(cls.detail);
      if (isMarkdownErr && !usePlain) {
        usePlain = true; // flip to plaintext, doesn't consume a real retry
        attempts--; continue;
      }
      if (cls.kind === 'permanent') break; // do not retry
      if (cls.kind === 'rate_limited') {
        const waitMs = Math.min((cls.retryAfterSec || 1) * 1000, 15000);
        // Persist retry_after on channel_health so other concurrent pushes back off
        await supabase.from('channel_health').upsert({
          profile_kind: channel,
          retry_after_at: new Date(Date.now() + waitMs).toISOString(),
          last_error: cls.detail, last_error_class: 'rate_limited',
        }, { onConflict: 'profile_kind' });
        if (attempts < 3) await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      // transient
      if (attempts < 3) await new Promise(r => setTimeout(r, jitterMs(attempts)));
    }

    const success = !!(result && result.ok && result.json?.ok);

    // Update channel_health
    if (success) {
      await supabase.from('channel_health').upsert({
        profile_kind: channel,
        last_ok_at: new Date().toISOString(),
        consecutive_failures: 0,
        total_successes: (health?.consecutive_failures !== undefined)
          ? undefined : undefined,
        last_error: null, last_error_class: null,
        retry_after_at: null,
      }, { onConflict: 'profile_kind' });
      // increment total_successes via raw RPC-less update
      await supabase.rpc('exec', {}).catch(() => {}); // no-op; counters via DB trigger could be added later
    } else if (result) {
      await supabase.from('channel_health').upsert({
        profile_kind: channel,
        last_error: `[${lastClass}] ${lastDetail}`.slice(0, 500),
        last_error_class: lastClass || 'transient',
        // fail-open: never set disabled_until (warn only)
      }, { onConflict: 'profile_kind' });
      // bump consecutive_failures atomically
      await supabase.rpc('bump_channel_failure', { p_kind: channel }).catch(() => {
        // RPC optional; tolerate missing without breaking push
      });
    }

    // Persist push attempt details on the log row regardless of outcome
    if (log_id) {
      const updates: Record<string, unknown> = {
        push_attempts: attempts,
        pushing_started_at: null, // release lock
      };
      if (success) {
        updates.posted = true;
        updates.posted_at = new Date().toISOString();
        updates.tg_message_id = result!.json.result?.message_id ?? null;
        updates.channel = channel;
        updates.image_url = image_url ?? null;
        updates.had_image = !!image_url;
        updates.last_push_error = null;
        updates.last_push_error_class = null;
      } else {
        updates.last_push_error = `[${lastClass}] ${lastDetail}`.slice(0, 500);
        updates.last_push_error_class = lastClass || 'transient';
      }
      try {
        await supabase.from('no_lube_post_log').update(updates).eq('id', log_id);
      } catch (e) {
        console.error('[no-lube-push] log update failed', e);
      }
    }

    if (!success) {
      return new Response(JSON.stringify({
        ok: false,
        error: result?.json || lastDetail,
        error_class: lastClass,
        attempts,
        rate_limited_until: rateLimitedUntil?.toISOString() || null,
      }), {
        status: lastClass === 'permanent' ? 422 : 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      message_id: result!.json.result?.message_id ?? null,
      chat_id: chatId,
      attempts,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('[no-lube-push] fatal', e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});