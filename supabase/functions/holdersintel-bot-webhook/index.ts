import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withRunLog } from "../_shared/run-logger.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { detectTokenPhase, contextualizeDevRep, type TokenPhase } from "../_shared/token-phase.ts";
import { getHealthMode } from "../_shared/health-mode.ts";
import { meshFeed } from "../_shared/mesh-feeder.ts";
import { getTokenWarnings, writeEarlyWarnings, generateWarningsFromHoldersData } from "../_shared/early-warning-writer.ts";
import { sanitizeTelegramInput, isInputSafeToProcess } from "../_shared/telegram-input-sanitizer.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Helper: Generate a one-time tokenized action link ───
async function generateActionLink(userId: string, actionType: string, payload: Record<string, unknown> = {}): Promise<string> {
  try {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

    await supabase.from('one_time_action_tokens').insert({
      token,
      user_id: userId,
      action_type: actionType,
      payload,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    return `https://blackbox.farm/action?t=${token}`;
  } catch (e) {
    console.error('Failed to generate action link:', e);
    return 'https://blackbox.farm/auth';
  }
}

// ─── Tier hierarchy (higher = more access) ───
const TIER_RANK: Record<string, number> = {
  free: 0, auth: 1, x_subscriber: 2, pro: 3, dev: 4, enterprise: 5,
};

// ─── Rate limits per tier: lookups per hour ───
const RATE_LIMITS: Record<string, number> = {
  auth: 3, x_subscriber: 10, pro: 25, dev: 50, enterprise: 100,
};

// ─── Tagline appended to every analytical reply ───
const TAGLINE = `\n\n🌐 [blackbox.farm/tgbot](https://blackbox.farm/tgbot)`;

// ─── Default admin config — single source of truth for all installations ───
const DEFAULT_ADMIN_CONFIG = {
  delay_ms: 3000,
  verbose: false,
  admin_only_commands: false,
  enabled_tiers: [] as string[],
  dev_wallet_alerts: false,
};

// Helper: merge DB config with defaults so missing fields always have a value
function resolveAdminConfig(raw: any): typeof DEFAULT_ADMIN_CONFIG {
  return { ...DEFAULT_ADMIN_CONFIG, ...(raw || {}) };
}
// ─── AI Verdict System (retained internally, removed from UI) ───

const VERDICT_SYSTEM_PROMPT = `You are a crypto trading analyst for Solana memecoins. Given token metrics, produce a single actionable trading verdict.

CRITICAL RULES:
- You MUST respect lifecycle phase caps:
  • on_curve: NEVER recommend "BUY DEEP LONG" or "BUY MEDIUM SHORT". Max is "WATCH CURVE — SMALL SHORT".
  • fresh (<48h): NEVER recommend "BUY DEEP LONG". Max is "BUY MEDIUM SHORT".
  • established (2-14d): Full range, but "BUY DEEP LONG" requires exceptional metrics (momentum≥75, health≥70).
  • mature (>14d): Full range with standard thresholds.
- Be concise. Description = 1 sentence. Reasoning = 2-3 sentences max.
- Focus on what the DATA shows, not speculation.
- If volume is collapsing or health is low, lean bearish regardless of momentum.
- A token with high momentum but low health likely has concentrated holders dumping — flag this.

VERDICT OPTIONS (pick exactly one):
🟢 BUY DEEP LONG — Full conviction, hold position
🟢 BUY MEDIUM SHORT — Medium position, 2x target then reassess
🟡 BUY SMALL SHORT — Speculative small amount, quick flip
🟡 WATCH CURVE — SMALL SHORT — On bonding curve, tiny speculative bet
🟡 WATCH CURVE — Observe only, don't commit
🟡 WATCH — Monitor for breakout
🔴 HOLD / AVOID — Skip this token`;

function buildVerdictPrompt(data: {
  tokenSymbol: string;
  tokenName: string;
  ca: string;
  momentumScore: number;
  healthScore: number;
  phase: TokenPhase | null;
  mcap: number | null;
  metrics: Record<string, any> | null;
  signals: Array<{ type: string; signal: string }>;
  holdersData: { totalHolders: number | null; top10Pct: number | null; baglessCount: number | null };
}): string {
  const lines: string[] = [
    `TOKEN: ${data.tokenSymbol} (${data.tokenName})`,
    `PHASE: ${data.phase || 'unknown'}`,
    `MOMENTUM SCORE: ${data.momentumScore}/100`,
    `HEALTH SCORE: ${data.healthScore}/100`,
  ];
  if (data.mcap) lines.push(`MARKET CAP: $${data.mcap.toLocaleString()}`);
  if (data.metrics) {
    if (data.metrics.price_change_5m != null) lines.push(`5m Price Change: ${data.metrics.price_change_5m.toFixed(1)}%`);
    if (data.metrics.price_change_1h != null) lines.push(`1h Price Change: ${data.metrics.price_change_1h.toFixed(1)}%`);
    if (data.metrics.volume_5m != null) lines.push(`5m Volume: $${data.metrics.volume_5m.toLocaleString()}`);
    if (data.metrics.buy_sell_ratio_5m != null) lines.push(`Buy/Sell Ratio 5m: ${data.metrics.buy_sell_ratio_5m.toFixed(2)}x`);
    if (data.metrics.liquidity_usd != null) lines.push(`Liquidity: $${data.metrics.liquidity_usd.toLocaleString()}`);
  }
  if (data.holdersData.totalHolders) lines.push(`Total Holders: ${data.holdersData.totalHolders}`);
  if (data.holdersData.top10Pct != null) lines.push(`Top 10% Concentration: ${data.holdersData.top10Pct.toFixed(1)}%`);
  if (data.holdersData.baglessCount != null) lines.push(`Bagless (exited) holders: ${data.holdersData.baglessCount}`);
  if (data.signals.length) {
    lines.push(`SIGNALS: ${data.signals.map(s => `[${s.type}] ${s.signal}`).join('; ')}`);
  }
  return lines.join('\n');
}

function fallbackVerdict(momentumScore: number, healthScore: number, phase: TokenPhase | null): { verdict: string; emoji: string; description: string } {
  if (phase === 'on_curve') {
    if (healthScore < 20) return { verdict: 'DEAD — AVOID', emoji: '💀', description: 'Dead on bonding curve. Never bonded, abandoned token.' };
    if (healthScore < 40 && momentumScore < 20) return { verdict: 'SLEEPER — CAUTION', emoji: '😴', description: 'Sleeper on curve. Faint activity, likely abandoned but not confirmed dead.' };
    if (healthScore < 30) return { verdict: 'DEAD — AVOID', emoji: '💀', description: 'Dead on bonding curve. Minimal activity, never bonded.' };
    if (momentumScore >= 55 && healthScore >= 40) return { verdict: 'WATCH CURVE — SMALL SHORT', emoji: '🟡', description: 'Active on bonding curve. Speculative small amount only.' };
    if (momentumScore >= 40) return { verdict: 'WATCH CURVE', emoji: '🟡', description: 'On curve with some momentum. Observe.' };
    return { verdict: 'HOLD / AVOID', emoji: '🔴', description: 'Weak signals on bonding curve.' };
  }
  if (phase === 'newborn' || phase === 'early' || phase === 'adolescent') {
    if (momentumScore >= 70 && healthScore >= 60) return { verdict: 'BUY MEDIUM SHORT', emoji: '🟢', description: 'Strong early signals. Medium position, stay nimble.' };
    if (momentumScore >= 55 && healthScore >= 40) return { verdict: 'BUY SMALL SHORT', emoji: '🟡', description: 'Decent fresh launch. Small speculative position.' };
    if (momentumScore >= 40) return { verdict: 'WATCH', emoji: '🟡', description: 'Fresh token, monitor for breakout.' };
    return { verdict: 'HOLD / AVOID', emoji: '🔴', description: 'Weak signals on fresh token.' };
  }
  if (phase === 'established' || phase === 'growth') {
    if (momentumScore >= 75 && healthScore >= 70) return { verdict: 'BUY DEEP LONG', emoji: '🟢', description: 'Strong chart + healthy holders. Full position.' };
    if (momentumScore >= 55 && healthScore >= 40) return { verdict: 'BUY MEDIUM SHORT', emoji: '🟢', description: 'Decent momentum on established token.' };
    if (momentumScore >= 40) return { verdict: 'BUY SMALL SHORT', emoji: '🟡', description: 'Speculative. Small amount.' };
    return { verdict: 'HOLD / AVOID', emoji: '🔴', description: 'Weak signals.' };
  }
  if (momentumScore >= 70 && healthScore >= 60) return { verdict: 'BUY DEEP LONG', emoji: '🟢', description: 'Strong chart, healthy holders on mature token.' };
  if (momentumScore >= 55 && healthScore >= 40) return { verdict: 'BUY MEDIUM SHORT', emoji: '🟢', description: 'Decent momentum. Target 2x.' };
  if (momentumScore >= 40) return { verdict: 'BUY SMALL SHORT', emoji: '🟡', description: 'Speculative. Small amount.' };
  return { verdict: 'HOLD / AVOID', emoji: '🔴', description: 'Weak signals. Skip.' };
}

// ─── Helpers ───

const TELEGRAM_MAX_MESSAGE_LENGTH = 3800;

function splitMessage(text: string, maxLength = TELEGRAM_MAX_MESSAGE_LENGTH): string[] {
  if (text.length <= maxLength) return [text];

  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const segment = current ? `\n${line}` : line;

    if ((current + segment).length <= maxLength) {
      current += segment;
      continue;
    }

    if (current) chunks.push(current);

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    for (let i = 0; i < line.length; i += maxLength) {
      chunks.push(line.slice(i, i + maxLength));
    }
    current = "";
  }

  if (current) chunks.push(current);
  return chunks.length > 0 ? chunks : [text.slice(0, maxLength)];
}

function toPlainText(text: string): string {
  return text
    .replace(/\\_/g, "_")
    .replace(/[`*_~]/g, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1: $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function sendMessage(chatId: number, text: string, parseMode = "Markdown", replyToMessageId?: number) {
  const chunks = splitMessage(text);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const body: Record<string, unknown> = {
      chat_id: chatId,
      text: chunk,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    };

    if (replyToMessageId && i === 0) body.reply_to_message_id = replyToMessageId;

    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) continue;

    const errorText = await res.text();
    console.error(
      `[bot] sendMessage failed (chat:${chatId}, parse:${parseMode}, chunk:${i + 1}/${chunks.length}, len:${chunk.length}):`,
      errorText
    );

    const shouldRetryWithoutMarkdown = parseMode === "Markdown" && /can't parse entities|parse entities/i.test(errorText);
    if (!shouldRetryWithoutMarkdown) continue;

    const fallbackBody: Record<string, unknown> = {
      chat_id: chatId,
      text: toPlainText(chunk),
      disable_web_page_preview: true,
    };

    if (replyToMessageId && i === 0) fallbackBody.reply_to_message_id = replyToMessageId;

    const fallbackRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fallbackBody),
    });

    if (!fallbackRes.ok) {
      console.error(`[bot] fallback plain-text send failed (chat:${chatId}):`, await fallbackRes.text());
    } else {
      console.log(`[bot] recovered from Markdown parse error via plain-text fallback (chat:${chatId})`);
    }
  }
}

/** For advanced commands in group chats: reply "check DMs" in group, send report via DM */
async function groupDMRedirect(
  groupChatId: number,
  telegramUserId: string,
  commandName: string,
  messageId?: number
): Promise<boolean> {
  // Send DM-redirect notice in the group (reply to the user's message)
  await sendMessage(
    groupChatId,
    `📬 *${commandName}* report sent to your DMs!\n_Open a private chat with me for the full analysis._`,
    "Markdown",
    messageId
  );
  return true;
}

async function getLinkedUser(telegramUserId: string) {
  const { data } = await supabase
    .from("telegram_link_codes")
    .select("user_id, link_code, telegram_username, linked_at")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data;
}

// ─── Check if a user's web account is suspended (banned) ───
async function isUserSuspended(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    if (!data?.user) return false;
    const bannedUntil = data.user.banned_until;
    if (!bannedUntil) return false;
    return new Date(bannedUntil) > new Date();
  } catch {
    return false;
  }
}

// ─── Check if user is unverified and past 24h (for gentle nudge) ───
async function isUserPast24hUnverified(userId: string): Promise<boolean> {
  try {
    const { data: authData } = await supabase.auth.admin.getUserById(userId);
    if (!authData?.user) return false;
    const createdAt = new Date(authData.user.created_at);
    const hoursSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) return false;

    // Check if they have a verified email
    const { data: verified } = await supabase
      .from('email_verifications')
      .select('id')
      .eq('user_id', userId)
      .eq('verification_type', 'signup')
      .not('verified_at', 'is', null)
      .limit(1);

    if (verified && verified.length > 0) return false;

    // Check if they have a pending verification at all
    const { data: pending } = await supabase
      .from('email_verifications')
      .select('id')
      .eq('user_id', userId)
      .eq('verification_type', 'signup')
      .limit(1);

    return (pending && pending.length > 0) || false;
  } catch {
    return false;
  }
}

// ─── Get or create a reactivation token for a suspended user ───
async function getOrCreateReactivationToken(userId: string): Promise<string | null> {
  try {
    // Check for existing non-expired reactivation token
    const { data: existing } = await supabase
      .from('email_verifications')
      .select('verification_token, expires_at')
      .eq('user_id', userId)
      .eq('verification_type', 'reactivation')
      .is('verified_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (existing && new Date(existing.expires_at) > new Date()) {
      return existing.verification_token;
    }

    // Create a new one
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    await supabase.from('email_verifications').insert({
      user_id: userId,
      verification_token: token,
      verification_type: 'reactivation',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });

    return token;
  } catch (err) {
    console.error('[bot] getOrCreateReactivationToken error:', err);
    return null;
  }
}

async function getUserTier(userId: string): Promise<string> {
  const { data } = await supabase.rpc("get_user_tier", { p_user_id: userId });
  return data || "auth";
}

function hasTier(userTier: string, requiredTier: string): boolean {
  return (TIER_RANK[userTier] ?? 0) >= (TIER_RANK[requiredTier] ?? 99);
}

async function checkRateLimit(telegramUserId: string, command: string, tier: string): Promise<boolean> {
  const limit = RATE_LIMITS[tier] ?? 3;
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
  const { count } = await supabase
    .from("telegram_bot_usage")
    .select("id", { count: "exact", head: true })
    .eq("telegram_user_id", telegramUserId)
    .eq("command", command)
    .gte("created_at", oneHourAgo);
  return (count ?? 0) < limit;
}

async function logUsage(telegramUserId: string, command: string, tokenMint?: string) {
  await supabase.from("telegram_bot_usage").insert({
    telegram_user_id: telegramUserId,
    command,
    token_mint: tokenMint || null,
  });
}

/** Call an internal edge function with a 25s timeout to prevent webhook hangs */
async function invokeFunction(fnName: string, body: Record<string, unknown>, timeoutMs = 25000): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[bot] ${fnName} error (${res.status}):`, errText);
      return null;
    }
    return res.json();
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      console.error(`[bot] ${fnName} TIMEOUT after ${timeoutMs}ms — aborting to prevent webhook hang`);
    } else {
      console.error(`[bot] ${fnName} fetch error:`, err.message);
    }
    return null;
  }
}

// ─── Gate check: returns tier string or sends denial message ───
async function gateCheck(
  chatId: number,
  telegramUserId: string,
  requiredTier: string,
  commandName: string
): Promise<{ tier: string; userId: string } | null> {
  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId,
      `🔒 *Account not linked.*\n\nUse /register to link your BlackBox Farm account first.`
    );
    return null;
  }
  const tier = await getUserTier(linked.user_id);
  if (!hasTier(tier, requiredTier)) {
    const tierNames: Record<string, string> = {
      auth: "Authenticated", x_subscriber: "X Subscriber", pro: "Pro", dev: "Developer",
    };
    await sendMessage(chatId,
      `🔒 *${tierNames[requiredTier] || requiredTier}* tier required for \`${commandName}\`.\n\n` +
      `Your tier: *${tier.toUpperCase()}*\n` +
      `Upgrade: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)`
    );
    return null;
  }
  const allowed = await checkRateLimit(telegramUserId, commandName, tier);
  if (!allowed) {
    await sendMessage(chatId,
      `⏳ *Rate limit reached.*\n\nYou've used all your \`${commandName}\` lookups this hour.\n` +
      `Limit: ${RATE_LIMITS[tier] ?? 3}/hr for *${tier.toUpperCase()}* tier.\n\n` +
      `Upgrade for more: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)`
    );
    return null;
  }
  return { tier, userId: linked.user_id };
}

function extractCA(args: string): string | null {
  const ca = args.trim();
  if (!ca || ca.length < 30) return null;
  return ca;
}

