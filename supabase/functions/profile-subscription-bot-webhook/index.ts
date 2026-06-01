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
  if (!profileKey) return new Response('profile required', { status: 400 });

  const botToken = await getProfileBotToken(profileKey);
  if (!botToken) return new Response('No bot configured', { status: 404 });

  const expected = await deriveSecret(botToken);
  if (!safeEq(req.headers.get('X-Telegram-Bot-Api-Secret-Token'), expected)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const update = await req.json();
  const message = update.message ?? update.edited_message;
  const text: string = message?.text ?? '';
  const fromId: number | undefined = message?.from?.id;
  const chatId: number | undefined = message?.chat?.id;
  const username: string | undefined = message?.from?.username;
  const language: string | undefined = message?.from?.language_code;

  if (!fromId || !chatId || !text.startsWith('/')) {
    return new Response(JSON.stringify({ ok: true, ignored: true }));
  }

  const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, '');

  async function send(t: string, kb?: any) {
    await tgCall(botToken!, 'sendMessage', {
      chat_id: chatId,
      text: t,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(kb ? { reply_markup: kb } : {}),
    });
  }

  if (cmd === '/start' || cmd === '/buy' || cmd === '/renew') {
    const { data: tiers } = await supabase
      .from('profile_subscription_tiers')
      .select('*')
      .eq('profile_key', profileKey)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    const { data: cfg } = await supabase
      .from('profile_subscription_configs').select('display_name,base_currency').eq('profile_key', profileKey).maybeSingle();
    if (!tiers?.length) {
      await send('No subscription tiers configured yet. Check back soon.');
      return new Response(JSON.stringify({ ok: true }));
    }
    const buttons = tiers.map(t => [{
      text: `${t.tier_months}mo — ${cfg?.base_currency ?? 'USD'} ${Number(t.price_fiat).toFixed(2)}${Number(t.discount_pct) > 0 ? `  (save ${Number(t.discount_pct)}%)` : ''}`,
      callback_data: `buy:${t.tier_months}`,
    }]);
    await send(`💎 <b>${cfg?.display_name ?? profileKey} — Subscription</b>\nPick a plan:`, { inline_keyboard: buttons });
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
      await send(`⏳ Pending payment to <code>${sub.payment_wallet_pubkey}</code>\nAmount: <b>${sub.quoted_sol} SOL</b>`);
    } else {
      await send(`✅ Active until <b>${new Date(sub.expires_at).toUTCString()}</b>`);
    }
    return new Response(JSON.stringify({ ok: true }));
  }

  // Callback queries (button taps)
  if (update.callback_query) {
    const cb = update.callback_query;
    const data: string = cb.data ?? '';
    if (data.startsWith('buy:')) {
      const months = parseInt(data.slice(4), 10);
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
      await tgCall(botToken!, 'answerCallbackQuery', { callback_query_id: cb.id, text: j.error ? `Error: ${j.error}` : 'Quote sent ✅' });
    }
    return new Response(JSON.stringify({ ok: true }));
  }

  return new Response(JSON.stringify({ ok: true, ignored: true }));
}));