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

// Mayhem Mode check - reject if true
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
  event: NewTokenEvent
): Promise<{ success: boolean; reason?: string }> {
  const { mint, name, symbol, traderPublicKey, marketCapSol, uri, vSolInBondingCurve } = event;
  
  console.log(`\n🆕 NEW TOKEN: ${symbol} (${name})`);
  console.log(`   Mint: ${mint}`);
  console.log(`   Creator: ${traderPublicKey}`);
  console.log(`   Initial MC: ${marketCapSol.toFixed(4)} SOL`);
  
  // Check if token already exists
  const { data: existing } = await supabase
    .from('pumpfun_watchlist')
    .select('id')
    .eq('token_mint', mint)
    .maybeSingle();
    
  if (existing) {
    console.log(`   ⏭️ Already in watchlist, skipping`);
    return { success: false, reason: 'already_exists' };
  }
  
  // Quick Mayhem Mode check
  const isMayhem = await checkMayhemMode(mint);
  if (isMayhem) {
    console.log(`   🔴 REJECTED: Mayhem Mode active`);
    
    // Insert as rejected for tracking
    await supabase.from('pumpfun_watchlist').insert({
      token_mint: mint,
      token_name: name,
      token_symbol: symbol,
      creator_wallet: traderPublicKey,
      status: 'rejected',
      rejection_reason: 'mayhem_mode',
      source: 'websocket',
      created_at_blockchain: new Date().toISOString(),
      bonding_curve_pct: (vSolInBondingCurve / 85) * 100, // Rough estimate
      market_cap_sol: marketCapSol,
    });
    
    return { success: false, reason: 'mayhem_mode' };
  }
  
  // Fetch metadata for social links
  let metadata: TokenMetadata | null = null;
  if (uri) {
    metadata = await fetchTokenMetadata(uri);
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
    holder_count: 1, // Just created, only creator
    volume_5m: event.initialBuy || 0,
  });
  
  if (error) {
    console.error(`   ❌ Failed to insert:`, error);
    return { success: false, reason: 'insert_error' };
  }
  
  console.log(`   ✅ Added to watchlist (pending_triage)`);
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

    if (action === 'status') {
      // Return current listener status from cache
      const { data: cache } = await supabase
        .from('cache')
        .select('value')
        .eq('key', 'pumpfun_websocket_stats')
        .maybeSingle();
        
      return new Response(JSON.stringify({
        success: true,
        stats: cache?.value || { connected: false, tokensReceived: 0 }
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
              
              const result = await processNewToken(supabase, data as NewTokenEvent);
              
              if (result.success) {
                stats.tokensAdded++;
              } else {
                stats.tokensRejected++;
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
        token_name: tokenData.token?.name || 'Unknown',
        token_symbol: tokenData.token?.symbol || '???',
        creator_wallet: tokenData.token?.creator || null,
        status: 'pending_triage',
        source: 'manual',
        created_at_blockchain: createdAt ? new Date(createdAt * 1000).toISOString() : null,
        holder_count: tokenData.holders || 0,
        market_cap_sol: tokenData.pools?.[0]?.marketCap?.quote || 0,
      });
      
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: `Added ${tokenData.token?.symbol} to watchlist` 
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