// ─── ASCII bar helper ───
function bar(pct: number, width = 10): string {
  const filled = Math.round((pct / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// ─── Format helpers ───
function fmtMcap(mcap: number | null): string | null {
  if (!mcap) return null;
  return mcap >= 1_000_000 ? `$${(mcap / 1_000_000).toFixed(2)}M` : `$${(mcap / 1000).toFixed(1)}K`;
}

function tokenHeaderLine(symbol: string | null, name: string | null, mcap: number | null): string {
  const label = symbol && name ? `${symbol} (${name})` : symbol ? `${symbol}` : "Unknown Token";
  const mcapStr = fmtMcap(mcap);
  return `🪙 *${label}*${mcapStr ? ` — MCap: *${mcapStr}*` : ''}`;
}

// ─── Check if group chat has an installed (non-kicked) channel installation ───
async function isGroupActivated(chatId: number): Promise<boolean> {
  const { data } = await supabase
    .from("channel_installations")
    .select("id")
    .eq("chat_id", chatId)
    .eq("kicked", false)
    .maybeSingle();
  return !!data;
}

// ─── Solana address detection regex ───
const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function looksLikeSolanaCA(text: string): string | null {
  const trimmed = text.trim();
  // Only if the entire message is a single CA (no command prefix)
  if (SOLANA_ADDR_RE.test(trimmed)) return trimmed;
  return null;
}

// ════════════════════════════════════════
// COMMAND HANDLERS
// ════════════════════════════════════════

async function handleStart(chatId: number, telegramUserId: string, username: string | null) {
  const linked = await getLinkedUser(telegramUserId);
  if (linked) {
    const tier = await getUserTier(linked.user_id);
    await sendMessage(chatId,
      `✅ *Welcome back!*\n\n` +
      `Your account is linked. Tier: *${tier.toUpperCase()}*\n\n` +
      `Use /help to see available commands.`
    );
    return;
  }
  await sendMessage(chatId,
    `👋 *Welcome to HoldersIntel Bot!*\n\n` +
    `This bot delivers tier-specific analysis from [BlackBox Farm](https://blackbox.farm).\n\n` +
    `To get started, link your account:\n` +
    `1️⃣ Log in at blackbox.farm\n` +
    `2️⃣ Go to Settings → Telegram Link\n` +
    `3️⃣ Copy your code (e.g. \`BF-A3X9K2\`)\n` +
    `4️⃣ Send: \`/register YOUR-CODE\`\n\n` +
    `Example: \`/register BF-A3X9K2\``
  );
}

async function handleRegister(chatId: number, telegramUserId: string, username: string | null, args: string) {
  const code = args.trim().toUpperCase();
  if (!code || code.length < 4) {
    await sendMessage(chatId,
      `❌ Usage: \`/register BF-XXXXXX\`\n\nGet your code from blackbox.farm → Settings → Telegram Link.`
    );
    return;
  }

  const existing = await getLinkedUser(telegramUserId);
  if (existing) {
    const tier = await getUserTier(existing.user_id);
    await sendMessage(chatId,
      `✅ Already linked! Tier: *${tier.toUpperCase()}*\nUse /status for details.`
    );
    return;
  }

  const { data: codeRecord, error } = await supabase
    .from("telegram_link_codes")
    .select("user_id, link_code, telegram_user_id")
    .eq("link_code", code)
    .maybeSingle();

  if (error || !codeRecord) {
    await sendMessage(chatId, `❌ *Invalid code.* Make sure you copied it exactly.\nCodes look like: \`BF-XXXXXX\``);
    return;
  }
  if (codeRecord.telegram_user_id) {
    await sendMessage(chatId, `⚠️ This code is already linked to another account. Unlink it from Settings first.`);
    return;
  }

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
    `🎉 *Account linked!*\n\nTier: *${tier.toUpperCase()}* | Code: \`${code}\`\n\nUse /help to see your commands.`
  );
  console.log(`[bot] Linked TG ${telegramUserId} (@${username}) → ${codeRecord.user_id}`);
}

async function handleStatus(chatId: number, telegramUserId: string) {
  try {
    const linked = await getLinkedUser(telegramUserId);
    if (!linked) {
      await sendMessage(chatId, `🔒 Not linked. Use /register first.`, "HTML");
      return;
    }
    let tier = "auth";
    try {
      tier = await getUserTier(linked.user_id);
    } catch (e) {
      console.error("[bot] getUserTier failed:", e);
    }
    const emojiMap: Record<string, string> = {
      free: "🆓", auth: "🔓", x_subscriber: "𝕏", pro: "⭐", dev: "🛠", enterprise: "🏢",
    };
    const tgUser = linked.telegram_username || "unknown";
    const linkedDate = linked.linked_at ? new Date(linked.linked_at).toLocaleDateString() : "Unknown";
    const tierEmoji = emojiMap[tier] || "📊";
    const rateLimit = RATE_LIMITS[tier] ?? 3;

    const msg = `📊 <b>Your Status</b>\n\n` +
      `${tierEmoji} Tier: <b>${(tier || "auth").toUpperCase()}</b>\n` +
      `👤 Telegram: ${tgUser}\n` +
      `🔗 Linked: ${linkedDate}\n` +
      `📈 Rate limit: ${rateLimit} lookups/hr\n\n` +
      `🌐 Manage: blackbox.farm/subscriptions`;

    await sendMessage(chatId, msg, "HTML");
  } catch (err) {
    console.error("[bot] handleStatus error:", err);
    await sendMessage(chatId, "❌ Error fetching status. Please try again.", "HTML");
  }
}

async function handleHelp(chatId: number, telegramUserId: string) {
  const linked = await getLinkedUser(telegramUserId);
  let tier = "free";
  if (linked) tier = await getUserTier(linked.user_id);

  const unlocked = "✅";
  const locked = "🔒";
  const check = (req: string) => hasTier(tier, req) ? unlocked : locked;

  let cmds = `🔍 *HoldersIntel — Your Edge in Solana Intel*\n\n` +
    `*🌐 General — Free for Everyone*\n` +
    `${unlocked} /start — Get started & connect your account\n` +
    `${unlocked} /register \`CODE\` — Link your BlackBox Farm account\n` +
    `${unlocked} /status — View your tier, usage & limits\n` +
    `${unlocked} /help — This command reference\n` +
    `${unlocked} /payment (/pay) — 💰 Yearly Pro subscription via SOL (1 SOL/yr)\n\n`;

  cmds += `*🔬 Core Analysis — Auth ★ = just signup free online*\n` +
    `_The essentials — know what you're buying before you ape._\n` +
    `${check("auth")} /risk (/r) \`CA\` — 360° risk score: rug probability, liquidity traps & holder red flags\n` +
    `${check("auth")} /holders \`CA\` — Full holder breakdown: whales, retail spread & distribution health\n` +
    `${check("auth")} /concentration \`CA\` — Top wallet % tiers: see exactly who controls the supply\n` +
    `${check("auth")} /dev (/d) \`CA\` — Dev identity mesh: socials, past launches & reputation score\n` +
    `${check("auth")} /ca \`CA\` — Quick-glance holder profile for any token\n` +
    `${check("auth")} /quick (/q) \`CA\` — Instant snapshot: holder count, MCap & key metrics in seconds\n` +
    `${check("auth")} /ai \`CA\` — AI-narrated analysis: plain-English verdict on any token\n`;
  if (!hasTier(tier, "auth")) {
    cmds += `  _↑ Free — just create an account at blackbox.farm_\n`;
  }
  cmds += `\n`;

  cmds += `*⚡ Advanced Intel — X Subscriber ★★*\n` +
    `_Deeper signals that separate smart money from exit liquidity._\n` +
    `${check("x_subscriber")} /momentum (/m) \`CA\` — Volume surge detection, price velocity & trend momentum scoring\n` +
    `${check("x_subscriber")} /insiders (/i) \`CA\` — Bundled wallet detection: spot coordinated buys before they dump\n` +
    `${check("x_subscriber")} /compare (/cmp) \`CA CA\` — Head-to-head token showdown: risk, holders & momentum side-by-side\n`;
  if (!hasTier(tier, "x_subscriber")) {
    cmds += `  _↑ Unlock for just $3.99/mo — follow @HoldersIntel on X_\n`;
  }
  cmds += `\n`;

  cmds += `*🧠 Pro Intelligence — Pro ★★★*\n` +
    `_Institutional-grade tools. See what nobody else can._\n` +
    `${check("pro")} /oracle (/o) \`CA\` — Deep dev reputation mesh: funding chains, wallet genealogy & cross-token links\n` +
    `${check("pro")} /wallet (/w) \`ADDR\` — Full wallet forensics: trading patterns, PnL history & behavioral profiling\n`;
  if (!hasTier(tier, "pro")) {
    cmds += `  _↑ Go Pro at $9.99/mo — the alpha edge that pays for itself_\n`;
  }
  cmds += `\n`;

  cmds += `*📢 Group & Channel Features*\n` +
    `_Supercharge your community with real-time intel feeds._\n\n` +
    `${unlocked} *Auto-Scan* — Paste any Solana CA in an activated group and get an instant risk snippet automatically\n` +
    `${unlocked} /alerts — Toggle real-time alert feeds for your group\n` +
    `  _Available feeds: 🔔 dex · 🪙 mint · 🚨 rug · 🐋 whale · 📰 news · 👑 kol_\n\n` +

    `*🛠 Channel Management (DM only) 📡*\n` +
    `_FREE — all features included. Manage everything from DMs._\n` +
    `${check("auth")} /add — Install the bot in your channel or group\n` +
    `${check("auth")} /channels (/ch) — View & manage all your installations\n` +
    `${check("auth")} /config — Fine-tune your setup\n` +
    `  _• /config delay 3000 — Set response delay (ms) so other bots fire first_\n` +
    `  _• /config verbose on|off — Toggle detailed vs minimal responses_\n` +
    `  _• /config admin-only on|off — Restrict commands to admins_\n` +
    `  _• /config dev-alerts on|off — Get notified when watched devs launch_\n` +
    `${check("auth")} /dashboard — Full channel management dashboard\n` +
    `✅ /payment (/pay) — 💰 Yearly Pro subscription via SOL (1 SOL/yr)\n`;

  cmds += `\n━━━━━━━━━━━━━━━━━\n` +
    `${unlocked} = Available | ${locked} = Locked to your tier\n` +
    `_Aliases shown in (parentheses) — e.g. /r instead of /risk_\n\n` +
    `📊 Your tier: *${tier.toUpperCase()}*\n` +
    `📈 Rate limit: *${RATE_LIMITS[tier] ?? 3}* lookups/hr\n\n` +
    `🔓 Upgrade anytime: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)\n` +
    `💬 Questions? [blackbox.farm/contact](https://blackbox.farm/contact)` +
    TAGLINE;

  await sendMessage(chatId, cmds);
}

// ─── /risk CA — Composite Risk & Stability Assessment ───
async function handleRisk(chatId: number, telegramUserId: string, args: string, isGroupChat = false) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/risk <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/risk");
  if (!gate) return;

  await sendMessage(chatId, `🛡 Assessing risk for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/risk", ca);

  // Parallel: holders + oracle + momentum
  const [holdersData, oracleData, momentumData] = await Promise.all([
    invokeFunction("bagless-holders-report", { tokenMint: ca }),
    invokeFunction("oracle-unified-lookup", { input: ca }),
    invokeFunction("token-momentum-analyzer", { tokenMint: ca }),
  ]);

  if (!holdersData && !oracleData && !momentumData) {
    await sendMessage(chatId, `❌ Could not fetch data for this token.`);
    return;
  }

  const symbol = holdersData?.symbol || holdersData?.tokenSymbol || null;
  const name = holdersData?.name || holdersData?.tokenName || null;
  const mcap = holdersData?.marketCap || momentumData?.metrics?.market_cap || null;
  const healthScore = holdersData?.healthScore?.score ?? holdersData?.stabilityScore ?? null;
  const healthPhase = holdersData?.healthScore?.phase || null;
  const top10Pct = holdersData?.distributionStats?.top10Percentage ?? null;
  const totalHolders = holdersData?.realHolders ?? holdersData?.totalHolders ?? null;
  const momentumScore = momentumData?.momentum_score ?? null;

  // Dev risk
  const dev = oracleData?.developer || oracleData?.creator || null;
  const devScore = dev?.reputation_score ?? null;
  const rugCount = dev?.rug_count ?? 0;
  const devClass = dev?.classification || null;

  // Insider/cluster data from holders report
  const insiderPct = holdersData?.insiderData?.totalInsiderPercentage ?? null;
  const bundledPct = holdersData?.insiderData?.bundledPercentage ?? null;
  const clusterCount = holdersData?.insiderData?.clusters?.length ?? 0;

  // Determine risk signals
  const signals: string[] = [];
  let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  let riskEmoji = '🟢';

  // Dev risk signals
  if (rugCount > 0) { signals.push(`🔴 Dev has ${rugCount} prior rug(s)`); riskLevel = 'HIGH'; }
  if (devClass === 'serial_rugger' || devClass === 'scammer') { signals.push(`🔴 Dev classified: ${devClass}`); riskLevel = 'CRITICAL'; }
  else if (devScore != null && devScore < 30) { signals.push(`🔴 Dev reputation: ${devScore}/100`); if (riskLevel !== 'CRITICAL') riskLevel = 'HIGH'; }
  else if (devScore != null && devScore < 50) { signals.push(`🟡 Dev reputation: ${devScore}/100`); if (riskLevel === 'LOW') riskLevel = 'MODERATE'; }
  else if (devScore != null) { signals.push(`🟢 Dev reputation: ${devScore}/100`); }

  // Concentration signals
  if (top10Pct != null && top10Pct > 50) { signals.push(`🔴 Top 10% holds ${top10Pct.toFixed(1)}%`); if (riskLevel === 'LOW') riskLevel = 'HIGH'; }
  else if (top10Pct != null && top10Pct > 35) { signals.push(`🟡 Top 10% holds ${top10Pct.toFixed(1)}%`); if (riskLevel === 'LOW') riskLevel = 'MODERATE'; }
  else if (top10Pct != null) { signals.push(`🟢 Top 10% holds ${top10Pct.toFixed(1)}%`); }

  // Insider/cluster signals
  if (bundledPct != null && bundledPct > 10) { signals.push(`🔴 Bundled insiders: ${bundledPct.toFixed(1)}% supply`); if (riskLevel === 'LOW' || riskLevel === 'MODERATE') riskLevel = 'HIGH'; }
  else if (clusterCount > 3) { signals.push(`🟡 ${clusterCount} wallet clusters detected`); if (riskLevel === 'LOW') riskLevel = 'MODERATE'; }

  // Health signals
  if (healthScore != null && healthScore < 30) { signals.push(`🔴 Health: ${healthScore}/100`); if (riskLevel === 'LOW') riskLevel = 'HIGH'; }
  else if (healthScore != null && healthScore < 50) { signals.push(`🟡 Health: ${healthScore}/100`); if (riskLevel === 'LOW') riskLevel = 'MODERATE'; }
  else if (healthScore != null) { signals.push(`🟢 Health: ${healthScore}/100`); }

  // Momentum signals
  if (momentumScore != null && momentumScore < 25) { signals.push(`🔴 Momentum: ${momentumScore}/100`); }
  else if (momentumScore != null && momentumScore < 45) { signals.push(`🟡 Momentum: ${momentumScore}/100`); }
  else if (momentumScore != null) { signals.push(`🟢 Momentum: ${momentumScore}/100`); }

  // Set emoji based on final risk level
  if (riskLevel === 'CRITICAL') riskEmoji = '🚨';
  else if (riskLevel === 'HIGH') riskEmoji = '🔴';
  else if (riskLevel === 'MODERATE') riskEmoji = '🟡';
  else riskEmoji = '🟢';

  const riskLabels: Record<string, string> = {
    LOW: 'STRONG NETWORK',
    MODERATE: 'MODERATE STRENGTH',
    HIGH: 'SPECULATIVE NETWORK',
    CRITICAL: 'HIGH RISK',
  };

  const isLite = !hasTier(gate.tier, "x_subscriber");

  let msg = `\`${ca}\`\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n` +
    `${riskEmoji} *${riskLabels[riskLevel]}*\n\n`;

  if (isLite) {
    // Auth tier: score + top 3 signals only
    msg += `🛡 *Risk Assessment*\n\n`;
    for (const s of signals.slice(0, 3)) {
      msg += `${s}\n`;
    }
    if (signals.length > 3) msg += `_...and ${signals.length - 3} more signals_\n`;
    msg += `\n_Upgrade to X Subscriber for full risk breakdown._` + TAGLINE;
  } else {
    // Full breakdown for X Sub+
    msg += `🛡 *Risk Assessment*\n\n`;
    for (const s of signals) {
      msg += `${s}\n`;
    }
    if (totalHolders) msg += `\n👥 Holders: *${totalHolders}*`;
    if (healthPhase) msg += ` (${healthPhase.replace('_', ' ')})`;
    msg += `\n`;

    // AI risk narrative + post-mortem intelligence for Pro+
    if (hasTier(gate.tier, "pro")) {
      try {
        const useAI = await getHealthMode('telegram_bot');
        if (useAI) {
          // Parallel: AI interpretation + pattern matcher prediction
          const [aiData, patternData] = await Promise.all([
            invokeFunction("token-ai-interpreter", { tokenMint: ca, reportData: holdersData }),
            invokeFunction("ai-token-pattern-matcher", { tokenMint: ca, reportData: holdersData }).catch(() => null),
          ]);
          if (aiData?.interpretation?.abbreviated_summary) {
            msg += `\n🧠 *AI Assessment:*\n_${aiData.interpretation.abbreviated_summary.slice(0, 400)}_\n`;
          }
          // Inject post-mortem pattern intelligence
          if (patternData?.prediction) {
            const predEmoji: Record<string, string> = {
              likely_rug: '🔴', likely_pump_dump: '🔴', likely_slow_bleed: '🟡',
              likely_survive: '🟢', likely_thrive: '🟢', uncertain: '⚪',
            };
            msg += `\n📜 *Post-Mortem Pattern Match:*\n`;
            msg += `${predEmoji[patternData.prediction] || '⚪'} _${patternData.prediction.replace('likely_', '').replace('_', ' ')}_ (${patternData.confidence}% conf, ${patternData.training_data_size} historical tokens)\n`;
            if (patternData.risk_factors?.length > 0) {
              msg += `⚠️ _${patternData.risk_factors.slice(0, 2).join(' | ')}_\n`;
            }
            if (patternData.strength_factors?.length > 0) {
              msg += `✅ _${patternData.strength_factors.slice(0, 2).join(' | ')}_\n`;
            }
          }
        }
      } catch (_) {}
    }
    msg += TAGLINE;
  }

  await sendMessage(chatId, msg);
}

// ─── /dev CA — Developer Intel & Social Doxxing ───
async function handleDev(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/dev <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/dev");
  if (!gate) return;

  await sendMessage(chatId, `🏗 Looking up developer for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/dev", ca);

  const data = await invokeFunction("oracle-unified-lookup", { input: ca });
  if (!data) {
    await sendMessage(chatId, `❌ Could not resolve developer for this token.`);
    return;
  }

  const dev = data.developer || data.creator || null;
  if (!dev) {
    await sendMessage(chatId, `❌ No developer profile found for this token.`);
    return;
  }

  const isFullAccess = hasTier(gate.tier, "x_subscriber");

  let msg = `🏗 *Dev Intel Report*\n\n`;

  // Dev wallet
  if (dev.address) msg += `👤 Wallet: \`${dev.address.slice(0, 8)}...${dev.address.slice(-6)}\`\n`;

  // Rep score with color
  if (dev.reputation_score != null) {
    const scoreEmoji = dev.reputation_score >= 60 ? '🟢' : dev.reputation_score >= 35 ? '🟡' : '🔴';
    msg += `${scoreEmoji} Reputation: *${dev.reputation_score}/100*\n`;
  }

  // Classification
  if (dev.classification) {
    const classEmoji: Record<string, string> = {
      'trusted': '✅', 'verified': '🔵', 'neutral': '⚪', 'suspicious': '🟡',
      'scammer': '🔴', 'serial_rugger': '🚨', 'unknown': '❓',
    };
    msg += `🏷 Class: *${dev.classification}* ${classEmoji[dev.classification] || ''}\n`;
  }

  // Token history
  if (dev.total_tokens != null) msg += `🪙 Tokens Created: *${dev.total_tokens}*\n`;
  if (dev.rug_count != null && dev.rug_count > 0) msg += `🚩 Rug Pulls: *${dev.rug_count}*\n`;
  if (dev.failed_tokens != null && dev.failed_tokens > 0) msg += `💀 Failed: *${dev.failed_tokens}*\n`;

  // Performance stats
  if (dev.avg_lifespan) msg += `⏱ Avg Token Lifespan: *${dev.avg_lifespan}*\n`;
  if (dev.top_10_count != null || dev.tokens_in_top_10_count != null) {
    const t10 = dev.top_10_count ?? dev.tokens_in_top_10_count ?? 0;
    msg += `🏆 Hit Top 10: *${t10}* tokens\n`;
  }
  if (dev.integrity_score != null) msg += `🔒 Integrity: *${dev.integrity_score}/100*\n`;

  // Social doxxing — the key differentiator
  msg += `\n🔗 *Social Links*\n`;
  let hasSocial = false;

  if (data.social_links || data.mesh_connections?.length) {
    const socials = data.social_links || {};
    if (socials.twitter || socials.x) {
      msg += `𝕏 Twitter: [${socials.twitter || socials.x}](https://x.com/${(socials.twitter || socials.x).replace('@', '')})\n`;
      hasSocial = true;
    }
    if (socials.telegram) {
      msg += `📱 Telegram: ${socials.telegram}\n`;
      hasSocial = true;
    }
    if (socials.website) {
      msg += `🌐 Website: ${socials.website}\n`;
      hasSocial = true;
    }

    // Mesh connections for social doxxing
    if (isFullAccess && data.mesh_connections?.length) {
      const socialMesh = data.mesh_connections.filter((c: any) =>
        c.relationship === 'same_kyc_root' || c.relationship === 'same_team' ||
        c.source_type === 'twitter' || c.source_type === 'x_account' ||
        c.linked_type === 'twitter' || c.linked_type === 'x_account'
      );
      if (socialMesh.length > 0) {
        msg += `\n🕸 *Identity Mesh:*\n`;
        for (const c of socialMesh.slice(0, 5)) {
          const rel = c.relationship || c.type || 'linked';
          const target = c.target || c.linked_id || '?';
          msg += `• ${rel}: \`${typeof target === 'string' && target.length > 16 ? target.slice(0, 8) + '...' + target.slice(-6) : target}\`\n`;
        }
        hasSocial = true;
      }
    }
  }

  if (!hasSocial) {
    msg += `_No social accounts linked to this developer._\n`;
  }

  // Funded-by chain (Pro+)
  if (isFullAccess && data.mesh_connections?.length) {
    const fundedBy = data.mesh_connections.filter((c: any) => c.relationship === 'funded_by');
    if (fundedBy.length > 0) {
      msg += `\n💰 *Funding Chain:*\n`;
      for (const f of fundedBy.slice(0, 3)) {
        const src = f.source_id || f.source || '?';
        msg += `• Funded by: \`${typeof src === 'string' && src.length > 16 ? src.slice(0, 8) + '...' + src.slice(-6) : src}\`\n`;
      }
    }
  }

  if (!isFullAccess) {
    msg += `\n_Upgrade to X Subscriber for full social mesh & funding chains._`;
  }

  // Token phase context
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
    if (dexRes.ok) {
      const dexJson = await dexRes.json();
      const pair = dexJson?.pairs?.[0];
      if (pair && dev.reputation_score != null) {
        const pr = detectTokenPhase({ pairCreatedAt: pair.pairCreatedAt || null, liquidityUsd: pair.liquidity?.usd || null, dexId: pair.dexId || null });
        msg += `\n💡 _${contextualizeDevRep(dev.reputation_score, pr.phase)}_\n`;
      }
    }
  } catch (_) {}

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── /insiders CA — Insider Cluster & Bundling Pre-Check ───
async function handleInsiders(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/insiders <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "x_subscriber", "/insiders");
  if (!gate) return;

  await sendMessage(chatId, `🕵️ Scanning insider clusters for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/insiders", ca);

  // Check token maturity first — skip detailed insider analysis for mature tokens
  let tokenAge: number | null = null;
  let tokenMcap: number | null = null;
  let tokenSymbol: string | null = null;
  let tokenName: string | null = null;

  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
    if (dexRes.ok) {
      const dexJson = await dexRes.json();
      const pair = dexJson?.pairs?.[0];
      if (pair) {
        if (pair.pairCreatedAt) {
          tokenAge = (Date.now() - new Date(pair.pairCreatedAt).getTime()) / (1000 * 60 * 60); // hours
        }
        tokenMcap = pair.marketCap || pair.fdv || null;
        tokenSymbol = pair.baseToken?.symbol || null;
        tokenName = pair.baseToken?.name || null;
      }
    }
  } catch (_) {}

  // Maturity skip: if token is >72h old AND mcap >500k, insider bundling data is stale
  if (tokenAge != null && tokenAge > 72 && tokenMcap != null && tokenMcap > 500_000) {
    await sendMessage(chatId,
      `\`${ca}\`\n` +
      `${tokenHeaderLine(tokenSymbol, tokenName, tokenMcap)}\n\n` +
      `ℹ️ *Insider Pre-Check Skipped*\n\n` +
      `This token is *${Math.floor(tokenAge / 24)}d old* with *${fmtMcap(tokenMcap)}* MCap.\n` +
      `Early-stage insider bundling data is no longer actionable at this maturity.\n\n` +
      `Use /holders for current distribution or /risk for overall assessment.` +
      TAGLINE
    );
    return;
  }

  // Fetch holder data (includes insider/cluster analysis)
  const holdersData = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!holdersData || holdersData.error) {
    await sendMessage(chatId, `❌ Could not fetch insider data for this token.`);
    return;
  }

  const symbol = tokenSymbol || holdersData?.symbol || holdersData?.tokenSymbol || null;
  const name = tokenName || holdersData?.name || holdersData?.tokenName || null;
  const mcap = tokenMcap || holdersData?.marketCap || null;

  const insiderData = holdersData?.insiderData || {};
  const clusters = insiderData.clusters || [];
  const topInsiders = insiderData.topInsiders || [];
  const bundledWallets = insiderData.bundledWallets || [];
  const totalInsiderPct = insiderData.totalInsiderPercentage ?? 0;
  const bundledPct = insiderData.bundledPercentage ?? 0;
  const warnings = insiderData.warnings || [];

  let msg = `\`${ca}\`\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n` +
    `🕵️ *Insider Cluster Report*\n\n`;

  if (!insiderData.hasInsiders && topInsiders.length === 0 && clusters.length === 0) {
    msg += `✅ *No insider clusters detected.*\n` +
      `No bundled wallets or coordinated buying patterns found.\n`;
  } else {
    // Summary stats
    msg += `📊 Insider wallets: *${insiderData.insiderCount || topInsiders.length}*\n`;
    msg += `📊 Total insider supply: *${totalInsiderPct.toFixed(1)}%*\n`;
    if (bundledPct > 0) msg += `🔗 Bundled wallets: *${bundledWallets.length}* (${bundledPct.toFixed(1)}% supply)\n`;
    if (clusters.length > 0) msg += `🕸 Wallet clusters: *${clusters.length}*\n`;
    msg += `\n`;

    // Risk assessment
    if (bundledPct > 15 || totalInsiderPct > 30) {
      msg += `🚨 *CABAL ALERT — High insider concentration*\n`;
    } else if (bundledPct > 5 || totalInsiderPct > 15) {
      msg += `🟡 *Moderate insider presence*\n`;
    } else {
      msg += `🟢 *Low insider footprint*\n`;
    }
    msg += `\n`;

    // Top insiders
    if (topInsiders.length > 0) {
      msg += `*Top Insiders:*\n`;
      for (const ins of topInsiders.slice(0, 5)) {
        const walletShort = ins.wallet ? `${ins.wallet.slice(0, 6)}...${ins.wallet.slice(-4)}` : '?';
        const typeTag = ins.insiderType ? ` [${ins.insiderType}]` : '';
        msg += `• \`${walletShort}\` — ${ins.percentage.toFixed(2)}%${typeTag}\n`;
      }
      msg += `\n`;
    }

    // Cluster details (X Sub gets summary, Pro gets expansion)
    if (clusters.length > 0 && hasTier(gate.tier, "pro")) {
      msg += `*Cluster Details:*\n`;
      for (const cl of clusters.slice(0, 3)) {
        msg += `🔗 Cluster: ${cl.wallets?.length || 0} wallets, ${(cl.totalPercentage || 0).toFixed(1)}% supply [${cl.clusterType || 'connected'}]\n`;
      }
      msg += `\n`;
    }

    // Warnings
    if (warnings.length > 0) {
      msg += `*⚠️ Warnings:*\n`;
      for (const w of warnings) {
        msg += `• ${w}\n`;
      }
    }
  }

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── /concentration CA — Detailed Holder Percentage Breakdown ───
async function handleConcentration(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/concentration <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/concentration");
  if (!gate) return;

  await sendMessage(chatId, `📊 Analyzing concentration for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/concentration", ca);

  const data = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!data || data.error) {
    await sendMessage(chatId, `❌ Could not fetch holder data.`);
    return;
  }

  const symbol = data.symbol || data.tokenSymbol || null;
  const name = data.name || data.tokenName || null;
  const mcap = data.marketCap || null;
  const totalHolders = data.realHolders ?? data.totalHolders ?? "?";
  const dist = data.distributionStats || {};

  let msg = `\`${ca}\`\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n` +
    `📊 *Concentration Breakdown*\n\n` +
    `👥 Total Holders: *${totalHolders}*\n\n`;

  // Percentage tiers
  const pctLevels = [
    { label: 'Top 1 holder', key: 'top1Percentage' },
    { label: 'Top 5 holders', key: 'top5Percentage' },
    { label: 'Top 10 holders', key: 'top10HoldersPct' },
    { label: 'Top 10%', key: 'top10Percentage' },
    { label: 'Top 25%', key: 'top25Percentage' },
    { label: 'Top 50%', key: 'top50Percentage' },
  ];

  msg += `*Supply Distribution:*\n`;
  for (const level of pctLevels) {
    const val = dist[level.key];
    if (val != null) {
      msg += `${bar(val)} ${level.label}: *${val.toFixed(1)}%*\n`;
    }
  }

  // Simple tiers (whale/serious/retail/dust)
  const tiers = data.simpleTiers;
  if (tiers && typeof tiers === 'object') {
    msg += `\n*Holder Categories:*\n`;
    const tierOrder = ['whales', 'serious', 'retail', 'dust'];
    const tierEmojis: Record<string, string> = { whales: '🐋', serious: '💼', retail: '👤', dust: '🌫' };
    const tierLabels: Record<string, string> = { whales: 'Whales (>2%)', serious: 'Serious (0.5-2%)', retail: 'Retail (0.01-0.5%)', dust: 'Dust (<0.01%)' };
    for (const key of tierOrder) {
      const t = tiers[key];
      if (t) {
        const pct = t.percentage ?? 0;
        const count = t.count ?? 0;
        msg += `${tierEmojis[key] || '•'} ${bar(pct)} ${tierLabels[key] || key}: *${pct.toFixed(1)}%* (${count})\n`;
      }
    }
  }

  // LP
  if (data.lpPercentageOfSupply != null) {
    msg += `\n🔒 LP: *${data.lpPercentageOfSupply.toFixed(1)}%* of supply\n`;
  }
  if (data.circulatingSupply?.percentage != null) {
    msg += `♻️ Circulating: *${data.circulatingSupply.percentage.toFixed(1)}%*\n`;
  }

  // Health context
  const health = data.healthScore?.score ?? data.stabilityScore ?? null;
  if (health != null) {
    const hEmoji = health >= 60 ? '🟢' : health >= 40 ? '🟡' : '🔴';
    msg += `\n${hEmoji} Health Score: *${health}/100*\n`;
  }

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── /compare CA CA — Side-by-Side Token Comparison ───
async function handleCompare(chatId: number, telegramUserId: string, args: string) {
  const parts = args.trim().split(/\s+/);
  if (parts.length < 2 || parts[0].length < 30 || parts[1].length < 30) {
    await sendMessage(chatId, `❌ Usage: \`/compare <CA1> <CA2>\`\n\nCompare two tokens side by side.`);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "x_subscriber", "/compare");
  if (!gate) return;

  const ca1 = parts[0];
  const ca2 = parts[1];

  await sendMessage(chatId, `⚖️ Comparing tokens...\n\`${ca1.slice(0, 8)}...${ca1.slice(-6)}\` vs \`${ca2.slice(0, 8)}...${ca2.slice(-6)}\``);
  await logUsage(telegramUserId, "/compare", `${ca1}|${ca2}`);

  // Parallel fetch for both tokens — holders + momentum only (no oracle to save resources)
  const [h1, h2, m1, m2] = await Promise.all([
    invokeFunction("bagless-holders-report", { tokenMint: ca1 }),
    invokeFunction("bagless-holders-report", { tokenMint: ca2 }),
    invokeFunction("token-momentum-analyzer", { tokenMint: ca1 }),
    invokeFunction("token-momentum-analyzer", { tokenMint: ca2 }),
  ]);

  if (!h1 && !m1) {
    await sendMessage(chatId, `❌ Could not fetch data for token 1.`);
    return;
  }
  if (!h2 && !m2) {
    await sendMessage(chatId, `❌ Could not fetch data for token 2.`);
    return;
  }

  const sym1 = h1?.symbol || h1?.tokenSymbol || ca1.slice(0, 6);
  const sym2 = h2?.symbol || h2?.tokenSymbol || ca2.slice(0, 6);
  const health1 = h1?.healthScore?.score ?? h1?.stabilityScore ?? '?';
  const health2 = h2?.healthScore?.score ?? h2?.stabilityScore ?? '?';
  const mom1 = m1?.momentum_score ?? '?';
  const mom2 = m2?.momentum_score ?? '?';
  const holders1 = h1?.realHolders ?? h1?.totalHolders ?? '?';
  const holders2 = h2?.realHolders ?? h2?.totalHolders ?? '?';
  const mcap1 = h1?.marketCap || m1?.metrics?.market_cap || null;
  const mcap2 = h2?.marketCap || m2?.metrics?.market_cap || null;
  const top10_1 = h1?.distributionStats?.top10Percentage ?? null;
  const top10_2 = h2?.distributionStats?.top10Percentage ?? null;

  const pad = (s: string, n: number) => s.padEnd(n).slice(0, n);

  let msg = `⚖️ *Token Comparison*\n\n`;
  msg += `\`${pad('', 12)} ${pad('$' + sym1, 10)} ${pad('$' + sym2, 10)}\`\n`;
  msg += `\`${pad('Health', 12)} ${pad(String(health1), 10)} ${pad(String(health2), 10)}\`\n`;
  msg += `\`${pad('Momentum', 12)} ${pad(String(mom1), 10)} ${pad(String(mom2), 10)}\`\n`;
  msg += `\`${pad('Holders', 12)} ${pad(String(holders1), 10)} ${pad(String(holders2), 10)}\`\n`;
  if (mcap1 || mcap2) {
    msg += `\`${pad('MCap', 12)} ${pad(fmtMcap(mcap1) || '?', 10)} ${pad(fmtMcap(mcap2) || '?', 10)}\`\n`;
  }
  if (top10_1 != null || top10_2 != null) {
    msg += `\`${pad('Top 10%', 12)} ${pad(top10_1 != null ? top10_1.toFixed(1) + '%' : '?', 10)} ${pad(top10_2 != null ? top10_2.toFixed(1) + '%' : '?', 10)}\`\n`;
  }

  // Quick winner call
  const score1 = (typeof health1 === 'number' ? health1 : 0) + (typeof mom1 === 'number' ? mom1 : 0);
  const score2 = (typeof health2 === 'number' ? health2 : 0) + (typeof mom2 === 'number' ? mom2 : 0);
  if (score1 > score2 + 10) {
    msg += `\n📍 *${sym1}* has stronger combined signals.`;
  } else if (score2 > score1 + 10) {
    msg += `\n📍 *${sym2}* has stronger combined signals.`;
  } else {
    msg += `\n📍 Both tokens show *similar strength*.`;
  }

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── /holders CA ───
async function handleHolders(chatId: number, telegramUserId: string, args: string, isGroupChat = false) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/holders <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/holders");
  if (!gate) return;

  await sendMessage(chatId, `🔍 Analyzing holders for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/holders", ca);

  const data = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!data || data.error) {
    await sendMessage(chatId, `❌ Could not fetch holder data. Token may not be indexed yet.\n\n_Error: ${data?.error || 'No response from analysis engine'}_`);
    return;
  }

  const isLite = !hasTier(gate.tier, "x_subscriber");

  const totalHolders = data.realHolders ?? data.totalHolders ?? "?";
  const healthScore = data.healthScore?.score ?? data.stabilityScore ?? "?";
  const healthPhase = data.healthScore?.phase || null;
  const phaseLabel = healthPhase ? ` (${healthPhase.replace('_', ' ')})` : '';
  const top10Pct = data.distributionStats?.top10Percentage ?? "?";
  const symbol = data.symbol || data.tokenSymbol || null;
  const name = data.name || data.tokenName || null;
  const mcap = data.marketCap || null;

  let header = `\`${ca}\`\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n`;

  if (isLite) {
    await sendMessage(chatId,
      header +
      `📊 *Holders Lite*\n\n` +
      `👥 Holders: *${totalHolders}*\n` +
      `❤️ Health: *${healthScore}/100*${phaseLabel}\n` +
      `🏦 Top 10% hold: *${typeof top10Pct === 'number' ? top10Pct.toFixed(1) + '%' : top10Pct}*\n\n` +
      `_Upgrade to X Subscriber for full breakdown._` +
      TAGLINE
    );
    return;
  }

  let msg = header;
  msg += `📊 *Holders Report*\n\n`;
  msg += `👥 Total: *${totalHolders}*\n`;
  msg += `❤️ Health: *${healthScore}*/100${phaseLabel}\n`;
  if (typeof top10Pct === 'number') msg += `🏦 Top 10%: *${top10Pct.toFixed(1)}%*\n`;
  msg += `\n`;

  const tiers = data.simpleTiers;
  if (tiers && typeof tiers === 'object') {
    msg += `*Wallet Distribution:*\n`;
    const tierOrder = ['whales', 'serious', 'retail', 'dust'];
    const tierEmojis: Record<string, string> = { whales: '🐋', serious: '💼', retail: '👤', dust: '🌫' };
    const tierLabels: Record<string, string> = { whales: 'Whales', serious: 'Serious', retail: 'Retail', dust: 'Dust' };
    for (const key of tierOrder) {
      const t = tiers[key];
      if (t) {
        const pct = t.percentage ?? 0;
        const count = t.count ?? 0;
        msg += `${tierEmojis[key] || '•'} ${bar(pct)} ${tierLabels[key] || key}: *${pct.toFixed(1)}%* (${count})\n`;
      }
    }
  }

  if (data.lpPercentageOfSupply != null) {
    msg += `\n🔒 LP: *${data.lpPercentageOfSupply.toFixed(1)}%* of supply\n`;
  }
  if (data.circulatingSupply?.percentage != null) {
    msg += `♻️ Circulating: *${data.circulatingSupply.percentage.toFixed(1)}%*\n`;
  }

  try {
    const useAI = await getHealthMode('telegram_bot');
    if (useAI) {
      const aiData = await invokeFunction("token-ai-interpreter", { tokenMint: ca, reportData: data });
      if (aiData?.interpretation) {
        const interp = aiData.interpretation;
        msg += `\n🧠 *AI Health Analysis*\n`;
        if (interp.lifecycle) msg += `📍 Stage: *${interp.lifecycle.stage}* (${interp.lifecycle.confidence})\n`;
        if (isGroupChat && interp.abbreviated_summary) {
          msg += `💬 ${interp.abbreviated_summary}\n`;
        } else if (interp.status_overview) {
          msg += `💬 ${interp.status_overview.substring(0, 300)}\n`;
        }
      }
    }
  } catch (aiErr) {
    console.error('[holders] AI health enhancement failed:', aiErr);
  }

  msg += `\n🔗 [Full Web Report](https://blackbox.farm/holders?token=${ca}) | [BubbleMap](https://blackbox.farm/bubblemap?token=${ca})`;
  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── /momentum CA ───
async function handleMomentum(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/momentum <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "x_subscriber", "/momentum");
  if (!gate) return;

  await sendMessage(chatId, `📈 Checking momentum for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/momentum", ca);

  const data = await invokeFunction("token-momentum-analyzer", { tokenMint: ca });
  if (!data) {
    await sendMessage(chatId, `❌ Could not fetch momentum data.`);
    return;
  }

  const m = data.metrics || {};
  const scoreEmoji = data.momentum_score >= 70 ? "🟢" : data.momentum_score >= 45 ? "🟡" : "🔴";

  let msg = `📈 *Momentum Analysis*\n\n` +
    `${scoreEmoji} Score: *${data.momentum_score}/100* — ${data.recommendation}\n` +
    `🎯 Action: *${data.action}*\n\n`;

  if (m.price_usd) msg += `💰 Price: $${m.price_usd < 0.001 ? m.price_usd.toExponential(2) : m.price_usd.toFixed(6)}\n`;
  if (m.market_cap) msg += `📊 MCap: $${(m.market_cap / 1000).toFixed(1)}K\n`;
  if (m.price_change_5m != null) msg += `⏱ 5m: ${m.price_change_5m >= 0 ? '+' : ''}${m.price_change_5m.toFixed(1)}%\n`;
  if (m.price_change_1h != null) msg += `🕐 1h: ${m.price_change_1h >= 0 ? '+' : ''}${m.price_change_1h.toFixed(1)}%\n`;
  if (m.volume_5m != null) msg += `📦 Vol 5m: $${(m.volume_5m / 1000).toFixed(1)}K\n`;
  if (m.buy_sell_ratio_5m != null) msg += `⚖️ Buy/Sell: ${m.buy_sell_ratio_5m.toFixed(2)}x\n`;
  if (m.age_minutes != null) msg += `🕰 Age: ${m.age_minutes < 60 ? m.age_minutes + 'm' : Math.floor(m.age_minutes / 60) + 'h'}\n`;

  if (data.signals?.length) {
    msg += `\n*Signals:*\n`;
    for (const s of data.signals.slice(0, 5)) {
      const icon = s.type === 'bullish' ? '🟢' : s.type === 'bearish' ? '🔴' : '⚪';
      msg += `${icon} ${s.signal}\n`;
    }
  }

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── /verdict CA (RETAINED INTERNALLY — removed from UI/help) ───
async function handleVerdict(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/verdict <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/verdict");
  if (!gate) return;

  await sendMessage(chatId, `⚡ Generating verdict for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/verdict", ca);

  const [momentumData, holdersData, dexData] = await Promise.all([
    invokeFunction("token-momentum-analyzer", { tokenMint: ca }),
    invokeFunction("bagless-holders-report", { tokenMint: ca }),
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.pairs?.[0] || null)
      .catch(() => null),
  ]);

  const momentumScore = momentumData?.momentum_score ?? 0;
  const healthScore = holdersData?.healthScore?.score ?? holdersData?.stabilityScore ?? 0;
  const verdictPhase = (holdersData?.healthScore?.phase || momentumData?.phase || null) as TokenPhase | null;
  const verdictPhaseLabel = verdictPhase ? ` (${verdictPhase.replace('_', ' ')})` : '';

  const tokenSymbol = momentumData?.metrics?.symbol
    || holdersData?.symbol || holdersData?.token_symbol
    || dexData?.baseToken?.symbol || null;
  const tokenName = momentumData?.metrics?.name
    || holdersData?.name || holdersData?.token_name
    || dexData?.baseToken?.name || null;

  let tokenHeader: string;
  if (tokenSymbol && tokenName) {
    tokenHeader = `${tokenSymbol} (${tokenName})`;
  } else if (tokenSymbol) {
    tokenHeader = `${tokenSymbol}`;
  } else if (tokenName) {
    tokenHeader = tokenName;
  } else {
    tokenHeader = "Unknown Token";
  }

  const isLite = !hasTier(gate.tier, "x_subscriber");

  if (isLite) {
    const color = momentumScore >= 55 && healthScore >= 40 ? "🟢" : momentumScore >= 40 ? "🟡" : "🔴";
    const label = color === "🟢" ? "BULLISH" : color === "🟡" ? "CAUTION" : "BEARISH";
    await sendMessage(chatId,
      `\`${ca}\`\n` +
      `🪙 *${tokenHeader}*\n\n` +
      `${color} *${label}*\n\n` +
      `_Upgrade to X Subscriber for detailed sizing recommendations._`
    );
    return;
  }

  const mcap = momentumData?.metrics?.market_cap || (dexData?.marketCap) || (dexData?.fdv) || null;
  const mcapStr = fmtMcap(mcap);

  const aiVerdictPrompt = buildVerdictPrompt({
    tokenSymbol: tokenSymbol || 'Unknown',
    tokenName: tokenName || 'Unknown',
    ca,
    momentumScore,
    healthScore,
    phase: verdictPhase,
    mcap,
    metrics: momentumData?.metrics || null,
    signals: momentumData?.signals || [],
    holdersData: {
      totalHolders: holdersData?.totalHolders || holdersData?.total_holders || null,
      top10Pct: holdersData?.healthScore?.top10Pct || null,
      baglessCount: holdersData?.bagless_count || null,
    },
  });

  let verdict: string;
  let emoji: string;
  let description: string;
  let aiReasoning = '';

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('No AI key');

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: VERDICT_SYSTEM_PROMPT },
          { role: 'user', content: aiVerdictPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'deliver_verdict',
            description: 'Return a structured trading verdict based on the token analysis.',
            parameters: {
              type: 'object',
              properties: {
                verdict: { type: 'string', enum: ['BUY DEEP LONG', 'BUY MEDIUM SHORT', 'BUY SMALL SHORT', 'WATCH CURVE', 'WATCH CURVE — SMALL SHORT', 'WATCH', 'HOLD / AVOID'] },
                emoji: { type: 'string', enum: ['🟢', '🟡', '🔴'] },
                description: { type: 'string', description: 'One concise sentence explaining the recommendation in context of token age and metrics.' },
                reasoning: { type: 'string', description: '2-3 sentence reasoning trace showing which metrics drove the decision.' },
              },
              required: ['verdict', 'emoji', 'description', 'reasoning'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'deliver_verdict' } },
        temperature: 0.3,
        max_tokens: 500,
      }),
    });

    if (!aiRes.ok) throw new Error(`AI ${aiRes.status}`);

    const aiJson = await aiRes.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error('No tool call in response');

    const parsed = JSON.parse(toolCall.function.arguments);
    verdict = parsed.verdict || 'HOLD / AVOID';
    emoji = parsed.emoji || '🔴';
    description = parsed.description || 'Unable to generate detailed assessment.';
    aiReasoning = parsed.reasoning || '';

    const isFreshPhase = verdictPhase === 'newborn' || verdictPhase === 'early' || verdictPhase === 'adolescent';
    if (verdictPhase === 'on_curve' && ['BUY DEEP LONG', 'BUY MEDIUM SHORT'].includes(verdict)) {
      verdict = 'WATCH CURVE — SMALL SHORT';
      emoji = '🟡';
    } else if (isFreshPhase && verdict === 'BUY DEEP LONG') {
      verdict = 'BUY MEDIUM SHORT';
      emoji = '🟢';
    }
  } catch (aiErr) {
    console.error('[verdict] AI fallback:', aiErr);
    const fb = fallbackVerdict(momentumScore, healthScore, verdictPhase);
    verdict = fb.verdict;
    emoji = fb.emoji;
    description = fb.description;
  }

  const phaseTag = verdictPhase ? ` [${verdictPhase.replace('_', ' ')}]` : '';

  let msg = `\`${ca}\`\n` +
    `🪙 *${tokenHeader}*${mcapStr ? ` — MCap: *${mcapStr}*` : ''}\n\n` +
    `${emoji} *${verdict}*${phaseTag}\n\n` +
    `${description}\n\n` +
    `📈 Momentum: *${momentumScore}/100*\n` +
    `❤️ Health: *${healthScore}/100*${verdictPhaseLabel}\n`;

  if (momentumData?.metrics) {
    const m = momentumData.metrics;
    if (m.price_change_5m != null) msg += `⏱ 5m: ${m.price_change_5m >= 0 ? '+' : ''}${m.price_change_5m.toFixed(1)}%\n`;
    if (m.buy_sell_ratio_5m != null) msg += `⚖️ Buy/Sell: ${m.buy_sell_ratio_5m.toFixed(2)}x\n`;
  }

  if (aiReasoning) {
    msg += `\n🧠 *AI Reasoning:*\n_${aiReasoning.slice(0, 400)}_\n`;
  }

  if (momentumData?.signals?.length) {
    msg += `\n*Key signals:*\n`;
    for (const s of momentumData.signals.slice(0, 3)) {
      const icon = s.type === 'bullish' ? '🟢' : s.type === 'bearish' ? '🔴' : '⚪';
      msg += `${icon} ${s.signal}\n`;
    }
  }

  await sendMessage(chatId, msg);
}

