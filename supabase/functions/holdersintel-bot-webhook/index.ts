import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

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
  const linked = await getLinkedUser(telegramUserId);
  if (!linked) {
    await sendMessage(chatId, `🔒 *Not linked.* Use /register first.`);
    return;
  }
  const tier = await getUserTier(linked.user_id);
  const emoji: Record<string, string> = {
    free: "🆓", auth: "🔓", x_subscriber: "𝕏", pro: "⭐", dev: "🛠", enterprise: "🏢",
  };
  await sendMessage(chatId,
    `📊 *Your Status*\n\n` +
    `${emoji[tier] || "📊"} Tier: *${tier.toUpperCase()}*\n` +
    `👤 Telegram: @${linked.telegram_username || "unknown"}\n` +
    `🔗 Linked: ${linked.linked_at ? new Date(linked.linked_at).toLocaleDateString() : "Unknown"}\n` +
    `📈 Rate limit: ${RATE_LIMITS[tier] ?? 3} lookups/hr\n\n` +
    `🌐 Manage: [blackbox.farm/subscriptions](https://blackbox.farm/subscriptions)`
  );
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

  const data = await invokeFunction("token-ai-interpreter", { tokenMint: ca });
  if (!data) {
    await sendMessage(chatId, `❌ Could not fetch holder data. Token may not be indexed yet.`);
    return;
  }

  const isLite = !hasTier(gate.tier, "x_subscriber");

  if (isLite) {
    // Auth tier: lite summary
    const holders = data.total_holders ?? data.holder_count ?? "?";
    const health = data.health_score ?? data.score ?? "?";
    const top10 = data.top10_concentration ?? data.top_10_pct ?? "?";
    await sendMessage(chatId,
      `📊 *Holders Lite*\n\n` +
      `👥 Holders: *${holders}*\n` +
      `❤️ Health: *${health}/100*\n` +
      `🏦 Top 10% hold: *${typeof top10 === 'number' ? top10.toFixed(1) + '%' : top10}*\n\n` +
      `_Upgrade to X Subscriber for full breakdown._`
    );
    return;
  }

  // Full breakdown for X Sub+
  let msg = `📊 *Holders Report*\n\n`;
  msg += `👥 Total: *${data.total_holders ?? data.holder_count ?? "?"}*\n`;
  msg += `❤️ Health: *${data.health_score ?? data.score ?? "?"}*/100\n\n`;

  // Distribution buckets if available
  const buckets = data.distribution || data.buckets || data.tiers;
  if (buckets && typeof buckets === 'object') {
    msg += `*Distribution:*\n`;
    const entries = Array.isArray(buckets) ? buckets : Object.entries(buckets);
    for (const entry of entries) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const [label, val] = entry;
        const pct = typeof val === 'number' ? val : (val?.percentage ?? val?.pct ?? 0);
        msg += `${bar(pct)} ${label}: ${typeof pct === 'number' ? pct.toFixed(1) : pct}%\n`;
      } else if (entry && typeof entry === 'object') {
        const label = entry.label || entry.tier || entry.name || "?";
        const pct = entry.percentage || entry.pct || entry.value || 0;
        msg += `${bar(pct)} ${label}: ${typeof pct === 'number' ? pct.toFixed(1) : pct}%\n`;
      }
    }
  }

  if (data.ai_summary) {
    msg += `\n💡 *AI Summary:*\n${data.ai_summary.slice(0, 500)}`;
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

  // Fetch momentum + holders in parallel
  const [momentumData, holdersData] = await Promise.all([
    invokeFunction("token-momentum-analyzer", { tokenMint: ca }),
    invokeFunction("token-ai-interpreter", { tokenMint: ca }),
  ]);

  const momentumScore = momentumData?.momentum_score ?? 0;
  const healthScore = holdersData?.health_score ?? holdersData?.score ?? 0;

  const isLite = !hasTier(gate.tier, "x_subscriber");

  if (isLite) {
    // Auth tier: just the color
    const color = momentumScore >= 55 && healthScore >= 40 ? "🟢" : momentumScore >= 40 ? "🟡" : "🔴";
    const label = color === "🟢" ? "BULLISH" : color === "🟡" ? "CAUTION" : "BEARISH";
    await sendMessage(chatId,
      `${color} *${label}*\n\n` +
      `_Upgrade to X Subscriber for detailed sizing recommendations._`
    );
    return;
  }

  // Full verdict with sizing
  let verdict: string;
  let emoji: string;
  let description: string;

  if (momentumScore >= 70 && healthScore >= 60) {
    verdict = "BUY DEEP LONG";
    emoji = "🟢";
    description = "Strong chart, healthy holders. Full position, hold for gains.";
  } else if (momentumScore >= 55 && healthScore >= 40) {
    verdict = "BUY MEDIUM SHORT";
    emoji = "🟢";
    description = "Decent momentum. Medium position, target 2x then reassess.";
  } else if (momentumScore >= 40) {
    verdict = "BUY SMALL SHORT";
    emoji = "🟡";
    description = "Speculative. Small/disposable amount, quick 2x flip.";
  } else {
    verdict = "HOLD / AVOID";
    emoji = "🔴";
    description = "Weak signals or dump in progress. Skip this one.";
  }

  let msg = `${emoji} *${verdict}*\n\n` +
    `${description}\n\n` +
    `📈 Momentum: *${momentumScore}/100*\n` +
    `❤️ Health: *${healthScore}/100*\n`;

  if (momentumData?.metrics) {
    const m = momentumData.metrics;
    if (m.price_change_5m != null) msg += `⏱ 5m: ${m.price_change_5m >= 0 ? '+' : ''}${m.price_change_5m.toFixed(1)}%\n`;
    if (m.buy_sell_ratio_5m != null) msg += `⚖️ Buy/Sell: ${m.buy_sell_ratio_5m.toFixed(2)}x\n`;
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

  let msg = `🔮 *Oracle Report*\n\n`;

  if (data.developer || data.creator) {
    const dev = data.developer || data.creator;
    if (dev.address) msg += `👤 Dev: \`${dev.address.slice(0, 8)}...${dev.address.slice(-6)}\`\n`;
    if (dev.reputation_score != null) msg += `📊 Rep Score: *${dev.reputation_score}/100*\n`;
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

// ─── /wallet ADDR ───
async function handleWallet(chatId: number, telegramUserId: string, args: string) {
  const addr = args.trim();
  if (!addr || addr.length < 30) {
    await sendMessage(chatId, `❌ Usage: \`/wallet <solana_address>\``);
    return;
  }

  const gate = await gateCheck(chatId, telegramUserId, "pro", "/wallet");
  if (!gate) return;

  await sendMessage(chatId, `🔎 Analyzing wallet \`${addr.slice(0, 8)}...${addr.slice(-6)}\`...`);
  await logUsage(telegramUserId, "/wallet", addr);

  const data = await invokeFunction("wallet-behavior-analysis", { walletAddress: addr });
  if (!data) {
    await sendMessage(chatId, `❌ Could not analyze wallet. It may have no recent activity.`);
    return;
  }

  let msg = `🔎 *Wallet Analysis*\n\n`;
  msg += `📍 \`${addr.slice(0, 8)}...${addr.slice(-6)}\`\n\n`;

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

// ─── /ca CA — Default holder analysis (alias for /holders) ───
async function handleCA(chatId: number, telegramUserId: string, args: string) {
  await handleHolders(chatId, telegramUserId, args);
}

// ─── /quick (/q) CA — Fast holder count & key stats ───
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

  const data = await invokeFunction("token-ai-interpreter", { tokenMint: ca });
  if (!data) {
    await sendMessage(chatId, `❌ Could not fetch data for this token.`);
    return;
  }

  const holders = data.total_holders ?? data.holder_count ?? "?";
  const health = data.health_score ?? data.score ?? "?";
  const top10 = data.top10_concentration ?? data.top_10_pct ?? "?";

  await sendMessage(chatId,
    `⚡ *Quick Stats*\n\n` +
    `👥 Holders: *${holders}*\n` +
    `❤️ Health: *${health}/100*\n` +
    `🏦 Top 10% hold: *${typeof top10 === 'number' ? top10.toFixed(1) + '%' : top10}*\n\n` +
    `_Use /holders for full breakdown or /ai for AI analysis._`
  );
}

// ─── /ai CA — Descriptive AI analysis snapshot ───
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

  const data = await invokeFunction("token-ai-interpreter", { tokenMint: ca });
  if (!data) {
    await sendMessage(chatId, `❌ Could not generate AI analysis for this token.`);
    return;
  }

  let msg = `🤖 *AI Analysis Snapshot*\n\n`;

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
