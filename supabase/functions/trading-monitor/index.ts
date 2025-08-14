import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface RunnerConfig {
  tokenMint: string;
  tradeSizeUsd: number;
  intervalSec: number;
  anchorWindowSec: number;
  dipPct: number;
  takeProfitPct: number;
  stopLossPct: number;
  cooldownSec: number;
  dailyCapUsd: number;
  slippageBps: number;
  quoteAsset: 'SOL' | 'USDC';
  trailArmPct: number;
  trailingDropPct: number;
  slowdownConfirmTicks: number;
  adaptiveTrails?: boolean;
  rocWindowSec?: number;
  upSensitivityBpsPerPct?: number;
  maxUpBiasBps?: number;
  downSensitivityBpsPerPct?: number;
  maxDownBiasBps?: number;
  separateLots: boolean;
  maxConcurrentLots: number;
  bigDipFloorDropPct: number;
  bigDipHoldMinutes: number;
  secondLotTradeSizeUsd?: number;
  confirmPolicy: 'confirmed' | 'processed' | 'none';
  feeOverrideMicroLamports?: number;
}

interface TradingSession {
  id: string;
  user_id: string;
  is_active: boolean;
  token_mint: string;
  config: RunnerConfig;
  start_mode: 'buying' | 'selling';
  session_start_time: string;
  last_activity: string;
  daily_buy_usd: number;
  daily_key: string;
}

interface Position {
  id: string;
  session_id: string;
  lot_id: string;
  entry_price: number;
  high_price: number;
  quantity_raw: number;
  quantity_ui: number;
  entry_timestamp: string;
  owner_pubkey: string;
  owner_secret: string;
  status: string;
}

// Utility functions
const format = (n: number, d = 4) => {
  return Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : "-";
};

const logActivity = async (sessionId: string, message: string, level: string = 'info', metadata: any = {}) => {
  await supabase.from('activity_logs').insert({
    session_id: sessionId,
    message,
    log_level: level,
    metadata
  });
  console.log(`[${sessionId}] ${level.toUpperCase()}: ${message}`);
};

// Price fetching functions
const fetchJupPriceUSD = async (mint: string): Promise<number | null> => {
  // 1) DexScreener
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.pairs?.[0]?.priceUsd);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  
  // 2) Jupiter fallback
  try {
    const r = await fetch(`https://price.jup.ag/v6/price?ids=${encodeURIComponent(mint)}&vsToken=USDC`, { cache: 'no-store' });
    if (r.ok) {
      const j = await r.json();
      const p = Number(j?.data?.[mint]?.price);
      if (Number.isFinite(p) && p > 0) return p;
    }
  } catch {}
  
  return null;
};

// Emergency sell monitoring
const checkEmergencySells = async (session: TradingSession, currentPrice: number) => {
  const { data: emergencySells } = await supabase
    .from('emergency_sells')
    .select('*')
    .eq('session_id', session.id)
    .eq('is_active', true);

  if (!emergencySells || emergencySells.length === 0) return;

  for (const sell of emergencySells) {
    if (currentPrice <= sell.limit_price) {
      await logActivity(session.id, `🚨 EMERGENCY SELL TRIGGERED! Price $${format(currentPrice, 6)} reached limit $${format(sell.limit_price, 6)}`, 'warn');
      
      // Get all active positions for this session
      const { data: positions } = await supabase
        .from('trading_positions')
        .select('*')
        .eq('session_id', session.id)
        .eq('status', 'active');

      if (positions && positions.length > 0) {
        // Execute sell for all positions
        for (const position of positions) {
          await executeEmergencySell(session, position);
        }
      }

      // Deactivate emergency sell
      await supabase
        .from('emergency_sells')
        .update({ is_active: false })
        .eq('id', sell.id);
    }
  }
};

const executeEmergencySell = async (session: TradingSession, position: Position) => {
  try {
    await logActivity(session.id, `🚨 Executing emergency sell for position ${position.lot_id}`, 'warn');
    
    // Call the existing raydium-swap function
    const { data, error } = await supabase.functions.invoke('raydium-swap', {
      body: {
        side: 'sell',
        tokenMint: session.token_mint,
        sellAmountRaw: position.quantity_raw.toString(),
        confirmPolicy: session.config.confirmPolicy,
        slippageBps: session.config.slippageBps,
        feeOverrideMicroLamports: session.config.feeOverrideMicroLamports
      },
      headers: {
        'x-owner-secret': position.owner_secret,
        'x-function-token': Deno.env.get('FUNCTION_TOKEN')
      }
    });

    if (error) {
      await logActivity(session.id, `❌ Emergency sell failed: ${error.message}`, 'error');
      return;
    }

    // Update position status
    await supabase
      .from('trading_positions')
      .update({ status: 'sold' })
      .eq('id', position.id);

    // Record trade
    await supabase.from('trade_history').insert({
      session_id: session.id,
      position_id: position.id,
      trade_type: 'sell',
      token_mint: session.token_mint,
      price_usd: 0, // Emergency sell price
      quantity_ui: position.quantity_ui,
      usd_amount: 0,
      signatures: data?.signatures || [],
      owner_pubkey: position.owner_pubkey,
      status: 'confirmed'
    });

    await logActivity(session.id, `✅ Emergency sell completed for position ${position.lot_id}`, 'info');
  } catch (error) {
    await logActivity(session.id, `❌ Emergency sell error: ${error.message}`, 'error');
  }
};

// Main trading logic for a single session
const processTradingSession = async (session: TradingSession) => {
  try {
    await logActivity(session.id, `🔄 Processing session for ${session.token_mint}`, 'info');
    
    // Get current price
    const currentPrice = await fetchJupPriceUSD(session.token_mint);
    if (!currentPrice) {
      await logActivity(session.id, `⚠️ Could not fetch price for ${session.token_mint}`, 'warn');
      return;
    }

    // Update last activity
    await supabase
      .from('trading_sessions')
      .update({ last_activity: new Date().toISOString() })
      .eq('id', session.id);

    // Check emergency sells first
    await checkEmergencySells(session, currentPrice);

    // Get current positions
    const { data: positions } = await supabase
      .from('trading_positions')
      .select('*')
      .eq('session_id', session.id)
      .eq('status', 'active');

    await logActivity(session.id, `📊 Current price: $${format(currentPrice, 6)} | Active positions: ${positions?.length || 0}`, 'info');

    // TODO: Implement full trading logic here
    // This would include:
    // - Position management
    // - Buy/sell decisions based on config
    // - Trailing stops
    // - Volatility assessment
    // - Token switching logic

  } catch (error) {
    await logActivity(session.id, `❌ Error processing session: ${error.message}`, 'error');
  }
};

// Main handler
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🤖 Trading Monitor: Starting cycle...');

    // Get all active trading sessions
    const { data: sessions, error } = await supabase
      .from('trading_sessions')
      .select('*')
      .eq('is_active', true);

    if (error) {
      console.error('Error fetching sessions:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!sessions || sessions.length === 0) {
      console.log('No active trading sessions found');
      return new Response(JSON.stringify({ message: 'No active sessions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${sessions.length} active session(s)`);

    // Process each session
    for (const session of sessions) {
      await processTradingSession(session);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: sessions.length,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Trading monitor error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});