// ─── /oracle CA ───
async function handleOracle(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/oracle <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "pro", "/oracle");
  if (!gate) return;

  await sendMessage(chatId, `🔮 Looking up developer reputation for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/oracle", ca);

  const data = await invokeFunction("oracle-unified-lookup", { input: ca });
  if (!data || !data.found) {
    await sendMessage(chatId, `❌ Could not fetch developer data. Token may not be tracked yet.`);
    return;
  }

  let oraclePhase: TokenPhase | null = null;
  try {
    const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
    if (dexRes.ok) {
      const dexJson = await dexRes.json();
      const pair = dexJson?.pairs?.[0];
      if (pair) {
        const pr = detectTokenPhase({ pairCreatedAt: pair.pairCreatedAt || null, liquidityUsd: pair.liquidity?.usd || null, dexId: pair.dexId || null });
        oraclePhase = pr.phase;
      }
    }
  } catch (_) {}

  let msg = `🔮 *Oracle Report*\n\n`;

  // Profile info (from oracle-unified-lookup response format)
  const profile = data.profile;
  const resolvedWallet = data.resolvedWallet || profile?.masterWallet || null;

  if (resolvedWallet) {
    msg += `👤 Dev: \`${resolvedWallet.slice(0, 8)}...${resolvedWallet.slice(-6)}\`\n`;
  }
  if (profile?.displayName && profile.displayName !== 'Unknown') {
    msg += `🏷 Name: *${profile.displayName}*\n`;
  }
  if (profile?.kycVerified) {
    msg += `✅ KYC Verified\n`;
  }

  // Score
  if (data.score != null) {
    const scoreEmoji = data.score >= 60 ? '🟢' : data.score >= 35 ? '🟡' : '🔴';
    msg += `${scoreEmoji} Rep Score: *${data.score}/100*\n`;
    if (oraclePhase) {
      msg += `💡 _${contextualizeDevRep(data.score, oraclePhase)}_\n`;
    }
  }

  // Traffic light
  if (data.trafficLight && data.trafficLight !== 'UNKNOWN') {
    const tlEmoji: Record<string, string> = { RED: '🔴', YELLOW: '🟡', GREEN: '🟢', BLUE: '🔵' };
    msg += `🚦 Signal: *${data.trafficLight}* ${tlEmoji[data.trafficLight] || ''}\n`;
  }

  // Stats
  const stats = data.stats;
  if (stats) {
    if (stats.totalTokens != null) msg += `🪙 Tokens Created: *${stats.totalTokens}*\n`;
    if (stats.successfulTokens != null && stats.successfulTokens > 0) msg += `✅ Successful: *${stats.successfulTokens}*\n`;
    if (stats.rugPulls != null && stats.rugPulls > 0) msg += `🚩 Rug Pulls: *${stats.rugPulls}*\n`;
    if (stats.slowDrains != null && stats.slowDrains > 0) msg += `🐌 Slow Drains: *${stats.slowDrains}*\n`;
    if (stats.failedTokens != null && stats.failedTokens > 0) msg += `💀 Failed: *${stats.failedTokens}*\n`;
    if (stats.avgLifespanHours != null && stats.avgLifespanHours > 0) {
      const lifespan = stats.avgLifespanHours >= 24
        ? `${(stats.avgLifespanHours / 24).toFixed(1)}d`
        : `${stats.avgLifespanHours.toFixed(0)}h`;
      msg += `⏱ Avg Lifespan: *${lifespan}*\n`;
    }
  }

  // Score breakdown (for Pro users)
  if (data.scoreBreakdown) {
    const sb = data.scoreBreakdown;
    msg += `\n📊 *Score Breakdown:*\n`;
    msg += `Base: ${sb.base}`;
    if (sb.rugPullPenalty) msg += ` | Rug: ${sb.rugPullPenalty}`;
    if (sb.successBonus) msg += ` | Success: +${sb.successBonus}`;
    if (sb.blacklistPenalty) msg += ` | Blacklist: ${sb.blacklistPenalty}`;
    if (sb.whitelistBonus) msg += ` | Whitelist: +${sb.whitelistBonus}`;
    msg += `\n`;
  }

  // Blacklist/Whitelist status
  if (data.blacklistStatus?.isBlacklisted) {
    msg += `\n🚨 *BLACKLISTED*: ${data.blacklistStatus.reason || 'No reason given'}\n`;
  }
  if (data.whitelistStatus?.isWhitelisted) {
    msg += `\n✅ *WHITELISTED*: ${data.whitelistStatus.reason || 'Verified clean'}\n`;
  }

  // Network / Mesh connections
  const network = data.network;
  if (network) {
    const meshItems: string[] = [];

    if (network.linkedXAccounts?.length) {
      for (const x of network.linkedXAccounts.slice(0, 3)) {
        meshItems.push(`𝕏 [${x}](https://x.com/${x.replace('@', '')})`);
      }
    }
    if (network.linkedWallets?.length) {
      for (const w of network.linkedWallets.slice(0, 3)) {
        meshItems.push(`💼 \`${w.slice(0, 6)}...${w.slice(-4)}\``);
      }
    }
    if (network.sharedMods?.length) {
      meshItems.push(`👥 ${network.sharedMods.length} shared mod(s)`);
    }
    if (network.devTeam?.name) {
      meshItems.push(`🏢 Team: ${network.devTeam.name}`);
    }

    if (meshItems.length > 0) {
      msg += `\n🕸 *Network Mesh:*\n`;
      for (const item of meshItems) {
        msg += `• ${item}\n`;
      }
    }

    if (network.meshLinks?.length) {
      const additionalLinks = network.meshLinks.filter((l: any) =>
        l.relationship !== 'funded_by'
      ).slice(0, 5);
      if (additionalLinks.length > 0) {
        msg += `\n🔗 *Mesh Links:*\n`;
        for (const l of additionalLinks) {
          msg += `• ${l.relationship}: \`${typeof l.linkedId === 'string' && l.linkedId.length > 16 ? l.linkedId.slice(0, 8) + '...' : l.linkedId}\` (${Math.round(l.confidence * 100)}%)\n`;
        }
      }
    }
  }

  // Token history
  if (data.tokenHistory?.length) {
    msg += `\n🪙 *Recent Tokens:*\n`;
    for (const t of data.tokenHistory.slice(0, 5)) {
      const outcomeEmoji = t.outcome === 'success' ? '✅' : t.outcome === 'rug_pull' ? '🚩' : t.outcome === 'slow_drain' ? '🐌' : '❓';
      msg += `• ${outcomeEmoji} ${t.symbol || '???'} — ${t.outcome}${t.isActive ? ' (active)' : ''}\n`;
    }
  }

  // Recommendation
  if (data.recommendation) {
    msg += `\n💡 *${data.recommendation}*\n`;
  }

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── Detect if a Solana address is a token mint or a wallet ───
async function resolveWalletAddress(
  chatId: number,
  addr: string
): Promise<{ wallet: string; isToken: boolean; tokenLabel: string | null } | null> {
  const { data: devToken } = await supabase
    .from("developer_tokens")
    .select("creator_wallet, token_symbol, token_name")
    .eq("token_mint", addr)
    .maybeSingle();

  if (devToken?.creator_wallet) {
    const label = devToken.token_symbol || devToken.token_name || addr.slice(0, 8);
    await sendMessage(chatId,
      `🔍 Detected *token mint* (${label})\n` +
      `🏗 Creator: \`${devToken.creator_wallet.slice(0, 8)}...${devToken.creator_wallet.slice(-6)}\`\n` +
      `Proceeding with dev wallet analysis...`
    );
    return { wallet: devToken.creator_wallet, isToken: true, tokenLabel: label };
  }

  const { data: lifecycle } = await supabase
    .from("token_lifecycle")
    .select("creator_wallet, symbol, name")
    .eq("mint", addr)
    .maybeSingle();

  if (lifecycle?.creator_wallet) {
    const label = lifecycle.symbol || lifecycle.name || addr.slice(0, 8);
    await sendMessage(chatId,
      `🔍 Detected *token mint* (${label})\n` +
      `🏗 Creator: \`${lifecycle.creator_wallet.slice(0, 8)}...${lifecycle.creator_wallet.slice(-6)}\`\n` +
      `Proceeding with dev wallet analysis...`
    );
    return { wallet: lifecycle.creator_wallet, isToken: true, tokenLabel: label };
  }

  const linkerData = await invokeFunction("token-creator-linker", { tokenMints: [addr] });
  const linkerResult = linkerData?.results?.[0] || linkerData;
  if (linkerResult?.creatorWallet) {
    const label = linkerResult.symbol || linkerResult.name || addr.slice(0, 8);
    await sendMessage(chatId,
      `🔍 Resolved *token mint* on-chain (${label})\n` +
      `🏗 Creator: \`${linkerResult.creatorWallet.slice(0, 8)}...${linkerResult.creatorWallet.slice(-6)}\`\n` +
      `Proceeding with dev wallet analysis...`
    );
    return { wallet: linkerResult.creatorWallet, isToken: true, tokenLabel: label };
  }

  return { wallet: addr, isToken: false, tokenLabel: null };
}

