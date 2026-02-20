import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PumpPortal WebSocket URL for real-time new token events
const PUMPPORTAL_WS_URL = 'wss://pumpportal.fun/api/data';

// Maximum token age in minutes - reject anything older
const MAX_TOKEN_AGE_MINUTES = 30;

// Standard pump.fun token supply (1 billion with 6 decimals)
const STANDARD_PUMPFUN_SUPPLY = 1000000000000000;

// Known abused/spam tickers (static list for fast lookup)
const KNOWN_ABUSED_TICKERS = new Set([
  'TEST', 'READ', 'BONKBALL', 'BADONK', 'OIL', 'MADURO',
  'BEAST', 'MOON', 'PUMP', 'GEM', 'PEPE', '100X', 'SEND',
  'TRUMP', 'MAGA', 'ELON', 'DOGE', 'SHIB', 'APE', 'CAT',
]);

interface NewTokenEvent {
  signature: string;
  mint: string;
  traderPublicKey: string;
  txType: string;
  initialBuy: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
  name: string;
  symbol: string;
  uri: string;
}

interface TokenMetadata {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

interface IntakeConfig {
  is_enabled: boolean;
  max_ticker_length: number;
  require_image: boolean;
  min_socials_count: number;
}

// Get config from database
async function getConfig(supabase: any): Promise<IntakeConfig> {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('is_enabled, max_ticker_length, require_image, min_socials_count')
    .limit(1)
    .maybeSingle();
    
  return {
    is_enabled: data?.is_enabled ?? true,
    max_ticker_length: data?.max_ticker_length ?? 15,
    require_image: data?.require_image ?? false,
    min_socials_count: data?.min_socials_count ?? 0,
  };
}

// Check if mint address is a pump.fun token
// pump.fun tokens end with "pump" in their mint address
function isPumpFunMint(mint: string): boolean {
  if (!mint) return false;
  return mint.toLowerCase().endsWith('pump');
}

// Check if ticker contains BAD emojis (decorative pictographs)
// ALLOWS: CJK characters, Latin extended with accents (ó, ō, ñ, etc.)
// REJECTS: Emoji pictographs only (💰, 🚀, ❤️, etc.)
function containsBadEmoji(text: string): boolean {
  if (!text) return false;
  
  // Only match actual pictograph emojis - NOT language characters
  const badEmojiRegex = new RegExp([
    '[\u{1F300}-\u{1F5FF}]', // Misc Symbols & Pictographs (🌀-🗿)
    '[\u{1F600}-\u{1F64F}]', // Emoticons (😀-🙏)
    '[\u{1F680}-\u{1F6FF}]', // Transport & Map Symbols (🚀-🛿)
    '[\u{1F700}-\u{1F77F}]', // Alchemical Symbols
    '[\u{1F780}-\u{1F7FF}]', // Geometric Shapes Extended
    '[\u{1F800}-\u{1F8FF}]', // Supplemental Arrows-C
    '[\u{1F900}-\u{1F9FF}]', // Supplemental Symbols & Pictographs (🤀-🧿)
    '[\u{1FA00}-\u{1FA6F}]', // Chess Symbols
    '[\u{1FA70}-\u{1FAFF}]', // Symbols & Pictographs Extended-A (🩰-🫿)
    '[\u{2600}-\u{26FF}]',   // Misc Symbols (☀-⛿) 
    '[\u{2700}-\u{27BF}]',   // Dingbats (✀-➿)
    '[\u{1F000}-\u{1F02F}]', // Mahjong/Domino tiles
    '[\u{FE00}-\u{FE0F}]',   // Variation Selectors (emoji modifiers)
  ].join('|'), 'u');
  
  return badEmojiRegex.test(text);
}

// Check if a codepoint is an allowed non-ASCII character (CJK + Latin extended)
function isAllowedNonAsciiChar(cp: number): boolean {
  // Latin Extended-A: U+0100-U+017F (ā, ă, ą, ć, ĉ, etc.)
  if (cp >= 0x0100 && cp <= 0x017F) return true;
  // Latin Extended-B: U+0180-U+024F (ƀ, ƃ, etc.)
  if (cp >= 0x0180 && cp <= 0x024F) return true;
  // Latin Extended Additional: U+1E00-U+1EFF (ḀḁḂḃ, etc.)
  if (cp >= 0x1E00 && cp <= 0x1EFF) return true;
  // Latin Extended-C/D/E: U+2C60-U+2C7F, U+A720-U+A7FF, U+AB30-U+AB6F
  if (cp >= 0x2C60 && cp <= 0x2C7F) return true;
  if (cp >= 0xA720 && cp <= 0xA7FF) return true;
  if (cp >= 0xAB30 && cp <= 0xAB6F) return true;
  // Combining Diacritical Marks: U+0300-U+036F (accents that combine)
  if (cp >= 0x0300 && cp <= 0x036F) return true;
  // Latin-1 Supplement: U+00C0-U+00FF (À, Á, Â, Ã, Ä, Å, etc.)
  if (cp >= 0x00C0 && cp <= 0x00FF) return true;
  // Greek and Coptic: U+0370-U+03FF
  if (cp >= 0x0370 && cp <= 0x03FF) return true;
  // Cyrillic: U+0400-U+04FF
  if (cp >= 0x0400 && cp <= 0x04FF) return true;
  
  // CJK & friends
  if (cp >= 0x3000 && cp <= 0x303F) return true; // CJK Symbols & Punctuation
  if (cp >= 0x3040 && cp <= 0x30FF) return true; // Hiragana + Katakana
  if (cp >= 0x31F0 && cp <= 0x31FF) return true; // Katakana Phonetic Extensions
  if (cp >= 0x31C0 && cp <= 0x31EF) return true; // CJK Strokes
  if (cp >= 0x3400 && cp <= 0x4DBF) return true; // CJK Unified Ideographs Ext A
  if (cp >= 0x4E00 && cp <= 0x9FFF) return true; // CJK Unified Ideographs
  if (cp >= 0xF900 && cp <= 0xFAFF) return true; // CJK Compatibility Ideographs
  if (cp >= 0x2E80 && cp <= 0x2FDF) return true; // CJK Radicals/Kangxi
  if (cp >= 0x3200 && cp <= 0x32FF) return true; // Enclosed CJK Letters & Months
  if (cp >= 0xFF00 && cp <= 0xFFEF) return true; // Halfwidth & Fullwidth Forms
  // Hangul
  if (cp >= 0x1100 && cp <= 0x11FF) return true; // Hangul Jamo
  if (cp >= 0x3130 && cp <= 0x318F) return true; // Hangul Compatibility Jamo
  if (cp >= 0xAC00 && cp <= 0xD7AF) return true; // Hangul Syllables
  // CJK extensions beyond BMP
  if (cp >= 0x20000 && cp <= 0x2CEAF) return true; // CJK Ext B-F

  return false;
}

// Check if ticker contains disallowed unicode (emoji or non-language symbols)
function containsDisallowedTickerUnicode(text: string): boolean {
  if (!text) return false;
  
  // Fast path: reject obvious emoji ranges
  if (containsBadEmoji(text)) return true;
  
  // Check each character
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    
    // ASCII is always OK
    if (cp <= 0x7F) continue;
    
    // Emoji joiners/modifiers should never appear in a ticker
    if (cp === 0x200D) return true; // ZWJ
    if (cp >= 0xFE00 && cp <= 0xFE0F) return true; // VS
    if (cp >= 0xE0100 && cp <= 0xE01EF) return true; // VS supplement
    
    // If not in our allowlist, reject
    if (!isAllowedNonAsciiChar(cp)) return true;
  }
  
