import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Handle /addme command
    if (text === '/addme' || text === '/start') {
      // Find all alert configs and add this user to pending
      const { data: configs } = await supabase
        .from('mega_whale_alert_config')
        .select('id, user_id, pending_telegram_ids, additional_telegram_ids')
        .eq('notify_telegram', true);

      if (!configs || configs.length === 0) {
        await sendTelegramMessage(telegramBotToken!, chatId, 
          "No active notification systems found. Please try again later.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Add to first config's pending list (you can modify this logic)
      const config = configs[0];
      const pending = (config.pending_telegram_ids as any[]) || [];
      const approved = config.additional_telegram_ids || [];

      // Check if already approved
      if (approved.includes(userId) || config.user_id === userId) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "✅ You're already approved to receive alerts!");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Check if already pending
      if (pending.some((p: any) => p.user_id === userId)) {
        await sendTelegramMessage(telegramBotToken!, chatId,
          "⏳ Your request is already pending approval. Please wait for the admin to approve you.");
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // Add to pending
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
    else if (text === '/removeme') {
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
    else if (text === '/status') {
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

    else {
      await sendTelegramMessage(telegramBotToken!, chatId,
        "🐋 MEGA WHALE Alert Bot\n\nCommands:\n/addme - Request to receive alerts\n/removeme - Unsubscribe from alerts\n/status - Check your subscription status");
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
    body: JSON.stringify({ chat_id: chatId, text })
  });
}