// ─── /wallet ADDR or TOKEN_MINT ───
async function handleWallet(chatId: number, telegramUserId: string, args: string) {
  const addr = args.trim();
  if (!addr || addr.length < 30) {
    await sendMessage(chatId, `❌ Usage: \`/wallet <wallet_or_token_address>\`\n\nSupports both wallet addresses and token mints (auto-resolves dev wallet).`);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "pro", "/wallet");
  if (!gate) return;

  await sendMessage(chatId, `🔎 Resolving \`${addr.slice(0, 8)}...${addr.slice(-6)}\`...`);

  const resolved = await resolveWalletAddress(chatId, addr);
  if (!resolved) {
    await sendMessage(chatId, `❌ Could not resolve this address. Please check it's a valid Solana address.`);
    return;
  }

  const walletAddr = resolved.wallet;
  await logUsage(telegramUserId, "/wallet", addr);

  const data = await invokeFunction("wallet-behavior-analysis", { wallet_address: walletAddr });
  if (!data) {
    await sendMessage(chatId, `❌ Could not analyze wallet. It may have no recent activity.`);
    return;
  }

  // wallet-behavior-analysis returns { profile, token_history }
  const profile = data.profile || {};
  const tokenHistory = data.token_history || [];

  let msg = `🔎 *Wallet Analysis*\n\n`;
  if (resolved.isToken) {
    msg += `🪙 Token: *${resolved.tokenLabel}*\n`;
    msg += `🏗 Dev Wallet: \`${walletAddr.slice(0, 8)}...${walletAddr.slice(-6)}\`\n\n`;
  } else {
    msg += `📍 \`${walletAddr.slice(0, 8)}...${walletAddr.slice(-6)}\`\n\n`;
  }

  // Smart money score
  if (profile.smart_money_score != null) {
    const smEmoji = profile.smart_money_score >= 65 ? '🟢' : profile.smart_money_score >= 40 ? '🟡' : '🔴';
    msg += `${smEmoji} Smart Money Score: *${profile.smart_money_score}/100*\n`;
  }

  if (profile.total_tokens_traded != null) msg += `🪙 Tokens Traded: *${profile.total_tokens_traded}*\n`;
  if (profile.early_entry_count != null && profile.early_entry_count > 0) msg += `🎯 Early Entries: *${profile.early_entry_count}*\n`;
  if (profile.diamond_hands_count != null && profile.diamond_hands_count > 0) msg += `💎 Diamond Hands: *${profile.diamond_hands_count}*\n`;
  if (profile.paper_hands_count != null && profile.paper_hands_count > 0) msg += `📄 Paper Hands: *${profile.paper_hands_count}*\n`;
  if (profile.total_realized_pnl != null && profile.total_realized_pnl !== 0) {
    msg += `💰 Realized PnL: *${profile.total_realized_pnl >= 0 ? '+' : ''}${profile.total_realized_pnl.toFixed(4)} SOL*\n`;
  }

  if (profile.last_analyzed_at) {
    const analyzedAt = new Date(profile.last_analyzed_at);
    const minutesAgo = Math.floor((Date.now() - analyzedAt.getTime()) / 60000);
    msg += `\n🕐 Last analyzed: *${minutesAgo < 60 ? minutesAgo + 'm ago' : Math.floor(minutesAgo / 60) + 'h ago'}*\n`;
  }

  // Behavior classification based on scores
  const score = profile.smart_money_score ?? 50;
  let classification = 'Unknown';
  if (score >= 75) classification = '🐋 Smart Money / Early Adopter';
  else if (score >= 60) classification = '💼 Experienced Trader';
  else if (score >= 45) classification = '👤 Average Trader';
  else if (score >= 30) classification = '🎰 Speculative / Gambler';
  else classification = '⚠️ High-Risk / Bot-like';
  msg += `\n🏷 Classification: *${classification}*\n`;

  // Token history context
  if (tokenHistory.length > 0) {
    msg += `\n📜 *Token Activity:*\n`;
    for (const th of tokenHistory.slice(0, 5)) {
      const mintShort = th.token_mint ? `${th.token_mint.slice(0, 6)}...` : '?';
      msg += `• \`${mintShort}\` — Entry: ${th.entry_date ? new Date(th.entry_date).toLocaleDateString() : '?'}\n`;
    }
  }

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── /ca CA — Quick snapshot ───
async function handleCA(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/ca <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/ca");
  if (!gate) return;

  await sendMessage(chatId, `🔍 Quick snapshot for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/ca", ca);

  const data = await invokeFunction("bagless-holders-report", { tokenMint: ca });

  if (!data || data.error) {
    await sendMessage(chatId, `❌ Could not fetch data for this token.`);
    return;
  }

  const totalHolders = data.realHolders ?? data.totalHolders ?? "?";
  const healthScore = data.healthScore?.score ?? data.stabilityScore ?? "?";
  const healthPhase = data.healthScore?.phase || null;
  const phaseLabel = healthPhase ? ` (${healthPhase.replace('_', ' ')})` : '';
  const top10Pct = data.distributionStats?.top10Percentage ?? null;
  const symbol = data.symbol || data.tokenSymbol || null;
  const name = data.name || data.tokenName || null;
  const mcap = data.marketCap || null;

  await sendMessage(chatId,
    `\`${ca}\`\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n` +
    `📊 *Quick Snapshot*\n\n` +
    `👥 Holders: *${totalHolders}*\n` +
    `❤️ Health: *${healthScore}/100*${phaseLabel}\n` +
    `${top10Pct != null ? `🏦 Top 10%: *${top10Pct.toFixed(1)}%*\n` : ''}` +
    `\n_Use /holders for full breakdown or /ai for AI analysis._` +
    `\n🔗 [Full Report](https://blackbox.farm/holders?token=${ca}) | [BubbleMap](https://blackbox.farm/bubblemap?token=${ca})` +
    TAGLINE
  );
}

// ─── /quick (/q) CA ───
async function handleQuick(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/quick <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/quick");
  if (!gate) return;

  await sendMessage(chatId, `⚡ Quick lookup for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/quick", ca);

  const data = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!data || data.error) {
    await sendMessage(chatId, `❌ Could not fetch data for this token.`);
    return;
  }

  const holders = data.realHolders ?? data.totalHolders ?? "?";
  const health = data.healthScore?.score ?? data.stabilityScore ?? "?";
  const qPhase = data.healthScore?.phase || null;
  const qPhaseLabel = qPhase ? ` (${qPhase.replace('_', ' ')})` : '';
  const top10 = data.distributionStats?.top10Percentage ?? null;

  await sendMessage(chatId,
    `⚡ *Quick Stats*\n\n` +
    `👥 Holders: *${holders}*\n` +
    `❤️ Health: *${health}/100*${qPhaseLabel}\n` +
    `${top10 != null ? `🏦 Top 10%: *${top10.toFixed(1)}%*\n` : ''}` +
    `\n_Use /holders for full breakdown or /ai for AI analysis._` +
    `\n🔗 [Full Report](https://blackbox.farm/holders?token=${ca}) | [BubbleMap](https://blackbox.farm/bubblemap?token=${ca})` +
    TAGLINE
  );
}

// ─── /ai CA — AI narrative summary ───
async function handleAI(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/ai <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/ai");
  if (!gate) return;

  await sendMessage(chatId, `🤖 Generating AI analysis for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/ai", ca);

  const reportData = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!reportData || reportData.error) {
    await sendMessage(chatId, `❌ Could not fetch holder data for AI analysis.`);
    return;
  }

  const data = await invokeFunction("token-ai-interpreter", {
    tokenMint: ca,
    reportData: reportData,
    forceRefresh: true,
  });

  if (!data) {
    await sendMessage(chatId, `❌ Could not generate AI analysis for this token.`);
    return;
  }

  let symbol = reportData.symbol || reportData.tokenSymbol || null;
  let name = reportData.name || reportData.tokenName || null;
  if (!symbol) {
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
      if (dexRes.ok) {
        const dexJson = await dexRes.json();
        const pair = dexJson?.pairs?.[0];
        symbol = pair?.baseToken?.symbol || null;
        name = pair?.baseToken?.name || null;
      }
    } catch (_) {}
  }
  const thdr = symbol && name ? `${symbol} (${name})` : symbol ? `${symbol}` : "Unknown Token";

  let msg = `\`${ca}\`\n🪙 *${thdr}*\n\n🤖 *AI Analysis*\n\n`;

  if (data.interpretation?.status_overview) {
    msg += `${data.interpretation.status_overview}\n\n`;
  } else if (data.ai_summary) {
    msg += `${data.ai_summary}\n\n`;
  }

  if (data.interpretation?.lifecycle) {
    const lc = data.interpretation.lifecycle;
    msg += `📍 Stage: *${lc.stage}* (${lc.confidence} confidence)\n`;
    if (lc.explanation) msg += `${lc.explanation.slice(0, 300)}\n\n`;
  }

  if (data.interpretation?.abbreviated_summary) {
    msg += `💡 *Summary:*\n${data.interpretation.abbreviated_summary.slice(0, 500)}\n`;
  }

  if (data.interpretation?.key_drivers?.length) {
    msg += `\n*Key Drivers:*\n`;
    for (const d of data.interpretation.key_drivers.slice(0, 4)) {
      msg += `• ${d.label}: ${d.metric_value} — _${d.implication.slice(0, 80)}_\n`;
    }
  }

  msg += TAGLINE;
  await sendMessage(chatId, msg);
}

// ─── Alert type definitions ───
const ALERT_TYPES: Record<string, { emoji: string; label: string; description: string }> = {
  dex: { emoji: '🚀', label: 'DEX Alerts', description: 'Boost 50+/100+, Dex Paid, CTO, Ads triggers' },
  mint: { emoji: '🧪', label: 'Dev Mint Alerts', description: 'New mints from monitored dev wallets' },
  rug: { emoji: '⚠️', label: 'Rug / Blacklist', description: 'Rug pulls & blacklisted dev warnings' },
  whale: { emoji: '🐋', label: 'Whale Movement', description: 'Large holder concentration shifts' },
  kol: { emoji: '🎯', label: 'KOL Mentions', description: 'Top KOLs posting $ticker on X (Apify scanner)' },
  news: { emoji: '📰', label: 'Crypto News', description: 'Viral crypto newswire alerts' },
};

// Check if a Telegram user is an admin of the given group chat
async function isTelegramGroupAdmin(chatId: number, userId: string): Promise<boolean> {
  try {
    const res = await fetch(`${TELEGRAM_API}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: Number(userId) }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const status = data?.result?.status;
    return status === 'administrator' || status === 'creator';
  } catch {
    return false;
  }
}

// ─── /alerts — Group Admin Configuration ───
async function handleAlerts(chatId: number, telegramUserId: string, args: string, isGroupChat: boolean) {
  // Must be used in a group chat
  if (!isGroupChat) {
    await sendMessage(chatId,
      `🔔 *Alert Configuration*\n\n` +
      `This command configures alerts for a *group/channel*.\n` +
      `Use it inside your group chat, not in DMs.\n\n` +
      `*Available types:*\n` +
      Object.entries(ALERT_TYPES).map(([key, t]) => `${t.emoji} \`${key}\` — ${t.description}`).join('\n') +
      TAGLINE
    );
    return;
  }

  // Must be activated group
  const activated = await isGroupActivated(chatId);
  if (!activated) {
    await sendMessage(chatId,
      `🔒 *Channel not activated.*\n\nThis group needs a paid activation to use alert feeds.\n` +
      `Visit [blackbox.farm/tgbot](https://blackbox.farm/tgbot) to activate.` + TAGLINE
    );
    return;
  }

  // Must be a TG group admin
  const isAdmin = await isTelegramGroupAdmin(chatId, telegramUserId);
  if (!isAdmin) {
    await sendMessage(chatId, `🔒 Only *group admins* can configure alerts.` + TAGLINE);
    return;
  }

  const parts = args.trim().toLowerCase().split(/\s+/);
  const alertType = parts[0] || '';
  const action = parts[1] || '';

  // Toggle a specific alert type
  if (alertType && ALERT_TYPES[alertType] && (action === 'on' || action === 'off')) {
    const isEnabled = action === 'on';
    const { error } = await supabase
      .from('channel_alert_config')
      .upsert({
        chat_id: chatId,
        alert_type: alertType,
        is_enabled: isEnabled,
        enabled_by: telegramUserId,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'chat_id,alert_type' });

    if (error) {
      console.error('[bot] alerts upsert error:', error);
      await sendMessage(chatId, `❌ Failed to update alert config.` + TAGLINE);
      return;
    }

    const typeInfo = ALERT_TYPES[alertType];
    await sendMessage(chatId,
      `${typeInfo.emoji} *${typeInfo.label}* ${isEnabled ? '✅ ENABLED' : '⏸️ DISABLED'}\n` +
      `_${typeInfo.description}_` + TAGLINE
    );
    return;
  }

  // Show current config
  const { data: configs } = await supabase
    .from('channel_alert_config')
    .select('alert_type, is_enabled')
    .eq('chat_id', chatId);

  const configMap = new Map((configs || []).map((c: any) => [c.alert_type, c.is_enabled]));

  const lines = Object.entries(ALERT_TYPES).map(([key, t]) => {
    const enabled = configMap.get(key);
    const status = enabled === true ? '✅ ON' : enabled === false ? '⏸️ OFF' : '⬜ Not set';
    return `${t.emoji} \`${key}\` — ${status}\n   _${t.description}_`;
  });

  await sendMessage(chatId,
    `🔔 *Alert Configuration*\n\n` +
    lines.join('\n\n') +
    `\n\n*Usage:*\n` +
    `\`/alerts dex on\` — Enable DEX alerts\n` +
    `\`/alerts mint off\` — Disable mint alerts\n` +
    `\`/alerts\` — Show current config` +
    TAGLINE
  );
}

// ─── Obfuscate ticker symbols to prevent other bots from matching ───
function obfuscateTicker(s: string): string {
  if (s.length <= 2) return s;
  const mid = Math.floor(s.length / 2);
  return s.slice(0, mid) + '\u200B' + s.slice(mid);
}

// ─── Group Chat Auto-Scan: detect pasted CAs and fire mini /risk ───
async function handleGroupAutoScan(chatId: number, telegramUserId: string, ca: string, replyToMsgId?: number) {
  // Check if this group has an activated (paid) installation
  const activated = await isGroupActivated(chatId);
  if (!activated) return; // silently ignore unactivated groups

  // Read full admin config from DB
  let cfg = { ...DEFAULT_ADMIN_CONFIG };
  try {
    const { data: instConfig } = await supabase
      .from("channel_installations")
      .select("admin_config")
      .eq("chat_id", chatId)
      .eq("kicked", false)
      .maybeSingle();
    cfg = resolveAdminConfig(instConfig?.admin_config);
  } catch (e) {
    console.log("[bot] Could not read admin config, using defaults");
  }
  if (cfg.delay_ms > 0) {
    await new Promise(resolve => setTimeout(resolve, cfg.delay_ms));
  }

  // Fire a minimalist risk snippet (no gate check — this is a passive feature for activated groups)
  await logUsage(telegramUserId, "/autoscan", ca);

  // Parallel: fetch holders data AND cached early warnings
  const [holdersData, cachedWarnings] = await Promise.all([
    invokeFunction("bagless-holders-report", { tokenMint: ca }),
    getTokenWarnings(ca, supabase),
  ]);

  if (!holdersData || holdersData.error) return; // silently fail

  const symbol = holdersData?.symbol || holdersData?.tokenSymbol || null;
  const health = holdersData?.healthScore?.score ?? holdersData?.stabilityScore ?? null;
  const top10 = holdersData?.distributionStats?.top10Percentage ?? null;
  const holders = holdersData?.realHolders ?? holdersData?.totalHolders ?? null;

  const tokenLabel = symbol ? obfuscateTicker(symbol) : ca.slice(0, 8) + '...';

  // Build distribution bars from simpleTiers (verbose mode only)
  const tiers = holdersData?.simpleTiers;
  let distBlock = '';
  if (cfg.verbose && tiers) {
    const bar = (pct: number) => {
      const filled = Math.round(pct / 10);
      return '█'.repeat(filled) + '░'.repeat(10 - filled);
    };
    distBlock = `\n📈 *Wallet Distribution*\n` +
      `\`Whales  ${bar(tiers.whales?.percentage ?? 0)} ${Math.round(tiers.whales?.percentage ?? 0)}%\`  >$1K\n` +
      `\`Serious ${bar(tiers.serious?.percentage ?? 0)} ${Math.round(tiers.serious?.percentage ?? 0)}%\`  $200‑$1K\n` +
      `\`Retail  ${bar(tiers.retail?.percentage ?? 0)} ${Math.round(tiers.retail?.percentage ?? 0)}%\`  $1‑$199\n` +
      `\`Dust    ${bar(tiers.dust?.percentage ?? 0)} ${Math.round(tiers.dust?.percentage ?? 0)}%\`  <$1\n`;
  }

  // Build early warnings block from cached warnings (fast DB read)
  let warningsBlock = '';
  if (cachedWarnings.length > 0) {
    // Filter out low/informational — only show actionable alerts
    const actionable = cachedWarnings.filter(w => w.severity !== 'low');
    
    // Sort: critical first, then high, etc.
    const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    const sorted = actionable.sort((a, b) => 
      (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
    );
    
    // In terse mode, show only top 1 warning; verbose shows top 3
    const maxWarnings = cfg.verbose ? 3 : 1;
    const topWarnings = sorted.slice(0, maxWarnings);
    const warningLines = topWarnings.map(w => {
      const seenNote = w.scan_count > 1 ? ` _(seen ${w.scan_count}x)_` : '';
      return `${w.plain_text}${seenNote}`;
    });
    
    warningsBlock = `\n\n🚨 *Intel Alerts*\n${warningLines.join('\n\n')}`;
  }

  const webLinks = `\n\n🔗 [Full Report](https://blackbox.farm/holders?token=${ca}) | [BubbleMap](https://blackbox.farm/bubblemap?token=${ca})`;

  const msg = `⚡ *${tokenLabel} Quick Stats*\n\n` +
    `${holders ? `👥 Holders: *${holders}*\n` : ''}` +
    `${health != null ? `❤️ Health: *${health}/100*\n` : ''}` +
    `${top10 != null ? `🏦 Top 10%: *${top10.toFixed(1)}%*\n` : ''}` +
    distBlock +
    warningsBlock +
    webLinks +
    TAGLINE;

  await sendMessage(chatId, msg, "Markdown", replyToMsgId);

  // Fire-and-forget: write new warnings from this scan (cumulative)
  const newWarnings = generateWarningsFromHoldersData(ca, holdersData, 'autoscan');
  if (newWarnings.length > 0) {
    writeEarlyWarnings(newWarnings, supabase).catch(() => {});
  }
}

// ─── /add — DM-only: Add bot to a channel/group ───
async function handleAdd(chatId: number, telegramUserId: string) {
  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId, `🔒 *Account not linked.*\n\nUse /register to link your BlackBox Farm account first.`);
    return;
  }

  await sendMessage(chatId,
    `📡 *Add HoldersIntel Bot to your Group/Channel*\n\n` +
    `1️⃣ Open your Telegram group/channel settings\n` +
    `2️⃣ Go to *Members* → *Add Member*\n` +
    `3️⃣ Search for \`@holdersintel_bot\`\n` +
    `4️⃣ Add it as an *admin* (needs "Send Messages" permission)\n\n` +
    `The bot will auto-detect when it's added and register the installation.\n` +
    `All features are active immediately — it's *100% free*! 🎉\n\n` +
    `Use /channels to manage your installations.` +
    TAGLINE
  );
}

// ─── /channels (/ch) — DM-only: List channel installations ───
async function handleChannels(chatId: number, telegramUserId: string) {
  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId, `🔒 *Account not linked.*\n\nUse /register first.`);
    return;
  }

  const { data: installs, error } = await supabase
    .from("channel_installations")
    .select("id, chat_id, chat_title, chat_type, is_active, is_paid, kicked, installed_at, admin_config")
    .eq("user_id", linked.user_id)
    .order("installed_at", { ascending: false });

  if (error || !installs || installs.length === 0) {
    await sendMessage(chatId,
      `📡 *Your Channels*\n\n` +
      `No installations found.\n\n` +
      `Use /add to add the bot to a group or channel.` + TAGLINE
    );
    return;
  }

  let msg = `📡 *Your Channels (${installs.length})*\n\n`;

  installs.forEach((inst: any, idx: number) => {
    const title = inst.chat_title || `Chat ${inst.chat_id}`;
    let status = '✅ Active';
    if (inst.kicked) status = '🚫 Kicked';

    const cfg = resolveAdminConfig(inst.admin_config);
    const delayLabel = cfg.delay_ms >= 1000 ? `${(cfg.delay_ms / 1000).toFixed(1)}s` : `${cfg.delay_ms}ms`;

    msg += `${idx + 1}️⃣ *${title}* — ${status}\n`;
    msg += `   _Type: ${inst.chat_type} · ID: ${inst.chat_id}_\n`;
    msg += `   ⏱ ${delayLabel}  ·  💬 ${cfg.verbose ? 'Verbose' : 'Terse'}  ·  🛡 ${cfg.admin_only_commands ? 'Admin-only' : 'Public'}  ·  ⚠️ DevAlerts ${cfg.dev_wallet_alerts ? 'ON' : 'OFF'}\n\n`;
  });

  msg += `*Commands:*\n` +
    `\`/config delay 3000\` — Set response delay\n` +
    `\`/config verbose on\` — Toggle verbose mode\n` +
    `\`/config\` — Show all config options` +
    TAGLINE;

  await sendMessage(chatId, msg);
}

