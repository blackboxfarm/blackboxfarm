import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { detectTokenPhase, contextualizeDevRep, type TokenPhase } from "../_shared/token-phase.ts";
import { getHealthMode } from "../_shared/health-mode.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_HOLDERSINTEL_BOT_TOKEN")!;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Tier hierarchy (higher = more access) ───
const TIER_RANK: Record<string, number> = {
  free: 0, auth: 1, x_subscriber: 2, pro: 3, dev: 4, enterprise: 5,
};

// ─── Rate limits per tier: lookups per hour ───
const RATE_LIMITS: Record<string, number> = {
  auth: 3, x_subscriber: 10, pro: 25, dev: 50, enterprise: 100,
};

// ─── AI Verdict System ───

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
    `TOKEN: $${data.tokenSymbol} (${data.tokenName})`,
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
  // mature / unknown
  if (momentumScore >= 70 && healthScore >= 60) return { verdict: 'BUY DEEP LONG', emoji: '🟢', description: 'Strong chart, healthy holders on mature token.' };
  if (momentumScore >= 55 && healthScore >= 40) return { verdict: 'BUY MEDIUM SHORT', emoji: '🟢', description: 'Decent momentum. Target 2x.' };
  if (momentumScore >= 40) return { verdict: 'BUY SMALL SHORT', emoji: '🟡', description: 'Speculative. Small amount.' };
  return { verdict: 'HOLD / AVOID', emoji: '🔴', description: 'Weak signals. Skip.' };
}

// ─── Helpers ───

async function sendMessage(chatId: number, text: string, parseMode = "Markdown") {
  // Telegram limit is 4096 chars
  const trimmed = text.length > 4090 ? text.slice(0, 4090) + "..." : text;
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: trimmed, parse_mode: parseMode, disable_web_page_preview: true }),
  });
  if (!res.ok) console.error("[bot] sendMessage failed:", await res.text());
}

