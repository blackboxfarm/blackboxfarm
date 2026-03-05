import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const BOT_TOKEN = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

/** Send a message back to the user */
async function sendMessage(chatId: number, text: string, parseMode = "Markdown") {
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode }),
  });
  if (!res.ok) {
    console.error("[bot] sendMessage failed:", await res.text());
  }
}

/** Look up a linked user by telegram_user_id */
async function getLinkedUser(telegramUserId: string) {
  const { data } = await supabase
    .from("telegram_link_codes")
    .select("user_id, link_code, telegram_username, linked_at")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data;
}

/** Get user's active subscription tier */
async function getUserTier(userId: string) {
  const { data } = await supabase.rpc("get_user_tier", { p_user_id: userId });
  return data || "free";
}

/** Handle /start command */
async function handleStart(chatId: number, telegramUserId: string, username: string | null) {
  const linked = await getLinkedUser(telegramUserId);

  if (linked) {
    const tier = await getUserTier(linked.user_id);
    await sendMessage(chatId,
      `✅ *Welcome back!*\n\n` +
      `Your account is already linked.\n` +
      `📊 Current tier: *${tier.toUpperCase()}*\n\n` +
      `Use /status to check your subscription details.\n` +
      `Use /help to see available commands.`
    );
    return;
  }

  await sendMessage(chatId,
    `👋 *Welcome to HoldersIntel Bot!*\n\n` +
    `This bot delivers tier-specific alerts and reports from [BlackBox Farm](https://blackbox.farm).\n\n` +
    `To get started, link your website account:\n` +
    `1️⃣ Log in at blackbox.farm\n` +
    `2️⃣ Go to Settings → Telegram Link\n` +
    `3️⃣ Copy your registration code (e.g. \`BF-A3X9K2\`)\n` +
    `4️⃣ Send it here: \`/register YOUR-CODE\`\n\n` +
    `Example: \`/register BF-A3X9K2\``
  );
}

/** Handle /register <code> command */
async function handleRegister(chatId: number, telegramUserId: string, username: string | null, args: string) {
  const code = args.trim().toUpperCase();

  if (!code || code.length < 4) {
    await sendMessage(chatId,
      `❌ Please provide your registration code.\n\n` +
      `Usage: \`/register BF-XXXXXX\`\n\n` +
      `Get your code from blackbox.farm → Settings → Telegram Link.`
    );
    return;
  }

  // Check if this telegram user is already linked
  const existing = await getLinkedUser(telegramUserId);
  if (existing) {
    const tier = await getUserTier(existing.user_id);
    await sendMessage(chatId,
      `✅ Your Telegram is already linked!\n\n` +
      `📊 Tier: *${tier.toUpperCase()}*\n` +
      `🔗 Code: \`${existing.link_code}\`\n\n` +
      `Use /status for full details.`
    );
    return;
  }

  // Look up the code
  const { data: codeRecord, error } = await supabase
    .from("telegram_link_codes")
    .select("user_id, link_code, telegram_user_id")
    .eq("link_code", code)
    .maybeSingle();

  if (error || !codeRecord) {
    await sendMessage(chatId,
      `❌ *Invalid code.*\n\n` +
      `Make sure you copied it exactly from your Settings page.\n` +
      `Codes look like: \`BF-XXXXXX\``
    );
    return;
  }

  // Check if code is already claimed by someone else
  if (codeRecord.telegram_user_id) {
    await sendMessage(chatId,
      `⚠️ This code has already been linked to another Telegram account.\n\n` +
      `If this is your code, unlink it from Settings first, then try again.`
    );
    return;
  }

  // Link the account
  const { error: updateError } = await supabase
    .from("telegram_link_codes")
    .update({
      telegram_user_id: telegramUserId,
      telegram_username: username,
      linked_at: new Date().toISOString(),
    })
    .eq("link_code", code);

  if (updateError) {
    console.error("[bot] Link failed:", updateError);
    await sendMessage(chatId, `❌ Something went wrong. Please try again later.`);
    return;
  }

  const tier = await getUserTier(codeRecord.user_id);

  await sendMessage(chatId,
    `🎉 *Account linked successfully!*\n\n` +
    `📊 Your tier: *${tier.toUpperCase()}*\n` +
    `🔗 Code: \`${code}\`\n\n` +
    `You'll now receive notifications based on your subscription level.\n\n` +
    `Use /status anytime to check your account.\n` +
    `Use /help to see all commands.`
  );

  console.log(`[bot] Linked TG user ${telegramUserId} (@${username}) to web user ${codeRecord.user_id}`);
}