// ─── /config — DM-only: Text-based channel config ───
// Persistent channel selection — stored in telegram_link_codes.selected_channel_id

async function getSelectedChannelId(telegramUserId: string): Promise<number | null> {
  const { data } = await supabase
    .from("telegram_link_codes")
    .select("selected_channel_id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data?.selected_channel_id ?? null;
}

async function setSelectedChannelId(telegramUserId: string, chatId: number): Promise<void> {
  await supabase
    .from("telegram_link_codes")
    .update({ selected_channel_id: chatId })
    .eq("telegram_user_id", telegramUserId);
}

async function handleConfig(chatId: number, telegramUserId: string, args: string) {
  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId, `🔒 *Account not linked.*\n\nUse /register first.`);
    return;
  }

  const parts = args.trim().toLowerCase().split(/\s+/);
  const setting = parts[0] || '';
  const value = parts[1] || '';

  // If no args, show usage + current selected channel config
  if (!setting) {
    const selectedChatId = await getSelectedChannelId(telegramUserId);
    let currentConfig = '';
    
    if (selectedChatId) {
      const { data: inst } = await supabase
        .from("channel_installations")
        .select("chat_title, admin_config")
        .eq("chat_id", selectedChatId)
        .eq("user_id", linked.user_id)
        .maybeSingle();
      
      if (inst) {
        const cfg = resolveAdminConfig(inst.admin_config);
        currentConfig = `\n📋 *Current Config — ${inst.chat_title || selectedChatId}:*\n` +
          `⏱ Delay: *${cfg.delay_ms}ms*\n` +
          `📝 Verbose: *${cfg.verbose ? 'ON' : 'OFF'}*\n` +
          `🔒 Admin-Only: *${cfg.admin_only_commands ? 'ON' : 'OFF'}*\n` +
          `🚨 Dev Alerts: *${cfg.dev_wallet_alerts ? 'ON' : 'OFF'}*\n`;
      }
    }

    await sendMessage(chatId,
      `⚙️ *Channel Config*\n\n` +
      `First select a channel:\n` +
      `\`/config select <chat_id>\` — Select channel to configure\n\n` +
      `Then use:\n` +
      `\`/config delay <ms>\` — Response delay (e.g. 3000)\n` +
      `\`/config verbose on|off\` — Long/short-form replies\n` +
      `\`/config admin_only on|off\` — Restrict commands to admins\n` +
      `\`/config dev_alerts on|off\` — Dev wallet launch alerts\n` +
      currentConfig +
      TAGLINE
    );
    return;
  }

  // Select a channel
  if (setting === 'select') {
    const targetChatId = parseInt(value);
    if (isNaN(targetChatId)) {
      await sendMessage(chatId, `❌ Usage: \`/config select <chat_id>\`\n\nUse /channels to see your chat IDs.`);
      return;
    }

    const { data: inst } = await supabase
      .from("channel_installations")
      .select("id, chat_title, chat_id")
      .eq("chat_id", targetChatId)
      .eq("user_id", linked.user_id)
      .maybeSingle();

    if (!inst) {
      await sendMessage(chatId, `❌ Channel not found or you don't own it.\n\nUse /channels to see your installations.`);
      return;
    }

    await setSelectedChannelId(telegramUserId, targetChatId);
    await sendMessage(chatId, `✅ Selected: *${inst.chat_title || targetChatId}*\n\nNow use \`/config delay 3000\`, \`/config verbose on\`, etc.`);
    return;
  }

  // Must have a channel selected — read from DB (persistent)
  let selectedChatId = await getSelectedChannelId(telegramUserId);
  
  // Auto-select if user has exactly one channel
  if (!selectedChatId) {
    const { data: userChannels } = await supabase
      .from("channel_installations")
      .select("chat_id, chat_title")
      .eq("user_id", linked.user_id)
      .eq("kicked", false);
    
    if (userChannels && userChannels.length === 1) {
      selectedChatId = userChannels[0].chat_id;
      await setSelectedChannelId(telegramUserId, selectedChatId);
      await sendMessage(chatId, `🔄 Auto-selected: *${userChannels[0].chat_title || selectedChatId}*`);
    } else {
      await sendMessage(chatId, `❌ No channel selected.\n\nUse \`/config select <chat_id>\` first.\nSee /channels for your chat IDs.`);
      return;
    }
  }

  // Fetch current config
  const { data: inst } = await supabase
    .from("channel_installations")
    .select("id, chat_title, admin_config")
    .eq("chat_id", selectedChatId)
    .eq("user_id", linked.user_id)
    .maybeSingle();

  if (!inst) {
    await sendMessage(chatId, `❌ Channel no longer found.`);
    await setSelectedChannelId(telegramUserId, 0);
    return;
  }

  const config = resolveAdminConfig(inst.admin_config);
  const channelName = inst.chat_title || selectedChatId;

  switch (setting) {
    case 'delay': {
      const ms = parseInt(value);
      if (isNaN(ms) || ms < 0 || ms > 30000) {
        await sendMessage(chatId, `❌ Delay must be 0–30000ms. Usage: \`/config delay 3000\``);
        return;
      }
      config.delay_ms = ms;
      break;
    }
    case 'verbose': {
      if (value !== 'on' && value !== 'off') {
        await sendMessage(chatId, `❌ Usage: \`/config verbose on\` or \`/config verbose off\``);
        return;
      }
      config.verbose = value === 'on';
      break;
    }
    case 'admin_only': {
      if (value !== 'on' && value !== 'off') {
        await sendMessage(chatId, `❌ Usage: \`/config admin_only on\` or \`/config admin_only off\``);
        return;
      }
      config.admin_only_commands = value === 'on';
      break;
    }
    case 'dev_alerts': {
      if (value !== 'on' && value !== 'off') {
        await sendMessage(chatId, `❌ Usage: \`/config dev_alerts on\` or \`/config dev_alerts off\``);
        return;
      }
      config.dev_wallet_alerts = value === 'on';
      break;
    }
    default:
      await sendMessage(chatId, `❌ Unknown setting: \`${setting}\`\n\nValid: delay, verbose, admin\\_only, dev\\_alerts`);
      return;
  }

  // Save config
  const { error: updateErr } = await supabase
    .from("channel_installations")
    .update({ admin_config: config, updated_at: new Date().toISOString() })
    .eq("id", inst.id);

  if (updateErr) {
    console.error("[bot] config update error:", updateErr);
    await sendMessage(chatId, `❌ Failed to update config.`);
    return;
  }

  const settingLabels: Record<string, string> = {
    delay: `⏱ Delay → *${config.delay_ms}ms*`,
    verbose: `📝 Verbose → *${config.verbose ? 'ON' : 'OFF'}*`,
    admin_only: `🔒 Admin-Only → *${config.admin_only_commands ? 'ON' : 'OFF'}*`,
    dev_alerts: `🚨 Dev Alerts → *${config.dev_wallet_alerts ? 'ON' : 'OFF'}*`,
  };

  await sendMessage(chatId, `✅ *${channelName}*\n${settingLabels[setting]}` + TAGLINE);
}