  return false;
}

// Check if ticker is a known abused ticker (dynamically from DB + static list)
async function isAbusedTicker(supabase: any, symbol: string): Promise<{ abused: boolean; reason?: string }> {
  if (!symbol) return { abused: false };
  
  const upperSymbol = symbol.toUpperCase();
  
  // Fast check: static list first
  if (KNOWN_ABUSED_TICKERS.has(upperSymbol)) {
    return { abused: true, reason: 'known_abused_ticker' };
  }
  
  // Check dynamic list from database
  const { data: abusedRecord } = await supabase
    .from('abused_tickers')
    .select('symbol, abuse_count, is_permanent_block')
    .eq('symbol', upperSymbol)
    .maybeSingle();
  
  if (abusedRecord?.is_permanent_block) {
    return { abused: true, reason: 'permanently_blocked_ticker' };
  }
  
  // Duplicates are handled separately (so we can reject with a clear "duplicate_ticker" reason)
  return { abused: false };
}

// Check dev wallet history on pump.fun - reject serial scammers
async function checkDevWalletHistory(creatorWallet: string): Promise<{ isSerialScammer: boolean; tokenCount: number; reason?: string }> {
  try {
    // Query pump.fun API for creator's token history
    const response = await fetch(`https://frontend-api.pump.fun/coins/user-created-coins/${creatorWallet}?limit=50&offset=0`);
    
    if (!response.ok) {
      console.log(`   ⚠️ Could not fetch dev history for ${creatorWallet.slice(0,8)}...`);
      return { isSerialScammer: false, tokenCount: 0 };
    }
    
    const coins = await response.json();
    const tokenCount = Array.isArray(coins) ? coins.length : 0;
    
    console.log(`   👤 Dev ${creatorWallet.slice(0,8)}... has created ${tokenCount} tokens on pump.fun`);
    
    // Serial scammer thresholds:
    // - 5+ tokens created = suspicious
    // - 10+ tokens created = definite serial scammer
    if (tokenCount >= 10) {
      return { 
        isSerialScammer: true, 
        tokenCount, 
        reason: `serial_scammer:${tokenCount}_tokens_created` 
      };
    }
    
    // Check if they create same name/symbol more than once (copy-paste scam)
    if (Array.isArray(coins) && coins.length >= 2) {
      const names = coins.map((c: any) => c.name?.toLowerCase()).filter(Boolean);
      const symbols = coins.map((c: any) => c.symbol?.toUpperCase()).filter(Boolean);
      
      // Count duplicates
      const nameCounts = names.reduce((acc: Record<string, number>, name: string) => {
        acc[name] = (acc[name] || 0) + 1;
        return acc;
      }, {});
      
      const symbolCounts = symbols.reduce((acc: Record<string, number>, sym: string) => {
        acc[sym] = (acc[sym] || 0) + 1;
        return acc;
      }, {});
      
      const maxNameDupes = Math.max(...Object.values(nameCounts), 0);
      const maxSymbolDupes = Math.max(...Object.values(symbolCounts), 0);
      
      // If same name/symbol used more than once (2+), it's a copy-paste scam
      if (maxNameDupes >= 2 || maxSymbolDupes >= 2) {
        return {
          isSerialScammer: true,
          tokenCount,
          reason: `copy_paste_scam:${maxNameDupes}_same_name,${maxSymbolDupes}_same_symbol`
        };
      }
    }
    
    return { isSerialScammer: false, tokenCount };
  } catch (error) {
    console.error(`Error checking dev wallet history:`, error);
    return { isSerialScammer: false, tokenCount: 0 };
  }
}

