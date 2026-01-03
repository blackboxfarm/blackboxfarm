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
  max_ticker_length: number;
  require_image: boolean;
  min_socials_count: number;
}

// Get config from database
async function getConfig(supabase: any): Promise<IntakeConfig> {
  const { data } = await supabase
    .from('pumpfun_monitor_config')
    .select('max_ticker_length, require_image, min_socials_count')
    .eq('id', 'default')
    .maybeSingle();
    
  return {
    max_ticker_length: data?.max_ticker_length ?? 10,
    require_image: data?.require_image ?? false,
    min_socials_count: data?.min_socials_count ?? 0,
  };
}

// Check if ticker contains emoji or problematic unicode
function containsEmojiOrUnicode(text: string): boolean {
  // Regex to detect emojis and extended unicode (above basic ASCII/Latin)
  const emojiRegex = /[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{FE00}-\u{FEFF}]|[\u{1F900}-\u{1F9FF}]/u;
  // Also reject tickers with unusual unicode characters (keeping basic Latin + numbers)
  const hasEmoji = emojiRegex.test(text);
  // Check for non-basic characters (allow A-Z, a-z, 0-9, and common symbols like $)
  const hasWeirdChars = /[^\x20-\x7E]/.test(text);
  return hasEmoji || hasWeirdChars;
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
  
  // EMOJI/UNICODE CHECK - PERMANENT
  if (event.symbol && containsEmojiOrUnicode(event.symbol)) {
    reasons.push('ticker_emoji_unicode');
    isPermanent = true;
  }
  
  // Also check name for emojis (less strict, but flag it)
  if (event.name && containsEmojiOrUnicode(event.name)) {
    reasons.push('name_emoji_unicode');
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
  
  // === DUPLICATE TICKER CHECK ===
  // Check if same ticker already exists in watching/qualified status (reject scam copies)
  if (symbol) {
    const { data: duplicateTickers, error: dupError } = await supabase
      .from('pumpfun_watchlist')
      .select('id, token_mint, token_symbol, status, first_seen_at, holder_count')
      .eq('token_symbol', symbol.toUpperCase())
      .in('status', ['watching', 'qualified', 'buy_now', 'pending_triage'])
      .order('first_seen_at', { ascending: true })
      .limit(5);
    
    if (!dupError && duplicateTickers && duplicateTickers.length > 0) {
      // There's already a token with this ticker - reject as duplicate
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
  
  // Fetch metadata for social links and image
  let metadata: TokenMetadata | null = null;
  if (uri) {
    metadata = await fetchTokenMetadata(uri);
  }
  
  // Calculate socials count
  const socialsCount = [metadata?.twitter, metadata?.telegram, metadata?.website]
    .filter(s => s && s.trim() !== '').length;
  const hasImage = !!(metadata?.image && metadata.image !== '' && !metadata.image.includes('placeholder'));
  
  // STAGE 0: Intake Validation
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
  const isMayhem = await checkMayhemMode(mint);
  if (isMayhem) {
    console.log(`   🔴 REJECTED: Mayhem Mode active (PERMANENT)`);
    
    await supabase.from('pumpfun_watchlist').insert({
      token_mint: mint,
      token_name: name,
      token_symbol: symbol,
      creator_wallet: traderPublicKey,
      status: 'rejected',
      rejection_reason: 'mayhem_mode',
      rejection_type: 'permanent',
      rejection_reasons: ['mayhem_mode'],
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
      // This action runs a listening session
      // In production, this would be a long-running connection
      // For edge function, we do a short burst listen
      
      const duration = parseInt(url.searchParams.get('duration') || '30') * 1000; // Default 30s
      const maxDuration = 55000; // Edge function timeout limit
      const listenDuration = Math.min(duration, maxDuration);
      
      console.log(`🎧 Starting PumpPortal WebSocket listener for ${listenDuration/1000}s...`);
      
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
            expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour
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
      
      if (containsEmojiOrUnicode(symbol)) {
        return new Response(JSON.stringify({ error: 'Ticker contains emoji/unicode' }), {
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
        socials_count: 0, // Would need to fetch metadata for this
      });
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
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