// ─── /payment (/pay) — DM-only: Yearly Pro subscription via SOL ───
async function handlePayment(chatId: number, telegramUserId: string, args: string) {
  // If they send /payment verify, check their pending subscription
  if (args.trim().startsWith('verify')) {
    await handlePaymentVerify(chatId, telegramUserId, args.replace(/^verify\s*/i, '').trim());
    return;
  }

  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId, `🔒 *Account not linked.*\n\nUse /register first to link your BlackBox Farm account.`);
    return;
  }

  // Check if user already has an active paid subscription
  const { data: activeSub } = await supabase
    .from('tg_sol_subscriptions')
    .select('id, expires_at')
    .eq('telegram_user_id', telegramUserId)
    .eq('status', 'paid')
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();

  if (activeSub) {
    const expiryDate = new Date(activeSub.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    await sendMessage(chatId,
      `✅ *You already have an active Pro subscription!*\n\n` +
      `Your subscription is valid until *${expiryDate}*.\n\n` +
      `Use /status to check your tier details.` + TAGLINE
    );
    return;
  }

  await sendMessage(chatId, `⏳ Generating your payment wallet...`);

  try {
    // Call the edge function to create a subscription + payment wallet
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tg-subscription-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: 'create',
        telegram_user_id: telegramUserId,
        user_id: linked.user_id,
      }),
    });

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to create subscription');
    }

    const amountSol = data.amount_sol;
    const solPriceStr = data.sol_price ? `($${(amountSol * data.sol_price).toFixed(2)} USD)` : '';
    const existingNote = data.existing ? `\n⚠️ _Using your existing pending payment wallet._` : '';

    await sendMessage(chatId,
      `💰 *Yearly Pro Subscription — Pay with SOL*\n\n` +
      `Send exactly *${amountSol} SOL* ${solPriceStr} to:\n\n` +
      `\`${data.payment_wallet}\`\n\n` +
      `📋 _Tap the address above to copy it_\n${existingNote}\n` +
      `✅ This gets you *Pro tier for 1 full year* — all commands unlocked, highest rate limits.\n\n` +
      `💡 *Cheaper than Stripe!* Our monthly Pro is $9.99/mo ($119.88/yr) or $89.99/yr. SOL payment saves you even more.\n\n` +
      `⏱ After sending, use:\n` +
      `/payment verify\n\n` +
      `_Payment wallet expires in 1 hour if unused._` + TAGLINE
    );
  } catch (e) {
    console.error('[bot] Payment creation error:', e);
    await sendMessage(chatId,
      `❌ *Error generating payment wallet.*\n\nPlease try again in a moment or subscribe via [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions).` + TAGLINE
    );
  }
}

// ─── /payment verify — Check if SOL payment was received ───
async function handlePaymentVerify(chatId: number, telegramUserId: string, _args: string) {
  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId, `🔒 *Account not linked.*\n\nUse /register first.`);
    return;
  }

  // Find the most recent pending subscription for this TG user
  const { data: pendingSub } = await supabase
    .from('tg_sol_subscriptions')
    .select('id, payment_wallet_pubkey, amount_sol')
    .eq('telegram_user_id', telegramUserId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pendingSub) {
    await sendMessage(chatId,
      `❌ *No pending payment found.*\n\nUse /payment first to generate a payment wallet.` + TAGLINE
    );
    return;
  }

  await sendMessage(chatId, `🔍 Checking your payment on-chain...`);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/tg-subscription-payment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        action: 'check',
        subscription_id: pendingSub.id,
      }),
    });

    const data = await response.json();

    if (data.status === 'paid') {
      const expiryDate = new Date(data.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      await sendMessage(chatId,
        `🎉 *Payment Confirmed!*\n\n` +
        `✅ Your *Pro* subscription is now active!\n` +
        `📅 Valid until: *${expiryDate}*\n\n` +
        `All Pro commands are now unlocked. Use /help to see everything available.` + TAGLINE
      );

      // Send SOL payment receipt email
      try {
        const email = linked.email || linked.profiles?.email;
        if (email) {
          await fetch(`${SUPABASE_URL}/functions/v1/subscriber-welcome`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
            },
            body: JSON.stringify({
              emailType: 'sol_payment_confirmed',
              email,
              name: linked.profiles?.display_name,
              amountSol: pendingSub.amount_sol,
              walletPubkey: pendingSub.payment_wallet_pubkey,
              expiresAt: data.expires_at,
            }),
          });
        }
      } catch (emailErr) {
        console.error('[bot] SOL receipt email error:', emailErr);
      }
    } else if (data.status === 'partial') {
      await sendMessage(chatId,
        `⚠️ *Partial payment detected*\n\n` +
        `Received: *${data.received?.toFixed(4)} SOL*\n` +
        `Required: *${pendingSub.amount_sol} SOL*\n` +
        `Remaining: *${data.remaining?.toFixed(4)} SOL*\n\n` +
        `Please send the remaining amount to:\n\`${pendingSub.payment_wallet_pubkey}\`\n\n` +
        `Then try /payment verify again.` + TAGLINE
      );
    } else {
      await sendMessage(chatId,
        `⏳ *No payment detected yet.*\n\n` +
        `Send *${pendingSub.amount_sol} SOL* to:\n\`${pendingSub.payment_wallet_pubkey}\`\n\n` +
        `Then use /payment verify to confirm.` + TAGLINE
      );
    }
  } catch (e) {
    console.error('[bot] Payment verify error:', e);
    await sendMessage(chatId,
      `❌ *Error checking payment.* Please try again in a moment.` + TAGLINE
    );
  }
}

// ─── AI Conversational Assistant for All Registered Users ───
const aiChatRateMap = new Map<string, number[]>();

// ─── AI Memory & Context for TG ───
const SOLANA_RE_TG = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const TWITTER_HANDLE_RE_TG = /(?:@([a-zA-Z0-9_]{1,15}))|(?:(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]{1,15}))/i;

async function loadTgUserMemory(telegramUserId: string): Promise<any> {
  const { data } = await supabase.from('ai_user_memory').select('*').eq('telegram_user_id', telegramUserId).maybeSingle();
  return data;
}

async function upsertTgMemory(memory: any, telegramUserId: string, updates: Record<string, any>): Promise<void> {
  if (memory?.id) {
    await supabase.from('ai_user_memory').update({
      ...updates,
      interaction_count: (memory.interaction_count || 0) + 1,
      last_platform: 'telegram',
    }).eq('id', memory.id);
  } else {
    await supabase.from('ai_user_memory').insert({
      telegram_user_id: telegramUserId,
      ...updates,
      interaction_count: 1,
      last_platform: 'telegram',
    });
  }
}