// Validate token intake - Stage 0 checks
function validateIntake(
  event: NewTokenEvent, 
  metadata: TokenMetadata | null,
  config: IntakeConfig
): { valid: boolean; rejectionReasons: string[]; rejectionType: 'soft' | 'permanent' | null } {
  const reasons: string[] = [];
  let isPermanent = false;
  
  // NULL NAME/TICKER CHECK - PERMANENT
  if (!event.name || event.name.trim() === '') {
    reasons.push('null_name');
    isPermanent = true;
  }
  
  if (!event.symbol || event.symbol.trim() === '') {
    reasons.push('null_ticker');
    isPermanent = true;
  }
  
  // TICKER LENGTH CHECK - PERMANENT
  if (event.symbol && event.symbol.length > config.max_ticker_length) {
    reasons.push(`ticker_too_long:${event.symbol.length}>${config.max_ticker_length}`);
    isPermanent = true;
  }
  
  // EMOJI/UNICODE CHECK - Use the improved function that allows CJK + Latin accents
  if (event.symbol && containsDisallowedTickerUnicode(event.symbol)) {
    reasons.push('ticker_bad_emoji');
    isPermanent = true;
  }
  
  // Also check name for bad emojis (soft reject)
  if (event.name && containsBadEmoji(event.name)) {
    reasons.push('name_bad_emoji');
    // Name with emoji is soft reject, not permanent
  }
  
  // IMAGE CHECK - SOFT (only if required)
  const hasImage = metadata?.image && metadata.image !== '' && !metadata.image.includes('placeholder');
  if (config.require_image && !hasImage) {
    reasons.push('no_image');
  }
  
  // SOCIALS CHECK - SOFT
  const socialsCount = [metadata?.twitter, metadata?.telegram, metadata?.website]
    .filter(s => s && s.trim() !== '').length;
  if (socialsCount < config.min_socials_count) {
    reasons.push(`low_socials:${socialsCount}<${config.min_socials_count}`);
  }
  
  if (reasons.length === 0) {
    return { valid: true, rejectionReasons: [], rejectionType: null };
  }
  
  return { 
    valid: false, 
    rejectionReasons: reasons, 
    rejectionType: isPermanent ? 'permanent' : 'soft' 
  };
}