/** Handle /status command */
async function handleStatus(chatId: number, telegramUserId: string) {
  const linked = await getLinkedUser(telegramUserId);

  if (!linked) {
    await sendMessage(chatId,
      `🔒 *Account not linked.*\n\n` +
      `Use /register to link your BlackBox Farm account first.`
    );
    return;
  }

  const tier = await getUserTier(linked.user_id);

  const tierEmoji: Record<string, string> = {
    free: "🆓", auth: "🔓", x_subscriber: "𝕏",
    pro: "⭐", dev: "🛠", enterprise: "🏢",
  };

  await sendMessage(chatId,
    `📊 *Your HoldersIntel Status*\n\n` +
    `${tierEmoji[tier] || "📊"} Tier: *${tier.toUpperCase()}*\n` +
    `👤 Telegram: @${linked.telegram_username || "unknown"}\n` +
    `🔗 Linked: ${linked.linked_at ? new Date(linked.linked_at).toLocaleDateString() : "Unknown"}\n\n` +
    `🌐 Manage subscription: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)`
  );
}

/** Handle /help command */
async function handleHelp(chatId: number) {
  await sendMessage(chatId,
    `📖 *HoldersIntel Bot Commands*\n\n` +
    `/start — Welcome & setup info\n` +
    `/register \`CODE\` — Link your BlackBox Farm account\n` +
    `/status — Check your subscription tier\n` +
    `/help — Show this message\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `🔔 *Notifications*\n` +
    `Once linked, you'll receive alerts based on your tier:\n\n` +
    `🆓 *Free* — Basic alerts\n` +
    `𝕏 *X Subscriber* — Enhanced alerts + first buyer intel\n` +
    `⭐ *Pro* — Full reports + key drivers\n` +
    `🛠 *Dev* — Everything + API notifications\n\n` +
    `Upgrade: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)`
  );
}

serve(async (req) => {
  // Handle webhook setup endpoint
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("setup") === "true") {
      const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/holdersintel-bot-webhook`;
      const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response("OK");
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const update = await req.json();
    const message = update.message;

    if (!message?.text || !message.from) {
      return new Response("OK");
    }

    const chatId = message.chat.id;
    const telegramUserId = String(message.from.id);
    const username = message.from.username || null;
    const text = message.text.trim();

    // Parse command and arguments
    const [rawCommand, ...argParts] = text.split(/\s+/);
    const command = rawCommand.toLowerCase().replace(/@\w+$/, ""); // strip @botname
    const args = argParts.join(" ");

    switch (command) {
      case "/start":
        await handleStart(chatId, telegramUserId, username);
        break;
      case "/register":
        await handleRegister(chatId, telegramUserId, username, args);
        break;
      case "/status":
        await handleStatus(chatId, telegramUserId);
        break;
      case "/help":
        await handleHelp(chatId);
        break;
      default:
        // Check if the message looks like a registration code (BF-XXXXXX)
        if (/^BF-[A-Z0-9]{6}$/i.test(text)) {
          await handleRegister(chatId, telegramUserId, username, text);
        }
        // Silently ignore other messages
        break;
    }
  } catch (err) {
    console.error("[bot] Webhook error:", err);
  }

  return new Response("OK");
});
