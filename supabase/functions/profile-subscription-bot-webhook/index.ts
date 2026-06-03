// Per-profile Telegram bot webhook. Handles /buy, /renew, /status.
// URL pattern: /functions/v1/profile-subscription-bot-webhook?profile=<profile_key>
// Secret token (X-Telegram-Bot-Api-Secret-Token) = SHA-256 base64url("subscription-webhook:" + bot_token)
import { withRunLog } from '../_shared/run-logger.ts';
import {
  getSupabaseAdmin,
  getProfileBotToken,
  tgCall,
} from '../_shared/profile-subscription.ts';
import { captureAttribution, buildFooter, parseRefFromStart } from '../_shared/affiliate.ts';
import { touchContact, logContactEvent, setFirstReferrerTgId } from '../_shared/bot-contacts.ts';

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

const LUNA_DEFAULT_WELCOME =
  `🌙 <b>{name}</b>, dusk settles in.\n\n` +
  `I'm <b>Luna Dusk</b> — gatekeeper of the No Lube wire.\n\n` +
  `You're now in the public lounge. Watch the feed. When you're ready to step past the velvet rope into the private channel, DM me <code>/start</code> and I'll show you the tiers.`;

async function handleChatMember(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  botToken: string,
  profileKey: string,
  update: any,
) {
  const cm = update.chat_member;
  if (!cm) return;
  const chat = cm.chat;
  const user = cm.new_chat_member?.user || cm.from;
  if (!chat?.id || !user?.id) return;
  if (user.is_bot) return;

  const newStatus = cm.new_chat_member?.status;
  const oldStatus = cm.old_chat_member?.status;
  const joined =
    (newStatus === 'member' || newStatus === 'administrator') &&
    (oldStatus === 'left' || oldStatus === 'kicked' || !oldStatus);
  const left = newStatus === 'left' || newStatus === 'kicked' || newStatus === 'banned';

  const chatIdStr = String(chat.id);

  const { data: cfg } = await supabase
    .from('profile_subscription_configs')
    .select('public_chat_id,private_chat_id,public_welcome_copy,public_welcome_image_url,public_welcome_enabled,public_welcome_persona')
    .eq('profile_key', profileKey)
    .maybeSingle();
  if (!cfg) return;

  let channelKind: 'public' | 'private' | null = null;
  if (cfg.public_chat_id && String(cfg.public_chat_id) === chatIdStr) channelKind = 'public';
  else if (cfg.private_chat_id && String(cfg.private_chat_id) === chatIdStr) channelKind = 'private';
  if (!channelKind) return;

  const nowIso = new Date().toISOString();

  if (joined) {
    // Upsert member, only mark joined_at on a brand-new row (the upsert below
    // won't overwrite an existing joined_at because we route via update-vs-insert).
    const { data: existing } = await supabase
      .from('nolube_channel_members')
      .select('id,left_at')
      .eq('chat_id', chatIdStr)
      .eq('telegram_user_id', user.id)
      .maybeSingle();

    if (!existing) {
      await supabase.from('nolube_channel_members').insert({
        profile_key: profileKey,
        channel_kind: channelKind,
        chat_id: chatIdStr,
        telegram_user_id: user.id,
        username: user.username ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        joined_at: nowIso,
        is_seed: false,
        source: 'chat_member_event',
        last_seen_at: nowIso,
      });
    } else {
      // Re-join: clear left_at, refresh joined_at if previously left.
      await supabase.from('nolube_channel_members').update({
        username: user.username ?? null,
        first_name: user.first_name ?? null,
        last_name: user.last_name ?? null,
        left_at: null,
        ...(existing.left_at ? { joined_at: nowIso } : {}),
        last_seen_at: nowIso,
        source: 'chat_member_event',
      }).eq('id', existing.id);
    }

    // Luna welcome — public channel only, when enabled.
    if (channelKind === 'public' && cfg.public_welcome_enabled) {
      try {
        const firstName = user.first_name || user.username || 'friend';
        const copy = (cfg.public_welcome_copy ?? '').trim() || LUNA_DEFAULT_WELCOME;
        const text = copy.replaceAll('{name}', firstName).replaceAll('{username}', user.username ? '@' + user.username : firstName);
        if (cfg.public_welcome_image_url) {
          await tgCall(botToken, 'sendPhoto', {
            chat_id: chat.id,
            photo: cfg.public_welcome_image_url,
            caption: text,
            parse_mode: 'HTML',
          });
        } else {
          await tgCall(botToken, 'sendMessage', {
            chat_id: chat.id,
            text,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          });
        }
        await supabase
          .from('nolube_channel_members')
          .update({ welcomed_at: nowIso })
          .eq('chat_id', chatIdStr)
          .eq('telegram_user_id', user.id);
      } catch (e) {
        console.warn('[bot-webhook] Luna welcome failed:', e);
      }
    }
  } else if (left) {
    await supabase
      .from('nolube_channel_members')
      .update({ left_at: nowIso, last_seen_at: nowIso })
      .eq('chat_id', chatIdStr)
      .eq('telegram_user_id', user.id);
  }
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
  const provided = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!safeEq(provided, expected)) {
    console.warn(`[bot-webhook] secret mismatch profile=${profileKey} hasHeader=${!!provided} headerLen=${provided?.length ?? 0} expectedLen=${expected.length} — re-run setup to re-register webhook.`);
    return new Response('Unauthorized', { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const update = await req.json();

  // ---------- chat_member: channel join/leave tracking + Luna welcome ----------
  if (update.chat_member) {
    try { await handleChatMember(supabase, botToken!, profileKey!, update); }
    catch (e) { console.error('[bot-webhook] chat_member handler failed:', e); }
    return new Response(JSON.stringify({ ok: true }));
  }
  if (update.my_chat_member) {
    // ignored; we only care about user joins/leaves
    return new Response(JSON.stringify({ ok: true }));
  }

  async function send(t: string, kb?: any) {
    let footer = '';
    try { footer = await buildFooter(profileKey!, fromId!, null); } catch { /* non-fatal */ }
    await tgCall(botToken!, 'sendMessage', {
      chat_id: chatId,
      text: t + footer,
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

    try { await touchContact(profileKey, cb.from); } catch (e) { console.warn('[webhook] touchContact(cb) failed', e); }

    if (data.startsWith('buy:')) {
      const months = parseInt(data.slice(4), 10);
      try { await logContactEvent(profileKey, cb.from.id, 'quote_issued', { months }); } catch { /* non-fatal */ }
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

  // ---- CRM: touch contact + log command ----
  const refOnStart = cmd === '/start' ? parseRefFromStart(text) : null;
  try {
    await touchContact(profileKey, message.from, { referralCode: refOnStart });
    if (isCmd) await logContactEvent(profileKey, fromId, 'command', { cmd, text: text.slice(0, 256) });
    if (refOnStart) await logContactEvent(profileKey, fromId, 'ref_link_tapped', { code: refOnStart });
  } catch (e) { console.warn('[webhook] CRM touch failed', e); }

  // ---- /stop opt-out hygiene ----
  if (cmd === '/stop' || cmd === '/unsubscribe') {
    try {
      await supabase.from('profile_bot_contacts')
        .update({ opted_out_broadcasts: true, opted_out_at: new Date().toISOString() })
        .eq('profile_key', profileKey).eq('telegram_user_id', fromId);
      await logContactEvent(profileKey, fromId, 'opted_out', {});
    } catch (e) { console.warn('[webhook] opt-out failed', e); }
    await send('🔕 You won\'t receive broadcast messages anymore. Send /start to re-enable or interact with the bot any time.');
    return new Response(JSON.stringify({ ok: true }));
  }

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
    // Capture referral code if present on /start
    if (cmd === '/start') {
      const ref = parseRefFromStart(text);
      if (ref) {
        try {
          const r = await captureAttribution(profileKey, fromId, ref);
          if (r.outcome === 'attributed' && r.referrerTelegramId) {
            try { await setFirstReferrerTgId(profileKey, fromId, r.referrerTelegramId); } catch { /* non-fatal */ }
          }
          if (r.outcome === 'inactive') {
            await tgCall(botToken!, 'sendMessage', {
              chat_id: chatId,
              text: `⚠️ That referral code (<code>${ref}</code>) is currently inactive — the referrer's subscription has lapsed. You can still subscribe below; ask them to renew to reactivate their code.`,
              parse_mode: 'HTML',
            });
          } else if (r.outcome === 'unknown') {
            await tgCall(botToken!, 'sendMessage', {
              chat_id: chatId,
              text: `⚠️ Referral code <code>${ref}</code> not recognized. No worries — pick a plan below.`,
              parse_mode: 'HTML',
            });
          }
        } catch (e) { console.warn('[webhook] ref capture failed', e); }
      }
    }
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