// Mayhem Mode check - reject if true (PERMANENT)
async function checkMayhemMode(tokenMint: string): Promise<boolean> {
  try {
    const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${tokenMint}/report/summary`);
    if (!response.ok) return false;
    
    const data = await response.json();
    const risks = data.risks || [];
    
    // Check for danger-level risks
    const hasDanger = risks.some((r: any) => r.level === 'danger');
    if (hasDanger) {
      console.log(`🔴 Mayhem Mode detected for ${tokenMint}: danger-level risks found`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`Error checking Mayhem Mode for ${tokenMint}:`, error);
    return false; // Don't reject on error, let it through for further checks
  }
}

// Fetch token metadata from URI
async function fetchTokenMetadata(uri: string): Promise<TokenMetadata | null> {
  try {
    // Handle IPFS URIs
    let fetchUrl = uri;
    if (uri.startsWith('ipfs://')) {
      fetchUrl = uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    
    const response = await fetch(fetchUrl, { 
      signal: AbortSignal.timeout(5000) 
    });
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error(`Error fetching metadata from ${uri}:`, error);
    return null;
  }
}

// Process a new token event from PumpPortal
async function processNewToken(
  supabase: any,
  event: NewTokenEvent,
  config: IntakeConfig
): Promise<{ success: boolean; reason?: string }> {
  const { mint, name, symbol, traderPublicKey, marketCapSol, uri, vSolInBondingCurve } = event;
  
  // PHASE 1: Filter non-pump.fun tokens IMMEDIATELY
  if (!isPumpFunMint(mint)) {
    console.log(`   ⏭️ Non-pump.fun token (${mint.slice(-8)}), skipping`);
    return { success: false, reason: 'non_pumpfun_launchpad' };
  }
  
  console.log(`\n🆕 NEW TOKEN: ${symbol} (${name})`);
  console.log(`   Mint: ${mint}`);
  console.log(`   Creator: ${traderPublicKey}`);
  console.log(`   Initial MC: ${marketCapSol.toFixed(4)} SOL`);
  
  // Check if token already exists by mint
  const { data: existing } = await supabase
    .from('pumpfun_watchlist')
    .select('id')
    .eq('token_mint', mint)
    .maybeSingle();
    
  if (existing) {
    console.log(`   ⏭️ Already in watchlist, skipping`);
    return { success: false, reason: 'already_exists' };
  }
  
  // PHASE 3: Check for abused tickers (smart detection)
  if (symbol) {
    const abuseCheck = await isAbusedTicker(supabase, symbol);
    if (abuseCheck.abused) {
      console.log(`   🚫 ABUSED TICKER REJECTED: ${symbol} - ${abuseCheck.reason}`);
      
      // Fetch metadata for social links and image
      let metadata: TokenMetadata | null = null;
      if (uri) {
        metadata = await fetchTokenMetadata(uri);
      }
      
      const socialsCount = [metadata?.twitter, metadata?.telegram, metadata?.website]
        .filter(s => s && s.trim() !== '').length;
      const hasImage = !!(metadata?.image && metadata.image !== '' && !metadata.image.includes('placeholder'));
      
      // Insert as rejected (permanent - spam/bot)
      await supabase.from('pumpfun_watchlist').insert({
        token_mint: mint,
        token_name: name,
        token_symbol: symbol,
        creator_wallet: traderPublicKey,
        status: 'rejected',
        rejection_reason: abuseCheck.reason,
        rejection_type: 'permanent',
        rejection_reasons: [abuseCheck.reason, 'bot_spam'],
        source: 'websocket',
        created_at_blockchain: new Date().toISOString(),
        bonding_curve_pct: (vSolInBondingCurve / 85) * 100,
        market_cap_sol: marketCapSol,
        has_image: hasImage,
        socials_count: socialsCount,
        image_url: metadata?.image || null,
        twitter_url: metadata?.twitter || null,
        telegram_url: metadata?.telegram || null,
        website_url: metadata?.website || null,
        removal_reason: `Abused ticker: ${abuseCheck.reason}`,
      });
      
      return { success: false, reason: abuseCheck.reason };
    }
  }
  
  // === DUPLICATE TICKER CHECK (active tokens within 6h window) - case-insensitive ===
  if (symbol) {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: duplicateTickers, error: dupError } = await supabase
      .from('pumpfun_watchlist')
      .select('id, token_mint, token_symbol, status, first_seen_at, holder_count')
      .ilike('token_symbol', symbol) // Case-insensitive match
      .in('status', ['pending_triage', 'watching', 'qualified', 'buy_now', 'new', 'passed', 'active'])
      .gte('first_seen_at', sixHoursAgo) // Only block if duplicate within last 6 hours
      .order('first_seen_at', { ascending: true })
      .limit(5);
    
    if (!dupError && duplicateTickers && duplicateTickers.length > 0) {
      const originalToken = duplicateTickers[0];
      console.log(`   🚫 DUPLICATE TICKER REJECTED: ${symbol} - already exists as ${originalToken.token_mint.slice(0,8)}... (${originalToken.status}, ${originalToken.holder_count || 0} holders)`);
      
      // Fetch metadata for social links and image
      let metadata: TokenMetadata | null = null;
      if (uri) {
        metadata = await fetchTokenMetadata(uri);
      }
      
      const socialsCount = [metadata?.twitter, metadata?.telegram, metadata?.website]
        .filter(s => s && s.trim() !== '').length;
      const hasImage = !!(metadata?.image && metadata.image !== '' && !metadata.image.includes('placeholder'));
      
      // Insert as rejected (permanent - scam/copycat)
      await supabase.from('pumpfun_watchlist').insert({
        token_mint: mint,
        token_name: name,
        token_symbol: symbol,
        creator_wallet: traderPublicKey,
        status: 'rejected',
        rejection_reason: `duplicate_ticker:${originalToken.token_mint.slice(0,8)}`,
        rejection_type: 'permanent',
        rejection_reasons: ['duplicate_ticker', 'copycat_scam'],
        source: 'websocket',
        created_at_blockchain: new Date().toISOString(),
        bonding_curve_pct: (vSolInBondingCurve / 85) * 100,
        market_cap_sol: marketCapSol,
        has_image: hasImage,
        socials_count: socialsCount,
        image_url: metadata?.image || null,
        twitter_url: metadata?.twitter || null,
        telegram_url: metadata?.telegram || null,
        website_url: metadata?.website || null,
        removal_reason: `Duplicate ticker - original: ${originalToken.token_mint}`,
      });
      
      return { success: false, reason: 'duplicate_ticker' };
    }
  }
  
  // === DEV WALLET HISTORY CHECK - reject serial scammers ===
  if (traderPublicKey) {
    const devCheck = await checkDevWalletHistory(traderPublicKey);
    if (devCheck.isSerialScammer) {
      console.log(`   🚫 SERIAL SCAMMER REJECTED: ${traderPublicKey.slice(0,8)}... - ${devCheck.reason}`);
      
      // Fetch metadata for social links and image
      let metadata: TokenMetadata | null = null;
      if (uri) {
        metadata = await fetchTokenMetadata(uri);
      }
      
      const socialsCount = [metadata?.twitter, metadata?.telegram, metadata?.website]
        .filter(s => s && s.trim() !== '').length;
      const hasImage = !!(metadata?.image && metadata.image !== '' && !metadata.image.includes('placeholder'));
      
      // Insert as rejected (permanent - serial scammer)
      await supabase.from('pumpfun_watchlist').insert({
        token_mint: mint,
        token_name: name,
        token_symbol: symbol,
        creator_wallet: traderPublicKey,
        status: 'rejected',
        rejection_reason: devCheck.reason,
        rejection_type: 'permanent',
        rejection_reasons: ['serial_scammer', devCheck.reason],
        source: 'websocket',
        created_at_blockchain: new Date().toISOString(),
        bonding_curve_pct: (vSolInBondingCurve / 85) * 100,
        market_cap_sol: marketCapSol,
        has_image: hasImage,
        socials_count: socialsCount,
        image_url: metadata?.image || null,
        twitter_url: metadata?.twitter || null,
        telegram_url: metadata?.telegram || null,
        website_url: metadata?.website || null,
        removal_reason: `Serial scammer dev: ${devCheck.tokenCount} tokens created`,
      });
      
      return { success: false, reason: devCheck.reason };
    }
  }
  
  // Fetch metadata for social links and image
  let metadata: TokenMetadata | null = null;
  if (uri) {
    metadata = await fetchTokenMetadata(uri);
  }
  
  // Calculate socials count
  const socialsCount = [metadata?.twitter, metadata?.telegram, metadata?.website]
    .filter(s => s && s.trim() !== '').length;
  const hasImage = !!(metadata?.image && metadata.image !== '' && !metadata.image.includes('placeholder'));
  
  // STAGE 0: Intake Validation (with fixed emoji detection)
  const validation = validateIntake(event, metadata, config);
  
  if (!validation.valid) {
    console.log(`   ⚠️ INTAKE VALIDATION FAILED: ${validation.rejectionReasons.join(', ')} (${validation.rejectionType})`);
    
    // Insert as rejected with proper type
    await supabase.from('pumpfun_watchlist').insert({
      token_mint: mint,
      token_name: name,
      token_symbol: symbol,
      creator_wallet: traderPublicKey,
      status: 'rejected',
      rejection_reason: validation.rejectionReasons.join(', '),
      rejection_type: validation.rejectionType,
      rejection_reasons: validation.rejectionReasons,
      source: 'websocket',
      created_at_blockchain: new Date().toISOString(),
      bonding_curve_pct: (vSolInBondingCurve / 85) * 100,
      market_cap_sol: marketCapSol,
      has_image: hasImage,
      socials_count: socialsCount,
      image_url: metadata?.image || null,
      twitter_url: metadata?.twitter || null,
      telegram_url: metadata?.telegram || null,
      website_url: metadata?.website || null,
    });
    
    return { success: false, reason: validation.rejectionReasons.join(', ') };
  }
  
  // Quick Mayhem Mode check - PERMANENT rejection
  // Do NOT store mayhem tokens at all - completely invisible
  const isMayhem = await checkMayhemMode(mint);
  if (isMayhem) {
    console.log(`   🔴 MAYHEM SKIPPED: ${symbol} - not storing at all`);
    return { success: false, reason: 'mayhem_mode' };
  }
  
  // Calculate bonding curve percentage (rough estimate)
  // pump.fun bonding curve completes at ~85 SOL
  const bondingCurvePercent = Math.min((vSolInBondingCurve / 85) * 100, 100);
  
  // Insert into watchlist with pending_triage status
  const { error } = await supabase.from('pumpfun_watchlist').insert({
    token_mint: mint,
    token_name: name,
    token_symbol: symbol,
    creator_wallet: traderPublicKey,
    status: 'pending_triage',
    source: 'websocket',
    created_at_blockchain: new Date().toISOString(),
    bonding_curve_pct: bondingCurvePercent,
    market_cap_sol: marketCapSol,
    twitter_url: metadata?.twitter || null,
    telegram_url: metadata?.telegram || null,
    website_url: metadata?.website || null,
    image_url: metadata?.image || null,
    has_image: hasImage,
    socials_count: socialsCount,
    holder_count: 1, // Just created, only creator
    volume_5m: event.initialBuy || 0,
  });
  
  if (error) {
    const code = (error as any)?.code;
    const msg = (error as any)?.message || '';

    // If our DB-level uniqueness rule fired, it means another same-ticker token won the race.
    if (code === '23505' && msg.includes('pumpfun_watchlist_unique_live_symbol')) {
      const { data: original } = await supabase
        .from('pumpfun_watchlist')
        .select('token_mint, status')
        .ilike('token_symbol', symbol)
        .in('status', ['pending_triage', 'watching', 'qualified', 'buy_now', 'new', 'passed', 'active'])
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      await supabase.from('pumpfun_watchlist').insert({
        token_mint: mint,
        token_name: name,
        token_symbol: symbol,
        creator_wallet: traderPublicKey,
        status: 'rejected',
        rejection_reason: `duplicate_ticker:${(original?.token_mint || 'unknown').slice(0, 8)}`,
        rejection_type: 'permanent',
        rejection_reasons: ['duplicate_ticker', 'race_condition'],
        source: 'websocket',
        created_at_blockchain: new Date().toISOString(),
        bonding_curve_pct: bondingCurvePercent,
        market_cap_sol: marketCapSol,
        twitter_url: metadata?.twitter || null,
        telegram_url: metadata?.telegram || null,
        website_url: metadata?.website || null,
        image_url: metadata?.image || null,
        has_image: hasImage,
        socials_count: socialsCount,
        holder_count: 1,
        volume_5m: event.initialBuy || 0,
        removal_reason: 'Duplicate ticker blocked (DB unique)',
      });

      return { success: false, reason: 'duplicate_ticker' };
    }

    console.error(`   ❌ Failed to insert:`, error);
    return { success: false, reason: 'insert_error' };
  }
  
  console.log(`   ✅ Added to watchlist (pending_triage) - Image: ${hasImage ? 'YES' : 'NO'}, Socials: ${socialsCount}`);
  return { success: true };
}

// Stats tracking
interface ListenerStats {
  connected: boolean;
  connectedAt: string | null;
  tokensReceived: number;
  tokensAdded: number;
  tokensRejected: number;
  lastTokenAt: string | null;
  errors: number;
  rejectionBreakdown: Record<string, number>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const action = url.searchParams.get('action') || 'listen';

    // Load config
    const config = await getConfig(supabase);
    console.log('📋 Intake Config:', config);

    // Global PAUSE (cron uses this function too). Allow status even when paused.
    if (!config.is_enabled && action !== 'status') {
      return new Response(JSON.stringify({
        success: true,
        paused: true,
        message: 'Pump.fun monitor is paused (is_enabled=false)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'status') {
      // Return current listener status from cache
      const { data: cache } = await supabase
        .from('cache')
        .select('value')
        .eq('key', 'pumpfun_websocket_stats')
        .maybeSingle();
        
      return new Response(JSON.stringify({
        success: true,
        stats: cache?.value || { connected: false, tokensReceived: 0 },
        config
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'listen') {
      const duration = parseInt(url.searchParams.get('duration') || '30') * 1000;
      const maxDuration = 55000;
      const listenDuration = Math.min(duration, maxDuration);
      
      console.log(`🎧 Starting PumpPortal WebSocket listener for ${listenDuration/1000}s...`);
      console.log(`   Filtering: pump.fun tokens ONLY (mint ends with "pump")`);
      
      const stats: ListenerStats = {
        connected: false,
        connectedAt: null,
        tokensReceived: 0,
        tokensAdded: 0,
        tokensRejected: 0,
        lastTokenAt: null,
        errors: 0,
        rejectionBreakdown: {},
      };
      
      return new Promise((resolve) => {
        const ws = new WebSocket(PUMPPORTAL_WS_URL);
        
        const timeout = setTimeout(() => {
          console.log(`⏱️ Listen duration complete, closing connection`);
          ws.close();
        }, listenDuration);
        
        ws.onopen = () => {
          console.log('✅ Connected to PumpPortal WebSocket');
          stats.connected = true;
          stats.connectedAt = new Date().toISOString();
          
          // Subscribe to new token events
          ws.send(JSON.stringify({
            method: 'subscribeNewToken'
          }));
          console.log('📡 Subscribed to new token events');
        };
        
        ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle subscription confirmation
            if (data.message) {
              console.log(`📨 ${data.message}`);
              return;
            }
            
            // Handle new token event
            if (data.txType === 'create' && data.mint) {
              stats.tokensReceived++;
              stats.lastTokenAt = new Date().toISOString();
              
              const result = await processNewToken(supabase, data as NewTokenEvent, config);
              
              if (result.success) {
                stats.tokensAdded++;
              } else {
                stats.tokensRejected++;
                // Track rejection reasons
                if (result.reason) {
                  stats.rejectionBreakdown[result.reason] = (stats.rejectionBreakdown[result.reason] || 0) + 1;
                }
              }
            }
          } catch (error) {
            console.error('Error processing message:', error);
            stats.errors++;
          }
        };
        
        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          stats.errors++;
        };
        
        ws.onclose = async () => {
          clearTimeout(timeout);
          console.log('\n📊 Session Summary:');
          console.log(`   Tokens received: ${stats.tokensReceived}`);
          console.log(`   Tokens added: ${stats.tokensAdded}`);
          console.log(`   Tokens rejected: ${stats.tokensRejected}`);
          console.log(`   Rejection breakdown:`, stats.rejectionBreakdown);
          console.log(`   Errors: ${stats.errors}`);
          
          // Cache stats
          await supabase.from('cache').upsert({
            key: 'pumpfun_websocket_stats',
            value: stats,
            expires_at: new Date(Date.now() + 3600000).toISOString()
          }, { onConflict: 'key' });
          
          resolve(new Response(JSON.stringify({
            success: true,
            stats,
            message: `Listened for ${listenDuration/1000}s`
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }));
        };
      });
    }

    // Manual token add (for testing)
    if (action === 'add-token') {
      const { mint } = await req.json();
      
      if (!mint) {
        return new Response(JSON.stringify({ error: 'mint required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Fetch token info from Solana Tracker
      const response = await fetch(`https://data.solanatracker.io/tokens/${mint}`);
      if (!response.ok) {
        return new Response(JSON.stringify({ error: 'Token not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      const tokenData = await response.json();
      
      // Check token age
      const createdAt = tokenData.events?.createdAt;
      if (createdAt) {
        const ageMinutes = (Date.now() - createdAt * 1000) / 60000;
        if (ageMinutes > MAX_TOKEN_AGE_MINUTES) {
          return new Response(JSON.stringify({ 
            error: 'Token too old',
            ageMinutes: Math.round(ageMinutes),
            maxAgeMinutes: MAX_TOKEN_AGE_MINUTES
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }
      
      // Validate ticker
      const symbol = tokenData.token?.symbol || '???';
      const name = tokenData.token?.name || 'Unknown';
      
      if (symbol.length > config.max_ticker_length) {
        return new Response(JSON.stringify({ 
          error: 'Ticker too long',
          tickerLength: symbol.length,
          maxLength: config.max_ticker_length
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      if (containsBadEmoji(symbol)) {
        return new Response(JSON.stringify({ error: 'Ticker contains bad emoji characters' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Check Mayhem Mode
      const isMayhem = await checkMayhemMode(mint);
      if (isMayhem) {
        return new Response(JSON.stringify({ error: 'Token in Mayhem Mode' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Insert token
      const { error } = await supabase.from('pumpfun_watchlist').insert({
        token_mint: mint,
        token_name: name,
        token_symbol: symbol,
        creator_wallet: tokenData.token?.creator || null,
        status: 'pending_triage',
        source: 'manual',
        created_at_blockchain: createdAt ? new Date(createdAt * 1000).toISOString() : null,
        holder_count: tokenData.holders || 0,
        market_cap_sol: tokenData.pools?.[0]?.marketCap?.quote || 0,
        has_image: !!tokenData.token?.image,
        socials_count: 0,
      });
      
      if (error) {
        const code = (error as any)?.code;
        const msg = (error as any)?.message || '';

        if (code === '23505' && msg.includes('pumpfun_watchlist_unique_live_symbol')) {
          return new Response(JSON.stringify({ error: 'Duplicate ticker already exists (live queue)' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        return new Response(JSON.stringify({ error: msg }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Added ${symbol} to watchlist` 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ 
      error: 'Unknown action',
      validActions: ['listen', 'status', 'add-token']
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
