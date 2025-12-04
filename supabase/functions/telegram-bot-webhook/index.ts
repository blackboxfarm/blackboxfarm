import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Keypair } from 'https://esm.sh/@solana/web3.js@1.95.3';
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
    const userId = message.from.id.toString();
    const username = message.from.username || message.from.first_name || 'Unknown';
    const text = message.text.toLowerCase().trim();
    const parts = text.split(' ');
    const command = parts[0];

    // Handle /addme command
    if (command === '/addme' || command === '/start') {
      const { data: configs } = await supabase
        .from('mega_whale_alert_config')
        .select('id, user_id, pending_telegram_ids, additional_telegram_ids')
        .eq('notify_telegram', true);

      if (!configs || configs.length === 0) {
        await sendTelegramMessage(telegramBotToken!, chatId, 
          "No active notification systems found. Please try again later.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const config = configs[0];
      const pending = (config.pending_telegram_ids as any[]) || [];
      const approved = config.additional_telegram_ids || [];

      if (approved.includes(userId) || config.user_id === userId) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "✅ You're already approved to receive alerts!");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (pending.some((p: any) => p.user_id === userId)) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "⏳ Your request is already pending approval. Please wait for the admin to approve you.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const newPending = [...pending, {
        user_id: userId,
        username: username,
        requested_at: new Date().toISOString()
      }];

      await supabase
        .from('mega_whale_alert_config')
        .update({ pending_telegram_ids: newPending })
        .eq('id', config.id);

      await sendTelegramMessage(telegramBotToken!, chatId,
        `📨 Your request has been submitted!\n\nUser ID: ${userId}\nUsername: @${username}\n\nPlease wait for admin approval. You'll receive alerts once approved.`);
      
      console.log(`[TELEGRAM-BOT] Added pending request from ${username} (${userId})`);
    }

    // Handle /removeme command
    else if (command === '/removeme') {
      const { data: configs } = await supabase
        .from('mega_whale_alert_config')
        .select('id, pending_telegram_ids, additional_telegram_ids');

      for (const config of configs || []) {
        const pending = (config.pending_telegram_ids as any[]) || [];
        const approved = config.additional_telegram_ids || [];

        const newPending = pending.filter((p: any) => p.user_id !== userId);
        const newApproved = approved.filter((id: string) => id !== userId);

        if (newPending.length !== pending.length || newApproved.length !== approved.length) {
          await supabase
            .from('mega_whale_alert_config')
            .update({ 
              pending_telegram_ids: newPending,
              additional_telegram_ids: newApproved 
            })
            .eq('id', config.id);
        }
      }

      await sendTelegramMessage(telegramBotToken!, chatId,
        "✅ You've been removed from the notification list. Send /addme to request access again.");
      
      console.log(`[TELEGRAM-BOT] Removed ${username} (${userId}) from lists`);
    }

    // Handle /status command
    else if (command === '/status') {
      const { data: configs } = await supabase
        .from('mega_whale_alert_config')
        .select('pending_telegram_ids, additional_telegram_ids');

      let status = 'not_found';
      for (const config of configs || []) {
        const pending = (config.pending_telegram_ids as any[]) || [];
        const approved = config.additional_telegram_ids || [];
        
        if (approved.includes(userId)) {
          status = 'approved';
          break;
        }
        if (pending.some((p: any) => p.user_id === userId)) {
          status = 'pending';
        }
      }

      const messages: Record<string, string> = {
        approved: "✅ You're approved to receive MEGA WHALE alerts!",
        pending: "⏳ Your request is pending admin approval.",
        not_found: "❌ You're not on any notification list. Send /addme to request access."
      };

      await sendTelegramMessage(telegramBotToken!, chatId, messages[status]);
    }

    // Handle /subscribe command (email subscription)
    else if (command === '/subscribe') {
      const email = parts[1];
      
      if (!email || !email.includes('@')) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "📧 Subscribe to email alerts\n\nUsage: /subscribe your@email.com\n\nExample: /subscribe john@gmail.com");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Update or create user wallet record with email
      const { data: existing } = await supabase
        .from('whale_user_wallets')
        .select('id')
        .eq('telegram_user_id', userId)
        .single();

      if (existing) {
        await supabase
          .from('whale_user_wallets')
          .update({ email, email_subscribed: true })
          .eq('telegram_user_id', userId);
      } else {
        // Create a new wallet for this user
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        
        // Simple encryption (XOR with key)
        const encryptedPrivateKey = encryptData(privateKeyBase58, encryptionKey || 'default-key');

        await supabase
          .from('whale_user_wallets')
          .insert({
            telegram_user_id: userId,
            telegram_username: username,
            email,
            email_subscribed: true,
            public_key: publicKey,
            encrypted_private_key: encryptedPrivateKey
          });
      }

      await sendTelegramMessage(telegramBotToken!, chatId,
        `✅ Email subscribed!\n\nYou'll receive MEGA WHALE alerts at:\n${email}\n\nTo unsubscribe: /unsubscribe`);
      
      console.log(`[TELEGRAM-BOT] ${username} subscribed email: ${email}`);
    }

    // Handle /unsubscribe command
    else if (command === '/unsubscribe') {
      await supabase
        .from('whale_user_wallets')
        .update({ email_subscribed: false })
        .eq('telegram_user_id', userId);

      await sendTelegramMessage(telegramBotToken!, chatId,
        "✅ Email notifications disabled.\n\nYou'll still receive Telegram alerts if approved.\nTo re-subscribe: /subscribe your@email.com");
      
      console.log(`[TELEGRAM-BOT] ${username} unsubscribed from email`);
    }

    // Handle /wallet command
    else if (command === '/wallet') {
      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('public_key, balance_sol, auto_buy_enabled, auto_buy_amount_sol, auto_buy_tokens')
        .eq('telegram_user_id', userId)
        .single();

      if (!wallet) {
        // Create new wallet
        const keypair = Keypair.generate();
        const publicKey = keypair.publicKey.toBase58();
        const privateKeyBase58 = bs58.encode(keypair.secretKey);
        const encryptedPrivateKey = encryptData(privateKeyBase58, encryptionKey || 'default-key');

        await supabase
          .from('whale_user_wallets')
          .insert({
            telegram_user_id: userId,
            telegram_username: username,
            public_key: publicKey,
            encrypted_private_key: encryptedPrivateKey
          });

        await sendTelegramMessage(telegramBotToken!, chatId,
          `🔐 New wallet created!\n\n` +
          `📍 Address:\n\`${publicKey}\`\n\n` +
          `💰 Balance: 0 SOL\n\n` +
          `Fund this wallet to enable auto-buy.\n\n` +
          `Commands:\n` +
          `/balance - Check balance\n` +
          `/autobuy <on/off> <sol_amount> - Configure auto-buy\n` +
          `/export - Export private key (DM only)`);
      } else {
        const tokenList = (wallet.auto_buy_tokens || []).length > 0 
          ? (wallet.auto_buy_tokens as string[]).join(', ') 
          : 'All whale alerts';

        await sendTelegramMessage(telegramBotToken!, chatId,
          `🔐 Your Whale Wallet\n\n` +
          `📍 Address:\n\`${wallet.public_key}\`\n\n` +
          `💰 Balance: ${(wallet.balance_sol || 0).toFixed(4)} SOL\n\n` +
          `🤖 Auto-Buy: ${wallet.auto_buy_enabled ? '✅ ON' : '❌ OFF'}\n` +
          `💵 Amount: ${wallet.auto_buy_amount_sol || 0.25} SOL\n` +
          `🎯 Tokens: ${tokenList}`);
      }
    }

    // Handle /balance command
    else if (command === '/balance') {
      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('public_key, balance_sol')
        .eq('telegram_user_id', userId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "❌ No wallet found. Use /wallet to create one.");
      } else {
        await sendTelegramMessage(telegramBotToken!, chatId,
          `💰 Wallet Balance\n\n` +
          `Address: \`${wallet.public_key}\`\n` +
          `Balance: ${(wallet.balance_sol || 0).toFixed(4)} SOL`);
      }
    }

    // Handle /autobuy command
    else if (command === '/autobuy') {
      const setting = parts[1]?.toLowerCase();
      const amount = parseFloat(parts[2]) || 0.25;

      if (!setting || !['on', 'off'].includes(setting)) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "🤖 Auto-Buy Configuration\n\n" +
          "Usage:\n" +
          "/autobuy on 0.25 - Enable with 0.25 SOL per buy\n" +
          "/autobuy off - Disable auto-buy\n\n" +
          "When enabled, your wallet will automatically buy tokens when whale alerts are detected.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const isEnabled = setting === 'on';

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('id, balance_sol')
        .eq('telegram_user_id', userId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "❌ No wallet found. Use /wallet to create one first.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      if (isEnabled && (wallet.balance_sol || 0) < amount) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          `⚠️ Insufficient balance!\n\n` +
          `Required: ${amount} SOL\n` +
          `Available: ${(wallet.balance_sol || 0).toFixed(4)} SOL\n\n` +
          `Please fund your wallet first.`);
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      await supabase
        .from('whale_user_wallets')
        .update({ 
          auto_buy_enabled: isEnabled,
          auto_buy_amount_sol: amount
        })
        .eq('telegram_user_id', userId);

      await sendTelegramMessage(telegramBotToken!, chatId,
        isEnabled 
          ? `✅ Auto-Buy ENABLED\n\nAmount: ${amount} SOL per trade\n\nYour wallet will automatically buy when whale alerts are detected.`
          : `✅ Auto-Buy DISABLED\n\nYou will only receive notifications.`);
      
      console.log(`[TELEGRAM-BOT] ${username} set auto-buy: ${setting}, ${amount} SOL`);
    }

    // Handle /export command
    else if (command === '/export') {
      // Only allow in private chat
      if (chatId !== parseInt(userId)) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "⚠️ For security, please DM me directly to export your private key.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('public_key, encrypted_private_key')
        .eq('telegram_user_id', userId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "❌ No wallet found. Use /wallet to create one.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const privateKey = decryptData(wallet.encrypted_private_key, encryptionKey || 'default-key');

      await sendTelegramMessage(telegramBotToken!, chatId,
        `🔐 PRIVATE KEY EXPORT\n\n` +
        `⚠️ NEVER share this with anyone!\n\n` +
        `Public Key:\n\`${wallet.public_key}\`\n\n` +
        `Private Key:\n\`${privateKey}\`\n\n` +
        `Import this into Phantom or Solflare wallet.`);
      
      console.log(`[TELEGRAM-BOT] ${username} exported private key`);
    }

    // Handle /addtoken command
    else if (command === '/addtoken') {
      const tokenMint = parts[1];

      if (!tokenMint || tokenMint.length < 30) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "🎯 Add Token to Auto-Buy List\n\n" +
          "Usage: /addtoken <token_mint_address>\n\n" +
          "Only alerts for this token will trigger auto-buy.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('id, auto_buy_tokens')
        .eq('telegram_user_id', userId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "❌ No wallet found. Use /wallet to create one first.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const tokens = (wallet.auto_buy_tokens as string[]) || [];
      if (!tokens.includes(tokenMint)) {
        tokens.push(tokenMint);
        await supabase
          .from('whale_user_wallets')
          .update({ auto_buy_tokens: tokens })
          .eq('telegram_user_id', userId);
      }

      await sendTelegramMessage(telegramBotToken!, chatId,
        `✅ Token added to auto-buy list!\n\n${tokenMint.slice(0, 8)}...${tokenMint.slice(-6)}\n\nYou now have ${tokens.length} token(s) in your list.`);
    }

    // Handle /removetoken command
    else if (command === '/removetoken') {
      const tokenMint = parts[1];

      if (!tokenMint) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "🗑️ Remove Token from Auto-Buy List\n\n" +
          "Usage: /removetoken <token_mint_address>\n" +
          "Or: /removetoken all - Clear all tokens");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      const { data: wallet } = await supabase
        .from('whale_user_wallets')
        .select('id, auto_buy_tokens')
        .eq('telegram_user_id', userId)
        .single();

      if (!wallet) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "❌ No wallet found. Use /wallet to create one first.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      let tokens = (wallet.auto_buy_tokens as string[]) || [];
      
      if (tokenMint.toLowerCase() === 'all') {
        tokens = [];
      } else {
        tokens = tokens.filter(t => t !== tokenMint);
      }

      await supabase
        .from('whale_user_wallets')
        .update({ auto_buy_tokens: tokens })
        .eq('telegram_user_id', userId);

      await sendTelegramMessage(telegramBotToken!, chatId,
        tokens.length === 0
          ? "✅ Token list cleared! Auto-buy will trigger on all whale alerts."
          : `✅ Token removed! ${tokens.length} token(s) remaining.`);
    }

    // Handle unknown commands
    else {
      await sendTelegramMessage(telegramBotToken!, chatId,
        "🐋 MEGA WHALE Alert Bot\n\n" +
        "📢 Notification Commands:\n" +
        "/addme - Request to receive alerts\n" +
        "/removeme - Unsubscribe from alerts\n" +
        "/status - Check your subscription\n" +
        "/subscribe <email> - Subscribe to email alerts\n" +
        "/unsubscribe - Disable email alerts\n\n" +
        "🔐 Wallet Commands:\n" +
        "/wallet - View/create your wallet\n" +
        "/balance - Check wallet balance\n" +
        "/export - Export private key (DM only)\n\n" +
        "🤖 Auto-Buy Commands:\n" +
        "/autobuy <on/off> <amount> - Configure auto-buy\n" +
        "/addtoken <mint> - Add token to auto-buy list\n" +
        "/removetoken <mint> - Remove token from list");
    }

    return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });

  } catch (error) {
    console.error('[TELEGRAM-BOT] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
});

async function sendTelegramMessage(token: string, chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
  });
}

// Simple encryption/decryption functions
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
