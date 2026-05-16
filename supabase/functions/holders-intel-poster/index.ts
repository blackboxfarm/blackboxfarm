import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { getHealthMode } from "../_shared/health-mode.ts";
import { meshFeed } from "../_shared/mesh-feeder.ts";
import { assessNetworkRisk } from "../_shared/network-risk-assessment.ts";
import { withRunLog } from "../_shared/run-logger.ts";
import { isInfrastructureToken } from "../_shared/excluded-tokens.ts";
import { upsertHealthSnapshot } from "../_shared/snapshot-writer.ts";
import { obfuscateTicker } from "../_shared/ticker-obfuscator.ts";
import { isFunctionEnabled } from '../_shared/function-toggle.ts';
import { assertDbWrite } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWITTER_HANDLE = 'HoldersIntel';

// Quality thresholds
const MIN_HOLDERS = 50;
const SKIP_GRADES: string[] = ['F', 'D-', 'D', 'D+']; // Block low-grade tokens from public posting

// Fallback template if DB fetch fails — {TICKER} is obfuscated by processTemplate
const FALLBACK_TEMPLATE = `🔍 {TICKER} Holder Analysis

📊 {TOTAL_WALLETS} Total | ✅ {REAL_HOLDERS} Real
{DUST_PERCENTAGE}% Dust | Health: {HEALTH_GRADE}

👉 blackbox.farm/holders?token={TOKEN_ADDRESS}`;

// Guard: only accept base58-shaped Solana wallet addresses (32–44 chars).
// Prevents JSON blobs like `{"address":"...","detectionMethod":"top_holder"}`
// from being persisted to creator_wallet columns.
function isValidWallet(v: unknown): v is string {
  return typeof v === 'string'
    && v.length >= 32 && v.length <= 44
    && /^[1-9A-HJ-NP-Za-km-z]+$/.test(v);
}

function asCount(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  // bagless-holders-report returns simpleTiers.* as objects: { count, percentage, ... }
  if (value && typeof value === 'object' && typeof value.count !== 'undefined') {
    const n = Number(value.count);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function getPostComment(timesPosted: number, triggerComment?: string | null, tokenAge?: { mintedAt?: string | null; firstSeenAt?: string | null }): string {
  // If a trigger comment is provided (from DEX scanner), use it
  if (triggerComment) return triggerComment;
  
  // Don't say "First call out" if the token is actually old (>24h since mint or first seen)
  // — we may have just discovered it via a new funnel, but the token isn't new
  if (timesPosted <= 1 && tokenAge) {
    const refTime = tokenAge.mintedAt || tokenAge.firstSeenAt;
    if (refTime) {
      const ageMs = Date.now() - new Date(refTime).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        return ' 📡 New Discovery';  // We just found it, but it's not a new token
      }
    }
  }
  
  // Milestone-based comments — no colon prefix to avoid looking like a health description
  if (timesPosted <= 1) return ' 🆕 First call out!';
  if (timesPosted === 2) return ' 📡 Still on the Chart';
  return ' 💪 Steady & Strong';
}

/**
 * Sanitize token names that look like URLs to prevent Twitter from
 * detecting them as links and hijacking the OG preview.
 * e.g. "click.fun" -> "click .fun" to break URL detection
 */
function sanitizeUrlLikeName(name: string): string {
  if (!name) return name;
  
  // Common TLDs that Twitter might detect as URLs
  const urlTlds = /\.(fun|com|io|xyz|net|org|co|ai|app|dev|gg|me|tv|live|lol|meme|wtf|sol|pump|token|coin|finance|fi|exchange|swap|trade|market|money|cash|pay|crypto|nft|dao|defi|web3|eth|btc|dex)$/i;
  
  // Check if the name ends with a URL-like TLD
  if (urlTlds.test(name)) {
    // Insert space before the dot to break URL detection
    return name.replace(/\.([a-z]+)$/i, ' .$1');
  }
  
  // Also catch names that contain dots mid-string with TLD patterns
  const midUrlPattern = /\.(?:fun|com|io|xyz|net|org|co|ai|app|dev|gg|me|tv|live|lol|meme|wtf|sol|pump|token|coin|finance|fi|exchange|swap|trade|market|money|cash|pay|crypto|nft|dao|defi|web3|eth|btc|dex)(?:\s|$)/gi;
  if (midUrlPattern.test(name)) {
    return name.replace(/\.([a-z]+)/gi, ' .$1');
  }
  
  return name;
}

function formatTimestamp(): string {
  const now = new Date();
  // Format: "Jan 27, 2:17 PM EST"
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/Toronto',
  };
  const formatted = now.toLocaleString('en-US', options);
  return `${formatted} EST`;
}

/**
 * Fetch ATH (24h window) from GeckoTerminal OHLCV data.
 * Uses hourly candles over 24h, takes the max high.
 * GeckoTerminal free API: 30 req/min, no key needed.
 */
async function fetchAth24h(tokenMint: string): Promise<number | null> {
  try {
    console.log(`[poster] Fetching ATH 24h for ${tokenMint} from GeckoTerminal`);
    
    // Step 1: Find the top pool for this token on Solana
    const poolsRes = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools?page=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!poolsRes.ok) {
      console.warn(`[poster] GeckoTerminal pools lookup failed: ${poolsRes.status}`);
      return null;
    }
    
    const poolsData = await poolsRes.json();
    const pools = poolsData?.data;
    
    if (!pools || pools.length === 0) {
      console.warn('[poster] No pools found on GeckoTerminal for this token');
      return null;
    }
    
    // Use the first (highest-ranked) pool
    const poolAddress = pools[0]?.attributes?.address;
    if (!poolAddress) {
      console.warn('[poster] No pool address found');
      return null;
    }
    
    console.log(`[poster] Using pool ${poolAddress} for OHLCV`);
    
    // Step 2: Fetch hourly OHLCV candles (24 candles = 24h window)
    const ohlcvRes = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/hour?aggregate=1&limit=24&currency=usd`,
      { headers: { 'Accept': 'application/json' } }
    );
    
    if (!ohlcvRes.ok) {
      console.warn(`[poster] GeckoTerminal OHLCV failed: ${ohlcvRes.status}`);
      return null;
    }
    
    const ohlcvData = await ohlcvRes.json();
    const candles = ohlcvData?.data?.attributes?.ohlcv_list;
    
    if (!candles || candles.length === 0) {
      console.warn('[poster] No OHLCV candles returned');
      return null;
    }
    
    // OHLCV format: [timestamp, open, high, low, close, volume]
    // Take the max "high" (index 2) across all candles
    let maxHigh = 0;
    for (const candle of candles) {
      const high = Number(candle[2]);
      if (high > maxHigh) maxHigh = high;
    }
    
    console.log(`[poster] ATH 24h: $${maxHigh} from ${candles.length} candles`);
    return maxHigh > 0 ? maxHigh : null;
  } catch (err) {
    console.warn('[poster] ATH 24h fetch failed:', err);
    return null;
  }
}

// Fetch AI interpretation summary for XBot posts (abbreviated version)
async function fetchAISummary(
  reportData: Record<string, unknown>,
  tokenMint: string,
  supabaseUrl: string,
  anonKey: string
): Promise<{ summary: string; overview: string; lifecycle: string } | null> {
  try {
    console.log(`[poster] Fetching AI interpretation for ${tokenMint}`);
    
    const response = await fetch(
      `${supabaseUrl}/functions/v1/token-ai-interpreter`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ reportData, tokenMint }),
      }
    );
    
    if (!response.ok) {
      console.warn(`[poster] AI interpreter returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (data.interpretation?.abbreviated_summary && data.interpretation?.lifecycle?.stage) {
      return {
        summary: data.interpretation.abbreviated_summary,
        overview: data.interpretation.status_overview || '',
        lifecycle: data.interpretation.lifecycle.stage,
      };
    }
    
    return null;
  } catch (err) {
    console.warn('[poster] AI summary fetch failed:', err);
    return null;
  }
}

