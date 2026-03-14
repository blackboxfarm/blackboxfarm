import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { detectTokenPhase, contextualizeDevRep, type TokenPhase } from "../_shared/token-phase.ts";
import { getHealthMode } from "../_shared/health-mode.ts";
import { meshFeed } from "../_shared/mesh-feeder.ts";

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

// ─── Tagline appended to every analytical reply ───
const TAGLINE = `\n\n🌐 [blackbox.farm/tgbot](https://blackbox.farm/tgbot)`;

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
  if (momentumScore >= 70 && healthScore >= 60) return { verdict: 'BUY DEEP LONG', emoji: '🟢', description: 'Strong chart, healthy holders on mature token.' };
  if (momentumScore >= 55 && healthScore >= 40) return { verdict: 'BUY MEDIUM SHORT', emoji: '🟢', description: 'Decent momentum. Target 2x.' };
  if (momentumScore >= 40) return { verdict: 'BUY SMALL SHORT', emoji: '🟡', description: 'Speculative. Small amount.' };
  return { verdict: 'HOLD / AVOID', emoji: '🔴', description: 'Weak signals. Skip.' };
}

// ─── Helpers ───

async function sendMessage(chatId: number, text: string, parseMode = "Markdown", replyToMessageId?: number) {
  const trimmed = text.length > 4090 ? text.slice(0, 4090) + "..." : text;
  const body: Record<string, unknown> = { chat_id: chatId, text: trimmed, parse_mode: parseMode, disable_web_page_preview: true };
  if (replyToMessageId) body.reply_to_message_id = replyToMessageId;
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("[bot] sendMessage failed:", await res.text());
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
  const label = symbol && name ? `$${symbol} (${name})` : symbol ? `$${symbol}` : "Unknown Token";
  const mcapStr = fmtMcap(mcap);
  return `🪙 *${label}*${mcapStr ? ` — MCap: *${mcapStr}*` : ''}`;
}

