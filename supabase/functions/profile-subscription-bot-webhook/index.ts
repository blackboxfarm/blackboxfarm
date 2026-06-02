// Per-profile Telegram bot webhook. Handles /buy, /renew, /status.
// URL pattern: /functions/v1/profile-subscription-bot-webhook?profile=<profile_key>
// Secret token (X-Telegram-Bot-Api-Secret-Token) = SHA-256 base64url("subscription-webhook:" + bot_token)
import { withRunLog } from '../_shared/run-logger.ts';
import {
  getSupabaseAdmin,
  getProfileBotToken,
  tgCall,
} from '../_shared/profile-subscription.ts';

async function deriveSecret(botToken: string): Promise<string> {
  const data = new TextEncoder().encode(`subscription-webhook:${botToken}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function safeEq(a: string | null, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(withRunLog('profile-subscription-bot-webhook', async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const url = new URL(req.url);
  const profileKey = url.searchParams.get('profile');
  // Telegram retries forever on 4xx. Swallow misrouted updates with 200.
  if (!profileKey) return new Response(JSON.stringify({ ok: true, ignored: 'no-profile' }), { status: 200 });

  const botToken = await getProfileBotToken(profileKey);
  if (!botToken) return new Response(JSON.stringify({ ok: true, ignored: 'no-bot' }), { status: 200 });

  const expected = await deriveSecret(botToken);
  if (!safeEq(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const update = await req.json();

  async function send(t: string, kb?: any) {
    await tgCall(botToken!, 'sendMessage', {
      chat_id: chatId,
      text: t,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(kb ? { reply_markup: kb } : {}),
    });
  }

  async function buildTierSheet() {
    const { data: tiers } = await supabase
      .from('profile_subscription_tiers')
      .select('*')
      .eq('profile_key', profileKey)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    const { data: cfg } = await supabase
      .from('profile_subscription_configs')
      .select('display_name,base_currency,welcome_copy,welcome_image_url')
      .eq('profile_key', profileKey)
      .maybeSingle();
    return { tiers: tiers ?? [], cfg };
  }

  function tierKeyboard(tiers: any[], baseCurrency: string) {
    return {
      inline_keyboard: tiers.map((t) => [{
        text: `${t.tier_months} mo  —  ${baseCurrency} ${Number(t.price_fiat).toFixed(2)}${Number(t.discount_pct) > 0 ? `  (save ${Number(t.discount_pct)}%)` : ''}`,
        callback_data: `buy:${t.tier_months}`,
      }]),
    };
  }

  // ---------- Callback queries (button taps) — handle FIRST ----------
  if (update.callback_query) {
    const cb = update.callback_query;
    const data: string = cb.data ?? '';
    const cbChatId = cb.message?.chat?.id;
    const cbMessageId = cb.message?.message_id;

    if (data.startsWith('buy:')) {
      const months = parseInt(data.slice(4), 10);
      let okText = 'Quote sent — check your DMs ✅';
      let errText: string | null = null;
      try {
        const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/profile-subscription-quote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            profile_key: profileKey,
            tier_months: months,
            telegram_user_id: cb.from.id,
            telegram_username: cb.from.username,
            language: cb.from.language_code,
            send_dm: true,
          }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || j?.error) errText = j?.error ?? `HTTP ${r.status}`;
      } catch (e) {
        errText = e instanceof Error ? e.message : String(e);
      }
      await tgCall(botToken!, 'answerCallbackQuery', {
        callback_query_id: cb.id,
        text: errText ? `Error: ${errText}` : okText,
        show_alert: !!errText,
      });
      if (!errText && cbChatId && cbMessageId) {
        try {
          await tgCall(botToken!, 'editMessageText', {
            chat_id: cbChatId,
            message_id: cbMessageId,
            text: `✅ <b>${months}-month plan selected.</b>\n\nI just sent the SOL payment instructions to your DMs. Once the funds land you'll be auto-added to the private channel.`,
            parse_mode: 'HTML',
          });
        } catch { /* ignore edit failures */ }
      }
    }
    return new Response(JSON.stringify({ ok: true }));
  }

  // ---------- Plain messages / commands ----------
  const message = update.message ?? update.edited_message;
  const text: string = message?.text ?? '';
  const fromId: number | undefined = message?.from?.id;
  const chatId: number | undefined = message?.chat?.id;

  if (!fromId || !chatId) {
    return new Response(JSON.stringify({ ok: true, ignored: 'no-message' }));
  }

  // Any non-command DM defaults to showing the tier sheet so users aren't stuck.
  const isCmd = text.startsWith('/');
  const cmd = isCmd ? text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '') : '/start';

  if (cmd === '/help') {
    await send(
      `<b>Commands</b>\n` +
      `/start — show plans\n` +
      `/buy — pick a plan and pay in SOL\n` +
      `/renew — extend your access\n` +
      `/status — check your subscription`
    );
    return new Response(JSON.stringify({ ok: true }));
  }

  if (cmd === '/start' || cmd === '/buy' || cmd === '/renew') {
    const { tiers, cfg } = await buildTierSheet();
    if (!tiers.length) {
      await send('No subscription tiers configured yet. Check back soon.');
      return new Response(JSON.stringify({ ok: true }));
    }
    const baseCurrency = cfg?.base_currency ?? 'USD';
    const title = cfg?.display_name ?? profileKey;
    const welcome = (cfg?.welcome_copy ?? '').trim();
    const intro =
      cmd === '/start'
        ? `👋 <b>Welcome to ${title}</b>\n\n${welcome ? welcome + '\n\n' : ''}Pick a plan below. You'll get a unique SOL deposit address — pay it and you're auto-added to the private channel.`
        : `💎 <b>${title}</b>\n\nPick a plan:`;
    // Send a header image first if configured (only on /start)
    if (cmd === '/start' && cfg?.welcome_image_url) {
      try {
        await tgCall(botToken!, 'sendPhoto', {
          chat_id: chatId,
          photo: cfg.welcome_image_url,
        });
      } catch { /* non-fatal */ }
    }
    await send(intro, tierKeyboard(tiers, baseCurrency));
    return new Response(JSON.stringify({ ok: true }));
  }

  if (cmd === '/status') {
    const { data: sub } = await supabase
      .from('profile_subscriptions')
      .select('*')
      .eq('profile_key', profileKey)
      .eq('telegram_user_id', fromId)
      .in('status', ['paid', 'pending'])
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();
    if (!sub) { await send('No active subscription. Send <code>/buy</code> to start.'); }
    else if (sub.status === 'pending') {
      await send(`⏳ Pending payment\nSend <b>${sub.quoted_sol} SOL</b> to:\n<code>${sub.payment_wallet_pubkey}</code>\n\nQuote expires: ${new Date(sub.quote_window_expires_at).toUTCString()}`);
    } else {
      await send(`✅ Active until <b>${new Date(sub.expires_at).toUTCString()}</b>`);
    }
    return new Response(JSON.stringify({ ok: true }));
  }

  // Unknown command in a private chat → re-show tiers as a graceful fallback.
  if (!isCmd || cmd === '/plans' || cmd === '/tiers') {
    const { tiers, cfg } = await buildTierSheet();
    if (tiers.length) {
      await send(`💎 <b>${cfg?.display_name ?? profileKey}</b>\nPick a plan:`, tierKeyboard(tiers, cfg?.base_currency ?? 'USD'));
    }
  }
  return new Response(JSON.stringify({ ok: true, ignored: true }));
}));