async function getLinkedUser(telegramUserId: string) {
  const { data } = await supabase
    .from("telegram_link_codes")
    .select("user_id, link_code, telegram_username, linked_at")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data;
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

/** Call an internal edge function */
async function invokeFunction(fnName: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[bot] ${fnName} error (${res.status}):`, errText);
    return null;
  }
  return res.json();
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
  // Rate limit
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

  let cmds = `📖 *HoldersIntel Bot Commands*\n\n` +
    `*General — All Users*\n` +
    `${unlocked} /start — Welcome & setup\n` +
    `${unlocked} /register \`CODE\` — Link account\n` +
    `${unlocked} /status — Check tier & usage\n` +
    `${unlocked} /help — This message\n\n`;

  cmds += `*Analysis — Auth ★*\n` +
    `${check("auth")} /holders \`CA\` — Holder distribution analysis\n` +
    `${check("auth")} /verdict (/v) \`CA\` — Buy/Hold signal with sizing\n` +
    `${check("auth")} /ca \`CA\` — Default holder analysis for a token\n` +
    `${check("auth")} /quick (/q) \`CA\` — Fast holder count & key stats\n` +
    `${check("auth")} /ai \`CA\` — Descriptive AI analysis snapshot\n\n`;

  cmds += `*Advanced — X Subscriber ★★*\n` +
    `${check("x_subscriber")} /momentum (/m) \`CA\` — Volume & price momentum scoring\n` +
    `${check("x_subscriber")} /alerts — Manage alert preferences\n`;
  if (!hasTier(tier, "x_subscriber")) {
    cmds += `  _↑ Unlock with X Subscriber ($3.99/mo)_\n`;
  }
  cmds += `\n`;

  cmds += `*Pro Intelligence — Pro ★★★*\n` +
    `${check("pro")} /oracle (/o) \`CA\` — Developer reputation lookup\n` +
    `${check("pro")} /wallet (/w) \`ADDR\` — Wallet behavior analysis\n`;
  if (!hasTier(tier, "pro")) {
    cmds += `  _↑ Unlock with Pro ($9.99/mo)_\n`;
  }

  cmds += `\n━━━━━━━━━━━━━━━━━\n` +
    `★ = Tier required | ${unlocked} = Available | ${locked} = Locked\n` +
    `_Shortforms shown in parentheses_\n\n` +
    `📊 Your tier: *${tier.toUpperCase()}*\n` +
    `📈 Rate limit: *${RATE_LIMITS[tier] ?? 3}* lookups/hr\n\n` +
    `🚀 Upgrade: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)`;

  await sendMessage(chatId, cmds);
}

// ─── /holders CA ───
async function handleHolders(chatId: number, telegramUserId: string, args: string) {
  const ca = extractCA(args);
  if (!ca) {
    await sendMessage(chatId, `❌ Usage: \`/holders <token_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "auth", "/holders");
  if (!gate) return;

  await sendMessage(chatId, `🔍 Analyzing holders for \`${ca.slice(0, 8)}...${ca.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/holders", ca);

  // Fetch fresh holder data from the main analysis function (same as the web app)
  const data = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!data || data.error) {
    await sendMessage(chatId, `❌ Could not fetch holder data. Token may not be indexed yet.\n\n_Error: ${data?.error || 'No response from analysis engine'}_`);
    return;
  }

  const isLite = !hasTier(gate.tier, "x_subscriber");

  // Extract key metrics from bagless-holders-report response
  const totalHolders = data.realHolders ?? data.totalHolders ?? "?";
  const healthScore = data.healthScore?.score ?? data.stabilityScore ?? "?";
  const healthPhase = data.healthScore?.phase || null;
  const phaseLabel = healthPhase ? ` (${healthPhase.replace('_', ' ')})` : '';
  const top10Pct = data.distributionStats?.top10Percentage ?? "?";
  const tokenSymbol = data.symbol || data.tokenSymbol || null;
  const tokenName = data.name || data.tokenName || null;
  const mcap = data.marketCap || null;

  const symbol = tokenSymbol || null;
  const name = tokenName || null;
  const tokenHeader = symbol && name ? `$${symbol} (${name})` : symbol ? `$${symbol}` : "Unknown Token";
  const mcapStr = mcap ? (mcap >= 1_000_000 ? `$${(mcap / 1_000_000).toFixed(2)}M` : `$${(mcap / 1000).toFixed(1)}K`) : null;

  // Header with token info
  let header = `\`${ca}\`\n` +
    `🪙 *${tokenHeader}*${mcapStr ? ` — MCap: *${mcapStr}*` : ''}\n\n`;

  if (isLite) {
    await sendMessage(chatId,
      header +
      `📊 *Holders Lite*\n\n` +
      `👥 Holders: *${totalHolders}*\n` +
      `❤️ Health: *${healthScore}/100*${phaseLabel}\n` +
      `🏦 Top 10% hold: *${typeof top10Pct === 'number' ? top10Pct.toFixed(1) + '%' : top10Pct}*\n\n` +
      `_Upgrade to X Subscriber for full breakdown._`
    );
    return;
  }

  // Full breakdown for X Sub+
  let msg = header;
  msg += `📊 *Holders Report*\n\n`;
  msg += `👥 Total: *${totalHolders}*\n`;
  msg += `❤️ Health: *${healthScore}*/100${phaseLabel}\n`;
  if (typeof top10Pct === 'number') msg += `🏦 Top 10%: *${top10Pct.toFixed(1)}%*\n`;
  msg += `\n`;

  // Simple tier distribution from bagless-holders-report
  const tiers = data.simpleTiers;
  if (tiers && typeof tiers === 'object') {
    msg += `*Distribution:*\n`;
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

  // LP info
  if (data.lpPercentageOfSupply != null) {
    msg += `\n🔒 LP: *${data.lpPercentageOfSupply.toFixed(1)}%* of supply\n`;
  }

  // Circulating supply
  if (data.circulatingSupply?.percentage != null) {
    msg += `♻️ Circulating: *${data.circulatingSupply.percentage.toFixed(1)}%*\n`;
  }

  // AI-enhanced health interpretation (if AI mode enabled)
  try {
    const useAI = await getHealthMode('telegram_bot');
    if (useAI) {
      const aiData = await invokeFunction("token-ai-interpreter", { tokenMint: ca, reportData: data });
      if (aiData?.interpretation) {
        const interp = aiData.interpretation;
        msg += `\n🧠 *AI Health Analysis*\n`;
        if (interp.lifecycle) msg += `📍 Stage: *${interp.lifecycle.stage}* (${interp.lifecycle.confidence})\n`;
        if (interp.status_overview) msg += `💬 ${interp.status_overview.substring(0, 300)}\n`;
      }
    }
  } catch (aiErr) {
    console.error('[holders] AI health enhancement failed:', aiErr);
    // Continue without AI — basic report already built
  }

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

  // Signals
  if (data.signals?.length) {
    msg += `\n*Signals:*\n`;
    for (const s of data.signals.slice(0, 5)) {
      const icon = s.type === 'bullish' ? '🟢' : s.type === 'bearish' ? '🔴' : '⚪';
      msg += `${icon} ${s.signal}\n`;
    }
  }

  await sendMessage(chatId, msg);
}

// ─── /verdict CA ───
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

  // Fetch momentum + holders + DexScreener metadata in parallel
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

  // Extract token info — try multiple sources
  const tokenSymbol = momentumData?.metrics?.symbol 
    || holdersData?.symbol || holdersData?.token_symbol 
    || dexData?.baseToken?.symbol || null;
  const tokenName = momentumData?.metrics?.name 
    || holdersData?.name || holdersData?.token_name 
    || dexData?.baseToken?.name || null;

  // Format header: $TICKER (Name)
  let tokenHeader: string;
  if (tokenSymbol && tokenName) {
    tokenHeader = `$${tokenSymbol} (${tokenName})`;
  } else if (tokenSymbol) {
    tokenHeader = `$${tokenSymbol}`;
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

  // Full verdict with AI-driven synthesis
  
  // Get mcap from momentum data or DexScreener
  const mcap = momentumData?.metrics?.market_cap || (dexData?.marketCap) || (dexData?.fdv) || null;
  const mcapStr = mcap ? (mcap >= 1_000_000 ? `$${(mcap / 1_000_000).toFixed(2)}M` : `$${(mcap / 1000).toFixed(1)}K`) : null;

  // Build AI verdict prompt with all available data
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

    // Phase safety caps — AI should respect these, but enforce as guardrail
    const isEarlyPhase = verdictPhase === 'on_curve' || verdictPhase === 'newborn' || verdictPhase === 'early' || verdictPhase === 'adolescent';
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
    // Fallback to rule-based logic
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

  const data = await invokeFunction("oracle-unified-lookup", { tokenMint: ca });
  if (!data) {
    await sendMessage(chatId, `❌ Could not fetch developer data. Token may not be tracked yet.`);
    return;
  }

  // Get token phase for contextualizing dev rep
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

  if (data.developer || data.creator) {
    const dev = data.developer || data.creator;
    if (dev.address) msg += `👤 Dev: \`${dev.address.slice(0, 8)}...${dev.address.slice(-6)}\`\n`;
    if (dev.reputation_score != null) {
      msg += `📊 Rep Score: *${dev.reputation_score}/100*\n`;
      // Contextualize dev rep against token phase
      if (oraclePhase) {
        msg += `💡 _${contextualizeDevRep(dev.reputation_score, oraclePhase)}_\n`;
      }
    }
    if (dev.total_tokens != null) msg += `🪙 Tokens Created: *${dev.total_tokens}*\n`;
    if (dev.rug_count != null) msg += `🚩 Rugs: *${dev.rug_count}*\n`;
    if (dev.avg_lifespan) msg += `⏱ Avg Lifespan: *${dev.avg_lifespan}*\n`;
    if (dev.classification) msg += `🏷 Class: *${dev.classification}*\n`;
  }

  if (data.verdict || data.risk_level) {
    const risk = data.verdict || data.risk_level;
    const riskEmoji = risk === 'safe' || risk === 'low' ? '🟢' : risk === 'medium' ? '🟡' : '🔴';
    msg += `\n${riskEmoji} Risk: *${risk.toUpperCase()}*\n`;
  }

  if (data.mesh_connections?.length) {
    msg += `\n🕸 *Mesh Connections:*\n`;
    for (const c of data.mesh_connections.slice(0, 5)) {
      msg += `• ${c.relationship || c.type}: ${c.target || c.linked_id || "?"}\n`;
    }
  }

  if (data.summary) {
    msg += `\n💡 ${data.summary.slice(0, 400)}`;
  }

  await sendMessage(chatId, msg);
}

// ─── Detect if a Solana address is a token mint or a wallet ───
async function resolveWalletAddress(
  chatId: number,
  addr: string
): Promise<{ wallet: string; isToken: boolean; tokenLabel: string | null } | null> {
  // Strategy: try to look up the address as a token mint first.
  // Check our DB tables, then fall back to the token-creator-linker edge function.

  // 1) Check developer_tokens table for a known creator
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

  // 2) Check token_lifecycle table
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

  // 3) Try token-creator-linker edge function (on-chain resolution)
  const linkerData = await invokeFunction("token-creator-linker", { tokenMint: addr });
  if (linkerData?.creatorWallet) {
    const label = linkerData.symbol || linkerData.name || addr.slice(0, 8);
    await sendMessage(chatId,
      `🔍 Resolved *token mint* on-chain (${label})\n` +
      `🏗 Creator: \`${linkerData.creatorWallet.slice(0, 8)}...${linkerData.creatorWallet.slice(-6)}\`\n` +
      `Proceeding with dev wallet analysis...`
    );
    return { wallet: linkerData.creatorWallet, isToken: true, tokenLabel: label };
  }

  // 4) Not found as a token — treat as a wallet address
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

  // Resolve: if it's a token mint, find the creator wallet
  const resolved = await resolveWalletAddress(chatId, addr);
  if (!resolved) {
    await sendMessage(chatId, `❌ Could not resolve this address. Please check it's a valid Solana address.`);
    return;
  }

  const walletAddr = resolved.wallet;
  await logUsage(telegramUserId, "/wallet", addr);

  const data = await invokeFunction("wallet-behavior-analysis", { walletAddress: walletAddr });
  if (!data) {
    await sendMessage(chatId, `❌ Could not analyze wallet. It may have no recent activity.`);
    return;
  }

  let msg = `🔎 *Wallet Analysis*\n\n`;
  if (resolved.isToken) {
    msg += `🪙 Token: *${resolved.tokenLabel}*\n`;
    msg += `🏗 Dev Wallet: \`${walletAddr.slice(0, 8)}...${walletAddr.slice(-6)}\`\n\n`;
  } else {
    msg += `📍 \`${walletAddr.slice(0, 8)}...${walletAddr.slice(-6)}\`\n\n`;
  }

  if (data.classification) msg += `🏷 Type: *${data.classification}*\n`;
  if (data.total_transactions != null) msg += `📊 Total Txns: *${data.total_transactions}*\n`;
  if (data.win_rate != null) msg += `🎯 Win Rate: *${(data.win_rate * 100).toFixed(1)}%*\n`;
  if (data.total_pnl != null) msg += `💰 PnL: *${data.total_pnl >= 0 ? '+' : ''}${data.total_pnl.toFixed(4)} SOL*\n`;
  if (data.avg_hold_time) msg += `⏱ Avg Hold: *${data.avg_hold_time}*\n`;
  if (data.tokens_traded != null) msg += `🪙 Tokens: *${data.tokens_traded}*\n`;

  if (data.risk_flags?.length) {
    msg += `\n🚩 *Risk Flags:*\n`;
    for (const f of data.risk_flags.slice(0, 5)) {
      msg += `• ${f}\n`;
    }
  }

  if (data.summary) {
    msg += `\n💡 ${data.summary.slice(0, 400)}`;
  }

  await sendMessage(chatId, msg);
}

// ─── /ca CA — Quick snapshot: holder count, health, top 10%, MCap ───
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

  // Fresh pull from bagless-holders-report (already includes DexScreener data)
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
  const tokenHeader = symbol && name ? `$${symbol} (${name})` : symbol ? `$${symbol}` : "Unknown Token";
  const mcapStr = mcap ? (mcap >= 1_000_000 ? `$${(mcap / 1_000_000).toFixed(2)}M` : `$${(mcap / 1000).toFixed(1)}K`) : null;

  await sendMessage(chatId,
    `\`${ca}\`\n` +
    `🪙 *${tokenHeader}*${mcapStr ? ` — MCap: *${mcapStr}*` : ''}\n\n` +
    `📊 *Quick Snapshot*\n\n` +
    `👥 Holders: *${totalHolders}*\n` +
    `❤️ Health: *${healthScore}/100*${phaseLabel}\n` +
    `${top10Pct != null ? `🏦 Top 10%: *${top10Pct.toFixed(1)}%*\n` : ''}` +
    `\n_Use /holders for full breakdown or /ai for AI analysis._`
  );
}

// ─── /quick (/q) CA — Fastest stats: holder count, health, top 10% ───
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

  // Fresh pull — minimal data needed
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
    `\n_Use /holders for full breakdown or /ai for AI analysis._`
  );
}

// ─── /ai CA — AI narrative summary only ───
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

  // Step 1: Fresh holder data pull
  const reportData = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!reportData || reportData.error) {
    await sendMessage(chatId, `❌ Could not fetch holder data for AI analysis.`);
    return;
  }

  // Step 2: Pass fresh data to AI interpreter
  const data = await invokeFunction("token-ai-interpreter", { 
    tokenMint: ca, 
    reportData: reportData,
    forceRefresh: true 
  });

  if (!data) {
    await sendMessage(chatId, `❌ Could not generate AI analysis for this token.`);
    return;
  }

  // Get token metadata for header
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
  const tokenHeader = symbol && name ? `$${symbol} (${name})` : symbol ? `$${symbol}` : "Unknown Token";

  let msg = `\`${ca}\`\n🪙 *${tokenHeader}*\n\n🤖 *AI Analysis*\n\n`;

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

  await sendMessage(chatId, msg);
}

