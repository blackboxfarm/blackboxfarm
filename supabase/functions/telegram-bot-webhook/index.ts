import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Keypair } from 'npm:@solana/web3.js@1.95.3';
import * as bs58 from 'https://esm.sh/bs58@5.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramUpdate {
  message?: {
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

type UserTier = 'free' | 'auth' | 'x_subscriber' | 'pro' | 'dev' | 'enterprise' | 'unlinked';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const telegramBotToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
  const encryptionKey = Deno.env.get('ENCRYPTION_KEY');
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const update: TelegramUpdate = await req.json();
    console.log('[TELEGRAM-BOT] Received update:', JSON.stringify(update));

    const message = update.message;
    if (!message?.text || !message.from) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    const chatId = message.chat.id;
    const telegramUserId = message.from.id.toString();
    const username = message.from.username || message.from.first_name || 'Unknown';
    const text = message.text.trim();
    const lowerText = text.toLowerCase();
    const parts = lowerText.split(' ');
    const command = parts[0];

    // === RESOLVE USER TIER ===
    const { tier, userId, linkData } = await resolveUserTier(supabase, telegramUserId);

    // === /start - Welcome & Registration Flow ===
    if (command === '/start') {
      if (tier === 'unlinked') {
        await sendTelegramMessage(telegramBotToken!, chatId,
          `🐋 *Welcome to BlackBox Farm Bot!*\n\n` +
          `To use this bot, you need a BlackBox Farm website account.\n\n` +
          `📋 *How to connect:*\n` +
          `1. Sign up at blackboxfarm.lovable.app\n` +
          `2. Go to Settings → Telegram Link\n` +
          `3. Copy your unique registration code\n` +
          `4. Send it here: e.g. \`BF-A3X9K2\`\n\n` +
          `Once linked, your bot access matches your subscription tier.`);
      } else {
        const tierLabel = getTierLabel(tier);
        await sendTelegramMessage(telegramBotToken!, chatId,
          `✅ *Welcome back!*\n\n` +
          `🏷️ Your tier: *${tierLabel}*\n\n` +
          `${getTierFeatureList(tier)}\n\n` +
          `Type /help to see available commands.`);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === Registration Code Handling (any message starting with BF-) ===
    if (text.toUpperCase().startsWith('BF-')) {
      const code = text.toUpperCase().trim();
      return await handleRegistration(supabase, telegramBotToken!, chatId, telegramUserId, username, code);
    }

    // === GATE: All other commands require linked account ===
    if (tier === 'unlinked') {
      await sendTelegramMessage(telegramBotToken!, chatId,
        `🔒 You need to link your BlackBox Farm account first.\n\n` +
        `Send /start for instructions.`);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === /help ===
    if (command === '/help') {
      await sendTelegramMessage(telegramBotToken!, chatId, getHelpMessage(tier));
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === /status ===
    if (command === '/status') {
      const tierLabel = getTierLabel(tier);
      await sendTelegramMessage(telegramBotToken!, chatId,
        `📊 *Your Status*\n\n` +
        `🏷️ Tier: *${tierLabel}*\n` +
        `🔗 Telegram: Linked ✅\n` +
        `${getTierFeatureList(tier)}`);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === /unlink ===
    if (command === '/unlink') {
      await supabase
        .from('telegram_link_codes')
        .update({ telegram_user_id: null, telegram_username: null, linked_at: null })
        .eq('telegram_user_id', telegramUserId);

      await sendTelegramMessage(telegramBotToken!, chatId,
        `✅ Account unlinked. Send /start to link again.`);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === TIER-GATED COMMANDS ===

    // /subscribe - email alerts (auth+ tier)
    if (command === '/subscribe') {
      const email = parts[1];
      if (!email || !email.includes('@')) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "📧 Subscribe to email alerts\n\nUsage: /subscribe your@email.com");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: existing } = await supabase
        .from('whale_user_wallets')
        .select('id')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (existing) {
        await supabase.from('whale_user_wallets')
          .update({ email, email_subscribed: true })
          .eq('telegram_user_id', telegramUserId);
      } else {
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        const encryptedPrivateKey = encryptData(privateKeyBase58, encryptionKey || 'default-key');

        await supabase.from('whale_user_wallets').insert({
          telegram_user_id: telegramUserId,
          telegram_username: username,
          email,
          email_subscribed: true,
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
        });
      }

      await sendTelegramMessage(telegramBotToken!, chatId,
        `✅ Email subscribed: ${email}\nTo unsubscribe: /unsubscribe`);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // /unsubscribe
    if (command === '/unsubscribe') {
      await supabase.from('whale_user_wallets')
        .update({ email_subscribed: false })
        .eq('telegram_user_id', telegramUserId);

      await sendTelegramMessage(telegramBotToken!, chatId,
        "✅ Email notifications disabled.\nTo re-subscribe: /subscribe your@email.com");
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === PRO+ COMMANDS (wallet, autobuy, etc.) ===
    const proTiers: UserTier[] = ['pro', 'dev', 'enterprise'];
    const isProPlus = proTiers.includes(tier);

    // /wallet
    if (command === '/wallet') {
      if (!isProPlus) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          `🔒 *Pro Feature*\n\nWallet management requires a Pro subscription ($9.99/mo).\n\nUpgrade at blackboxfarm.lovable.app/pricing`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('public_key, balance_sol, auto_buy_enabled, auto_buy_amount_sol, auto_buy_tokens')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (!wallet) {
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        const encryptedPrivateKey = encryptData(privateKeyBase58, encryptionKey || 'default-key');

        await supabase.from('whale_user_wallets').insert({
          telegram_user_id: telegramUserId,
          telegram_username: username,
          public_key: publicKey,
          encrypted_private_key: encryptedPrivateKey,
        });

        await sendTelegramMessage(telegramBotToken!, chatId,
          `🔐 New wallet created!\n\n📍 Address:\n\`${publicKey}\`\n\n💰 Balance: 0 SOL\n\nCommands: /balance, /autobuy, /export`);
      } else {
        const tokenList = (wallet.auto_buy_tokens || []).length > 0 
          ? (wallet.auto_buy_tokens as string[]).join(', ') 
          : 'All whale alerts';

        await sendTelegramMessage(telegramBotToken!, chatId,
          `🔐 Your Wallet\n\n📍 \`${wallet.public_key}\`\n💰 ${(wallet.balance_sol || 0).toFixed(4)} SOL\n🤖 Auto-Buy: ${wallet.auto_buy_enabled ? '✅ ON' : '❌ OFF'}\n💵 Amount: ${wallet.auto_buy_amount_sol || 0.25} SOL\n🎯 Tokens: ${tokenList}`);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // /balance
    if (command === '/balance') {
      if (!isProPlus) {
        await sendTelegramMessage(telegramBotToken!, chatId, `🔒 Pro feature. Upgrade at blackboxfarm.lovable.app/pricing`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('public_key, balance_sol')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId, "❌ No wallet found. Use /wallet to create one.");
      } else {
        await sendTelegramMessage(telegramBotToken!, chatId,
          `💰 Balance: ${(wallet.balance_sol || 0).toFixed(4)} SOL\n📍 \`${wallet.public_key}\``);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // /autobuy
    if (command === '/autobuy') {
      if (!isProPlus) {
        await sendTelegramMessage(telegramBotToken!, chatId, `🔒 Pro feature. Upgrade at blackboxfarm.lovable.app/pricing`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const setting = parts[1]?.toLowerCase();
      const amount = parseFloat(parts[2]) || 0.25;

      if (!setting || !['on', 'off'].includes(setting)) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "🤖 Auto-Buy\n\n/autobuy on 0.25 - Enable\n/autobuy off - Disable");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const isEnabled = setting === 'on';
      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('id, balance_sol')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId, "❌ Use /wallet first.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (isEnabled && (wallet.balance_sol || 0) < amount) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          `⚠️ Insufficient balance! Need ${amount} SOL, have ${(wallet.balance_sol || 0).toFixed(4)} SOL`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      await supabase.from('whale_user_wallets')
        .update({ auto_buy_enabled: isEnabled, auto_buy_amount_sol: amount })
        .eq('telegram_user_id', telegramUserId);

      await sendTelegramMessage(telegramBotToken!, chatId,
        isEnabled ? `✅ Auto-Buy ON (${amount} SOL/trade)` : `✅ Auto-Buy OFF`);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // /export
    if (command === '/export') {
      if (!isProPlus) {
        await sendTelegramMessage(telegramBotToken!, chatId, `🔒 Pro feature.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (chatId !== parseInt(telegramUserId)) {
        await sendTelegramMessage(telegramBotToken!, chatId, "⚠️ DM me directly to export your key.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('public_key, encrypted_private_key')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId, "❌ No wallet. Use /wallet first.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const privateKey = decryptData(wallet.encrypted_private_key, encryptionKey || 'default-key');
      await sendTelegramMessage(telegramBotToken!, chatId,
        `🔐 PRIVATE KEY\n⚠️ NEVER share!\n\nPub: \`${wallet.public_key}\`\nKey: \`${privateKey}\``);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // /addtoken
    if (command === '/addtoken') {
      if (!isProPlus) {
        await sendTelegramMessage(telegramBotToken!, chatId, `🔒 Pro feature.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const tokenMint = parts[1];
      if (!tokenMint || tokenMint.length < 30) {
        await sendTelegramMessage(telegramBotToken!, chatId, "Usage: /addtoken <mint_address>");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('id, auto_buy_tokens')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId, "❌ Use /wallet first.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const tokens = (wallet.auto_buy_tokens as string[]) || [];
      if (!tokens.includes(tokenMint)) {
        tokens.push(tokenMint);
        await supabase.from('whale_user_wallets')
          .update({ auto_buy_tokens: tokens })
          .eq('telegram_user_id', telegramUserId);
      }

      await sendTelegramMessage(telegramBotToken!, chatId,
        `✅ Token added! ${tokens.length} token(s) in list.`);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // /removetoken
    if (command === '/removetoken') {
      if (!isProPlus) {
        await sendTelegramMessage(telegramBotToken!, chatId, `🔒 Pro feature.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const tokenMint = parts[1];
      if (!tokenMint) {
        await sendTelegramMessage(telegramBotToken!, chatId, "Usage: /removetoken <mint> or /removetoken all");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('id, auto_buy_tokens')
        .eq('telegram_user_id', telegramUserId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId, "❌ Use /wallet first.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      let tokens = (wallet.auto_buy_tokens as string[]) || [];
      tokens = tokenMint === 'all' ? [] : tokens.filter(t => t !== tokenMint);

      await supabase.from('whale_user_wallets')
        .update({ auto_buy_tokens: tokens })
        .eq('telegram_user_id', telegramUserId);

      await sendTelegramMessage(telegramBotToken!, chatId,
        tokens.length === 0 ? "✅ Token list cleared." : `✅ ${tokens.length} token(s) remaining.`);
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }

    // === Unknown command - show help ===
    await sendTelegramMessage(telegramBotToken!, chatId, getHelpMessage(tier));
    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

  } catch (error) {
    console.error('[TELEGRAM-BOT] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});

// ========== HELPER FUNCTIONS ==========

async function resolveUserTier(
  supabase: any, 
  telegramUserId: string
): Promise<{ tier: UserTier; userId: string | null; linkData: any }> {
  // Look up telegram_link_codes for this telegram user
  const { data: linkData } = await supabase
    .from('telegram_link_codes')
    .select('user_id, link_code')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!linkData) {
    return { tier: 'unlinked', userId: null, linkData: null };
  }

  // Get user's active subscription tier
  const { data: subs } = await supabase
    .from('web_user_subscriptions')
    .select('tier_key, expires_at')
    .eq('user_id', linkData.user_id)
    .eq('is_active', true);

  if (!subs || subs.length === 0) {
    return { tier: 'auth', userId: linkData.user_id, linkData };
  }

  // Find best non-expired tier
  const tierOrder: Record<string, number> = {
    free: 0, auth: 1, x_subscriber: 2, pro: 3, dev: 4, enterprise: 5,
  };

  let bestTier: UserTier = 'auth';
  for (const sub of subs) {
    if (sub.expires_at && new Date(sub.expires_at) < new Date()) continue;
    const subTier = sub.tier_key as UserTier;
    if ((tierOrder[subTier] || 0) > (tierOrder[bestTier] || 0)) {
      bestTier = subTier;
    }
  }

  return { tier: bestTier, userId: linkData.user_id, linkData };
}

async function handleRegistration(
  supabase: any,
  botToken: string,
  chatId: number,
  telegramUserId: string,
  username: string,
  code: string
): Promise<Response> {
  // Check if already linked
  const { data: existingLink } = await supabase
    .from('telegram_link_codes')
    .select('user_id, telegram_user_id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (existingLink) {
    await sendTelegramMessage(botToken, chatId,
      `✅ You're already linked! Send /status to check your tier.\n\nTo relink with a different account, first send /unlink`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Look up the code
  const { data: codeData, error } = await supabase
    .from('telegram_link_codes')
    .select('id, user_id, telegram_user_id')
    .eq('link_code', code)
    .single();

  if (!codeData || error) {
    await sendTelegramMessage(botToken, chatId,
      `❌ Invalid registration code.\n\nCheck your code at blackboxfarm.lovable.app → Settings → Telegram Link`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (codeData.telegram_user_id) {
    await sendTelegramMessage(botToken, chatId,
      `⚠️ This code is already linked to another Telegram account.\n\nIf this is your code, unlink the other account from your website settings.`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Link the account
  const { error: updateError } = await supabase
    .from('telegram_link_codes')
    .update({
      telegram_user_id: telegramUserId,
      telegram_username: username,
      linked_at: new Date().toISOString(),
    })
    .eq('id', codeData.id);

  if (updateError) {
    console.error('[TELEGRAM-BOT] Link error:', updateError);
    await sendTelegramMessage(botToken, chatId, `❌ Failed to link. Please try again.`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Check their tier
  const { tier } = await resolveUserTier(supabase, telegramUserId);
  const tierLabel = getTierLabel(tier);

  await sendTelegramMessage(botToken, chatId,
    `🎉 *Account linked successfully!*\n\n` +
    `🏷️ Your tier: *${tierLabel}*\n\n` +
    `${getTierFeatureList(tier)}\n\n` +
    `Type /help to see your available commands.`);

  console.log(`[TELEGRAM-BOT] Linked ${username} (${telegramUserId}) to user ${codeData.user_id}, tier: ${tier}`);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function getTierLabel(tier: UserTier): string {
  const labels: Record<UserTier, string> = {
    unlinked: 'Not Linked',
    free: 'Free',
    auth: 'Free Account',
    x_subscriber: '𝕏 Subscriber',
    pro: 'Pro ⭐',
    dev: 'Developer 🛠️',
    enterprise: 'Enterprise 🏢',
  };
  return labels[tier] || tier;
}

function getTierFeatureList(tier: UserTier): string {
  const features: Record<UserTier, string> = {
    unlinked: '',
    free: '📢 Basic whale alerts',
    auth: '📢 Whale alerts\n📧 Email notifications',
    x_subscriber: '📢 Enhanced whale alerts\n📧 Email notifications\n📊 Detailed token info',
    pro: '📢 Priority whale alerts\n📧 Email notifications\n📊 Full token analysis\n🔐 Wallet & Auto-Buy\n💎 All premium features',
    dev: '📢 Priority whale alerts\n📧 Email notifications\n📊 Full token analysis\n🔐 Wallet & Auto-Buy\n💎 All premium features\n🔌 API Access',
    enterprise: '📢 Priority whale alerts\n📧 Email notifications\n📊 Full token analysis\n🔐 Wallet & Auto-Buy\n💎 All premium features\n🔌 API Access\n👥 Team features',
  };
  return features[tier] || '';
}

function getHelpMessage(tier: UserTier): string {
  let msg = "🐋 *BlackBox Farm Bot*\n\n";
  msg += "📋 *General:*\n";
  msg += "/start - Welcome\n";
  msg += "/status - Check your tier & status\n";
  msg += "/help - Show this menu\n";
  msg += "/unlink - Unlink your account\n\n";

  msg += "📧 *Notifications:*\n";
  msg += "/subscribe <email> - Email alerts\n";
  msg += "/unsubscribe - Disable email\n";

  const proTiers: UserTier[] = ['pro', 'dev', 'enterprise'];
  if (proTiers.includes(tier)) {
    msg += "\n🔐 *Wallet (Pro+):*\n";
    msg += "/wallet - View/create wallet\n";
    msg += "/balance - Check balance\n";
    msg += "/export - Export private key (DM)\n\n";
    msg += "🤖 *Auto-Buy (Pro+):*\n";
    msg += "/autobuy <on/off> <amount> - Configure\n";
    msg += "/addtoken <mint> - Add to watchlist\n";
    msg += "/removetoken <mint|all> - Remove\n";
  } else {
    msg += "\n🔒 *Pro Features:* Wallet, Auto-Buy\n";
    msg += "Upgrade → blackboxfarm.lovable.app/pricing";
  }

  return msg;
}

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

function encryptData(data: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key);
  const dataBytes = new TextEncoder().encode(data);
  const encrypted = new Uint8Array(dataBytes.length);
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted[i] = dataBytes[i] ^ keyBytes[i % keyBytes.length];
  }
  return btoa(String.fromCharCode(...encrypted));
}

function decryptData(encryptedData: string, key: string): string {
  const keyBytes = new TextEncoder().encode(key);
  const encrypted = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  const decrypted = new Uint8Array(encrypted.length);
  for (let i = 0; i < encrypted.length; i++) {
    decrypted[i] = encrypted[i] ^ keyBytes[i % keyBytes.length];
  }
  return new TextDecoder().decode(decrypted);
}