function processTemplate(template: string, data: any): string {
  const tickerUpper = (data.symbol || 'TOKEN').toUpperCase();
  // Telegram thin-formatting protocol: strip $ cashtag and interleave U+200B
  // between letters so external bots (e.g. Rick, Maestro) cannot match the symbol
  // and trigger reply-chain loops. See mem://features/telegram-bot/thin-formatting-protocol.
  const tickerSafe = obfuscateTicker(tickerUpper);
  const rawName = data.name || data.tokenName || 'Unknown';
  // Sanitize URL-like names to prevent Twitter hijacking the OG preview
  const tokenName = sanitizeUrlLikeName(rawName);
  // Pass trigger_comment to allow DEX scanner overrides
  const comment1 = getPostComment(data.timesPosted || 1, data.triggerComment, data.tokenAge);
  const timestamp = formatTimestamp();
  
  // AI summary defaults to empty if not provided or disabled
  const aiSummary = data.aiSummary || '';
  const aiOverview = data.aiOverview || '';
  const lifecycle = data.lifecycle || '';
  const risk = data.risk || '';
  const riskDetail = data.riskDetail || '';
  const devRep = data.devRep || 'Unknown';
  const xCommunity = data.xCommunity || 'N/A';
  const website = data.website || 'N/A';
  
  return template
    .replace(/\{TICKER\}/g, tickerSafe)
    .replace(/\{ticker\}/g, tickerSafe)
    .replace(/\{NAME\}/g, tokenName)
    .replace(/\{name\}/g, tokenName)
    .replace(/\{comment1\}/g, comment1)
    .replace(/\{COMMENT1\}/g, comment1)
    .replace(/\{timestamp\}/g, timestamp)
    .replace(/\{TIMESTAMP\}/g, timestamp)
    .replace(/\{TOTAL_WALLETS\}/g, (data.totalHolders || 0).toLocaleString())
    .replace(/\{totalWallets\}/g, (data.totalHolders || 0).toLocaleString())
    .replace(/\{REAL_HOLDERS\}/g, (data.realHolders || 0).toLocaleString())
    .replace(/\{realHolders\}/g, (data.realHolders || 0).toLocaleString())
    .replace(/\{DUST_PERCENTAGE\}/g, String(data.dustPercentage || 0))
    .replace(/\{dustPct\}/g, String(data.dustPercentage || 0))
    .replace(/\{WHALES\}/g, (data.whaleCount || 0).toLocaleString())
    .replace(/\{whales\}/g, (data.whaleCount || 0).toLocaleString())
    .replace(/\{SERIOUS\}/g, (data.seriousCount || 0).toLocaleString())
    .replace(/\{serious\}/g, (data.seriousCount || 0).toLocaleString())
    .replace(/\{REAL_RETAIL\}/g, (data.activeCount || 0).toLocaleString())
    .replace(/\{retail\}/g, (data.activeCount || 0).toLocaleString())
    .replace(/\{DUST_COUNT\}/g, (data.dustCount || 0).toLocaleString())
    .replace(/\{dust\}/g, (data.dustCount || 0).toLocaleString())
    .replace(/\{HEALTH_GRADE\}/g, data.healthGrade || 'N/A')
    .replace(/\{healthGrade\}/g, data.healthGrade || 'N/A')
    .replace(/\{HEALTH_SCORE\}/g, String(data.healthScore || 0))
    .replace(/\{healthScore\}/g, String(data.healthScore || 0))
    .replace(/\{structuralScore\}/g, String(data.structuralScore ?? ''))
    .replace(/\{STRUCTURAL_SCORE\}/g, String(data.structuralScore ?? ''))
    .replace(/\{activityScore\}/g, String(data.activityScore ?? ''))
    .replace(/\{ACTIVITY_SCORE\}/g, String(data.activityScore ?? ''))
    .replace(/\{momentumGrade\}/g, data.momentumGrade || '')
    .replace(/\{MOMENTUM_GRADE\}/g, data.momentumGrade || '')
    .replace(/\{TOKEN_ADDRESS\}/g, data.tokenMint || '')
    .replace(/\{ca\}/g, data.tokenMint || '')
    .replace(/\{ai_summary\}/g, aiSummary)
    .replace(/\{AI_SUMMARY\}/g, aiSummary)
    .replace(/\{ai_overview\}/g, aiOverview)
    .replace(/\{AI_OVERVIEW\}/g, aiOverview)
    .replace(/\{lifecycle\}/g, lifecycle)
    .replace(/\{LIFECYCLE\}/g, lifecycle)
    .replace(/\{risk\}/g, risk)
    .replace(/\{RISK\}/g, risk)
    .replace(/\{risk_detail\}/g, riskDetail)
    .replace(/\{RISK_DETAIL\}/g, riskDetail)
    .replace(/\{dev_rep\}/g, devRep)
    .replace(/\{DEV_REP\}/g, devRep)
    .replace(/\{x_community\}/g, xCommunity)
    .replace(/\{X_COMMUNITY\}/g, xCommunity)
    .replace(/\{website\}/g, website)
    .replace(/\{WEBSITE\}/g, website)
    .replace(/\{ath_24h\}/g, data.ath24h != null ? `$${Number(data.ath24h).toFixed(6)}` : 'N/A')
    .replace(/\{ATH_24H\}/g, data.ath24h != null ? `$${Number(data.ath24h).toFixed(6)}` : 'N/A')
    .replace(/\{padre\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${data.tokenMint || ''}`)
    .replace(/\{PADRE\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${data.tokenMint || ''}`);
}

async function fetchActiveTemplate(supabase: any): Promise<string> {
  try {
    // Check template mode config
    const { data: modeRow } = await supabase
      .from('holders_intel_config')
      .select('value')
      .eq('key', 'template_mode')
      .maybeSingle();

    const mode = modeRow?.value || 'active_only';
    console.log(`[poster] Template mode: ${mode}`);

    if (mode === 'alternating') {
      // Get last used template name
      const { data: lastRow } = await supabase
        .from('holders_intel_config')
        .select('value')
        .eq('key', 'last_used_template')
        .maybeSingle();

      const lastUsed = lastRow?.value || 'large';
      const nextName = lastUsed === 'large' ? 'small' : 'large';

      const { data, error } = await supabase
        .from('holders_intel_templates')
        .select('template_text, template_name')
        .eq('template_name', nextName)
        .maybeSingle();

      if (error || !data) {
        console.log(`[poster] Alternating: failed to fetch '${nextName}', falling back`);
        return FALLBACK_TEMPLATE;
      }

      // Update last_used_template and last_used_at
      await supabase
        .from('holders_intel_config')
        .update({ value: nextName, updated_at: new Date().toISOString() })
        .eq('key', 'last_used_template');

      await supabase
        .from('holders_intel_templates')
        .update({ last_used_at: new Date().toISOString() })
        .eq('template_name', nextName);

      console.log(`[poster] Alternating: using '${nextName}' template (last was '${lastUsed}')`);
      return data.template_text;
    }

    // Default: active_only mode — use whichever is_active
    const { data, error } = await supabase
      .from('holders_intel_templates')
      .select('template_text')
      .in('template_name', ['small', 'large'])
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      console.log('[poster] Failed to fetch active template, using fallback:', error?.message);
      return FALLBACK_TEMPLATE;
    }
    
    console.log('[poster] Using active template from database');
    return data.template_text;
  } catch (err) {
    console.error('[poster] Template fetch error:', err);
    return FALLBACK_TEMPLATE;
  }
}