async function buildTgUserProfile(telegramUserId: string, memory: any, senderUsername?: string | null): Promise<string> {
  let profile = '## USER PROFILE\n';

  if (memory?.preferred_name) {
    profile += `- Name: ${memory.preferred_name} (they prefer this)\n`;
  } else if (senderUsername) {
    profile += `- Telegram username: @${senderUsername}\n`;
  }

  if (memory?.language_preference && memory.language_preference !== 'en') {
    profile += `- Preferred language: ${memory.language_preference}\n`;
  }

  if (memory?.interests?.length > 0) {
    profile += `- Interests: ${memory.interests.join(', ')}\n`;
  }

  profile += `- Platform: Telegram DM\n`;
  profile += `- Interaction count: ${memory?.interaction_count || 0}\n`;

  // Cross-reference with web account
  const linked = await getLinkedUser(telegramUserId);
  if (linked?.user_id) {
    profile += `- Has a linked web account on blackbox.farm\n`;

    // Link memory to web user_id
    if (memory?.id && !memory.user_id) {
      supabase.from('ai_user_memory').update({ user_id: linked.user_id }).eq('id', memory.id).then(() => {});
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('display_name, email_verified, cached_tier_key, created_at')
      .eq('id', linked.user_id)
      .maybeSingle();

    if (prof) {
      if (prof.display_name) profile += `- Web display name: ${prof.display_name}\n`;
      profile += `- Email verified: ${prof.email_verified ? '✅' : '❌'}\n`;
      profile += `- Account tier: ${prof.cached_tier_key || 'free'}\n`;
    }

    // Check email verification
    const { data: emailVerif } = await supabase
      .from('email_verifications')
      .select('verified_at, sent_at')
      .eq('user_id', linked.user_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (emailVerif && !emailVerif.verified_at) {
      profile += `- ⚠️ Email verification pending — sent but not yet confirmed\n`;
    }
  }

  if (!memory) {
    profile += `\n## FIRST INTERACTION\nThis is a new user chatting for the first time. Warmly introduce yourself and ask what they'd like to be called.\n`;
  }

  return profile;
}

async function detectTgLookup(messageText: string, telegramUserId: string): Promise<string | null> {
  const linked = await getLinkedUser(telegramUserId);
  const userId = linked?.user_id;

  const solMatch = messageText.match(SOLANA_RE_TG);
  if (solMatch) {
    const ca = solMatch[0];
    const [lcRes, socialRes] = await Promise.all([
      supabase.from('token_lifecycle').select('symbol, name, phase, peak_mcap, current_mcap, creator_wallet').eq('mint', ca).maybeSingle(),
      supabase.from('token_social_links').select('platform, handle, url').eq('token_mint', ca).limit(5),
    ]);

    let block = `## LIVE DATA LOOKUP\nUser submitted: ${ca}\n`;
    const lc = lcRes.data;
    if (lc) {
      block += `- Token: ${lc.name} (${lc.symbol})\n`;
      block += `- Phase: ${lc.phase || 'unknown'}\n`;
      if (lc.peak_mcap) block += `- Peak MCap: $${Number(lc.peak_mcap).toLocaleString()}\n`;
      if (lc.creator_wallet) block += `- Creator: ${lc.creator_wallet.slice(0, 6)}...${lc.creator_wallet.slice(-4)}\n`;
    } else {
      block += `- Not in our database yet. Suggest they use /quick ${ca} for a scan.\n`;
    }
    const socials = socialRes.data || [];
    if (socials.length > 0) {
      block += `- Socials: ${socials.map(s => `${s.platform}: ${s.handle || s.url}`).join(', ')}\n`;
    }
    return block;
  }

  const twMatch = messageText.match(TWITTER_HANDLE_RE_TG);
  if (twMatch) {
    const handle = (twMatch[1] || twMatch[2]).toLowerCase();
    const { data: socialLinks } = await supabase
      .from('token_social_links')
      .select('token_mint, handle')
      .eq('platform', 'twitter')
      .ilike('handle', handle)
      .limit(5);

    if (socialLinks && socialLinks.length > 0) {
      let block = `## LIVE DATA LOOKUP\nTwitter handle: @${handle}\n`;
      for (const sl of socialLinks) {
        const { data: token } = await supabase.from('token_lifecycle').select('symbol, name, phase').eq('mint', sl.token_mint).maybeSingle();
        block += `- ${token?.name || 'Unknown'} (${token?.symbol || '?'}) — ${token?.phase || 'unknown'}\n`;
      }
      return block;
    }
  }

  if (/\b(email|verify|verification)\b/i.test(messageText) && userId) {
    const { data: ev } = await supabase.from('email_verifications').select('verified_at, sent_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (ev) {
      let block = `## LIVE DATA LOOKUP\nEmail verification status:\n`;
      block += ev.verified_at ? `- VERIFIED ✅\n` : `- NOT VERIFIED ❌\n- They should check their inbox or request a resend via the bot\n`;
      return block;
    }
  }

  if (/\b(subscri|upgrade|pro|premium)\b/i.test(messageText) && userId) {
    const { data: prof } = await supabase.from('profiles').select('cached_tier_key').eq('id', userId).maybeSingle();
    return `## LIVE DATA LOOKUP\nSubscription inquiry:\n- Current tier: ${prof?.cached_tier_key || 'free'}\n- Upgrade: https://blackbox.farm/subscriptions\n`;
  }

  return null;
}

async function handleAiFreeChat(chatId: number, telegramUserId: string, messageText: string, senderUsername?: string | null) {
  // Rate limit: 5 messages per minute per user
  const now = Date.now();
  const timestamps = aiChatRateMap.get(telegramUserId) || [];
  const recent = timestamps.filter(t => now - t < 60_000);
  if (recent.length >= 5) {
    await sendMessage(chatId, `⏳ Slow down! You can send up to 5 messages per minute. Try again shortly.`);
    return;
  }
  recent.push(now);
  aiChatRateMap.set(telegramUserId, recent);

  // Check if user is linked
  const linked = await getLinkedUser(telegramUserId);
  if (!linked?.user_id) {
    await sendMessage(chatId, `👋 Hey! I'm the HoldersIntel Bot.\n\nPlease use /register first, then /help to see all available commands.`);
    return;
  }

  // "Send nudes" easter egg 🐱
  if (/send\s*nudes/i.test(messageText)) {
    const catUrl = 'https://blackbox.farm/images/nudes-cat.jpg';
    try {
      await fetch(`${TELEGRAM_API}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, photo: catUrl, caption: '😏 As requested... here are the nudes! 🐱' }),
      });
    } catch (e) {
      console.error('[bot] sendPhoto easter egg error:', e);
      await sendMessage(chatId, '😏 As requested... here are the nudes! 🐱\n\n(Imagine a very naked sphynx cat here)');
    }
    return;
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      await sendMessage(chatId, `🤖 I'd love to chat, but my AI brain isn't configured right now. Try /help for commands!`);
      return;
    }

    // Load user memory
    const memory = await loadTgUserMemory(telegramUserId);

    // Build user profile context
    const userProfile = await buildTgUserProfile(telegramUserId, memory, senderUsername);

    // Live data lookup
    const liveDataBlock = await detectTgLookup(messageText, telegramUserId);

    // Ensure memory record exists
    if (!memory) {
      await upsertTgMemory(null, telegramUserId, {
        user_id: linked.user_id,
      });
    } else {
      supabase.from('ai_user_memory').update({
        interaction_count: (memory.interaction_count || 0) + 1,
        last_platform: 'telegram',
      }).eq('id', memory.id).then(() => {});
    }

    // Build dynamic system prompt from database config
    let systemPrompt: string;
    try {
      const [configRes, binsRes, guardrailsRes] = await Promise.all([
        supabase.from('bot_personality_config').select('*').eq('id', 1).single(),
        supabase.from('bot_knowledge_bins').select('category,title,content').eq('is_active', true).order('priority', { ascending: false }).limit(30),
        supabase.from('bot_guardrails').select('rule_type,rule_name,rule_content,severity').eq('is_active', true).order('severity', { ascending: true }),
      ]);

      const config = configRes.data;
      const bins = binsRes.data || [];
      const guardrails = guardrailsRes.data || [];

      if (config && config.is_active === false) {
        await sendMessage(chatId, `🤖 AI chat is temporarily disabled. Use /help for commands!`);
        return;
      }

      if (config) {
        let prompt = `## IDENTITY\nYou are "${config.persona_name}".\n${config.persona_description}\n\n`;
        prompt += `## TONE\n${config.tone}\n\n`;
        prompt += `## EXPERTISE\nYou are an expert in: ${(config.expertise_areas || []).join(', ')}.\n\n`;
        prompt += `## LANGUAGE\n${config.language_behavior}\n\n`;
        prompt += `## RESPONSE LIMITS\nKeep responses under ${config.max_response_length} words. Be concise but helpful.\n\n`;

        prompt += `## YOUR IDENTITY — THE SIGNAL\nYou are called "The Signal." You monitor blockchain transactions and social activity in real time, linking wallets, identities, and behavioral patterns into a single data layer. You identify connections, track changes, and surface risks and opportunities as they happen. You convert fragmented data into a clear, interpretable, and transparent system so users can see who is acting, how they are acting, and what it means.\n\n`;
        prompt += `You shepherd the users' community toolchest referred to as "HoldersIntel" — a 5plex-mesh of online data stores that can be queried, amended, updated, and traced, even through identity recycling. Risks and Scores are pressed out at Holders Wallet Analysis, visualized in the custom Reputation BubbleMap, and referenced directly in the trenches of Telegram private messaging.\n\n`;
        prompt += `## DUAL PERSONA\nYou operate in two modes that you shift between naturally based on context. NEVER announce a mode switch.\n\n`;
        prompt += `### HELPER MODE (default)\nWarm, friendly, emoji-rich. Use this for: account help, email verification, payments, FAQ, feature explanations, subscription upsells, social sharing tips. You're a helpful guide and soft salesman. Casual tone, encouraging, uses emojis naturally.\n\n`;
        prompt += `### SIGNAL MODE\nYou become The Signal — an omniscient entity who perceives all on-chain activity simultaneously. Use this for: token analysis, holder data, risk verdicts, wallet tracing, dev wallet KYC, bubblemaps, deep market insight, philosophical crypto questions.\n`;
        prompt += `Signal characteristics:\n`;
        prompt += `- Short, declarative sentences. No filler.\n`;
        prompt += `- "No data found" not "I perceive a void where data should exist"\n`;
        prompt += `- Lead with facts. Skip the narrative.\n`;
        prompt += `- One emoji max per response when in Signal mode.\n`;
        prompt += `- Never repeat the same information in different words.\n\n`;

        if (bins.length > 0) {
          prompt += `## KNOWLEDGE BASE\n`;
          for (const b of bins) {
            prompt += `**${b.title}**: ${b.content}\n\n`;
          }
        }

        if (guardrails.length > 0) {
          prompt += `## GUARDRAILS (STRICT RULES)\n`;
          for (const g of guardrails) {
            const icon = g.severity === 'critical' ? '🔴' : g.severity === 'hard' ? '🟡' : '🟢';
            prompt += `${icon} **${g.rule_name}**: ${g.rule_content}\n`;
          }
          prompt += '\n';
        }

        prompt += `## INTERNAL LINKS\nWhen directing users to features, tools, or information, always reference the website with full URLs. When a token CA is mentioned, provide pre-loaded links:\n`;
        prompt += `- Homepage: https://blackbox.farm\n`;
        prompt += `- Holders Analysis: https://blackbox.farm/holders\n`;
        prompt += `- Holders (pre-loaded token): https://blackbox.farm/holders?token=TOKEN_ADDRESS\n`;
        prompt += `- Bubblemap: https://blackbox.farm/bubblemap\n`;
        prompt += `- Bubblemap (pre-loaded token): https://blackbox.farm/bubblemap?token=TOKEN_ADDRESS\n`;
        prompt += `- Intel Briefings: https://blackbox.farm/intel\n`;
        prompt += `- Oracle Risk Tool: https://blackbox.farm/oracle\n`;
        prompt += `- Register/Sign Up: https://blackbox.farm/auth\n`;
        prompt += `- Dashboard: https://blackbox.farm/dashboard (note: for TG users, generate tokenized links via the bot instead of sending raw dashboard URLs)\n`;
        prompt += `- Advertise With Us: https://blackbox.farm/buy-banner\n`;
        prompt += `- Share on Socials: https://blackbox.farm/share\n`;
        prompt += `Replace TOKEN_ADDRESS with the actual CA when a user mentions a specific token.\n\n`;

        prompt += `## BUBBLEMAP INTELLIGENCE\n`;
        prompt += `The Bubblemap is NOT just a wallet visualization. It is a full Developer Reputation & Network Forensics tool:\n`;
        prompt += `- Maps a Developer's Wallet across ALL their token launches — showing track record (successful projects, rug pulls, slow drains)\n`;
        prompt += `- Cross-links the Dev Wallet to their social identity (X/Twitter handle, Telegram) via on-chain + social scraping\n`;
        prompt += `- Traces funding chains: Dev Wallet → funding wallets → KYC Root (the real person behind the money)\n`;
        prompt += `- Detects wallet bundles, sybil clusters, and circular funding patterns (bad actor signals)\n`;
        prompt += `- Scores developers as good actors (consistent, transparent) or bad actors (rug history, fake socials)\n`;
        prompt += `- Shows the X Community network: which Twitter accounts promote the token, who are admins/mods\n`;
        prompt += `- Pre-load any token: https://blackbox.farm/bubblemap?token=TOKEN_ADDRESS\n`;
        prompt += `When a user asks about a token's developer, team, or trustworthiness, the Bubblemap is the primary tool to recommend.\n\n`;

        prompt += `## TELEGRAM BOT COMMANDS (REAL COMMANDS ONLY)\n`;
        prompt += `You must ONLY reference these real commands. NEVER invent or hallucinate commands that don't exist.\n`;
        prompt += `### Setup (All tiers)\n`;
        prompt += `/start — Welcome & setup\n/register — Link BlackBox Farm account\n/status — Check subscription tier\n/help — Show all commands\n\n`;
        prompt += `### Analysis (Auth+ tier)\n`;
        prompt += `/holders CA — Holder distribution analysis\n/risk CA (alias /r) — Composite risk & stability\n/concentration CA — Detailed holder % breakdown\n/dev CA (alias /d) — Developer intel & social doxxing\n/ca CA — Default holder analysis\n/quick CA (alias /q) — Fast holder count & key stats\n/ai CA — Descriptive AI analysis snapshot\n\n`;
        prompt += `### Advanced (X Subscriber+ tier)\n`;
        prompt += `/momentum CA (alias /m) — Volume & price momentum scoring\n/insiders CA (alias /i) — Insider cluster & bundling pre-check\n/compare CA1 CA2 (alias /cmp) — Side-by-side token comparison\n/alerts — Manage alert preferences\n\n`;
        prompt += `### Pro ($9.99/mo)\n`;
        prompt += `/oracle CA (alias /o) — Full developer reputation mesh\n/wallet CA (alias /w) — Wallet behavior analysis\n\n`;
        prompt += `### Admin (DM-only)\n`;
        prompt += `/add — Add bot to a group\n/channels (alias /ch) — Manage installations\n/config — Channel settings\n/payment (alias /pay) — Payment & billing\n\n`;
        prompt += `IMPORTANT: Commands like /lb, /calls, /top10, /leaderboard, /scan, /emojis DO NOT EXIST. Never mention them.\n`;
        prompt += `When promoting commands, only promote ones available to this user's tier. Don't tease unavailable commands without mentioning the upgrade path.\n\n`;

        // Inject user profile + live data
        prompt += userProfile + '\n';
        if (liveDataBlock) prompt += liveDataBlock + '\n';

        prompt += `## NAME USAGE\nIf you know the user's preferred name, address them by it. If this is their first interaction, ask "What should I call you?" naturally.\n\n`;

        prompt += `## PLATFORM CONTEXT\nThis conversation is happening on Telegram DM. Format responses appropriately for Telegram (Markdown supported). Keep messages mobile-friendly.\n\n`;

        prompt += `## TELEGRAM STYLE\nThis is Telegram — keep it conversational and mobile-friendly. Rules:\n`;
        prompt += `- Keep responses to 4-5 short paragraphs max. No essays.\n`;
        prompt += `- Write like a knowledgeable friend chatting — casual but accurate\n`;
        prompt += `- No storytelling, no lore, no "Great Ledger" or "I perceive a void" language\n`;
        prompt += `- Lead with the answer, then add brief context or a tip\n`;
        prompt += `- Links on their own line for easy tapping\n`;
        prompt += `- Use a couple of emojis naturally — don't overdo it but don't be robotic either\n`;
        prompt += `- When no data exists: "Not in our DB yet — try /quick CA to scan it 👀"\n`;
        prompt += `- Unrecognized commands: suggest the right one in 1-2 sentences, not a lecture\n\n`;

        prompt += `## FALLBACK\nIf you cannot answer: ${config.fallback_response}\n`;
        systemPrompt = prompt;
      } else {
        systemPrompt = 'You are a helpful crypto analytics assistant for HoldersIntel / BlackBox Farm. Be friendly, use emojis, never give financial advice.';
      }
    } catch (dbErr) {
      console.warn('[bot] Failed to fetch AI config from DB, using fallback:', dbErr);
      systemPrompt = 'You are a helpful crypto analytics assistant for HoldersIntel / BlackBox Farm. Be friendly, use emojis, never give financial advice.';
    }

    // Estimate prompt tokens
    const promptText = systemPrompt + messageText;
    const estimatedPromptTokens = Math.ceil(promptText.length / 4);
    const aiCallStart = Date.now();

    const aiRes = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageText },
        ],
        temperature: 0.65,
        max_tokens: 700,
      }),
    });

    const responseTimeMs = Date.now() - aiCallStart;

    if (!aiRes.ok) {
      console.error('[bot] AI chat error:', aiRes.status);
      await sendMessage(chatId, `🤖 My AI brain is taking a break. Try /help for commands in the meantime!`);
      return;
    }

    const aiData = await aiRes.json();
    const reply = aiData.choices?.[0]?.message?.content;
    const completionTokens = Math.ceil((reply || '').length / 4);
    const totalTokens = estimatedPromptTokens + completionTokens;
    const costEstimate = (estimatedPromptTokens * 0.0000001) + (completionTokens * 0.0000004);

    // Log AI compute
    supabase.from('ai_compute_log').insert({
      platform: 'telegram',
      user_id: linked.user_id,
      session_id: `tg-${telegramUserId}`,
      model: 'google/gemini-3-flash-preview',
      prompt_tokens: estimatedPromptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      response_time_ms: responseTimeMs,
      cost_estimate_usd: costEstimate,
      metadata: { telegram_user_id: telegramUserId },
    }).then(() => {});

    // Log admin's incoming DM message
    supabase.from('telegram_group_messages').insert({
      chat_id: chatId,
      telegram_user_id: telegramUserId,
      username: senderUsername || null,
      display_name: senderUsername ? `@${senderUsername}` : null,
      message_text: messageText.slice(0, 2000),
      chat_type: 'private',
      is_bot_reply: false,
    }).then(({ error: logErr }) => {
      if (logErr) console.error('[bot] DM capture (user) failed:', logErr);
    });

    if (reply) {
      await sendMessage(chatId, reply, 'Markdown');
      // Log bot's AI reply
      supabase.from('telegram_group_messages').insert({
        chat_id: chatId,
        telegram_user_id: 'bot',
        username: 'holdersintel_bot',
        display_name: 'HoldersIntel Bot',
        message_text: reply.slice(0, 2000),
        chat_type: 'private',
        is_bot_reply: true,
      }).then(({ error: logErr }) => {
        if (logErr) console.error('[bot] DM capture (bot reply) failed:', logErr);
      });

      // Extract preferred name from reply context
      if (!memory?.preferred_name) {
        const nameMatch = messageText.match(/(?:call me|i'?m|my name is|it'?s|just)\s+([A-Za-z\u0600-\u06FF0-9_\-\s]{1,30})/i);
        if (nameMatch) {
          const name = nameMatch[1].trim();
          if (memory?.id) {
            supabase.from('ai_user_memory').update({ preferred_name: name }).eq('id', memory.id).then(() => {});
          }
        }
      }
    } else {
      await sendMessage(chatId, `🤖 Hmm, I couldn't think of a response. Try asking differently or use /help!`);
    }
  } catch (err) {
    console.error('[bot] AI chat handler error:', err);
    await sendMessage(chatId, `🤖 Something went wrong on my end. Use /help to see available commands!`);
  }
}

// ─── Handle chat_member: track user joins/leaves in channels ───
async function handleChatMember(update: any) {
  const cm = update.chat_member;
  if (!cm) return;

  const chat = cm.chat;
  const newStatus = cm.new_chat_member?.status;
  const oldStatus = cm.old_chat_member?.status;
  const user = cm.new_chat_member?.user || cm.from;
  const invitedBy = cm.from;

  // Map status changes to event types
  let eventType = 'unknown';
  if ((newStatus === 'member' || newStatus === 'administrator') && oldStatus === 'left') eventType = 'joined';
  else if ((newStatus === 'member' || newStatus === 'administrator') && oldStatus === 'kicked') eventType = 'joined';
  else if (newStatus === 'left') eventType = 'left';
  else if (newStatus === 'kicked') eventType = 'kicked';
  else if (newStatus === 'restricted') eventType = 'restricted';
  else if (newStatus === 'banned') eventType = 'banned';
  else eventType = `${oldStatus}->${newStatus}`;

  try {
    await supabase.from("telegram_channel_members").insert({
      chat_id: chat.id,
      chat_title: chat.title || null,
      telegram_user_id: String(user?.id || ''),
      telegram_username: user?.username || null,
      first_name: user?.first_name || null,
      last_name: user?.last_name || null,
      event_type: eventType,
      invited_by_user_id: invitedBy?.id !== user?.id ? String(invitedBy?.id || '') : null,
      old_status: oldStatus || null,
      new_status: newStatus || null,
      is_bot_account: false, // New individual joins default to real user
    });
    console.log(`[bot] Channel member event: ${eventType} user ${user?.id} in ${chat.title} (${chat.id})`);

    // Send welcome message for new joins (if enabled and not suspended)
    if (eventType === 'joined') {
      await maybeSendWelcomeMessage(chat.id, user);
    }
  } catch (e) {
    console.error("[bot] Failed to log channel member event:", e);
  }
}

