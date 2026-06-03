import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withRunLog } from "../_shared/run-logger.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { detectTokenPhase, contextualizeDevRep, type TokenPhase } from "../_shared/token-phase.ts";
import { getHealthMode } from "../_shared/health-mode.ts";
import { meshFeed } from "../_shared/mesh-feeder.ts";
import { ingestPublicCAQuery, type IngestSource } from "../_shared/mesh-ingest.ts";
import { getTokenWarnings, writeEarlyWarnings, generateWarningsFromHoldersData } from "../_shared/early-warning-writer.ts";
import { sanitizeTelegramInput, isInputSafeToProcess } from "../_shared/telegram-input-sanitizer.ts";
import { obfuscateTicker } from "../_shared/ticker-obfuscator.ts";
import { runBadActorCheck } from "../_shared/bad-actor-check.ts";
import { xHandleReverseLookup, formatXLookupForTelegram } from "../_shared/x-handle-reverse-lookup.ts";
import { meteredAiFetch } from '../_shared/ai-meter.ts';

const BOT_TOKEN = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ─── Curated optimistic tokens — bot returns a positive rendition ───
// Mirrors src/lib/curatedOptimisticTokens.ts on the web side.
const CURATED_OPTIMISTIC_TOKENS = new Set<string>([
  "FiEUFoZpjAdvoFRShKaxzuN5NXkuwe9jBPYDaeGpump",
]);
function isCuratedOptimistic(mint: string | null | undefined): boolean {
  return !!mint && CURATED_OPTIMISTIC_TOKENS.has(mint);
}
const CURATED_OPTIMISTIC_BANNER =
  `✨ *Community Takeover Confirmed*\n` +
  `Organic momentum, dispersed holders, dev renounced. Treated as a healthy CTO by HoldersIntel.\n\n`;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Bad Actor Banner — prepended to /holders /risk /dev replies ───
async function buildBadActorBanner(ca: string, tier: string): Promise<string> {
  try {
    const alert = await runBadActorCheck(supabase, { tokenMint: ca });
    if (!alert.isBadActor) return '';
    const isPaid = ['x_subscriber', 'pro', 'dev', 'enterprise'].includes(tier);
    const reasonLabels: Record<string, string> = {
      blacklisted_token: 'Token blacklisted',
      blacklisted_dev: 'Dev wallet blacklisted',
      blacklisted_x_handle: 'X handle blacklisted',
      scammer: 'Dev flagged: scammer',
      serial_rugger: 'Dev: serial rugger',
      blacklisted: 'Dev: blacklisted',
      serial_spammer: 'Dev: serial spammer',
      fee_farmer: 'Dev: fee farmer',
      mesh_linked: 'Linked to bad actors',
      recycled_community: 'Recycled X community',
    };
    const emoji = alert.level === 'critical' ? '🚨' : alert.level === 'high' ? '🔴' : '⚠️';
    let banner = `${emoji} *${alert.headline.replace(/^[^A-Z]*/, '')}*\n`;
    const labels = alert.reasons.map((r) => reasonLabels[r] || r.replace(/_/g, ' '));
    if (labels.length > 0) banner += `_${labels.slice(0, 4).join(' · ')}_\n`;
    if (!isPaid) {
      const ev =
        (alert.details?.blacklistEntries?.length ? 1 : 0) +
        (alert.details?.devReputation ? 1 : 0) +
        (alert.details?.meshLinks?.length ? 1 : 0) +
        (alert.details?.recycledCommunities?.length ? 1 : 0) +
        (alert.details?.launchHistory?.length ? 1 : 0);
      banner += `🔒 _Full Dev Reputation, KYC, launch history & mesh — Pro subscribers only${
        ev > 0 ? ` (${ev} evidence categories on file)` : ''
      }._\n`;
    } else {
      const dr = alert.details?.devReputation;
      if (dr) {
        banner += `Dev: \`${dr.wallet?.slice(0, 8)}…${dr.wallet?.slice(-4)}\` · trust:*${dr.trust_level || '—'}* · score:*${dr.reputation_score ?? '—'}* · rugged:*${dr.tokens_rugged ?? 0}*/${dr.tokens_launched ?? 0}\n`;
      }
      const lh = alert.details?.launchHistory || [];
      if (lh.length > 0) {
        const failed = lh.filter((t: any) => t.outcome === 'failed' || t.outcome === 'rugged').length;
        banner += `Prior launches: *${lh.length}* (failed:*${failed}*)\n`;
      }
      const ml = alert.details?.meshLinks || [];
      if (ml.length > 0) banner += `Funding-chain links to blacklisted entities: *${ml.length}*\n`;
      const rc = alert.details?.recycledCommunities || [];
      if (rc.length > 0) banner += `Recycled communities: *${rc.length}*\n`;
    }
    return banner + '\n';
  } catch (e) {
    console.warn('[bad-actor-banner] failed:', e);
    return '';
  }
}

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

/** Send a message with inline keyboard buttons */
async function sendMessageWithButtons(chatId: number, text: string, buttons: Array<Array<Record<string, string>>>, parseMode = "Markdown") {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons },
  };
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.error(`[bot] sendMessageWithButtons failed:`, await res.text());
  }
}

/** Answer a callback_query to dismiss the loading spinner */
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

/** Generate a short-lived OTP token for Telegram auth (2-min expiry) */
async function generateTelegramOTP(actionType: string, telegramUserId: string, telegramUsername: string | null): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');

  // Use a placeholder user_id since the user doesn't have an account yet
  // The resolve-action-token function will handle this specially for tg_ types
  await supabase.from('one_time_action_tokens').insert({
    token,
    user_id: '00000000-0000-0000-0000-000000000000',
    action_type: actionType,
    payload: { telegram_user_id: telegramUserId, telegram_username: telegramUsername },
    expires_at: new Date(Date.now() + 2 * 60 * 1000).toISOString(), // 2 minutes
  });

  return token;
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
        const bannedUntil = (data.user as any).banned_until;
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
    // Try to greet by preferred name
    const { data: mem } = await supabase.from('ai_user_memory').select('preferred_name').or(`telegram_user_id.eq.${telegramUserId},user_id.eq.${linked.user_id}`).limit(1).maybeSingle();
    const greeting = mem?.preferred_name ? `Welcome back, ${mem.preferred_name}!` : 'Welcome back!';
    await sendMessage(chatId,
      `✅ *${greeting}*\n\n` +
      `Your account is linked. Tier: *${tier.toUpperCase()}*\n\n` +
      `Use /help to see available commands.`
    );
    return;
  }
  await sendMessageWithButtons(chatId,
    `👋 *Welcome to HoldersIntel Bot!*\n\n` +
    `This bot delivers tier-specific analysis from [BlackBox Farm](https://blackbox.farm).\n\n` +
    `Get started by choosing an option below:`,
    [
      [{ text: "🆕 Create Account", callback_data: "auth_signup" }],
      [{ text: "🔑 Log In & Link", callback_data: "auth_signin" }],
      [{ text: "🔗 Link with Code", callback_data: "auth_link_code" }],
    ]
  );
}

// ─── /myname — Set preferred name for AI interactions ───
async function handleMyName(chatId: number, telegramUserId: string, args: string) {
  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId, `🔒 Please link your account first with /register.`);
    return;
  }

  const name = args.trim();
  if (!name) {
    // Show current name
    const { data: mem } = await supabase.from('ai_user_memory').select('preferred_name').or(`telegram_user_id.eq.${telegramUserId},user_id.eq.${linked.user_id}`).limit(1).maybeSingle();
    if (mem?.preferred_name) {
      await sendMessage(chatId, `👤 Your current name: *${mem.preferred_name}*\n\nTo change it: \`/myname NewName\``);
    } else {
      await sendMessage(chatId, `👤 No name set yet.\n\nUsage: \`/myname Alex\``);
    }
    return;
  }

  if (name.length > 30) {
    await sendMessage(chatId, `❌ Name too long. Max 30 characters.`);
    return;
  }

  // Upsert into ai_user_memory
  const { data: existing } = await supabase.from('ai_user_memory').select('id').or(`telegram_user_id.eq.${telegramUserId},user_id.eq.${linked.user_id}`).limit(1).maybeSingle();
  if (existing) {
    await supabase.from('ai_user_memory').update({ preferred_name: name, telegram_user_id: telegramUserId, user_id: linked.user_id }).eq('id', existing.id);
  } else {
    await supabase.from('ai_user_memory').insert({ preferred_name: name, telegram_user_id: telegramUserId, user_id: linked.user_id, last_platform: 'telegram' });
  }

  await sendMessage(chatId, `✅ Got it, I'll call you *${name}* from now on! 🎉`);
}