async function fetchHolderReport(tokenMint: string, supabaseUrl: string, anonKey: string): Promise<any> {
  console.log(`[poster] Fetching holder report for ${tokenMint}`);
  
  const response = await fetch(
    `${supabaseUrl}/functions/v1/bagless-holders-report`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ tokenMint }),
    }
  );
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Holder report failed: ${response.status} - ${text}`);
  }
  
  return response.json();
}

async function postTweet(tweetText: string, supabaseUrl: string, anonKey: string, manualOverride = false): Promise<any> {
  console.log(`[poster] Posting tweet (${tweetText.length} chars, manualOverride=${manualOverride})`);
  
  const response = await fetch(
    `${supabaseUrl}/functions/v1/post-share-card-twitter`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        tweetText,
        twitterHandle: TWITTER_HANDLE,
        skipTelegram: true,
        manualOverride,
      }),
    }
  );
  
  const result = await response.json();
  
  if (result.paused) {
    console.log('[poster] X posting is PAUSED (account suspended) — skipping tweet, continuing pipeline');
    return { ...result, tweetId: null, tweetUrl: null, skipped: true };
  }
  
  if (!result.success) {
    throw new Error(result.error || 'Tweet posting failed');
  }
  
  return result;
}

Deno.serve(withRunLog('holders-intel-poster', async (req) => {
  if (!await isFunctionEnabled('holders-intel-poster')) {
    return new Response(JSON.stringify({ skipped: 'disabled via function_toggles' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const reqBody = await req.clone().json().catch(() => ({}));
  const manualOverride = !!reqBody.manualOverride;
  
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || 
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFweGF1YXB1dXNtZ3diYnpqZ2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ1OTEzMDUsImV4cCI6MjA3MDE2NzMwNX0.w8IrKq4YVStF3TkdEcs5mCSeJsxjkaVq2NFkypYOXHU';
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch the active template from database
    const tweetTemplate = await fetchActiveTemplate(supabase);
    
    // BATCH MODE: fetch up to 5 candidates, post up to 3 per tick
    const MAX_POSTS_PER_TICK = 3;
    const BATCH_SIZE = 5; // fetch extra in case some skip/fail
    const STALE_HOURS = 3; // auto-expire anything older than this — keep queue fresh
    const now = new Date().toISOString();
    const staleCutoff = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

    // Auto-expire stale pending items (older than 6h) so they don't clog the queue
    const { count: expiredCount } = await (supabase as any)
      .from('holders_intel_post_queue')
      .update({ status: 'expired', error_message: `Auto-expired: older than ${STALE_HOURS}h` })
      .eq('status', 'pending')
      .lt('created_at', staleCutoff)
      .select('*', { count: 'exact', head: true } as any);
    
    if (expiredCount && expiredCount > 0) {
      console.log(`[poster] Auto-expired ${expiredCount} stale items (>${STALE_HOURS}h old)`);
    }

    // Fetch NEWEST discoveries first — most relevant tokens get posted first
    const { data: pendingItems, error: fetchError } = await supabase
      .from('holders_intel_post_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now)
      .order('created_at', { ascending: false })
      .limit(BATCH_SIZE);
    
    if (fetchError) {
      throw fetchError;
    }
    
    if (!pendingItems || pendingItems.length === 0) {
      const { count } = await supabase
        .from('holders_intel_post_queue')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No items due for posting',
          pendingCount: count || 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[poster] Batch: ${pendingItems.length} candidates, max ${MAX_POSTS_PER_TICK} posts`);
    
    const results: any[] = [];
    let postsThisTick = 0;
    
    for (const item of pendingItems) {
      if (postsThisTick >= MAX_POSTS_PER_TICK) {
        console.log(`[poster] Hit ${MAX_POSTS_PER_TICK} posts this tick, stopping`);
        break;
      }
    // Skip infrastructure/chain-native tokens (JUP, RAY, SOL, USDC etc)
    if (isInfrastructureToken(item.token_mint)) {
      console.log(`[poster] Skipping infrastructure token: ${item.symbol} (${item.token_mint})`);
      await supabase.from('holders_intel_post_queue')
        .update({ status: 'skipped', error_message: 'Infrastructure/chain-native token — not a meme' })
        .eq('id', item.id);
      results.push({ symbol: item.symbol, action: 'skipped', reason: 'Infrastructure token' });
      continue;
    }

    console.log(`[poster] Processing: ${item.symbol} (${item.token_mint})`);
    
    // ── HARD DUPLICATE CHECK ──
    // Before processing, verify this token hasn't already been posted (by any queue entry)
    const { data: alreadyPosted } = await supabase
      .from('holders_intel_post_queue')
      .select('id')
      .eq('token_mint', item.token_mint)
      .eq('status', 'posted')
      .limit(1);
    
    if (alreadyPosted && alreadyPosted.length > 0) {
      console.log(`[poster] DUPLICATE BLOCKED: ${item.symbol} already has a posted entry`);
      await supabase.from('holders_intel_post_queue')
        .update({ status: 'skipped', error_message: 'Duplicate: token already posted previously' })
        .eq('id', item.id);
      results.push({ symbol: item.symbol, action: 'skipped', reason: 'Already posted (dedup)' });
      continue;
    }
    
    // Mark as processing
    await supabase
      .from('holders_intel_post_queue')
      .update({ status: 'processing' })
      .eq('id', item.id);
    
    try {
      // Fetch holder report
      const report = await fetchHolderReport(item.token_mint, supabaseUrl, anonKey);
      
      if (!report || report.error) {
        throw new Error(report?.error || 'Empty report returned');
      }
      
      // Get current times_posted + age info from seen_tokens to determine comment
      const { data: seenToken } = await supabase
        .from('holders_intel_seen_tokens')
        .select('times_posted, minted_at, first_seen_at')
        .eq('token_mint', item.token_mint)
        .maybeSingle();
      
      const currentTimesPosted = (seenToken?.times_posted || 0) + 1; // +1 because this will be the next post
      const tokenAge = { mintedAt: seenToken?.minted_at, firstSeenAt: seenToken?.first_seen_at };
      
      // Extract + normalize stats from report (match manual ShareCardDemo mapping)
      const totalHolders = asCount(report?.totalHolders);
      const dustCount = asCount(report?.tierBreakdown?.dust ?? report?.dustWallets ?? report?.simpleTiers?.dust);
      const dustPercentage = totalHolders > 0 ? Math.round((dustCount / totalHolders) * 100) : 0;

      const stats = {
        symbol: (report?.tokenSymbol || report?.symbol || item.symbol || 'UNKNOWN').toString(),
        name: (report?.tokenName || report?.name || item.name || 'Unknown').toString(),
        tokenMint: item.token_mint,
        totalHolders,
        timesPosted: currentTimesPosted,
        // Pass trigger_comment from queue item (used by DEX scanner triggers)
        triggerComment: item.trigger_comment || null,
        tokenAge,
        // bagless-holders-report sets realHolders = realWalletCount ($50-$199)
        realHolders: asCount(report?.realHolders ?? report?.realWalletCount),
        dustCount,
        dustPercentage,
        // NOTE: simpleTiers.* are objects; always use .count
        whaleCount: asCount(report?.tierBreakdown?.whale ?? report?.simpleTiers?.whales),
        seriousCount: asCount(report?.tierBreakdown?.serious ?? report?.simpleTiers?.serious),
        activeCount: asCount(report?.tierBreakdown?.retail ?? report?.simpleTiers?.retail),
        healthGrade: (report?.stabilityGrade ?? report?.healthScore?.grade ?? 'N/A').toString(),
        healthScore: asCount(report?.stabilityScore ?? report?.healthScore?.score),
        structuralScore: report?.healthScore?.structuralScore ?? null,
        activityScore: report?.healthScore?.activityScore ?? null,
        momentumGrade: report?.healthScore?.momentumGrade ?? '',
        // AI summary fields (populated below if enabled)
        aiSummary: '',
        aiOverview: '',
        lifecycle: '',
        // Risk assessment fields (populated below)
        risk: '',
        riskDetail: '',
        // Mint info fields (populated below from report socials + dev reputation)
        devRep: 'Unknown',
        xCommunity: 'N/A',
        website: 'N/A',
      };
      
      // Extract socials from report (DexScreener data)
      if (report?.socials) {
        if (report.socials.twitter) {
          // Check if it's a community URL (contains /i/communities/)
          const twitterUrl = report.socials.twitter;
          if (twitterUrl.includes('/i/communities/') || twitterUrl.includes('community')) {
            stats.xCommunity = twitterUrl;
          } else {
            stats.xCommunity = twitterUrl;
          }
        }
        if (report.socials.website) {
          stats.website = report.socials.website;
        }
      }
      
      // Fetch dev reputation from dev_wallet_reputation table
      // NOTE: potentialDevWallet is an OBJECT ({ address, balance, confidence, ... }),
      // never a string. Always extract .address.
      const creatorWalletRaw =
        report?.creatorInfo?.wallet || report?.potentialDevWallet?.address || null;
      const creatorWallet = isValidWallet(creatorWalletRaw) ? creatorWalletRaw : null;
      if (creatorWallet) {
        try {
          const { data: devRepData } = await supabase
            .from('dev_wallet_reputation')
            .select('reputation_score, trust_level, tokens_rugged, tokens_successful, total_tokens_launched')
            .eq('wallet_address', creatorWallet)
            .maybeSingle();
          
          if (devRepData) {
            const score = Math.round(devRepData.reputation_score || 0);
            const level = devRepData.trust_level || 'unknown';
            const emoji = level === 'trusted' ? '✅' : 
                          level === 'neutral' ? '⚖️' :
                          level === 'suspicious' ? '⚠️' :
                          level === 'scammer' ? '🚩' : '❓';
            const rugs = devRepData.tokens_rugged || 0;
            const wins = devRepData.tokens_successful || 0;
            const total = devRepData.total_tokens_launched || 0;
            
            stats.devRep = `${emoji} ${level.charAt(0).toUpperCase() + level.slice(1)} (${score}/100) | ${total} tokens, ${wins} wins, ${rugs} rugs`;
            console.log(`[poster] Dev reputation: ${stats.devRep}`);
          } else {
            stats.devRep = '❓ No history found';
            console.log('[poster] No dev reputation data found');
          }
        } catch (devErr) {
          console.warn('[poster] Dev reputation lookup failed:', devErr);
        }
      }
      
      console.log(`[poster] Stats: ${stats.totalHolders} holders, grade ${stats.healthGrade}, post #${currentTimesPosted}`);
      
      // EARLY WRITE: Always persist health_grade to seen_tokens as soon as analysis completes,
      // regardless of whether the token passes quality checks or gets posted.
      // This ensures the Live Feed always has grade data.
      if (stats.healthGrade) {
        await supabase
          .from('holders_intel_seen_tokens')
          .update({
            health_grade: stats.healthGrade,
          })
          .eq('token_mint', item.token_mint);
        console.log(`[poster] Early-wrote health_grade=${stats.healthGrade} for ${item.token_mint.slice(0, 8)}`);
      }

      // ── Hydrate pumpfun_watchlist with the decision data we just computed ──
      // Without this, funnel_feed inserts stay forever at holder_count=0 / price_usd=null
      // and the admin Token Funnel Pool spreadsheet looks empty for tokens that
      // actually have full holder reports.
      try {
        const reportPriceUsd = (report?.priceUSD ?? report?.priceUsd ?? null) as number | null;
        const reportMcapUsd = (report?.marketCapUSD ?? report?.marketCap ?? report?.inferredMarketCapUSD ?? null) as number | null;
        const reportLiquidityUsd = (report?.liquidityUSD ?? report?.liquidityUsd ?? null) as number | null;
        const reportCreatorWalletRaw =
          (report?.creatorInfo?.wallet ?? report?.potentialDevWallet?.address ?? null) as string | null;
        const reportCreatorWallet = isValidWallet(reportCreatorWalletRaw) ? reportCreatorWalletRaw : null;
        const reportBondingCurvePct = (report?.bondingCurveProgress ?? null) as number | null;
        const top10Pct = (report?.distributionStats?.top10Percentage ?? null) as number | null;
        const realHolders = stats.realHolders;

        const hydrate: Record<string, unknown> = {
          last_checked_at: new Date().toISOString(),
          last_snapshot_at: new Date().toISOString(),
          last_processor: 'holders-intel-poster',
          token_symbol: stats.symbol || null,
          token_name: stats.name || null,
          holder_count: stats.totalHolders ?? null,
        };
        // Only set peak if it's higher than what's stored (best-effort: we just write — DB has no MAX trigger here).
        if (typeof stats.totalHolders === 'number') hydrate.holder_count_peak = stats.totalHolders;
        if (reportPriceUsd != null) {
          hydrate.price_usd = reportPriceUsd;
          hydrate.price_current = reportPriceUsd;
        }
        if (reportMcapUsd != null) hydrate.market_cap_usd = reportMcapUsd;
        if (reportLiquidityUsd != null) hydrate.liquidity_usd = reportLiquidityUsd;
        if (reportCreatorWallet) hydrate.creator_wallet = reportCreatorWallet;
        if (reportBondingCurvePct != null) hydrate.bonding_curve_pct = reportBondingCurvePct;
        if (typeof top10Pct === 'number') hydrate.max_single_wallet_pct = top10Pct;
        if (typeof realHolders === 'number') hydrate.suspicious_wallet_pct = null; // leave untouched

        // We update by token_mint. If the row doesn't exist (manual_push case), upsert it.
        const { data: existingWlRow } = await supabase
          .from('pumpfun_watchlist')
          .select('id, ath_market_cap_usd, price_ath_usd, holder_count_peak')
          .eq('token_mint', item.token_mint)
          .maybeSingle();

        // Promote ATH only when the new value is genuinely higher.
        if (reportMcapUsd != null) {
          const prevAth = (existingWlRow?.ath_market_cap_usd ?? 0) as number;
          if (reportMcapUsd > prevAth) {
            hydrate.ath_market_cap_usd = reportMcapUsd;
            hydrate.ath_market_cap_at = new Date().toISOString();
          }
        }
        if (reportPriceUsd != null) {
          const prevPriceAth = (existingWlRow?.price_ath_usd ?? 0) as number;
          if (reportPriceUsd > prevPriceAth) hydrate.price_ath_usd = reportPriceUsd;
        }
        if (typeof stats.totalHolders === 'number') {
          const prevPeak = (existingWlRow?.holder_count_peak ?? 0) as number;
          hydrate.holder_count_peak = Math.max(prevPeak, stats.totalHolders);
        }

        if (existingWlRow) {
          await assertDbWrite(
            supabase.from('pumpfun_watchlist').update(hydrate).eq('id', existingWlRow.id),
            'pumpfun_watchlist',
            'UPDATE'
          );
        } else {
          await assertDbWrite(
            supabase.from('pumpfun_watchlist').upsert(
              { token_mint: item.token_mint, status: 'pending_triage', source: item.trigger_source ?? 'holders-intel-poster', ...hydrate },
              { onConflict: 'token_mint' }
            ),
            'pumpfun_watchlist',
            'UPSERT'
          );
        }
        console.log(`[poster] Hydrated pumpfun_watchlist for ${item.token_mint.slice(0, 8)} (holders=${stats.totalHolders}, mcap=${reportMcapUsd ?? 'n/a'})`);
      } catch (hydrateErr) {
        console.warn('[poster] pumpfun_watchlist hydrate failed:', hydrateErr);
        // Re-throw so run-logger marks the run as failed (zero-tolerance silent-fail policy).
        throw hydrateErr;
      }
      
      // Quality checks
      if (stats.totalHolders < MIN_HOLDERS) {
        console.log(`[poster] Skipping: too few holders (${stats.totalHolders})`);
        await supabase
          .from('holders_intel_post_queue')
          .update({ 
            status: 'skipped', 
            error_message: `Too few holders: ${stats.totalHolders}` 
          })
          .eq('id', item.id);
        
        results.push({ symbol: item.symbol, action: 'skipped', reason: 'Too few holders' });
        continue;
      }
      
      if (SKIP_GRADES.includes(stats.healthGrade)) {
        console.log(`[poster] Skipping: low health grade (${stats.healthGrade})`);
        await supabase
          .from('holders_intel_post_queue')
          .update({ 
            status: 'skipped', 
            error_message: `Low health grade: ${stats.healthGrade}` 
          })
          .eq('id', item.id);
        
        results.push({ symbol: item.symbol, action: 'skipped', reason: 'Low health grade' });
        continue;
      }
      
      // ATH 24h: Fetch from GeckoTerminal on FIRST POST only, store in token_lifecycle
      let ath24h: number | null = null;
      if (currentTimesPosted === 1) {
        ath24h = await fetchAth24h(item.token_mint);
        if (ath24h !== null) {
          // Store in token_lifecycle (upsert)
          const { error: athError } = await supabase
            .from('token_lifecycle')
            .upsert({
              token_mint: item.token_mint,
              ath_24h_usd: ath24h,
              first_seen_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            }, { onConflict: 'token_mint' });
          
          if (athError) {
            console.warn(`[poster] Failed to store ATH 24h: ${athError.message}`);
          } else {
            console.log(`[poster] Stored ATH 24h: $${ath24h} for ${item.token_mint}`);
          }
        }
      }
      (stats as any).ath24h = ath24h;

      // Check if AI summary is enabled (via queue item flag or template contains AI vars)
      const templateUsesAI = tweetTemplate.includes('{ai_summary}') || tweetTemplate.includes('{AI_SUMMARY}') ||
                             tweetTemplate.includes('{ai_overview}') || tweetTemplate.includes('{AI_OVERVIEW}') ||
                             tweetTemplate.includes('{lifecycle}') || tweetTemplate.includes('{LIFECYCLE}');
      const aiEnabledForItem = item.include_ai_summary === true;
      const aiHealthModeOn = await getHealthMode('x_posts');
      
      if (templateUsesAI || aiEnabledForItem || aiHealthModeOn) {
        console.log('[poster] Template uses AI variables, fetching AI interpretation...');
        const aiResult = await fetchAISummary(report, item.token_mint, supabaseUrl, anonKey);
        if (aiResult) {
          stats.aiSummary = aiResult.summary;
          stats.aiOverview = aiResult.overview;
          stats.lifecycle = aiResult.lifecycle;
          console.log(`[poster] AI summary: ${stats.lifecycle} - ${stats.aiSummary.substring(0, 50)}...`);
        } else {
          console.log('[poster] AI summary not available, using empty string');
        }
      }
      
      // Generate network risk assessment — always run since TG templates may use {risk} even if X template doesn't
      console.log('[poster] Generating network risk assessment...');
      const riskResult = assessNetworkRisk({
        healthScore: stats.healthScore,
        totalHolders: stats.totalHolders,
        realHolders: stats.realHolders,
        dustPercentage: stats.dustPercentage,
        whaleCount: stats.whaleCount,
        seriousCount: stats.seriousCount,
        top10Pct: report?.distributionStats?.top10Percentage ?? null,
        devTrustLevel: report?.devReputation?.trustLevel ?? null,
        devReputationScore: report?.devReputation?.score ?? null,
        isBlacklisted: report?.devReputation?.isBlacklisted ?? false,
      });
      stats.risk = riskResult.signal;
      stats.riskDetail = riskResult.detail;
      console.log(`[poster] Risk: ${riskResult.signal}`);
      
      // Write health snapshot for Litmus Strip (fire-and-forget)
      upsertHealthSnapshot(supabase, {
        tokenMint: item.token_mint,
        healthScore: stats.healthScore,
        healthGrade: stats.healthGrade,
        riskSignal: riskResult.signal,
        riskLabel: riskResult.label,
        riskEmoji: riskResult.emoji,
        totalHolders: stats.totalHolders,
        realHolders: stats.realHolders,
        dustPercentage: stats.dustPercentage,
        whaleCount: stats.whaleCount,
        top10Pct: report?.distributionStats?.top10Percentage ?? null,
        source: 'poster',
      }).catch(e => console.warn('[poster] Snapshot write failed:', e));

      // Build tweet using the active template from database
      const tweetText = processTemplate(tweetTemplate, stats);

      // Persist composed tweet text so admins can review/copy it for manual X posting
      await supabase
        .from('holders_intel_post_queue')
        .update({ tweet_text: tweetText })
        .eq('id', item.id);

      // Safety: if an operator emergency-stopped this queue item while we were processing,
      // do NOT post.
      const { data: latestItem, error: latestItemError } = await supabase
        .from('holders_intel_post_queue')
        .select('status')
        .eq('id', item.id)
        .maybeSingle();

      if (latestItemError) {
        console.warn(`[poster] Could not re-check queue status before posting: ${latestItemError.message}`);
      } else if (!latestItem || latestItem.status !== 'processing') {
        console.log(`[poster] Aborting post: queue item status is '${latestItem?.status ?? 'missing'}'`);

        results.push({ symbol: item.symbol, action: 'aborted', reason: 'Stopped before posting' });
        continue;
      }
      
      // Post tweet
      const tweetResult = await postTweet(tweetText, supabaseUrl, anonKey, manualOverride);
      
      // If X posting is paused/skipped, do NOT mark as posted — that creates
      // false positives with tweet_id=null and no X link. Mark as skipped
      // with a clear reason so the row can be re-queued when X comes back.
      if (tweetResult?.skipped || !tweetResult?.tweetId) {
        await supabase
          .from('holders_intel_post_queue')
          .update({
            status: 'skipped',
            error_message: tweetResult?.paused
              ? 'X posting paused (account suspended) — no tweet sent'
              : 'Tweet returned no tweet_id — not marked posted',
          })
          .eq('id', item.id);
        console.warn(`[poster] Tweet not actually posted for ${item.symbol} (paused=${!!tweetResult?.paused}); marked skipped instead of posted`);
        results.push({ symbol: item.symbol, action: 'skipped', reason: tweetResult?.paused ? 'x_posting_paused' : 'no_tweet_id' });
        continue;
      }

      // Update queue with success — only when we have a real tweet_id
      await supabase
        .from('holders_intel_post_queue')
        .update({
          status: 'posted',
          posted_at: new Date().toISOString(),
          tweet_id: tweetResult.tweetId,
        })
        .eq('id', item.id);
      
      // Update seen tokens with incremented post count
      await supabase
        .from('holders_intel_seen_tokens')
        .update({
          was_posted: true,
          health_grade: stats.healthGrade,
          times_posted: stats.timesPosted,
        })
        .eq('token_mint', item.token_mint);
      
      // Update funnel_feed_discoveries if this came from funnel feed
      if (item.trigger_source === 'funnel_feed' || item.trigger_source === 'manual_push') {
        await supabase
          .from('funnel_feed_discoveries')
          .update({ xpost_status: 'posted', xpost_processed_at: new Date().toISOString() })
          .eq('token_mint', item.token_mint);
        console.log(`[poster] Updated funnel_feed_discoveries xpost_status → posted for ${item.token_mint.slice(0, 8)}`);
      }
      
      console.log(`[poster] Successfully posted tweet: ${tweetResult.tweetId}`);
      
      // 🕸️ MESH FEEDER: Every posted token feeds the mesh with ALL available data
      const creatorWalletForMeshRaw =
        report?.creatorInfo?.wallet || report?.potentialDevWallet?.address || null;
      const creatorWalletForMesh = isValidWallet(creatorWalletForMeshRaw) ? creatorWalletForMeshRaw : null;
      const twitterUrlForMesh = report?.socials?.twitter || null;
      const telegramUrlForMesh = report?.socials?.telegram || null;
      const websiteUrlForMesh = report?.socials?.website || null;
      
      meshFeed.token(supabase, {
        mint: item.token_mint,
        symbol: stats.symbol,
        name: stats.name,
        creatorWallet: creatorWalletForMesh,
        twitterUrl: twitterUrlForMesh,
        telegramUrl: telegramUrlForMesh,
        websiteUrl: websiteUrlForMesh,
        source: 'holders-intel-poster',
      }).catch(e => console.warn('[mesh-feeder] poster feed failed:', e));
      
      // 🏘️ AUTO-ENRICH X COMMUNITY: If the token's social link is an X Community,
      // fire off the community enricher to scrape admins/mods into the mesh
      if (twitterUrlForMesh && (twitterUrlForMesh.includes('/i/communities/') || twitterUrlForMesh.includes('/communities/'))) {
        const communityIdMatch = twitterUrlForMesh.match(/communities\/(\d+)/);
        if (communityIdMatch) {
          const communityId = communityIdMatch[1];
          console.log(`[poster] 🏘️ Detected X Community ${communityId}, auto-queuing enrichment...`);
          
          // Fire-and-forget: call the community enricher
          // NOTE: enricher requires `communityUrl` (or `twitterUrl`) — NOT `communityId`.
          // Sending the wrong shape was producing HTTP 400 on every auto-trigger.
          fetch(`${supabaseUrl}/functions/v1/x-community-enricher`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({
              communityUrl: twitterUrlForMesh,
              linkedTokenMint: item.token_mint,
              source: 'holders-intel-poster-auto',
            }),
          }).then(async (res) => {
            if (res.ok) {
              const result = await res.json().catch(() => ({}));
              console.log(`[poster] 🏘️ Community enrichment triggered: ${JSON.stringify(result).substring(0, 200)}`);
            } else {
              console.warn(`[poster] 🏘️ Community enrichment failed: ${res.status}`);
            }
          }).catch(e => console.warn('[poster] 🏘️ Community enrichment error:', e));
        }
      }
      
      // Generate ASCII bar for TG messages (shared by both BLACKBOX and PUBLIC broadcasts)
      const generateAsciiBar = (percentage: number, width: number = 10): string => {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;
        return '█'.repeat(filled) + '░'.repeat(empty);
      };
      
      // Calculate tier percentages (shared by both BLACKBOX and PUBLIC broadcasts)
      const whalePct = stats.totalHolders > 0 ? Math.round((stats.whaleCount / stats.totalHolders) * 100) : 0;
      const seriousPct = stats.totalHolders > 0 ? Math.round((stats.seriousCount / stats.totalHolders) * 100) : 0;
      const retailPct = stats.totalHolders > 0 ? Math.round((stats.activeCount / stats.totalHolders) * 100) : 0;
      const dustPctVal = stats.totalHolders > 0 ? Math.round((stats.dustCount / stats.totalHolders) * 100) : 0;

      // Also post to BlackBox TG group (fire-and-forget, with retry)
      try {
        
        // Fetch tg_posted template from database
        let tgTemplate = `📢 *Intel XBot Posted*\n\n🪙 *$\{ticker}*\n├ Holders: {totalWallets}\n├ Real: {realHolders}\n├ Grade: {healthGrade}\n└ Post #{timesPosted}\n\n📈 Distribution\n\`Whales  {whaleBar} {whalePct}%\`\n\`Serious {seriousBar} {seriousPct}%\`\n\`Retail  {retailBar} {retailPct}%\`\n\`Dust    {dustBar} {dustPct}%\`\n\n🐦 {tweetUrl}`;
        
        try {
          const { data: tgTplData } = await supabase
            .from('holders_intel_templates')
            .select('template_text')
            .eq('template_name', 'tg_posted')
            .maybeSingle();
          
          if (tgTplData?.template_text) {
            tgTemplate = tgTplData.template_text;
            console.log('[poster] Using tg_posted template from database');
          }
        } catch (tplErr) {
          console.warn('[poster] Failed to fetch tg_posted template, using fallback');
        }
        
        // Process template with variables
        const tgMessage = tgTemplate
          .replace(/\$\{ticker\}/g, `$ ${stats.symbol.toUpperCase()}`)
          .replace(/\$\{TICKER\}/g, `$ ${stats.symbol.toUpperCase()}`)
          .replace(/\{ticker\}/g, stats.symbol.toUpperCase())
          .replace(/\{TICKER\}/g, stats.symbol.toUpperCase())
          .replace(/\{totalWallets\}/g, stats.totalHolders.toLocaleString())
          .replace(/\{realHolders\}/g, stats.realHolders.toLocaleString())
          .replace(/\{healthGrade\}/g, stats.healthGrade)
          .replace(/\{timesPosted\}/g, String(stats.timesPosted))
          .replace(/\{whaleBar\}/g, generateAsciiBar(whalePct))
          .replace(/\{seriousBar\}/g, generateAsciiBar(seriousPct))
          .replace(/\{retailBar\}/g, generateAsciiBar(retailPct))
          .replace(/\{dustBar\}/g, generateAsciiBar(dustPctVal))
          .replace(/\{whalePct\}/g, whalePct.toString().padStart(2))
          .replace(/\{seriousPct\}/g, seriousPct.toString().padStart(2))
          .replace(/\{retailPct\}/g, retailPct.toString().padStart(2))
          .replace(/\{dustPct\}/g, dustPctVal.toString().padStart(2))
          .replace(/\{tweetUrl\}/g, tweetResult.tweetUrl || (tweetResult.tweetId ? `Tweet ID: ${tweetResult.tweetId}` : '(X posting paused)'))
          .replace(/\{healthScore\}/g, String(stats.healthScore || ''))
          .replace(/\{structuralScore\}/g, String(stats.structuralScore ?? ''))
          .replace(/\{activityScore\}/g, String(stats.activityScore ?? ''))
          .replace(/\{momentumGrade\}/g, stats.momentumGrade || '')
          .replace(/\{name\}/g, stats.name || stats.symbol)
          .replace(/\{ca\}/g, item.token_mint)
          .replace(/\{devRep\}/g, stats.devRep || '')
          .replace(/\{risk\}/g, stats.risk || '')
          .replace(/\{riskDetail\}/g, stats.riskDetail || '')
          .replace(/\{marketCap\}/g, item.market_cap ? (item.market_cap >= 1e6 ? `$${(item.market_cap / 1e6).toFixed(1)}M` : `$${(item.market_cap / 1e3).toFixed(0)}K`) : '—')
          .replace(/\{ai_summary\}/g, stats.aiSummary || '')
          .replace(/\{aiSummary\}/g, stats.aiSummary || '')
          .replace(/\{aiOverview\}/g, stats.aiOverview || '')
          .replace(/\{lifecycle\}/g, stats.lifecycle || '')
          .replace(/\{padre\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${item.token_mint}`)
          .replace(/\{PADRE\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${item.token_mint}`);
        
        // Send with retry (cold start can cause first attempt to fail)
        let tgSuccess = false;
        for (let attempt = 1; attempt <= 2 && !tgSuccess; attempt++) {
          try {
            const { error } = await supabase.functions.invoke('admin-notify', {
              body: {
                type: 'intel_xbot_post',
                title: `XBot: $ ${stats.symbol.toUpperCase()}`,
                message: tgMessage,
                metadata: { tokenMint: item.token_mint, tweetId: tweetResult.tweetId },
                channels: ['telegram'],
              },
            });
            if (!error) {
              tgSuccess = true;
              console.log(`[poster] TG notification sent (attempt ${attempt})`);
            } else if (attempt === 1) {
              console.warn(`[poster] TG attempt ${attempt} failed, retrying...`);
              await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
            }
          } catch (attemptErr) {
            if (attempt === 1) {
              console.warn(`[poster] TG attempt ${attempt} error, retrying...`);
              await new Promise(r => setTimeout(r, 1000));
            } else {
              console.warn('[poster] TG notification failed after retries:', attemptErr);
            }
          }
        }
      } catch (tgErr) {
        console.warn('[poster] TG notification failed:', tgErr);
      }
      
      // === PUBLIC CHANNEL BROADCAST (INTEL_PUBLIC) ===
      try {
        // Check if broadcast is suspended
        const { data: suspendedSetting } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'telegram_broadcast_suspended')
          .maybeSingle();
        
        const isSuspended = suspendedSetting?.value === true;
        
        if (!isSuspended) {
          // Fetch public channel template
          let publicTemplate = `🔎 $\{ticker} Holder Analysis\n\n📊 {totalWallets} Wallets → ✅ {realHolders} Real\nHealth: {healthGrade} | {dustPct}% Dust\n\n🐋 {whales} Whales | 😎 {serious} Serious\n\n🐦 {tweetUrl}\n\n💎 Want full reports, AI summaries & whale alerts?\n👉 Subscribe for $9.99/mo: blackbox.farm/pricing`;
          
          try {
            const { data: pubTplData } = await supabase
              .from('holders_intel_templates')
              .select('template_text')
              .eq('template_name', 'tg_public_post')
              .maybeSingle();
            
            if (pubTplData?.template_text) {
              publicTemplate = pubTplData.template_text;
              console.log('[poster] Using tg_public_post template from database');
            }
          } catch (tplErr) {
            console.warn('[poster] Failed to fetch tg_public_post template, using fallback');
          }
          
          // Process template with same variables
          const publicMessage = publicTemplate
            .replace(/\$\{ticker\}/g, `$${stats.symbol.toUpperCase()}`)
            .replace(/\$\{TICKER\}/g, `$${stats.symbol.toUpperCase()}`)
            .replace(/\{ticker\}/g, stats.symbol.toUpperCase())
            .replace(/\{TICKER\}/g, stats.symbol.toUpperCase())
            .replace(/\{totalWallets\}/g, stats.totalHolders.toLocaleString())
            .replace(/\{realHolders\}/g, stats.realHolders.toLocaleString())
            .replace(/\{healthGrade\}/g, stats.healthGrade)
            .replace(/\{timesPosted\}/g, String(stats.timesPosted))
            .replace(/\{whales\}/g, stats.whaleCount.toLocaleString())
            .replace(/\{serious\}/g, stats.seriousCount.toLocaleString())
            .replace(/\{retail\}/g, stats.activeCount.toLocaleString())
            .replace(/\{dust\}/g, stats.dustCount.toLocaleString())
            .replace(/\{whaleBar\}/g, generateAsciiBar(whalePct))
            .replace(/\{seriousBar\}/g, generateAsciiBar(seriousPct))
            .replace(/\{retailBar\}/g, generateAsciiBar(retailPct))
            .replace(/\{dustBar\}/g, generateAsciiBar(dustPctVal))
            .replace(/\{whalePct\}/g, whalePct.toString().padStart(2))
            .replace(/\{seriousPct\}/g, seriousPct.toString().padStart(2))
            .replace(/\{retailPct\}/g, retailPct.toString().padStart(2))
            .replace(/\{dustPct\}/g, dustPctVal.toString().padStart(2))
            .replace(/\{tweetUrl\}/g, tweetResult.tweetUrl || `Tweet ID: ${tweetResult.tweetId}`)
            .replace(/\{name\}/g, stats.name || stats.symbol)
            .replace(/\{ca\}/g, item.token_mint)
            .replace(/\{healthScore\}/g, String(stats.healthScore || ''))
            .replace(/\{structuralScore\}/g, String(stats.structuralScore ?? ''))
            .replace(/\{activityScore\}/g, String(stats.activityScore ?? ''))
            .replace(/\{momentumGrade\}/g, stats.momentumGrade || '')
            .replace(/\{devRep\}/g, stats.devRep || '')
            .replace(/\{risk\}/g, stats.risk || '')
            .replace(/\{riskDetail\}/g, stats.riskDetail || '')
            .replace(/\{marketCap\}/g, item.market_cap ? (item.market_cap >= 1e6 ? `$${(item.market_cap / 1e6).toFixed(1)}M` : `$${(item.market_cap / 1e3).toFixed(0)}K`) : '—')
            .replace(/\{ai_summary\}/g, stats.aiSummary || '')
            .replace(/\{aiSummary\}/g, stats.aiSummary || '')
            .replace(/\{aiOverview\}/g, stats.aiOverview || '')
            .replace(/\{lifecycle\}/g, stats.lifecycle || '')
            .replace(/\{padre\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${item.token_mint}`)
            .replace(/\{PADRE\}/g, `https://trade.padre.gg/rk/blackbox/trade/solana/${item.token_mint}`);
          
          // Fetch INTEL_PUBLIC target
          const { data: publicTarget } = await supabase
            .from('telegram_message_targets')
            .select('id, chat_id, label')
            .eq('label', 'INTEL_PUBLIC')
            .maybeSingle();
          
          if (publicTarget?.chat_id) {
            const chatId = Number(publicTarget.chat_id);
            
            let pubTgSuccess = false;
            for (let attempt = 1; attempt <= 2 && !pubTgSuccess; attempt++) {
              try {
                const { data: sendResult, error: sendErr } = await supabase.functions.invoke('telegram-mtproto-auth', {
                  body: {
                    action: 'send_message',
                    chatId: chatId,
                    message: publicMessage,
                    parseMode: 'markdown',
                  },
                });
                
                if (!sendErr && sendResult?.success) {
                  pubTgSuccess = true;
                  console.log(`[poster] Public TG channel sent (attempt ${attempt})`);
                  
                  // Update last_used_at
                  await supabase
                    .from('telegram_message_targets')
                    .update({ last_used_at: new Date().toISOString() })
                    .eq('id', publicTarget.id);
                } else if (attempt === 1) {
                  console.warn(`[poster] Public TG attempt ${attempt} failed, retrying...`);
                  await new Promise(r => setTimeout(r, 1500));
                }
              } catch (attemptErr) {
                if (attempt === 1) {
                  console.warn(`[poster] Public TG attempt ${attempt} error, retrying...`);
                  await new Promise(r => setTimeout(r, 1500));
                } else {
                  console.warn('[poster] Public TG channel failed after retries:', attemptErr);
                }
              }
            }
            
            // Log delivery
            try {
              await supabase.from('notification_delivery_log').insert({
                channel: 'telegram',
                target_id: publicTarget.id,
                target_label: 'INTEL_PUBLIC',
                status: pubTgSuccess ? 'delivered' : 'failed',
                message_preview: publicMessage.slice(0, 200),
                source_function: 'holders-intel-poster',
              });
            } catch (logErr) {
              console.warn('[poster] Failed to log public TG delivery:', logErr);
            }
          } else {
            console.warn('[poster] No INTEL_PUBLIC target found in telegram_message_targets');
          }
        } else {
          console.log('[poster] Public TG broadcast skipped — broadcasts suspended');
        }
      } catch (pubTgErr) {
        console.warn('[poster] Public TG channel broadcast failed:', pubTgErr);
      }
      
      postsThisTick++;
      results.push({ symbol: stats.symbol, action: 'posted', tweetId: tweetResult.tweetId });

      // === ADVERT INTERLEAVING ===
      try {
        // Check if advert system is enabled
        const { data: advertConfigRows } = await supabase
          .from('holders_intel_config')
          .select('key, value')
          .in('key', ['advert_enabled', 'advert_frequency', 'advert_post_counter', 'advert_last_x_template', 'advert_last_tg_template']);

        if (advertConfigRows) {
          const cfg: Record<string, string> = {};
          for (const r of advertConfigRows) cfg[r.key] = r.value;

          if (cfg.advert_enabled === 'true') {
            const frequency = parseInt(cfg.advert_frequency || '5', 10);
            const counter = parseInt(cfg.advert_post_counter || '0', 10) + 1;

            if (counter >= frequency) {
              console.log(`[poster] Advert trigger! Counter ${counter} >= frequency ${frequency}`);

              // --- X ADVERT ---
              try {
                // Get all enabled X advert templates
                const { data: xAdverts } = await supabase
                  .from('holders_intel_templates')
                  .select('template_name, template_text')
                  .like('template_name', 'x_advert_%')
                  .eq('is_active', true)
                  .order('template_name');

                if (xAdverts && xAdverts.length > 0) {
                  const lastX = cfg.advert_last_x_template || 'x_advert_1';
                  // Find next template in rotation
                  const lastIdx = xAdverts.findIndex(t => t.template_name === lastX);
                  const nextIdx = (lastIdx + 1) % xAdverts.length;
                  const nextXAdvert = xAdverts[nextIdx];

                  console.log(`[poster] Posting X advert: ${nextXAdvert.template_name}`);

                  try {
                    const { data: xAdResult, error: xAdErr } = await supabase.functions.invoke('post-share-card-twitter', {
                      body: { tweetText: nextXAdvert.template_text, twitterHandle: TWITTER_HANDLE },
                    });
                    if (xAdErr) {
                      console.warn('[poster] X advert post failed:', xAdErr);
                    } else {
                      console.log(`[poster] X advert posted: ${nextXAdvert.template_name}`, xAdResult?.tweetId);
                    }
                  } catch (xPostErr) {
                    console.warn('[poster] X advert post error:', xPostErr);
                  }

                  // Update last used X template
                  await supabase.from('holders_intel_config')
                    .update({ value: nextXAdvert.template_name, updated_at: new Date().toISOString() })
                    .eq('key', 'advert_last_x_template');

                  // Increment shown counter for this X advert template
                  const xCounterKey = `advert_shown_${nextXAdvert.template_name}`;
                  const { data: xCounterRow } = await supabase
                    .from('holders_intel_config')
                    .select('value')
                    .eq('key', xCounterKey)
                    .maybeSingle();
                  const xNewCount = String((parseInt(xCounterRow?.value || '0', 10)) + 1);
                  await supabase.from('holders_intel_config')
                    .upsert({ key: xCounterKey, value: xNewCount, updated_at: new Date().toISOString() })
                    .eq('key', xCounterKey);
                  console.log(`[poster] ${nextXAdvert.template_name} shown count: ${xNewCount}`);
                }
              } catch (xAdErr) {
                console.warn('[poster] X advert rotation error:', xAdErr);
              }

              // --- TG ADVERT (to INTEL_PUBLIC channel) ---
              try {
                const { data: tgAdverts } = await supabase
                  .from('holders_intel_templates')
                  .select('template_name, template_text')
                  .like('template_name', 'tg_advert_%')
                  .eq('is_active', true)
                  .order('template_name');

                if (tgAdverts && tgAdverts.length > 0) {
                  const lastTg = cfg.advert_last_tg_template || 'tg_advert_1';
                  const lastTgIdx = tgAdverts.findIndex(t => t.template_name === lastTg);
                  const nextTgIdx = (lastTgIdx + 1) % tgAdverts.length;
                  const nextTgAdvert = tgAdverts[nextTgIdx];

                  console.log(`[poster] Posting TG advert: ${nextTgAdvert.template_name}`);

                  // Check if broadcast not suspended
                  const { data: suspCheck } = await supabase
                    .from('system_settings')
                    .select('value')
                    .eq('key', 'telegram_broadcast_suspended')
                    .maybeSingle();

                  if (suspCheck?.value !== true) {
                    const { data: pubTarget } = await supabase
                      .from('telegram_message_targets')
                      .select('chat_id')
                      .eq('label', 'INTEL_PUBLIC')
                      .maybeSingle();

                    if (pubTarget?.chat_id) {
                      try {
                        await supabase.functions.invoke('telegram-mtproto-auth', {
                          body: {
                            action: 'send_message',
                            chatId: Number(pubTarget.chat_id),
                            message: nextTgAdvert.template_text,
                          },
                        });
                        console.log(`[poster] TG advert sent: ${nextTgAdvert.template_name}`);
                      } catch (tgSendErr) {
                        console.warn('[poster] TG advert send error:', tgSendErr);
                      }
                    }
                  }

                  // TG adverts go ONLY to INTEL_PUBLIC — no admin-notify broadcast
                  console.log(`[poster] TG advert ${nextTgAdvert.template_name} sent to INTEL_PUBLIC only`);

                  // Update last used TG template
                  await supabase.from('holders_intel_config')
                    .update({ value: nextTgAdvert.template_name, updated_at: new Date().toISOString() })
                    .eq('key', 'advert_last_tg_template');

                  // Increment shown counter for this TG advert template
                  const tgCounterKey = `advert_shown_${nextTgAdvert.template_name}`;
                  const { data: tgCounterRow } = await supabase
                    .from('holders_intel_config')
                    .select('value')
                    .eq('key', tgCounterKey)
                    .maybeSingle();
                  const tgNewCount = String((parseInt(tgCounterRow?.value || '0', 10)) + 1);
                  await supabase.from('holders_intel_config')
                    .upsert({ key: tgCounterKey, value: tgNewCount, updated_at: new Date().toISOString() })
                    .eq('key', tgCounterKey);
                  console.log(`[poster] ${nextTgAdvert.template_name} shown count: ${tgNewCount}`);
                }
              } catch (tgAdErr) {
                console.warn('[poster] TG advert rotation error:', tgAdErr);
              }

              // Reset counter
              await supabase.from('holders_intel_config')
                .update({ value: '0', updated_at: new Date().toISOString() })
                .eq('key', 'advert_post_counter');

              console.log('[poster] Advert cycle complete, counter reset to 0');
            } else {
              // Increment counter
              await supabase.from('holders_intel_config')
                .update({ value: String(counter), updated_at: new Date().toISOString() })
                .eq('key', 'advert_post_counter');
              console.log(`[poster] Advert counter: ${counter}/${frequency}`);
            }
          }
        }
      } catch (advertErr) {
        console.warn('[poster] Advert interleaving error (non-fatal):', advertErr);
      }
      
    } catch (postError: any) {
      console.error(`[poster] Error processing ${item.symbol}:`, postError);
      
      const errorMsg = postError.message || '';
      
      const isTwitterRejection = errorMsg.includes('Twitter API error') ||
                                  errorMsg.includes('duplicate') ||
                                  errorMsg.includes('already posted') ||
                                  errorMsg.includes('Status is a duplicate') ||
                                  errorMsg.includes('187') ||
                                  errorMsg.includes('You are not allowed') ||
                                  errorMsg.includes('403') ||
                                  errorMsg.includes('401') ||
                                  errorMsg.includes('429') ||
                                  errorMsg.includes('Too Many Requests');
      
      if (isTwitterRejection) {
        console.log(`[poster] Twitter rejected, skipping (no retry): ${item.symbol} - ${errorMsg.substring(0, 100)}`);
        await supabase
          .from('holders_intel_post_queue')
          .update({
            status: 'skipped',
            error_message: `Twitter rejected: ${errorMsg.substring(0, 500)}`,
          })
          .eq('id', item.id);
        
        results.push({ symbol: item.symbol, action: 'skipped', reason: 'Twitter rejected' });
        // Twitter rejection = stop posting this tick to avoid rate limit cascade
        break;
      }
      
      // Non-Twitter errors (RPC fail etc.) - retry once, but CONTINUE to next item
      const newRetryCount = (item.retry_count || 0) + 1;
      const finalStatus = newRetryCount >= 2 ? 'failed' : 'pending';
      const retryAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      
      await supabase
        .from('holders_intel_post_queue')
        .update({
          status: finalStatus,
          error_message: postError.message,
          retry_count: newRetryCount,
          scheduled_at: finalStatus === 'pending' ? retryAt : item.scheduled_at,
        })
        .eq('id', item.id);
      
      results.push({ symbol: item.symbol, action: finalStatus, error: errorMsg.substring(0, 100) });
      continue; // Move to next item instead of returning!
    }
    } // end for-loop
    
    const elapsed = Date.now() - startTime;
    console.log(`[poster] Batch complete: ${postsThisTick} posted, ${results.length} processed in ${elapsed}ms`);
    
    return new Response(
      JSON.stringify({
        success: true,
        postsThisTick,
        results,
        executionTimeMs: elapsed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error: any) {
    console.error('[poster] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