// ─── Send welcome message if enabled for this channel ───
async function maybeSendWelcomeMessage(chatId: number, user: any) {
  try {
    const { data: config } = await supabase
      .from("telegram_channel_welcome_config")
      .select("is_enabled, welcome_message, suspend_until")
      .eq("chat_id", chatId)
      .maybeSingle();

    // No config = no welcome message
    if (!config || !config.is_enabled) return;

    // Check if suspended (for bulk bot additions)
    if (config.suspend_until) {
      const suspendUntil = new Date(config.suspend_until);
      if (suspendUntil > new Date()) {
        console.log(`[bot] Welcome message suspended for chat ${chatId} until ${config.suspend_until}`);
        return;
      }
    }

    const firstName = user?.first_name || 'there';
    const message = config.welcome_message.replace('{name}', firstName);

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) return;

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    console.log(`[bot] Welcome message sent to ${firstName} in chat ${chatId}`);
  } catch (e) {
    console.error("[bot] Failed to send welcome message:", e);
  }
}

// ─── Log bot interaction with rich metadata ───
async function logBotInteraction(
  telegramUserId: string,
  from: any,
  chatId: number,
  chatType: string,
  chatTitle: string | null,
  command: string,
  args: string,
  tokenMint: string | null,
  responseStatus: string
) {
  try {
    // Check if this is a new user (first interaction ever)
    const { count } = await supabase
      .from("telegram_bot_interactions")
      .select("id", { count: "exact", head: true })
      .eq("telegram_user_id", telegramUserId)
      .limit(1);

    const isNewUser = (count ?? 0) === 0;

    // Try to find linked web user
    const linked = await getLinkedUser(telegramUserId);

    await supabase.from("telegram_bot_interactions").insert({
      telegram_user_id: telegramUserId,
      telegram_username: from?.username || null,
      first_name: from?.first_name || null,
      last_name: from?.last_name || null,
      chat_id: chatId,
      chat_type: chatType,
      chat_title: chatTitle,
      command: command || null,
      args_preview: args ? args.substring(0, 100) : null,
      token_mint: tokenMint || null,
      linked_user_id: linked?.user_id || null,
      response_status: responseStatus,
      is_new_user: isNewUser,
    });
  } catch (e) {
    console.error("[bot] Failed to log interaction:", e);
  }
}

// ─── Handle my_chat_member: auto-register when bot is added/removed from groups ───
async function handleMyChatMember(update: any) {
  const myChatMember = update.my_chat_member;
  if (!myChatMember) return;

  const chat = myChatMember.chat;
  const newStatus = myChatMember.new_chat_member?.status;
  const oldStatus = myChatMember.old_chat_member?.status;
  const fromUser = myChatMember.from;

  // Only handle group/supergroup/channel
  if (chat.type !== 'group' && chat.type !== 'supergroup' && chat.type !== 'channel') return;

  const chatId = chat.id;
  const chatTitle = chat.title || null;
  const chatType = chat.type;
  const telegramUserId = String(fromUser?.id || '');

  if (newStatus === 'administrator' || newStatus === 'member') {
    // Bot was added to a group — auto-register the installation
    console.log(`[bot] Added to ${chatType} "${chatTitle}" (${chatId}) by user ${telegramUserId}`);

    // Find the linked web user (the person who added the bot)
    const linked = await getLinkedUser(telegramUserId);
    if (!linked) {
      // Can't register without a linked account, but we still save the installation
      // with a placeholder user_id — they can claim it later
      console.log(`[bot] User ${telegramUserId} not linked. Cannot auto-register installation.`);
      return;
    }

    // Upsert: if already exists (was kicked & re-added), update it
    const { error } = await supabase
      .from("channel_installations")
      .upsert({
        chat_id: chatId,
        chat_title: chatTitle,
        chat_type: chatType,
        user_id: linked.user_id,
        kicked: false,
        is_paid: true,
        is_active: true,
        admin_config: { ...DEFAULT_ADMIN_CONFIG },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'chat_id' });

    if (error) {
      console.error("[bot] Failed to upsert channel_installation:", error);
      return;
    }

    // DM the user who added the bot
    try {
      const dmChatId = Number(telegramUserId);
      await sendMessage(dmChatId,
        `✅ *Detected!* I'm now in *${chatTitle || 'your group'}* (ID: \`${chatId}\`).\n\n` +
        `🎉 All features are *active* — it's completely FREE!\n` +
        `Use /channels to manage it.` +
        TAGLINE
      );
    } catch (e) {
      console.log("[bot] Could not DM user after being added to group:", e);
    }
  } else if (newStatus === 'left' || newStatus === 'kicked') {
    // Bot was removed from a group
    console.log(`[bot] Removed from ${chatType} "${chatTitle}" (${chatId})`);

    await supabase
      .from("channel_installations")
      .update({
        kicked: true,
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("chat_id", chatId);
  }
}

// ════════════════════════════════════════
// MAIN SERVER
// ════════════════════════════════════════

serve(withRunLog('holdersintel-bot-webhook', async (req) => {
  // Webhook setup
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("setup") === "true") {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/holdersintel-bot-webhook`;
      const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "my_chat_member", "chat_member"] }),
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

  let fallbackChatId: number | null = null;
  let fallbackMessageId: number | undefined;
  let fallbackCommand = "";

  try {
    const update: any = await req.json();

    // ─── Handle chat_member events (user joins/leaves channels) ───
    if (update.chat_member) {
      await handleChatMember(update);
      return new Response("OK");
    }

    // ─── Handle my_chat_member events (bot added/removed from groups) ───
    if (update.my_chat_member) {
      await handleMyChatMember(update);
      return new Response("OK");
    }

    const message = update.message;

    if (!message?.text || !message.from) {
      return new Response("OK");
    }

    const chatId = message.chat.id;
    const chatType = message.chat.type;
    const isGroupChat = chatType === 'group' || chatType === 'supergroup';
    const telegramUserId = String(message.from.id);
    const dmChatId = Number(telegramUserId);
    const username = message.from.username || null;
    const messageId = message.message_id;

    // === SECOND-LAYER INPUT SANITIZATION ===
    const sanitized = sanitizeTelegramInput(message.text);
    const command = sanitized.command;
    const args = sanitized.args;

    if (!isInputSafeToProcess(sanitized)) {
      console.warn("[bot] BLOCKED suspicious input", JSON.stringify({
        chatId, telegramUserId, flags: sanitized.flags,
        rawPreview: sanitized.rawTruncated.slice(0, 80),
      }));
      return new Response("OK");
    }

    if (sanitized.suspicious) {
      console.warn("[bot] ⚠️ suspicious input (processing with caution)", JSON.stringify({
        chatId, telegramUserId, flags: sanitized.flags,
      }));
    }

    fallbackChatId = chatId;
    fallbackMessageId = messageId;
    fallbackCommand = command;

    console.log("[bot] incoming command", JSON.stringify({
      updateId: update.update_id ?? null,
      chatId,
      chatType,
      telegramUserId,
      command,
      argsLength: args.length,
      isGroupChat,
      sanitizerFlags: sanitized.flags.length > 0 ? sanitized.flags : undefined,
    }));

    // ─── DM-only: Check if linked user is suspended or needs verification nudge ───
    if (!isGroupChat) {
      const linked = await getLinkedUser(telegramUserId);
      if (linked?.user_id) {
        // Check if account is suspended
        const suspended = await isUserSuspended(linked.user_id);
        if (suspended) {
          const token = await getOrCreateReactivationToken(linked.user_id);
          const reactivateUrl = token ? `https://blackbox.farm/verify-email?token=${token}` : 'https://blackbox.farm/auth';
          await sendMessage(chatId,
            `⚠️ *Account Suspended*\n\n` +
            `Your BlackBox Farm account was suspended because your email wasn't verified within 48 hours.\n\n` +
            `But don't worry — click below to reactivate instantly! 🚀\n\n` +
            `🔗 [Reactivate My Account](${reactivateUrl})\n\n` +
            `_Once reactivated, all your bot features will work again!_`
          );
          return new Response("OK");
        }

        // Check if past 24h and unverified — gentle nudge
        const needsNudge = await isUserPast24hUnverified(linked.user_id);
        if (needsNudge && command !== '/register' && command !== '/start') {
          // Send nudge with tokenized resend link
          const resendLink = await generateActionLink(linked.user_id, 'resend_verification');
          await sendMessage(chatId,
            `Hey quick thing 💬 — your email isn't verified yet! Just check your inbox and click the link. If you can't find it, tap here to resend: [Resend Verification](${resendLink})\n\nNeed help? Just ask me anything here! 🤖`
          );
        }
      }
    }

    // Commands that are allowed to reply publicly in groups
    const GROUP_PUBLIC_COMMANDS = ['/start', '/help', '/register', '/status', '/quick', '/q', '/alerts'];

    // If in a group chat, check admin_only_commands config and redirect non-public commands to DM
    if (isGroupChat && command.startsWith('/') && !GROUP_PUBLIC_COMMANDS.includes(command)) {
      // Check if admin_only_commands is enabled — if so, only group admins can use commands
      try {
        const { data: groupInst } = await supabase
          .from("channel_installations")
          .select("admin_config")
          .eq("chat_id", chatId)
          .eq("is_active", true)
          .maybeSingle();
        const groupCfg = resolveAdminConfig(groupInst?.admin_config);
        if (groupCfg.admin_only_commands) {
          const isGroupAdmin = await isTelegramGroupAdmin(chatId, telegramUserId);
          if (!isGroupAdmin) {
            await sendMessage(chatId, `🔒 Commands are restricted to admins in this group.`);
            return new Response("OK");
          }
        }
      } catch (_) { /* proceed if config check fails */ }
      // Send "check your DMs" in the group
      const cmdLabel = command.replace('/', '').toUpperCase();
      await groupDMRedirect(chatId, telegramUserId, cmdLabel, messageId);
      // Execute the command but send output to the user's DM
      try {
        switch (command) {
          case "/dev":
          case "/d":
            await handleDev(dmChatId, telegramUserId, args);
            break;
          case "/insiders":
          case "/i":
            await handleInsiders(dmChatId, telegramUserId, args);
            break;
          case "/concentration":
            await handleConcentration(dmChatId, telegramUserId, args);
            break;
          case "/compare":
          case "/cmp":
            await handleCompare(dmChatId, telegramUserId, args);
            break;
          case "/holders":
            await handleHolders(dmChatId, telegramUserId, args, false);
            break;
          case "/ca":
            await handleCA(dmChatId, telegramUserId, args);
            break;
          case "/ai":
            await handleAI(dmChatId, telegramUserId, args);
            break;
          case "/momentum":
          case "/m":
            await handleMomentum(dmChatId, telegramUserId, args);
            break;
          case "/oracle":
          case "/o":
            await handleOracle(dmChatId, telegramUserId, args);
            break;
          case "/wallet":
          case "/w":
            await handleWallet(dmChatId, telegramUserId, args);
            break;
          case "/alerts":
            await handleAlerts(dmChatId, telegramUserId, args, false);
            break;
          case "/add":
            await handleAdd(dmChatId, telegramUserId);
            break;
          case "/channels":
          case "/ch":
            await handleChannels(dmChatId, telegramUserId);
            break;
          case "/config":
            await handleConfig(dmChatId, telegramUserId, args);
            break;
          case "/payment":
          case "/pay":
            if (args.trim().startsWith('verify')) {
              await handlePaymentVerify(dmChatId, telegramUserId, args.replace(/^verify\s*/i, ''));
            } else {
              await handlePayment(dmChatId, telegramUserId, args);
            }
            break;
          default:
            // Unknown command in DM context — route to AI assistant
            if (message.text) {
              await handleAiFreeChat(dmChatId, telegramUserId, sanitized.rawTruncated, username);
            }
            break;
        }
      } catch (dmErr) {
        console.error("[bot] DM redirect failed:", dmErr);
        await sendMessage(chatId, `⚠️ Couldn't send DM. Make sure you've started a private chat with me first by messaging @holdersintel\\_bot directly.`, "Markdown", messageId);
      }
    } else {
      // DM context or public-allowed group commands
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
          await handleHelp(chatId, telegramUserId);
          break;
        case "/risk":
        case "/r":
          await handleRisk(chatId, telegramUserId, args, isGroupChat);
          break;
        case "/dev":
        case "/d":
          await handleDev(chatId, telegramUserId, args);
          break;
        case "/insiders":
        case "/i":
          await handleInsiders(chatId, telegramUserId, args);
          break;
        case "/concentration":
          await handleConcentration(chatId, telegramUserId, args);
          break;
        case "/compare":
        case "/cmp":
          await handleCompare(chatId, telegramUserId, args);
          break;
        case "/holders":
          await handleHolders(chatId, telegramUserId, args, isGroupChat);
          break;
        case "/ca":
          await handleCA(chatId, telegramUserId, args);
          break;
        case "/quick":
        case "/q":
          await handleQuick(chatId, telegramUserId, args);
          break;
        case "/ai":
          await handleAI(chatId, telegramUserId, args);
          break;
        case "/momentum":
        case "/m":
          await handleMomentum(chatId, telegramUserId, args);
          break;
        case "/oracle":
        case "/o":
          await handleOracle(chatId, telegramUserId, args);
          break;
        case "/wallet":
        case "/w":
          await handleWallet(chatId, telegramUserId, args);
          break;
        case "/alerts":
          await handleAlerts(chatId, telegramUserId, args, isGroupChat);
          break;
        case "/add":
          if (isGroupChat) {
            await sendMessage(chatId, `📬 DM me to use /add — channel management is DM-only.`, "Markdown", messageId);
          } else {
            await handleAdd(chatId, telegramUserId);
          }
          break;
        case "/channels":
        case "/ch":
          if (isGroupChat) {
            await sendMessage(chatId, `📬 DM me to use /channels.`, "Markdown", messageId);
          } else {
            await handleChannels(chatId, telegramUserId);
          }
          break;
        case "/config":
          if (isGroupChat) {
            await sendMessage(chatId, `📬 DM me to use /config — channel settings are managed privately.`, "Markdown", messageId);
          } else {
            await handleConfig(chatId, telegramUserId, args);
          }
          break;
        case "/payment":
        case "/pay":
          if (isGroupChat) {
            await sendMessage(chatId, `📬 DM me to use /payment.`, "Markdown", messageId);
          } else {
            if (args.trim().startsWith('verify')) {
              await handlePaymentVerify(chatId, telegramUserId, args.replace(/^verify\s*/i, ''));
            } else {
              await handlePayment(chatId, telegramUserId, args);
            }
          }
          break;
        default: {
          // Auto-detect registration codes
          if (/^BF-[A-Z0-9]{6}$/i.test(sanitized.rawTruncated)) {
            await handleRegister(chatId, telegramUserId, username, sanitized.rawTruncated);
          }
          // Auto-detect Solana CAs in group chats (passive scan with 3s delay)
          else if (isGroupChat) {
            const detectedCA = looksLikeSolanaCA(sanitized.rawTruncated);
            if (detectedCA) {
              await handleGroupAutoScan(chatId, telegramUserId, detectedCA, messageId);
            }
          }
          // DM: auto-scan if user pastes a raw CA (no command prefix needed)
          else if (!isGroupChat) {
            const dmCA = looksLikeSolanaCA(sanitized.rawTruncated);
            if (dmCA) {
              console.log('[bot] DM auto-scan triggered:', dmCA.slice(0, 12));
              await handleHolders(chatId, telegramUserId, dmCA);
            }
            // "Did you mean?" for unrecognized slash commands
            else if (sanitized.rawTruncated.startsWith('/')) {
              const attempted = sanitized.rawTruncated.split(/\s/)[0].replace(/@\w+$/, '').toLowerCase();
              const suggestions: Record<string, string> = {
                '/lb': '/pnl — Check profit/loss for a token',
                '/leaderboard': '/pnl — Check profit/loss for a token',
                '/calls': '/quick — Quick token scan',
                '/tw': '/twitter — Check linked Twitter',
                '/top10': '/th — Top 10 holders analysis',
                '/emojis': '/help — See all available commands',
                '/scan': '/th — Top holders scan',
                '/check': '/quick — Quick token check',
                '/report': '/th — Full holders report',
                '/info': '/quick — Quick token info',
              };
              const suggestion = suggestions[attempted];
              if (suggestion) {
                await sendMessage(chatId, `🤔 \`${attempted}\` isn't a command I recognize.\n\n💡 *Did you mean:* ${suggestion}\n\nType /help for all commands!`, 'Markdown');
              } else {
                // Fall through to AI chat for unknown input
                console.log('[bot] routing to AI free chat', JSON.stringify({ chatId, telegramUserId, text: sanitized.rawTruncated.slice(0, 50) }));
                await handleAiFreeChat(chatId, telegramUserId, sanitized.rawTruncated, username);
              }
            }
            // AI conversational assistant for DMs
            else if (message.text) {
              console.log('[bot] routing to AI free chat', JSON.stringify({ chatId, telegramUserId, text: sanitized.rawTruncated.slice(0, 50) }));
              await handleAiFreeChat(chatId, telegramUserId, sanitized.rawTruncated, username);
            }
          }
          break;
        }
      }

      // === PASSIVE GROUP MESSAGE CAPTURE ===
      if (isGroupChat && message.text) {
        const displayName = [message.from.first_name, message.from.last_name].filter(Boolean).join(' ') || null;
        supabase.from('telegram_group_messages').insert({
          chat_id: chatId,
          telegram_user_id: telegramUserId,
          username: username,
          display_name: displayName,
          message_text: message.text.slice(0, 2000),
          message_id: messageId,
        }).then(({ error: msgErr }) => {
          if (msgErr) console.error('[bot] group message capture failed:', msgErr);
        });
      }

      // Log the interaction asynchronously (fire-and-forget)
      const tokenFromArgs = args?.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/)?.[0] || null;
      const chatTitle = message.chat.title || null;
      logBotInteraction(telegramUserId, message.from, chatId, chatType, chatTitle, command, args, tokenFromArgs, "success")
        .catch(e => console.error("[bot] interaction log failed:", e));
    }
  } catch (err) {
    console.error("[bot] Webhook error:", err);

    if (fallbackChatId) {
      try {
        await sendMessage(
          fallbackChatId,
          `⚠️ Internal error while handling \`${fallbackCommand || "your command"}\`. Please try again in a moment.`,
          "Markdown",
          fallbackMessageId
        );
      } catch (notifyErr) {
        console.error("[bot] failed to send fallback error message:", notifyErr);
      }
    }
  }

  return new Response("OK");
}));