// ─── Check if group chat has an activated (paid) channel installation ───
async function isGroupActivated(chatId: number): Promise<boolean> {
  const { data } = await supabase
    .from("channel_installations")
    .select("id")
    .eq("chat_id", chatId)
    .eq("is_paid", true)
    .eq("is_active", true)
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

  let cmds = `📖 *HoldersIntel Bot Commands*\n\n` +
    `*General — All Users*\n` +
    `${unlocked} /start — Welcome & setup\n` +
    `${unlocked} /register \`CODE\` — Link account\n` +
    `${unlocked} /status — Check tier & usage\n` +
    `${unlocked} /help — This message\n\n`;

  cmds += `*Analysis — Auth ★*\n` +
    `${check("auth")} /risk (/r) \`CA\` — Composite risk & stability assessment\n` +
    `${check("auth")} /holders \`CA\` — Holder distribution analysis\n` +
    `${check("auth")} /concentration \`CA\` — Detailed holder % breakdown\n` +
    `${check("auth")} /dev (/d) \`CA\` — Developer intel & social doxxing\n` +
    `${check("auth")} /ca \`CA\` — Default holder analysis for a token\n` +
    `${check("auth")} /quick (/q) \`CA\` — Fast holder count & key stats\n` +
    `${check("auth")} /ai \`CA\` — Descriptive AI analysis snapshot\n\n`;

  cmds += `*Advanced — X Subscriber ★★*\n` +
    `${check("x_subscriber")} /momentum (/m) \`CA\` — Volume & price momentum scoring\n` +
    `${check("x_subscriber")} /insiders (/i) \`CA\` — Insider cluster & bundling pre-check\n` +
    `${check("x_subscriber")} /compare (/cmp) \`CA CA\` — Side-by-side token comparison\n`;
  if (!hasTier(tier, "x_subscriber")) {
    cmds += `  _↑ Unlock with X Subscriber ($3.99/mo)_\n`;
  }
  cmds += `\n`;

  cmds += `*Pro Intelligence — Pro ★★★*\n` +
    `${check("pro")} /oracle (/o) \`CA\` — Full developer reputation mesh\n` +
    `${check("pro")} /wallet (/w) \`ADDR\` — Wallet behavior analysis\n`;
  if (!hasTier(tier, "pro")) {
    cmds += `  _↑ Unlock with Pro ($9.99/mo)_\n`;
  }
  cmds += `\n`;

  cmds += `*Group Admin — Alerts ⚙️*\n` +
    `${unlocked} /alerts — Manage group alert feeds\n` +
    `  _Types: dex · mint · rug · whale · news · kol_\n\n`;

  cmds += `*Channel Management (DM only) 📡*\n` +
    `${check("auth")} /add — Add bot to your channel/group\n` +
    `${check("auth")} /channels (/ch) — List & manage installations\n` +
    `${check("auth")} /config — Configure channel settings\n` +
    `  _Usage: /config delay 3000 · verbose on · admin\\_only on · dev\\_alerts on_\n` +
    `${check("auth")} /payment (/pay) — View/generate payment wallet\n`;

  cmds += `\n━━━━━━━━━━━━━━━━━\n` +
    `★ = Tier required | ${unlocked} = Available | ${locked} = Locked\n` +
    `_Shortforms shown in parentheses_\n\n` +
    `📊 Your tier: *${tier.toUpperCase()}*\n` +
    `📈 Rate limit: *${RATE_LIMITS[tier] ?? 3}* lookups/hr\n\n` +
    `🚀 Upgrade: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)` +
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

    // AI risk narrative for Pro+
    if (hasTier(gate.tier, "pro")) {
      try {
        const useAI = await getHealthMode('telegram_bot');
        if (useAI) {
          const aiData = await invokeFunction("token-ai-interpreter", { tokenMint: ca, reportData: holdersData });
          if (aiData?.interpretation?.abbreviated_summary) {
            msg += `\n🧠 *AI Assessment:*\n_${aiData.interpretation.abbreviated_summary.slice(0, 400)}_\n`;
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
    msg += `\n📍 *$${sym1}* has stronger combined signals.`;
  } else if (score2 > score1 + 10) {
    msg += `\n📍 *$${sym2}* has stronger combined signals.`;
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
      msg += `• ${outcomeEmoji} $${t.symbol || '???'} — ${t.outcome}${t.isActive ? ' (active)' : ''}\n`;
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
  const thdr = symbol && name ? `$${symbol} (${name})` : symbol ? `$${symbol}` : "Unknown Token";

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

// ─── Group Chat Auto-Scan: detect pasted CAs and fire mini /risk ───
async function handleGroupAutoScan(chatId: number, telegramUserId: string, ca: string) {
  // Check if this group has an activated (paid) installation
  const activated = await isGroupActivated(chatId);
  if (!activated) return; // silently ignore unactivated groups

  // 3-second delay — let other bots (Phanes, BubbleMaps, etc.) reply first
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Fire a minimalist risk snippet (no gate check — this is a passive feature for activated groups)
  await logUsage(telegramUserId, "/autoscan", ca);

  const holdersData = await invokeFunction("bagless-holders-report", { tokenMint: ca });
  if (!holdersData || holdersData.error) return; // silently fail

  const symbol = holdersData?.symbol || holdersData?.tokenSymbol || null;
  const name = holdersData?.name || holdersData?.tokenName || null;
  const health = holdersData?.healthScore?.score ?? holdersData?.stabilityScore ?? null;
  const top10 = holdersData?.distributionStats?.top10Percentage ?? null;
  const mcap = holdersData?.marketCap || null;
  const holders = holdersData?.realHolders ?? holdersData?.totalHolders ?? null;

  // Determine quick risk signal
  let riskEmoji = '🟢';
  let riskLabel = 'STABLE';
  if (health != null) {
    if (health < 30) { riskEmoji = '🔴'; riskLabel = 'HIGH RISK'; }
    else if (health < 50) { riskEmoji = '🟡'; riskLabel = 'MODERATE'; }
  }

  const tokenLabel = symbol ? `$${symbol}` : ca.slice(0, 8) + '...';

  const msg = `🔍 *${tokenLabel}* ${riskEmoji} ${riskLabel}\n` +
    `${health != null ? `❤️ ${health}/100` : ''}` +
    `${holders ? ` · 👥 ${holders}` : ''}` +
    `${top10 != null ? ` · 🏦 ${top10.toFixed(0)}%` : ''}` +
    `${mcap ? ` · 💰 ${fmtMcap(mcap)}` : ''}\n` +
    `→ /risk \`${ca}\` for full report` +
    TAGLINE;

  await sendMessage(chatId, msg);
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
    const chatType = message.chat.type;
    const isGroupChat = chatType === 'group' || chatType === 'supergroup';
    const telegramUserId = String(message.from.id);
    const dmChatId = Number(telegramUserId); // user's DM chat ID = their telegram user ID
    const username = message.from.username || null;
    const text = message.text.trim();
    const messageId = message.message_id;

    const [rawCommand, ...argParts] = text.split(/\s+/);
    const command = rawCommand.toLowerCase().replace(/@\w+$/, "");
    const args = argParts.join(" ");

    // Commands that are allowed to reply publicly in groups
    const GROUP_PUBLIC_COMMANDS = ['/start', '/help', '/register', '/status', '/risk', '/r', '/quick', '/q', '/alerts'];

    // If in a group chat and command is NOT in the public list, redirect to DM
    if (isGroupChat && command.startsWith('/') && !GROUP_PUBLIC_COMMANDS.includes(command)) {
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
          default:
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
        default:
          // Auto-detect registration codes
          if (/^BF-[A-Z0-9]{6}$/i.test(text)) {
            await handleRegister(chatId, telegramUserId, username, text);
          }
          // Auto-detect Solana CAs in group chats (passive scan with 3s delay)
          else if (isGroupChat) {
            const detectedCA = looksLikeSolanaCA(text);
            if (detectedCA) {
              await handleGroupAutoScan(chatId, telegramUserId, detectedCA);
            }
          }
          break;
      }
    }
  } catch (err) {
    console.error("[bot] Webhook error:", err);
  }

  return new Response("OK");
});