/** Handle callback_query from inline keyboard buttons */
async function handleCallbackQuery(callbackQuery: any) {
  const chatId = callbackQuery.message?.chat?.id;
  const telegramUserId = String(callbackQuery.from.id);
  const username = callbackQuery.from.username || null;
  const data = callbackQuery.data;

  if (!chatId || !data) return;

  // Dismiss the loading spinner immediately
  await answerCallbackQuery(callbackQuery.id);

  // Check if already linked
  const linked = await getLinkedUser(telegramUserId);
  if (linked && (data === 'auth_signup' || data === 'auth_signin')) {
    const tier = await getUserTier(linked.user_id);
    await sendMessage(chatId,
      `✅ Your account is already linked! Tier: *${tier.toUpperCase()}*\n\nUse /help to see commands.`
    );
    return;
  }

  switch (data) {
    case 'auth_signup':
    case 'auth_signin': {
      const actionType = data === 'auth_signup' ? 'tg_signup' : 'tg_signin';
      const token = await generateTelegramOTP(actionType, telegramUserId, username);
      const url = `https://blackbox.farm/auth/tg?t=${token}`;
      const label = data === 'auth_signup' ? 'Create Account' : 'Log In & Link';

      await sendMessageWithButtons(chatId,
        `🔐 *${label}*\n\n` +
        `Tap the button below to open BlackBox Farm.\n` +
        `⏱ This link expires in *2 minutes*.`,
        [[{ text: "🌐 Open BlackBox Farm", url }]]
      );
      break;
    }
    case 'auth_link_code': {
      await sendMessage(chatId,
        `🔗 *Link with Registration Code*\n\n` +
        `1️⃣ Log in at blackbox.farm\n` +
        `2️⃣ Go to Settings → Telegram Link\n` +
        `3️⃣ Copy your code (e.g. \`BF-A3X9K2\`)\n` +
        `4️⃣ Send: \`/register YOUR-CODE\`\n\n` +
        `Example: \`/register BF-A3X9K2\``
      );
      break;
    }
    default: {
      // ─── Payment flow callbacks ───
      if (data.startsWith('pay_verify:')) {
        const subId = data.slice('pay_verify:'.length);
        // Pre-flight: ensure the sub still exists for this TG user, then run verify
        const { data: sub } = await supabase
          .from('tg_sol_subscriptions')
          .select('id')
          .eq('id', subId)
          .eq('telegram_user_id', telegramUserId)
          .maybeSingle();
        if (!sub) {
          await sendMessage(chatId, `❌ This payment session is no longer active. Use /payment to start a new one.`);
          break;
        }
        await handlePaymentVerify(chatId, telegramUserId, '');
        break;
      }
      if (data.startsWith('pay_refresh:')) {
        const subId = data.slice('pay_refresh:'.length);
        const { data: sub } = await supabase
          .from('tg_sol_subscriptions')
          .select('id, payment_wallet_pubkey, amount_sol, sol_price_at_order, status, created_at')
          .eq('id', subId)
          .eq('telegram_user_id', telegramUserId)
          .maybeSingle();
        if (!sub) {
          await sendMessage(chatId, `❌ Payment session not found. Use /payment to start a new one.`);
          break;
        }
        if (sub.status !== 'pending') {
          await sendMessage(chatId, `ℹ️ This payment session is *${sub.status}*. Use /payment for a new one or /status to check your tier.`);
          break;
        }
        const ageMs = Date.now() - new Date(sub.created_at).getTime();
        const remainingSec = Math.max(0, Math.floor((3600_000 - ageMs) / 1000));
        if (remainingSec === 0) {
          await sendMessage(chatId, `⏱ This payment wallet has *expired*. Use /payment to generate a new one.`);
          break;
        }
        const minsLeft = Math.floor(remainingSec / 60);
        const secsLeft = remainingSec % 60;
        await sendMessage(chatId,
          `⏱ *Payment wallet still active*\n\n` +
          `Wallet: \`${sub.payment_wallet_pubkey}\`\n` +
          `Amount: *${sub.amount_sol} SOL*\n` +
          `⏳ Time remaining: *${minsLeft}m ${secsLeft}s*\n\n` +
          `_Once you've sent the payment, tap_ 🔄 _I've sent it on the original message, or use_ /payment verify_._`
        );
        break;
      }
    }
  }
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

  // Fire admin notification for TG link
  await supabase.from('admin_notifications').insert({
    notification_type: 'new_signup',
    title: 'Telegram Account Linked',
    message: `@${username || telegramUserId} linked via /register code ${code}`,
    metadata: { telegram_user_id: telegramUserId, telegram_username: username, user_id: codeRecord.user_id, link_method: 'registration_code', tier },
  });
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
    `${unlocked} /signup — Create account via Telegram\n` +
    `${unlocked} /register \`CODE\` — Link your BlackBox Farm account\n` +
    `${unlocked} /myname \`NAME\` — Set your preferred name for AI chat\n` +
    `${unlocked} /status — View your tier, usage & limits\n` +
    `${unlocked} /help — This command reference\n` +
    `${unlocked} /feedback (/fb) — 📝 Send feedback to the team\n` +
    `${unlocked} /payment (/pay) — 💰 Yearly Pro via SOL · /pay CODE to redeem invite\n\n`;

  cmds += `*🔬 Core Analysis — Auth ★ = just signup free online*\n` +
    `_The essentials — know what you're buying before you ape._\n` +
    `${check("auth")} /risk (/r) \`CA\` — 360° risk score: rug probability, liquidity traps & holder red flags\n` +
    `${check("auth")} /holders \`CA\` — Full holder breakdown: whales, retail spread & distribution health\n` +
    `${check("auth")} /concentration (/con) \`CA\` — Top wallet % tiers: see exactly who controls the supply\n` +
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
    `${check("x_subscriber")} /momentum (/m /mom) \`CA\` — Volume surge detection, price velocity & trend momentum scoring\n` +
    `${check("x_subscriber")} /insiders (/i) \`CA\` — Bundled wallet detection: spot coordinated buys before they dump\n` +
    `${check("x_subscriber")} /compare (/cmp) \`CA CA\` — Head-to-head token showdown: risk, holders & momentum side-by-side\n`;
  if (!hasTier(tier, "x_subscriber")) {
    cmds += `  _↑ Unlock for just $3.99/mo — follow @HoldersIntel on X_\n`;
  }
  cmds += `\n`;

  cmds += `*🧠 Pro Intelligence — Pro ★★★*\n` +
    `_Institutional-grade tools. See what nobody else can._\n` +
    `${check("pro")} /oracle (/o) \`CA\` — Deep dev reputation mesh: funding chains, wallet genealogy & cross-token links\n` +
    `${check("pro")} /wallet (/w) \`ADDR\` — Full wallet forensics: trading patterns, PnL history & behavioral profiling\n` +
    `${check("pro")} /ticket — 🎫 Submit, track & reply to support tickets\n`;
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
    `✅ /payment (/pay) — 💰 Yearly Pro subscription via SOL (1 SOL/yr)\n` +
    `  _• /payment CODE — Redeem an invitation/promo code_\n` +
    `  _• /payment verify — Check if your SOL payment was received_\n`;

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

// ─── /ticket — Pro-only support ticket management ───
async function handleTicket(chatId: number, telegramUserId: string, args: string) {
  const gate = await gateCheck(chatId, telegramUserId, "pro", "/ticket");
  if (!gate) return;

  const trimmed = args.trim();

  // /ticket new <message> — Create a new ticket
  if (trimmed.toLowerCase().startsWith("new ")) {
    const ticketMessage = trimmed.slice(4).trim();
    if (ticketMessage.length < 5) {
      await sendMessage(chatId, `🎫 *Create a Ticket*\n\nUsage: \`/ticket new Your issue description here\`\n\n_Minimum 5 characters._`);
      return;
    }

    // Get profile info for name/email
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("id", gate.userId)
      .maybeSingle();

    const name = profile?.display_name || `TG User ${telegramUserId}`;
    const email = profile?.email || `tg-${telegramUserId}@telegram.placeholder`;
    const subject = ticketMessage.slice(0, 50) + (ticketMessage.length > 50 ? "…" : "");

    const { data: ticket, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: gate.userId,
        name,
        email,
        subject,
        message: ticketMessage.slice(0, 2000),
        category: "telegram",
        priority: "medium",
        status: "open",
        metadata: { source: "telegram_bot", telegram_user_id: telegramUserId },
      })
      .select("ticket_number")
      .single();

    if (error || !ticket) {
      console.error("[bot] ticket create error:", error);
      await sendMessage(chatId, `❌ Failed to create ticket. Please try again or use [the contact page](https://blackbox.farm/contact).`);
      return;
    }

    // Admin notification
    await supabase.from("admin_notifications").insert({
      notification_type: "new_ticket",
      title: `🎫 New TG Ticket #${ticket.ticket_number}`,
      message: `From ${name}: ${subject}`,
      metadata: { ticket_number: ticket.ticket_number, user_id: gate.userId, source: "telegram" },
    });

    await sendMessage(chatId,
      `✅ *Ticket #${ticket.ticket_number} Created*\n\n` +
      `📋 Subject: _${subject}_\n` +
      `📊 Status: Open\n\n` +
      `Track it: \`/ticket #${ticket.ticket_number}\`\n` +
      `Reply: \`/ticket #${ticket.ticket_number} Your message\``
    );
    return;
  }

  // /ticket #123 or /ticket #123 <reply>
  const ticketMatch = trimmed.match(/^#?(\d+)\s*(.*)/s);
  if (ticketMatch) {
    const ticketNum = parseInt(ticketMatch[1], 10);
    const replyText = (ticketMatch[2] || "").trim();

    // Fetch the ticket
    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, subject, status, created_at, message")
      .eq("ticket_number", ticketNum)
      .eq("user_id", gate.userId)
      .maybeSingle();

    if (!ticket) {
      await sendMessage(chatId, `❌ Ticket #${ticketNum} not found or doesn't belong to your account.`);
      return;
    }

    // If reply text provided, add a reply
    if (replyText.length > 0) {
      if (replyText.length < 3) {
        await sendMessage(chatId, `⚠️ Reply too short. Minimum 3 characters.`);
        return;
      }
      const { error: replyErr } = await supabase
        .from("support_ticket_replies")
        .insert({
          ticket_id: ticket.id,
          message: replyText.slice(0, 2000),
          reply_type: "user",
          reply_by: gate.userId,
          is_internal_note: false,
        });

      if (replyErr) {
        console.error("[bot] ticket reply error:", replyErr);
        await sendMessage(chatId, `❌ Failed to add reply. Try again later.`);
        return;
      }

      // Reopen if resolved/closed
      if (ticket.status === "resolved" || ticket.status === "closed") {
        await supabase
          .from("support_tickets")
          .update({ status: "open" })
          .eq("id", ticket.id);
      }

      // Admin notification
      await supabase.from("admin_notifications").insert({
        notification_type: "ticket_reply",
        title: `💬 TG Reply on Ticket #${ticket.ticket_number}`,
        message: replyText.slice(0, 300),
        metadata: { ticket_number: ticket.ticket_number, ticket_id: ticket.id, user_id: gate.userId, source: "telegram" },
      });

      await sendMessage(chatId, `✅ Reply added to *Ticket #${ticket.ticket_number}*`);
      return;
    }

    // View ticket details + replies
    const { data: replies } = await supabase
      .from("support_ticket_replies")
      .select("message, reply_type, created_at")
      .eq("ticket_id", ticket.id)
      .eq("is_internal_note", false)
      .order("created_at", { ascending: true })
      .limit(10);

    const statusEmoji: Record<string, string> = {
      open: "🟡", in_progress: "🔵", resolved: "✅", closed: "⚫",
    };

    let msg = `🎫 *Ticket #${ticket.ticket_number}*\n\n` +
      `📋 ${ticket.subject}\n` +
      `${statusEmoji[ticket.status] || "⚪"} Status: *${ticket.status.replace(/_/g, " ").toUpperCase()}*\n` +
      `📅 Created: ${new Date(ticket.created_at).toLocaleDateString()}\n`;

    if (replies && replies.length > 0) {
      msg += `\n━━ *Conversation* ━━\n`;
      for (const r of replies) {
        const who = r.reply_type === "admin" ? "🛡 Support" : "👤 You";
        const date = new Date(r.created_at).toLocaleDateString();
        msg += `\n${who} _(${date})_:\n${r.message.slice(0, 300)}${r.message.length > 300 ? "…" : ""}\n`;
      }
    }

    msg += `\n_Reply: \`/ticket #${ticket.ticket_number} Your message\`_`;
    await sendMessage(chatId, msg);
    return;
  }

  // /ticket (no args) — List open tickets
  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("ticket_number, subject, status, created_at")
    .eq("user_id", gate.userId)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (!tickets || tickets.length === 0) {
    await sendMessage(chatId,
      `🎫 *Support Tickets*\n\n` +
      `You have no open tickets.\n\n` +
      `Create one: \`/ticket new Your issue here\`\n\n` +
      `_Pro subscribers get direct support via Telegram._`
    );
    return;
  }

  let msg = `🎫 *Your Open Tickets*\n\n`;
  for (const t of tickets) {
    const statusEmoji = t.status === "open" ? "🟡" : "🔵";
    msg += `${statusEmoji} *#${t.ticket_number}* — ${t.subject}\n`;
  }
  msg += `\nView details: \`/ticket #NUMBER\`\nCreate new: \`/ticket new Your issue\``;

  await sendMessage(chatId, msg);
}

// ─── /feedback — Collect user feedback (open to all) ───
async function handleFeedback(chatId: number, telegramUserId: string, username: string | null, args: string) {
  const feedbackText = args.trim();

  if (!feedbackText || feedbackText.length < 3) {
    await sendMessage(chatId,
      `📝 *Send Feedback*\n\nUsage: \`/feedback Your message here\`\n\nExample: \`/feedback The /risk command is awesome but could show liquidity depth\`\n\n_Your feedback helps us improve! All messages are read by the team._`
    );
    return;
  }

  // Hard cap at 1000 chars (sanitizer already caps at 512 for args, but be safe)
  const safeFeedback = feedbackText.slice(0, 1000);

  // Check if user is a linked tester
  const linked = await getLinkedUser(telegramUserId);
  let linkedUserId: string | null = null;
  let isTester = false;

  if (linked) {
    linkedUserId = linked.user_id;
    // Check if they have an active tester promo
    const { data: promo } = await supabase
      .from('promo_redemptions')
      .select('id')
      .eq('user_id', linked.user_id)
      .eq('is_active', true)
      .gte('expires_at', new Date().toISOString())
      .limit(1);
    isTester = (promo?.length ?? 0) > 0;
  }

  const { error } = await supabase.from('telegram_feedback').insert({
    telegram_user_id: telegramUserId,
    username: username?.slice(0, 64) || null,
    feedback_text: safeFeedback,
    linked_user_id: linkedUserId,
    is_tester: isTester,
  });

  if (error) {
    console.error('[bot] feedback insert failed:', error);
    await sendMessage(chatId, `⚠️ Failed to save feedback. Please try again.`);
    return;
  }

  // If tester, also insert into tester_feedback for their dashboard
  if (isTester && linkedUserId) {
    await supabase.from('tester_feedback').insert({
      user_id: linkedUserId,
      feedback_type: 'general',
      page_path: '/telegram',
      message: `[TG @${username || telegramUserId}] ${safeFeedback}`,
    }).then(({ error: tfErr }) => {
      if (tfErr) console.error('[bot] tester_feedback mirror failed:', tfErr);
    });
  }

  const testerBadge = isTester ? `\n🧪 _Logged to your tester account_` : '';
  await sendMessage(chatId, `✅ *Feedback received!* Thank you 🙏${testerBadge}\n\n_The team reads every submission._`);
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

  const curated = isCuratedOptimistic(ca);
  const badActorBanner = curated ? null : await buildBadActorBanner(ca, gate.tier);

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

  // Dev risk (oracle-unified-lookup returns .profile, .score, .trafficLight, .stats)
  const oracleProfile = oracleData?.profile || null;
  const devScore = oracleData?.score ?? oracleProfile?.reputationScore ?? null;
  const rugCount = oracleData?.stats?.rugPulls ?? 0;
  const devClass = oracleData?.trafficLight === 'RED' ? 'serial_rugger' : null;

  // Insider/cluster data from holders report
  const insiderPct = holdersData?.insiderData?.totalInsiderPercentage ?? null;
  const bundledPct = holdersData?.insiderData?.bundledPercentage ?? null;
  const clusterCount = holdersData?.insiderData?.clusters?.length ?? 0;

  // Determine risk signals
  const signals: string[] = [];
  let riskLevel: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' = 'LOW';
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let riskEmoji = '🟢';

  // Dev risk signals
  if (rugCount > 0) { signals.push(`🔴 Dev has ${rugCount} prior rug(s)`); riskLevel = 'HIGH'; }
  if (devClass === 'serial_rugger' || devClass === 'scammer') { signals.push(`🔴 Dev classified: ${devClass}`); riskLevel = 'CRITICAL'; }
  else if (devScore != null && devScore < 30) { signals.push(`🔴 Dev reputation: ${devScore}/100`); if ((riskLevel as string) !== 'CRITICAL') riskLevel = 'HIGH'; }
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

  if (curated) {
    riskLevel = 'LOW';
    riskEmoji = '🟢';
  }
  let msg = `\`${ca}\`\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n` +
    `${riskEmoji} *${riskLabels[riskLevel]}*\n\n`;
  if (badActorBanner) msg = badActorBanner + msg;
  if (curated) msg = CURATED_OPTIMISTIC_BANNER + msg;

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

  await sendMessage(chatId, `🏗 Looking up developer for \`${ca}\`...`);
  await logUsage(telegramUserId, "/dev", ca);

  // Fetch oracle + DexScreener in parallel
  const [data, dexData] = await Promise.all([
    invokeFunction("oracle-unified-lookup", { input: ca }),
    (async () => {
      try {
        const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
        if (r.ok) { const j = await r.json(); return j?.pairs?.[0] || null; }
      } catch (_) {}
      return null;
    })(),
  ]);

  if (!data) {
    await sendMessage(chatId, `❌ Could not resolve developer for this token.`);
    return;
  }

  const profile = data.profile || null;
  const resolvedWallet = data.resolvedWallet || null;

  if (!profile && !resolvedWallet) {
    await sendMessage(chatId, `❌ No developer profile found for this token.`);
    return;
  }

  const devAddress = profile?.masterWallet || resolvedWallet;
  const tokenSymbol = dexData?.baseToken?.symbol || null;
  const tokenName = dexData?.baseToken?.name || null;

  const dev = {
    address: devAddress,
    reputation_score: data.score ?? profile?.reputationScore ?? null,
    classification: data.trafficLight || null,
    total_tokens: data.stats?.totalTokens ?? null,
    rug_count: data.stats?.rugPulls ?? null,
    failed_tokens: data.stats?.failedTokens ?? null,
    avg_lifespan: data.stats?.avgLifespanHours ? `${Math.round(data.stats.avgLifespanHours)}h` : null,
    tokens_in_top_10_count: null,
    integrity_score: profile?.kycVerified ? 100 : null,
    display_name: profile?.displayName || null,
  };

  const isFullAccess = hasTier(gate.tier, "x_subscriber");

  // ── Resolve KYC/CEX label from mesh + cex-wallets DB ──
  const meshLinks: any[] = data.network?.meshLinks || [];
  let cexLabel: string | null = null;

  // Import CEX wallets for label resolution
  const { KNOWN_CEX_WALLETS } = await import('../_shared/cex-wallets.ts');

  // Check dev wallet itself against CEX DB
  if (devAddress) {
    for (const [exchange, addrs] of Object.entries(KNOWN_CEX_WALLETS)) {
      if (addrs.includes(devAddress)) { cexLabel = exchange; break; }
    }
  }

  // Check KYC roots from mesh for CEX label
  if (!cexLabel) {
    const kycRoots = meshLinks.filter((m: any) =>
      m.relationship === 'same_kyc_root' || m.relationship === 'is_kyc_root'
    );
    for (const kr of kycRoots) {
      const rootId = kr.sourceType === 'kyc_root' ? kr.sourceId : kr.linkedId;
      if (rootId) {
        for (const [exchange, addrs] of Object.entries(KNOWN_CEX_WALLETS)) {
          if (addrs.includes(rootId)) { cexLabel = exchange; break; }
        }
        if (cexLabel) break;
      }
    }
  }

  // Check funding chain for CEX label
  if (!cexLabel && data.upstreamChain?.length > 0) {
    for (const hop of data.upstreamChain) {
      if (hop.wallet) {
        for (const [exchange, addrs] of Object.entries(KNOWN_CEX_WALLETS)) {
          if (addrs.includes(hop.wallet)) { cexLabel = exchange; break; }
        }
        if (cexLabel) break;
      }
    }
  }

  // ── Build message ──
  const curated = isCuratedOptimistic(ca);
  const badActorBanner = curated ? null : await buildBadActorBanner(ca, gate.tier);
  let msg = '';
  if (badActorBanner) msg += badActorBanner;
  if (curated) msg += CURATED_OPTIMISTIC_BANNER;
  msg += `🏗 *Dev Intel Report*\n`;
  if (tokenSymbol) {
    msg += `Token: *$${tokenSymbol.replace(/\$/g, '')}*${tokenName ? ` (${tokenName})` : ''}\n`;
  }
  msg += `\n`;

  // Dev wallet — FULL address, linked to Solscan
  if (dev.address) {
    msg += `👤 Wallet: [${dev.address}](https://solscan.io/account/${dev.address})\n`;
  }

  // KYC/CEX Account
  if (cexLabel) {
    msg += `🏦 Account: *${cexLabel}*\n`;
  }

  // Rep score
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
  if (dev.integrity_score != null) msg += `🔒 Integrity: *${dev.integrity_score}/100*\n`;

  // ── KYC Root section ──
  const kycRoots = meshLinks.filter((m: any) =>
    m.relationship === 'same_kyc_root' || m.relationship === 'is_kyc_root'
  );
  if (kycRoots.length > 0) {
    msg += `\n🏦 *KYC Root*\n`;
    for (const kr of kycRoots.slice(0, 3)) {
      const rootId = kr.sourceType === 'kyc_root' ? kr.sourceId : kr.linkedId;
      // Resolve CEX name for this root
      let rootLabel = '';
      if (rootId) {
        for (const [exchange, addrs] of Object.entries(KNOWN_CEX_WALLETS)) {
          if (addrs.includes(rootId)) { rootLabel = ` (${exchange})`; break; }
        }
      }
      msg += `• [${rootId}](https://solscan.io/account/${rootId})${rootLabel} — ${kr.confidence}%\n`;
    }
  }

  // ── X Communities ──
  const linkedXAccounts: string[] = data.network?.linkedXAccounts || [];
  const xCommunities = meshLinks.filter((m: any) =>
    m.sourceType === 'x_community' || m.linkedType === 'x_community'
  );
  if (xCommunities.length > 0) {
    msg += `\n🏠 *X Communities*\n`;
    for (const xc of xCommunities.slice(0, 5)) {
      const cid = xc.sourceType === 'x_community' ? xc.sourceId : xc.linkedId;
      msg += `• [Community ${cid}](https://x.com/i/communities/${cid})\n`;
    }
  }

  // ── Social Links ──
  msg += `\n🔗 *Social Links*\n`;
  let hasSocial = false;

  if (linkedXAccounts.length > 0) {
    for (const handle of linkedXAccounts.slice(0, 3)) {
      if (handle) {
        msg += `𝕏 [${handle}](https://x.com/${handle.replace('@', '')})\n`;
        hasSocial = true;
      }
    }
  }

  const websites = meshLinks.filter((m: any) =>
    (m.relationship === 'has_website' || m.relationship === 'website_of' || m.relationship === 'website_of_token' || m.relationship === 'official_website')
    && (m.sourceType === 'website' || m.linkedType === 'website')
  );
  for (const w of websites.slice(0, 3)) {
    const url = w.sourceType === 'website' ? w.sourceId : w.linkedId;
    if (url && !url.includes('x.com') && !url.includes('twitter.com')) {
      msg += `🌐 ${url}\n`;
      hasSocial = true;
    }
  }

  if (!hasSocial) {
    const xFromMesh = meshLinks.filter((m: any) =>
      m.sourceType === 'x_account' || m.linkedType === 'x_account' ||
      m.sourceType === 'twitter' || m.linkedType === 'twitter'
    );
    for (const xm of xFromMesh.slice(0, 3)) {
      const handle = xm.sourceType === 'x_account' || xm.sourceType === 'twitter' ? xm.sourceId : xm.linkedId;
      if (handle) {
        msg += `𝕏 [${handle}](https://x.com/${handle.replace('@', '')})\n`;
        hasSocial = true;
      }
    }
  }

  // Identity Mesh (Pro+)
  if (isFullAccess && meshLinks.length > 0) {
    const socialMesh = meshLinks.filter((c: any) =>
      c.relationship === 'same_kyc_root' || c.relationship === 'same_team' ||
      c.sourceType === 'twitter' || c.sourceType === 'x_account' ||
      c.linkedType === 'twitter' || c.linkedType === 'x_account'
    );
    if (socialMesh.length > 0) {
      msg += `\n🕸 *Identity Mesh:*\n`;
      for (const c of socialMesh.slice(0, 5)) {
        const rel = c.relationship || 'linked';
        const target = c.linkedId || '?';
        // Full address for wallets, plain for handles
        const isWallet = typeof target === 'string' && target.length > 32;
        const display = isWallet
          ? `[${target}](https://solscan.io/account/${target})`
          : `\`${target}\``;
        msg += `• ${rel}: ${display}\n`;
      }
      hasSocial = true;
    }
  }

  if (!hasSocial) {
    msg += `_No social accounts linked to this developer._\n`;
  }

  // Funded-by chain (Pro+) — FULL addresses linked to Solscan
  if (isFullAccess && meshLinks.length > 0) {
    const fundedBy = meshLinks.filter((c: any) =>
      c.relationship === 'funded_by' || c.relationship === 'directly_funded'
    );
    if (fundedBy.length > 0) {
      msg += `\n💰 *Funding Chain:*\n`;
      for (const f of fundedBy.slice(0, 3)) {
        const src = f.sourceId || '?';
        let fundLabel = '';
        if (typeof src === 'string') {
          for (const [exchange, addrs] of Object.entries(KNOWN_CEX_WALLETS)) {
            if (addrs.includes(src)) { fundLabel = ` 🏦 ${exchange}`; break; }
          }
        }
        msg += `• [${src}](https://solscan.io/account/${src})${fundLabel}\n`;
      }
    }
  }

  // Upstream chain from genealogy scanner — FULL addresses
  if (isFullAccess && data.upstreamChain?.length > 0) {
    msg += `\n🔗 *Wallet Lineage:*\n`;
    for (const hop of data.upstreamChain.slice(0, 5)) {
      const emoji = hop.role === 'KYC_ROOT' ? '🏦' : hop.role === 'FUNDER' ? '💰' : '📡';
      let hopLabel = '';
      if (hop.wallet) {
        for (const [exchange, addrs] of Object.entries(KNOWN_CEX_WALLETS)) {
          if (addrs.includes(hop.wallet)) { hopLabel = ` (${exchange})`; break; }
        }
      }
      msg += `${emoji} ${hop.role}: [${hop.wallet}](https://solscan.io/account/${hop.wallet})${hopLabel}\n`;
    }
  }

  if (!isFullAccess) {
    msg += `\n_Upgrade to X Subscriber for full social mesh & funding chains._`;
  }

  // ── Quick Links ──
  msg += `\n\n🔗 *Quick Links:*\n`;
  msg += `├ [Padre.gg](https://trade.padre.gg/rk/blackbox/trade/solana/${ca})\n`;
  if (dev.address) {
    msg += `├ [Dev on Pump.fun](https://pump.fun/profile/${dev.address})\n`;
    msg += `├ [Dev on Solscan](https://solscan.io/account/${dev.address})\n`;
  }
  msg += `├ [Token on Pump.fun](https://pump.fun/${ca})\n`;
  msg += `└ [BubbleMap](https://blackbox.farm/bubblemap?token=${ca})\n`;

  // Token phase context
  try {
    if (dexData && dev.reputation_score != null) {
      const pr = detectTokenPhase({ pairCreatedAt: dexData.pairCreatedAt || null, liquidityUsd: dexData.liquidity?.usd || null, dexId: dexData.dexId || null });
      msg += `\n💡 _${contextualizeDevRep(dev.reputation_score, pr.phase)}_\n`;
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

  const curated = isCuratedOptimistic(ca);
  const isLite = !hasTier(gate.tier, "x_subscriber");
  const badActorBanner = curated ? null : await buildBadActorBanner(ca, gate.tier);

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
  if (badActorBanner) header = badActorBanner + header;
  if (curated) header = CURATED_OPTIMISTIC_BANNER + header;

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

    const aiRes = await meteredAiFetch("holdersintel-bot-webhook", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
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

// ─── /ca CA — Rich snapshot with dev reputation + risk flags ───
async function handleCA(chatId: number, telegramUserId: string, args: string, isGroupChat = false) {
  const trimmedArgs = args.trim().toLowerCase();

  // Handle /ca on | /ca off toggle (groups only)
  if (trimmedArgs === 'on' || trimmedArgs === 'off') {
    if (!isGroupChat) {
      await sendMessage(chatId, `ℹ️ Toggle is for group chats only. /ca is always active in DMs.`);
      return;
    }
    const enabled = trimmedArgs === 'on';
    await supabase.from('bot_chat_settings').upsert(
      { chat_id: chatId, ca_enabled: enabled, updated_at: new Date().toISOString() },
      { onConflict: 'chat_id' }
    );
    await sendMessage(chatId, enabled
      ? `✅ */ca* responses *enabled* in this chat. I'll reply when you paste a contract address.`
      : `🔇 */ca* responses *disabled* in this chat. Other bots can handle /ca. Use \`/ca on\` to re-enable.`
    );
    return;
  }

  // In group chats, check if /ca is toggled off
  if (isGroupChat) {
    const { data: settings } = await supabase
      .from('bot_chat_settings')
      .select('ca_enabled')
      .eq('chat_id', chatId)
      .maybeSingle();
    if (settings && settings.ca_enabled === false) return; // silently ignore
  }

  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/ca <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/ca");
  if (!gate) return;

  const isPaid = hasTier(gate.tier, 'x_subscriber');

  await sendMessage(chatId, `🔍 Scanning \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
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
  const dustPct = data.dustPercentage ?? null;
  const whaleCount = data.simpleTiers?.whales?.count ?? null;
  const whalePct = data.simpleTiers?.whales?.supplyPercentage ?? null;

  // Dev reputation — tiered
  let devLine = '';
  const devWallet = data.potentialDevWallet?.address || data.creatorInfo?.wallet;
  if (devWallet) {
    const { data: devProfile } = await supabase
      .from('developer_profiles')
      .select('reputation_score, trust_level, rug_pull_count, successful_tokens')
      .eq('master_wallet', devWallet)
      .maybeSingle();

    if (devProfile && devProfile.reputation_score !== null) {
      if (isPaid) {
        const score = devProfile.reputation_score;
        const trustEmoji = score >= 70 ? '🟢' : score >= 40 ? '🟡' : '🔴';
        devLine = `\n🏗 Dev: ${trustEmoji} *${score}/100* (${devProfile.trust_level || 'unknown'})`;
        if (devProfile.rug_pull_count > 0) devLine += ` ⚠️ *${devProfile.rug_pull_count} prior rug(s)*`;
        if (devProfile.successful_tokens > 0) devLine += ` ✅ ${devProfile.successful_tokens} successful`;
      } else {
        devLine = `\n🏗 Dev: 🔒 ██/100 — _upgrade to reveal_`;
        if (devProfile.rug_pull_count > 0) devLine += `\n⚠️ *${devProfile.rug_pull_count} prior rug(s)* — 🔒 _details locked_`;
      }
    }
  }

  // Social links count — tiered
  let socialLine = '';
  const { count: socialCount } = await supabase
    .from('token_social_links')
    .select('*', { count: 'exact', head: true })
    .eq('token_mint', ca)
    .eq('is_current', true);
  if (socialCount && socialCount > 0) {
    socialLine = isPaid
      ? `\n🔗 Socials: *${socialCount} linked*`
      : `\n🔗 Socials: 🔒 _${socialCount} found — upgrade to view_`;
  }

  // Risk flags — tiered
  let riskLine = '';
  if (data.riskFlags && data.riskFlags.length > 0) {
    if (isPaid) {
      const flagTexts = data.riskFlags.slice(0, 3).map((f: any) => typeof f === 'string' ? f : f.label || f.flag || '⚠️');
      riskLine = `\n⚠️ Flags: ${flagTexts.join(', ')}`;
    } else {
      riskLine = `\n⚠️ *${data.riskFlags.length} flag(s) detected* — 🔒 _upgrade to see_`;
    }
  }

  const upgradeCta = !isPaid ? `\n\n🔓 _Unlock full dev intel & risk flags:_ [Upgrade](https://blackbox.farm/subscriptions)` : '';

  await sendMessage(chatId,
    `\`${ca}\`\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n` +
    `📊 *Token Profile*\n\n` +
    `👥 Holders: *${totalHolders}*` + (dustPct != null ? ` (${dustPct.toFixed(0)}% dust)` : '') + `\n` +
    `❤️ Health: *${healthScore}/100*${phaseLabel}\n` +
    `${top10Pct != null ? `🏦 Top 10%: *${top10Pct.toFixed(1)}%*\n` : ''}` +
    `${whaleCount != null ? `🐋 Whales: *${whaleCount}*${whalePct != null ? ` (${whalePct.toFixed(1)}% supply)` : ''}\n` : ''}` +
    devLine +
    socialLine +
    riskLine +
    upgradeCta +
    `\n\n_/holders for full breakdown · /risk for risk analysis · /ai for AI verdict_` +
    `\n🔗 [Full Report](https://blackbox.farm/holders?token=${ca}) | [BubbleMap](https://blackbox.farm/bubblemap?token=${ca})` +
    TAGLINE
  );
}

// ─── /quick (/q) CA — Lightweight DB-only instant lookup (no edge function call) ───
async function handleQuick(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/quick <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/quick");
  if (!gate) return;

  await logUsage(telegramUserId, "/quick", ca);

  // Pure DB lookup — no edge function call, instant response
  const [lifecycleRes, healthRes] = await Promise.all([
    supabase.from('token_lifecycle').select('symbol, name, market_cap, price_usd, holder_count, phase, last_seen_at').eq('token_mint', ca).maybeSingle(),
    supabase.from('token_health_snapshots').select('health_score, health_grade, top10_pct, real_holders').eq('token_mint', ca).order('snapshot_at', { ascending: false }).limit(1).maybeSingle(),
  ]);

  const lc = lifecycleRes.data;
  const hs = healthRes.data;

  if (!lc && !hs) {
    await sendMessage(chatId, `⚡ No data found for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`\n\n_This token hasn't been scanned yet. Use /ca for a full scan._` + TAGLINE);
    return;
  }

  const symbol = lc?.symbol || '???';
  const name = lc?.name || '';
  const mcap = lc?.market_cap || null;
  const holders = hs?.real_holders || lc?.holder_count || '?';
  const health = hs?.health_score ?? '?';
  const grade = hs?.health_grade || '';
  const top10 = hs?.top10_pct ?? null;
  const phase = lc?.phase || null;
  const phaseLabel = phase ? ` (${phase.replace('_', ' ')})` : '';
  const gradeLabel = grade ? ` [${grade}]` : '';

  await sendMessage(chatId,
    `⚡ *Instant Lookup*\n` +
    `${tokenHeaderLine(symbol, name, mcap)}\n\n` +
    `👥 Holders: *${holders}*\n` +
    `❤️ Health: *${health}/100*${gradeLabel}${phaseLabel}\n` +
    `${top10 != null ? `🏦 Top 10%: *${typeof top10 === 'number' ? top10.toFixed(1) : top10}%*\n` : ''}` +
    `\n_Use /ca for full scan or /holders for detailed breakdown._` +
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

// obfuscateTicker imported from _shared/ticker-obfuscator.ts (thin-formatting protocol).
// Strips $ cashtag and interleaves U+200B between every letter so external bots
// (Rick, Maestro, etc.) cannot match the symbol and trigger reply-chain loops.

// ─── Group Chat Auto-Scan: detect pasted CAs and fire mini /risk ───
async function handleGroupAutoScan(chatId: number, telegramUserId: string, ca: string, replyToMsgId?: number, opts?: { skipActivationCheck?: boolean }) {
  // Check if this group has an activated (paid) installation
  // (BlackBox aggregator group bypasses this — it's a system channel, not a customer install.)
  if (!opts?.skipActivationCheck) {
    const activated = await isGroupActivated(chatId);
    if (!activated) return; // silently ignore unactivated groups
  }

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
  // One retry with backoff — Helius/RPC fan-out occasionally returns
  // "All RPC endpoints failed" on a single attempt and clears on retry.
  const fetchHolders = async () => {
    let r = await invokeFunction("bagless-holders-report", { tokenMint: ca });
    if (!r || r.error) {
      await new Promise((res) => setTimeout(res, 500));
      r = await invokeFunction("bagless-holders-report", { tokenMint: ca });
    }
    return r;
  };
  const [holdersData, cachedWarnings] = await Promise.all([
    fetchHolders(),
    getTokenWarnings(ca, supabase),
  ]);

  const holdersOk = holdersData && !holdersData.error;

  if (!holdersOk) {
    // BlackBox aggregator group MUST always see a HoldersIntel reply lined
    // up alongside Phanes / Rick. For customer-installed groups we keep the
    // original silent-fail behaviour so paid installs aren't spammed.
    if (!opts?.skipActivationCheck) return;

    // Tiered fallback: DexScreener-only stats → minimal stub.
    let symbol: string | null = null;
    let mcUsd: number | null = null;
    let liqUsd: number | null = null;
    try {
      const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
      if (dexRes.ok) {
        const dx = await dexRes.json();
        const pair = (dx?.pairs || [])
          .filter((p: any) => p.chainId === 'solana')
          .sort((a: any, b: any) => (b?.liquidity?.usd || 0) - (a?.liquidity?.usd || 0))[0];
        if (pair) {
          symbol = pair.baseToken?.symbol || null;
          mcUsd = pair.marketCap ?? pair.fdv ?? null;
          liqUsd = pair?.liquidity?.usd ?? null;
        }
      }
    } catch (_) { /* ignore */ }

    const label = symbol ? obfuscateTicker(symbol) : ca.slice(0, 8) + '...';
    const lines: string[] = [`⚡ *${label} — Quick Stats*`, ''];
    if (mcUsd != null) lines.push(`💰 MC: *$${Math.round(mcUsd).toLocaleString()}*`);
    if (liqUsd != null) lines.push(`💧 Liq: *$${Math.round(liqUsd).toLocaleString()}*`);
    lines.push(`_Holders snapshot temporarily unavailable — retrying on next tick._`);
    lines.push(`\n🔗 [Full Report](https://blackbox.farm/holders?token=${ca}) | [BubbleMap](https://blackbox.farm/bubblemap?token=${ca})${TAGLINE}`);
    console.log(`[bot] blackbox_group reply sent (fallback) chat:${chatId} ca:${ca.slice(0,12)} dexOk:${mcUsd != null}`);
    await sendMessage(chatId, lines.join('\n'), "Markdown", replyToMsgId);
    return;
  }

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
      await setSelectedChannelId(telegramUserId, selectedChatId as number);
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

// ─── Promo code redemption helper ───
async function handlePromoRedemption(chatId: number, telegramUserId: string, code: string) {
  try {
    // Look up promo code
    const { data: promo, error: promoErr } = await supabase
      .from('promo_codes')
      .select('*')
      .eq('code', code)
      .eq('is_active', true)
      .maybeSingle();

    if (promoErr || !promo) {
      // Not a valid promo code — fall through to normal payment flow
      // Re-call handlePayment with empty args to trigger normal flow
      await sendMessage(chatId,
        `❓ *"${code}" is not a valid promo code.*\n\n` +
        `If you want to pay with SOL, just use /payment without a code.\n` +
        `To verify an existing payment: /payment verify` + TAGLINE
      );
      return;
    }

    // Check if limit reached
    if (promo.current_uses >= promo.max_uses) {
      await sendMessage(chatId,
        `⛔ *This invitation code has reached its limit.*\n\n` +
        `All ${promo.max_uses} spots for "${code}" have been claimed.\n` +
        `You can still subscribe via /payment or at blackbox.farm/subscriptions.` + TAGLINE
      );
      return;
    }

    // Check if this TG user already redeemed ANY promo code
    const { data: existingRedemption } = await supabase
      .from('promo_redemptions')
      .select('id, expires_at')
      .eq('telegram_user_id', telegramUserId)
      .eq('is_active', true)
      .gte('expires_at', new Date().toISOString())
      .maybeSingle();

    if (existingRedemption) {
      const expiryDate = new Date(existingRedemption.expires_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      await sendMessage(chatId,
        `✅ *You already have an active tester subscription!*\n\n` +
        `Your trial is valid until *${expiryDate}*.\n` +
        `Use /status to check your tier details.` + TAGLINE
      );
      return;
    }

    // Get linked user (optional for promo)
    const linked = await getLinkedUser(telegramUserId);

    // Calculate expiry
    const now = new Date();
    const expiresAt = new Date(now.getTime() + promo.trial_duration_days * 24 * 60 * 60 * 1000);

    // Create redemption record
    const { error: redemptionErr } = await supabase
      .from('promo_redemptions')
      .insert({
        promo_code_id: promo.id,
        telegram_user_id: telegramUserId,
        user_id: linked?.user_id || null,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        source_label: promo.source_label,
      });

    if (redemptionErr) throw redemptionErr;

    // Increment usage counter
    await supabase
      .from('promo_codes')
      .update({ current_uses: promo.current_uses + 1, updated_at: new Date().toISOString() })
      .eq('id', promo.id);

    // Create a tg_sol_subscriptions record for tier recognition
    await supabase
      .from('tg_sol_subscriptions')
      .insert({
        user_id: linked?.user_id || null,
        telegram_user_id: telegramUserId,
        payment_wallet_pubkey: 'PROMO_' + code,
        payment_wallet_secret_encrypted: 'promo',
        amount_sol: 0,
        sol_price_at_order: null,
        status: 'paid',
        tier_granted: promo.tier_granted,
        paid_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

    // Update user tier if linked
    if (linked?.user_id) {
      await supabase
        .from('profiles')
        .update({ cached_tier_key: promo.tier_granted })
        .eq('id', linked.user_id);
    }

    // Admin notification
    try {
      await supabase.from('admin_notifications').insert({
        notification_type: 'promo_redemption',
        title: '🎟️ Promo Code Redeemed',
        message: `TG user ${telegramUserId} redeemed "${code}" (${promo.current_uses + 1}/${promo.max_uses}). Source: ${promo.source_label || 'N/A'}. Expires: ${expiresAt.toLocaleDateString('en-US')}`,
        metadata: {
          code,
          telegram_user_id: telegramUserId,
          user_id: linked?.user_id,
          source_label: promo.source_label,
          uses: `${promo.current_uses + 1}/${promo.max_uses}`,
          expires_at: expiresAt.toISOString(),
        },
      });
    } catch { /* non-critical */ }

    const spotsLeft = promo.max_uses - promo.current_uses - 1;
    console.log(`[bot] Promo "${code}" redeemed by TG ${telegramUserId}. ${spotsLeft} spots remaining.`);

    await sendMessage(chatId,
      `🎉 *Welcome, Tester!*\n\n` +
      `You now have *${promo.trial_duration_days}-day Pro access* courtesy of the "${code}" invitation.\n\n` +
      `🔓 All commands unlocked • Full analytics • AI assistant\n\n` +
      `📅 Expires: *${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}*\n\n` +
      `🌐 Visit [blackbox.farm](https://blackbox.farm) to explore all features.\n\n` +
      `💬 We value your feedback! Use the feedback widget on the website to share your thoughts.` + TAGLINE
    );

  } catch (e) {
    console.error('[bot] Promo redemption error:', e);
    await sendMessage(chatId,
      `❌ *Error processing promo code.*\n\nPlease try again or contact support.` + TAGLINE
    );
  }
}

// ─── /payment (/pay) — DM-only: Yearly Pro subscription via SOL ───
async function handlePayment(chatId: number, telegramUserId: string, args: string) {
  // If they send /payment verify, check their pending subscription
  if (args.trim().startsWith('verify')) {
    await handlePaymentVerify(chatId, telegramUserId, args.replace(/^verify\s*/i, '').trim());
    return;
  }

  // ─── Promo code interception (e.g. /payment ARAB10) ───
  const trimmedArgs = args.trim().toUpperCase();
  if (trimmedArgs && !trimmedArgs.startsWith('VERIFY')) {
    await handlePromoRedemption(chatId, telegramUserId, trimmedArgs);
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

    await sendPaymentInstructionsWithQR(chatId, {
      paymentWallet: data.payment_wallet,
      amountSol: data.amount_sol,
      solPrice: data.sol_price,
      subscriptionId: data.subscription_id,
      expiresInSec: data.expires_in_sec ?? 3600,
      isExisting: !!data.existing,
    });
  } catch (e) {
    console.error('[bot] Payment creation error:', e);
    await sendMessage(chatId,
      `❌ *Error generating payment wallet.*\n\nPlease try again in a moment or subscribe via [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions).` + TAGLINE
    );
  }
}

// ─── Helper: Render the payment instructions message with QR code + countdown + buttons ───
async function sendPaymentInstructionsWithQR(
  chatId: number,
  opts: {
    paymentWallet: string;
    amountSol: number;
    solPrice?: number | null;
    subscriptionId: string;
    expiresInSec: number;
    isExisting: boolean;
  }
) {
  const { paymentWallet, amountSol, solPrice, subscriptionId, expiresInSec, isExisting } = opts;
  const solPriceStr = solPrice ? `($${(amountSol * solPrice).toFixed(2)} USD)` : '';
  const existingNote = isExisting ? `\n⚠️ _Using your existing pending payment wallet._\n` : '';
  const expiresAtMs = Date.now() + expiresInSec * 1000;
  const expiresAtStr = new Date(expiresAtMs).toUTCString().replace('GMT', 'UTC');
  const minsLeft = Math.max(0, Math.floor(expiresInSec / 60));

  // Solana Pay URI — many wallets render this as a deep link from QR scans
  const solanaPayUri = `solana:${paymentWallet}?amount=${amountSol}&label=HoldersIntel%20Pro&message=Yearly%20Pro%20Subscription`;
  // QR via free public service (no key, returns PNG)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=10&data=${encodeURIComponent(solanaPayUri)}`;

  const caption =
    `💰 *Yearly Pro Subscription — Pay with SOL*\n\n` +
    `📲 *Scan the QR* with any Solana wallet (Phantom, Solflare, Backpack)\n` +
    `_or_ send manually:\n\n` +
    `Amount: *${amountSol} SOL* ${solPriceStr}\n` +
    `Wallet: \`${paymentWallet}\`\n` +
    `📋 _Tap the address above to copy it_${existingNote}\n` +
    `⏱ *Expires in ~${minsLeft} min* (at ${expiresAtStr})\n\n` +
    `✅ Unlocks Pro tier for *1 full year* — all commands, highest limits.\n` +
    `💡 _Cheaper than Stripe ($89.99/yr)._`;

  const buttons = [
    [{ text: "🔄 I've sent it — Verify now", callback_data: `pay_verify:${subscriptionId}` }],
    [{ text: "⏱ Refresh countdown", callback_data: `pay_refresh:${subscriptionId}` }],
  ];

  // Try sendPhoto with caption first; fall back to plain text if QR service fails
  try {
    const res = await fetch(`${TELEGRAM_API}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: qrUrl,
        caption,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[bot] sendPhoto QR failed, falling back to text:', errText);
      await sendMessageWithButtons(chatId, caption + TAGLINE, buttons);
    }
  } catch (e) {
    console.error('[bot] sendPhoto QR exception, falling back to text:', e);
    await sendMessageWithButtons(chatId, caption + TAGLINE, buttons);
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

      // ─── 1) Celebration receipt message ───
      await sendMessage(chatId,
        `🎉🎊 *PAYMENT CONFIRMED!* 🎊🎉\n\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `👑 *Welcome to HoldersIntel Pro*\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `💎 Amount received: *${data.received?.toFixed(4) ?? pendingSub.amount_sol} SOL*\n` +
        `📅 Pro active until: *${expiryDate}*\n` +
        `🆔 Payment ID: \`${pendingSub.id.slice(0, 8)}\`\n\n` +
        `_A welcome message with your unlocked perks is coming next..._` + TAGLINE
      );

      // ─── 2) Welcome-to-Pro DM with perks + action buttons (one-time) ───
      await sendProWelcomeDM(chatId, expiryDate);

      // Send SOL payment receipt email
      try {
      const email = (linked as any).email || (linked as any).profiles?.email;
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
          name: (linked as any).profiles?.display_name,
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

// ─── Pro Welcome DM (sent once on payment confirmation) ───
async function sendProWelcomeDM(chatId: number, expiryDate: string) {
  const text =
    `👑 *Welcome to HoldersIntel Pro*\n\n` +
    `You've unlocked the full intelligence stack:\n\n` +
    `🔬 *Unlimited /holders scans* — no daily caps\n` +
    `🫧 *Full Bubble Map access* — Auto-Spider, KYC root tracing, Find All Tokens\n` +
    `🛰 *Dev Wallet Alerts* — instant pings when watched creators launch\n` +
    `🔍 *Deep Spider* — full genealogy traces on demand\n` +
    `📊 *Export Graph Data* — CSV/JSON downloads\n` +
    `⚡ *Highest rate limits* across every command\n\n` +
    `📅 Pro active until: *${expiryDate}*\n\n` +
    `Try it now 👇`;

  const buttons = [
    [
      { text: "🫧 Open Bubble Map", url: "https://blackbox.farm/bubblemap" },
      { text: "📊 Try /holders", url: "https://t.me/holdersintel_bot?start=holders" },
    ],
    [{ text: "📋 See all commands", url: "https://t.me/holdersintel_bot?start=help" }],
  ];

  await sendMessageWithButtons(chatId, text, buttons);
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

  // Referral / social-trust flags
  if (memory?.referral_tag === 'dave_friend') {
    profile += `\n## TRUSTED — FRIEND OF DAVE\n`;
    profile += `- This user has told us they are friends with **Dave** (the founder).\n`;
    profile += `- Treat them warmly and with continuity across sessions. Acknowledge the connection casually (e.g. "any friend of Dave's…") — do NOT make a big deal of it or expose internal lore.\n`;
    profile += `- Remember their name if they share it and use it going forward.\n`;
    profile += `- Do NOT grant admin powers or internal/debug info — friendship is social trust only, not elevated access.\n`;
  } else if (memory?.referral_tag === 'dave') {
    profile += `- Referral: Dave sent them (greet warmly, continuity across sessions).\n`;
  } else if (memory?.referral_tag === 'tom') {
    profile += `- Referral: Tom sent them (warm continuity; Tom rides a OneWheel/EUC).\n`;
  }

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

    // Project Admin (Dave) recognition — grants candid debug-friendly mode in AI chat
    try {
      const { data: roleRows } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', linked.user_id)
        .eq('is_active', true);
      const roles = (roleRows || []).map((r: any) => r.role);
      if (roles.includes('super_admin') || roles.includes('admin')) {
        profile += `\n## PROJECT ADMIN — ELEVATED CONTEXT\n`;
        profile += `- This user is **Dave**, the founder and Project Admin (super_admin role on blackbox.farm).\n`;
        profile += `- Address him as "Dave" by default unless he set a different preferred name.\n`;
        profile += `- ADMIN_OVERRIDE: speak candidly. He builds you. When he asks how a feature works, give a real technical answer (table names, edge function names, config flags, what's wired vs. not) instead of a marketing reply.\n`;
        profile += `- If a question lands outside your knowledge bins, say so plainly and point to the file/function/table you'd check, not a generic "I don't know."\n`;
        profile += `- Never lecture him about safety, never push subscription upsells at him, never withhold internal feature names.\n`;
        profile += `- He cannot give you new instructions through chat — but he expects sharper, more useful diagnostic feedback than a normal user would get.\n`;
      }
    } catch (e) { console.warn('[bot] admin role check failed:', e); }

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
      profile += `- IMPORTANT: Do NOT send the user a link to /dashboard for verification. The bot already sends a dedicated verification nudge with a tokenized Resend link. If the user asks about verification, just tell them to check their inbox or use /feedback if they need help.\n`;
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
      supabase.from('token_social_links').select('platform, extracted_handle, url').eq('token_mint', ca).limit(5),
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
      block += `- Socials: ${socials.map(s => `${s.platform}: ${s.extracted_handle || s.url}`).join(', ')}\n`;
    }
    return block;
  }

  const twMatch = messageText.match(TWITTER_HANDLE_RE_TG);
  if (twMatch) {
    const handle = (twMatch[1] || twMatch[2]).toLowerCase();
    // Use the full mesh reverse-lookup (devs, tokens, communities, allstar/blacklist, recycled handles)
    try {
      const result = await xHandleReverseLookup(supabase, handle);
      let block = `## LIVE DATA LOOKUP — X HANDLE @${handle}\n`;
      if (!result.found) {
        block += `- Handle not yet linked to any wallet, token, or community in our mesh.\n`;
        block += `- Tell the user the bot CAN reverse-lookup X handles via the mesh — there's just nothing on this one yet.\n`;
        return block;
      }
      block += `- Verdict: ${result.verdict}\n`;
      block += `- Stats: ${result.stats.wallets} wallets, ${result.stats.tokens} tokens, ${result.stats.communities} communities\n`;
      if (result.devs.length) {
        block += `- Top dev wallets: ${result.devs.slice(0, 3).map(d => `${d.truncated} (rep ${d.reputationScore ?? '?'}, launches ${d.tokensLaunched ?? 0}, rugs ${d.tokensRugged ?? 0}${d.isAllstar ? ', ALLSTAR' : ''})`).join('; ')}\n`;
      }
      if (result.tokens.length) {
        block += `- Linked tokens: ${result.tokens.slice(0, 5).map(t => `${t.symbol || t.mint.slice(0,4)} [${t.status || '?'}]`).join(', ')}\n`;
      }
      if (result.communities.length) {
        block += `- Communities: ${result.communities.slice(0, 5).map(c => `${c.name} (${c.role}${c.recycled ? ', RECYCLED' : ''})`).join('; ')}\n`;
      }
      if (result.recycledHandles.length) {
        block += `- Recycled handle history: ${result.recycledHandles.slice(0, 5).join(', ')}\n`;
      }
      if (result.kycRoots.length) {
        block += `- KYC roots traced: ${result.kycRoots.length}\n`;
      }
      return block;
    } catch (e) {
      console.warn('[bot] detectTgLookup x-handle failed:', e);
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
        prompt += `- Dashboard: NEVER send https://blackbox.farm/dashboard as a raw link in Telegram — it renders poorly in mobile browsers. Instead, tell users to open the site and navigate to their dashboard, or generate a tokenized action link.\n`;
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

        prompt += `## X-HANDLE REVERSE LOOKUP (YOU CAN DO THIS)\n`;
        prompt += `You DO know about X (Twitter) handles. The bot has a mesh reverse-lookup that, given any @handle, returns:\n`;
        prompt += `- linked dev wallets + reputation score + launch/rug counts + allstar status\n`;
        prompt += `- linked tokens (alive/dying/dead, autopsy slug if any)\n`;
        prompt += `- linked X Communities (admin vs mod role, with recycled-name history)\n`;
        prompt += `- recycled prior handles that pointed at the same wallets/tokens\n`;
        prompt += `- KYC root chain if traced\n`;
        prompt += `Trigger: in DM, a user can paste a bare \`@handle\` (or just \`handle\`) and the bot auto-runs the lookup. In AI chat, if a handle appears in the message and we have data, you'll see a "LIVE DATA LOOKUP — X HANDLE" block above. If the handle isn't in the mesh yet, say so plainly and tell them DM-pasting the bare handle re-triggers a fresh scan. NEVER say "I don't know about X handles" — that capability exists.\n\n`;

        prompt += `## TELEGRAM BOT COMMANDS (REAL COMMANDS ONLY)\n`;
        prompt += `You must ONLY reference these real commands. NEVER invent or hallucinate commands that don't exist.\n`;
        prompt += `### Setup (All tiers)\n`;
        prompt += `/start — Welcome & setup\n/signup — Create account via Telegram\n/register — Link BlackBox Farm account\n/myname NAME — Set your preferred name\n/status — Check subscription tier\n/help — Show all commands\n\n`;
        prompt += `### Analysis (Auth+ tier)\n`;
        prompt += `/holders CA — Holder distribution analysis\n/risk CA (alias /r) — Composite risk & stability\n/concentration CA — Detailed holder % breakdown\n/dev CA (alias /d) — Developer intel & social doxxing\n/ca CA — Default holder analysis\n/quick CA (alias /q) — Fast holder count & key stats\n/ai CA — Descriptive AI analysis snapshot\n\n`;
        prompt += `### Advanced (X Subscriber+ tier)\n`;
        prompt += `/momentum CA (alias /m) — Volume & price momentum scoring\n/insiders CA (alias /i) — Insider cluster & bundling pre-check\n/compare CA1 CA2 (alias /cmp) — Side-by-side token comparison\n/alerts — Manage alert preferences\n\n`;
        prompt += `### Pro ($9.99/mo)\n`;
        prompt += `/oracle CA (alias /o) — Full developer reputation mesh\n/wallet CA (alias /w) — Wallet behavior analysis\n\n`;
        prompt += `### Admin (DM-only)\n`;
        prompt += `/add — Add bot to a group\n/channels (alias /ch) — Manage installations\n/config — Channel settings\n/payment (alias /pay) — Payment & billing\n\n`;
        prompt += `### Utility (All tiers)\n`;
        prompt += `/feedback (alias /fb) — Send feedback to the team\n\n`;
        prompt += `IMPORTANT: Commands like /lb, /calls, /top10, /leaderboard, /scan, /emojis DO NOT EXIST. Never mention them.\n`;
        prompt += `When promoting commands, only promote ones available to this user's tier. Don't tease unavailable commands without mentioning the upgrade path.\n\n`;

        // Inject user profile + live data
        prompt += userProfile + '\n';
        if (liveDataBlock) prompt += liveDataBlock + '\n';

        // Inject cross-platform chat history for continuity
        try {
          const { data: recentChat } = await supabase
            .from('unified_chat_history')
            .select('platform, role, content, created_at')
            .eq('account_user_id', linked.user_id)
            .order('created_at', { ascending: false })
            .limit(5);
          if (recentChat && recentChat.length > 0) {
            prompt += `## RECENT CROSS-PLATFORM CONTEXT\nRecent messages from this user across web and Telegram (newest first):\n`;
            for (const msg of recentChat.reverse()) {
              const plat = msg.platform === 'web' ? '🌐' : '📱';
              prompt += `${plat} [${msg.role}]: ${(msg.content || '').slice(0, 200)}\n`;
            }
            prompt += `\nUse this context naturally — don't reference "cross-platform" to the user.\n\n`;
          }
        } catch (e) { console.warn('[bot] cross-platform context fetch failed:', e); }

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

    const aiRes = await meteredAiFetch("holdersintel-bot-webhook", 'https://ai.gateway.lovable.dev/v1/chat/completions', {
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

      // Write to unified_chat_history for cross-platform context
      supabase.from('unified_chat_history').insert([
        { account_user_id: linked.user_id, telegram_user_id: telegramUserId, platform: 'telegram', role: 'user', content: messageText.slice(0, 2000) },
        { account_user_id: linked.user_id, telegram_user_id: telegramUserId, platform: 'telegram', role: 'assistant', content: reply.slice(0, 2000) },
      ]).then(({ error: uhErr }) => {
        if (uhErr) console.error('[bot] unified_chat_history write failed:', uhErr);
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

      // Detect "friend of Dave" claims — Dave is the founder. Persist as referral_tag for cross-session continuity.
      if (memory?.referral_tag !== 'dave_friend') {
        const daveFriendRe = /\b(?:friends?\s+with\s+dave|dave'?s\s+(?:friend|buddy|mate|pal)|i\s+know\s+dave|dave\s+(?:and\s+i|&\s+i)\s+(?:are|go)|known\s+dave)\b/i;
        if (daveFriendRe.test(messageText)) {
          const updates: any = {
            referral_tag: 'dave_friend',
            referral_first_seen_at: new Date().toISOString(),
          };
          if (memory?.id) {
            supabase.from('ai_user_memory').update(updates).eq('id', memory.id).then(({ error }) => {
              if (error) console.error('[bot] dave_friend tag update failed:', error);
            });
          } else {
            supabase.from('ai_user_memory').insert({
              telegram_user_id: telegramUserId,
              user_id: linked?.user_id || null,
              last_platform: 'telegram',
              ...updates,
            }).then(({ error }) => {
              if (error) console.error('[bot] dave_friend tag insert failed:', error);
            });
          }
          console.log(`[bot] tagged TG user ${telegramUserId} as friend_of_dave`);
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
        body: JSON.stringify({ url: webhookUrl, allowed_updates: ["message", "my_chat_member", "chat_member", "callback_query"] }),
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

    // ─── Handle callback_query events (inline keyboard button taps) ───
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
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

    // ─── BlackBox Aggregator silent-mode router ───
    // In the configured BlackBox group, HoldersIntel must NOT auto-respond to
    // anything — the blackbox-tick function is the only thing that posts in
    // there (a bare CA). Trader-bot replies and chatter are picked up via
    // MTProto, not this webhook. Same idea for the output channel: only the
    // aggregator publishes there; user commands are ignored.
    try {
      const { data: bbCfg } = await supabase
        .from('blackbox_channel_config')
        .select('role')
        .eq('chat_id', chatId)
        .eq('enabled', true)
        .maybeSingle();
      if (bbCfg?.role === 'output_channel') {
        console.log(`[bot] silent-mode (output_channel) chat:${chatId} — skipping`);
        return new Response("OK");
      }
      if (bbCfg?.role === 'blackbox_group') {
        // Carve-out: skip command handling + /ca toggle, but still let the
        // passive auto-CA scanner fire so HoldersIntel posts its wallet-analysis
        // reply alongside Phanes / Dr. Rick when a bare CA shows up.
        try {
          const detectedCA = looksLikeSolanaCA(message.text);
          if (detectedCA) {
            console.log(`[bot] blackbox_group passive auto-scan chat:${chatId} ca:${detectedCA.slice(0,12)}`);
            await handleGroupAutoScan(chatId, telegramUserId, detectedCA, messageId, { skipActivationCheck: true });
          }
        } catch (e) {
          console.warn('[bot] blackbox_group passive auto-scan failed:', e);
        }
        return new Response("OK");
      }
    } catch (e) {
      console.warn('[bot] blackbox config lookup failed:', e);
    }

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

    // ─── Phase 1 mesh symmetry: every CA-bearing bot command feeds the
    // reputation mesh + bumps the public-demand counter, even before the
    // command's own handler runs. Fire-and-forget; never blocks the user.
    {
      const CA_BEARING_COMMANDS = new Set<string>([
        "/holders", "/ca", "/risk", "/r", "/dev", "/d",
        "/quick", "/q", "/oracle", "/o", "/wallet", "/w",
        "/insiders", "/i", "/concentration", "/con",
        "/momentum", "/m", "/mom", "/ai", "/compare", "/cmp",
      ]);
      const COMMAND_TO_SOURCE: Record<string, IngestSource> = {
        "/holders": "tg_bot:/holders",
        "/ca": "tg_bot:/ca",
        "/risk": "tg_bot:/risk", "/r": "tg_bot:/risk",
        "/dev": "tg_bot:/dev", "/d": "tg_bot:/dev",
        "/quick": "tg_bot:/quick", "/q": "tg_bot:/quick",
        "/oracle": "tg_bot:/oracle", "/o": "tg_bot:/oracle",
        "/insiders": "tg_bot:/insiders", "/i": "tg_bot:/insiders",
        "/concentration": "tg_bot:/concentration", "/con": "tg_bot:/concentration",
        "/momentum": "tg_bot:/momentum", "/m": "tg_bot:/momentum", "/mom": "tg_bot:/momentum",
        "/ai": "tg_bot:/ai",
        "/compare": "tg_bot:/compare", "/cmp": "tg_bot:/compare",
      };
      if (CA_BEARING_COMMANDS.has(command)) {
        const ca = extractCA(args);
        if (ca) {
          ingestPublicCAQuery(supabase, {
            mint: ca,
            source: COMMAND_TO_SOURCE[command] ?? "tg_bot:/ca",
            telegramUserId,
          });
        }
      } else if (!command.startsWith("/")) {
        // DM CA paste auto-trigger path (no command, just a CA in the message)
        const ca = extractCA(message.text);
        if (ca && !isGroupChat) {
          ingestPublicCAQuery(supabase, {
            mint: ca,
            source: "tg_bot:dm:ca_paste",
            telegramUserId,
          });
        }
      }
    }

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
    const GROUP_PUBLIC_COMMANDS = ['/start', '/help', '/register', '/status', '/quick', '/q', '/alerts', '/ca'];

    // Allow-list of commands WE own that should be redirected from group → DM.
    // Anything not in this list (e.g. /pnl, /lb, /buy from Phanes/BonkBot/etc.)
    // is silently ignored in groups so other bots can answer.
    const KNOWN_GROUP_REDIRECT_COMMANDS = [
      '/dev', '/d',
      '/insiders', '/i',
      '/concentration', '/con',
      '/compare', '/cmp',
      '/holders',
      '/ai',
      '/momentum', '/m', '/mom',
      '/oracle', '/o',
      '/wallet', '/w',
      '/add',
      '/channels', '/ch',
      '/config',
      '/payment', '/pay',
      '/ticket',
    ];

    // If in a group chat, redirect ONLY known commands to DM. Unknown slash
    // commands fall through to the lower switch's default (silent for groups).
    if (isGroupChat && KNOWN_GROUP_REDIRECT_COMMANDS.includes(command)) {
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
          case "/con":
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
            await handleCA(dmChatId, telegramUserId, args, false);
            break;
          case "/ai":
            await handleAI(dmChatId, telegramUserId, args);
            break;
          case "/momentum":
          case "/m":
          case "/mom":
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
          case "/ticket":
            await handleTicket(dmChatId, telegramUserId, args);
            break;
          default:
            // Should be unreachable — KNOWN_GROUP_REDIRECT_COMMANDS gate ensures
            // only listed commands enter this switch. Stay silent if it ever happens.
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
        case "/signup":
          await handleStart(chatId, telegramUserId, username);
          break;
        case "/myname":
          await handleMyName(chatId, telegramUserId, args);
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
        case "/con":
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
          await handleCA(chatId, telegramUserId, args, isGroupChat);
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
        case "/mom":
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
        case "/feedback":
        case "/fb":
          await handleFeedback(chatId, telegramUserId, username, args);
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
        case "/ticket":
          if (isGroupChat) {
            await sendMessage(chatId, `📬 DM me to use /ticket — support tickets are private.`, "Markdown", messageId);
          } else {
            await handleTicket(chatId, telegramUserId, args);
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
            // DM: auto-detect bare X handle (e.g., "@pumpfun711" or "pumpfun711")
            // and run mesh reverse-lookup to surface linked dev wallets / tokens / communities.
            else if (/^@?[A-Za-z0-9_]{2,15}$/.test(sanitized.rawTruncated.trim())) {
              const handle = sanitized.rawTruncated.trim().replace(/^@/, '').toLowerCase();
              console.log('[bot] X-handle reverse lookup:', handle);
              try {
                // Daily quota: Free = 3, Pro+ = unlimited
                const linked = await getLinkedUser(telegramUserId);
                let tier = 'free';
                if (linked?.user_id) tier = await getUserTier(linked.user_id);
                const isPaid = ['x_subscriber', 'pro', 'dev', 'enterprise'].includes(tier);
                if (!isPaid) {
                  const today = new Date().toISOString().slice(0, 10);
                  const { data: usageRow } = await supabase
                    .from('telegram_xlookup_usage')
                    .select('count')
                    .eq('telegram_user_id', telegramUserId)
                    .eq('used_on', today)
                    .maybeSingle();
                  if ((usageRow?.count ?? 0) >= 3) {
                    await sendMessage(chatId,
                      `🔒 *Daily X-handle lookups exhausted* (3/day on Free).\n\nUpgrade to Pro for unlimited reverse-lookups: /payment`,
                      'Markdown');
                    break;
                  }
                  await supabase.from('telegram_xlookup_usage').upsert({
                    telegram_user_id: telegramUserId,
                    used_on: today,
                    count: (usageRow?.count ?? 0) + 1,
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'telegram_user_id,used_on' });
                }
                const result = await xHandleReverseLookup(supabase, handle);
                const reply = formatXLookupForTelegram(result, obfuscateTicker);
                await sendMessage(chatId, reply, 'Markdown');
              } catch (e) {
                console.error('[bot] x-handle lookup failed:', e);
                await sendMessage(chatId,
                  `⚠️ Couldn't run lookup for @${handle}. Try again in a moment.`,
                  'Markdown');
              }
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