// ─── /alerts ───
async function handleAlerts(chatId: number, telegramUserId: string) {
  const gate = await gateCheck(chatId, telegramUserId, "x_subscriber", "/alerts");
  if (!gate) return;

  await sendMessage(chatId,
    `🔔 *Alert Preferences*\n\n` +
    `Alert management is coming soon!\n\n` +
    `You'll be able to:\n` +
    `• Set price alerts for specific tokens\n` +
    `• Get notified on whale movements\n` +
    `• Receive daily digest reports\n\n` +
    `For now, you receive tier-based broadcasts automatically.`
  );
}

// ════════════════════════════════════════
// MAIN SERVER
// ════════════════════════════════════════

serve(async (req) => {
  // Webhook setup
  if (req.method === "GET") {
    const url = new URL(req.url);
    if (url.searchParams.get("setup") === "true") {
      const webhookUrl = `${SUPABASE_URL}/functions/v1/holdersintel-bot-webhook`;
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

    const [rawCommand, ...argParts] = text.split(/\s+/);
    const command = rawCommand.toLowerCase().replace(/@\w+$/, "");
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
        await handleHelp(chatId, telegramUserId);
        break;
      case "/holders":
        await handleHolders(chatId, telegramUserId, args);
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
      case "/verdict":
      case "/v":
        await handleVerdict(chatId, telegramUserId, args);
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
        await handleAlerts(chatId, telegramUserId);
        break;
      default:
        // Auto-detect registration codes
        if (/^BF-[A-Z0-9]{6}$/i.test(text)) {
          await handleRegister(chatId, telegramUserId, username, text);
        }
        break;
    }
  } catch (err) {
    console.error("[bot] Webhook error:", err);
  }

  return new Response("OK");
});
