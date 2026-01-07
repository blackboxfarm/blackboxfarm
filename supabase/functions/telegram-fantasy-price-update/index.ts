import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Sanity check constants
const MAX_MULTIPLIER = 1000; // Reject price changes > 1000x
const MIN_MULTIPLIER = 0.0001; // Reject if price dropped to essentially zero from a real value
const SUSPICIOUS_THRESHOLD = 100; // Log warning if > 100x

interface TokenData {
  price: number;
  symbol: string | null;
  source: 'jupiter' | 'dexscreener' | 'unknown';
}

interface SanityCheckResult {
  isValid: boolean;
  reason?: string;
  multiplier?: number;
}

// Sanity check: ensure price change is within reasonable bounds
function validatePriceChange(entryPrice: number, currentPrice: number, tokenMint: string): SanityCheckResult {
  if (entryPrice <= 0) {
    return { isValid: false, reason: 'Invalid entry price (zero or negative)' };
  }
  
  if (currentPrice <= 0) {
    return { isValid: false, reason: 'Invalid current price (zero or negative)' };
  }
  
  const multiplier = currentPrice / entryPrice;
  
  // Reject impossibly high gains
  if (multiplier > MAX_MULTIPLIER) {
    console.error(`[SANITY_CHECK_FAILED] Token ${tokenMint}: ${multiplier.toFixed(2)}x gain is impossible (>${MAX_MULTIPLIER}x). Entry: $${entryPrice}, Current: $${currentPrice}`);
    return { 
      isValid: false, 
      reason: `Multiplier ${multiplier.toFixed(2)}x exceeds max ${MAX_MULTIPLIER}x - likely wrong price data`,
      multiplier 
    };
  }
  
  // Reject if entry was substantial but current is essentially zero (likely wrong token)
  if (entryPrice > 0.0000001 && multiplier < MIN_MULTIPLIER) {
    console.error(`[SANITY_CHECK_FAILED] Token ${tokenMint}: ${multiplier.toFixed(8)}x is too low. Entry: $${entryPrice}, Current: $${currentPrice}`);
    return { 
      isValid: false, 
      reason: `Multiplier ${multiplier.toFixed(8)}x below min ${MIN_MULTIPLIER} - likely wrong price data`,
      multiplier 
    };
  }
  
  // Warn on suspicious but not impossible gains
  if (multiplier > SUSPICIOUS_THRESHOLD) {
    console.warn(`[SANITY_CHECK_WARNING] Token ${tokenMint}: ${multiplier.toFixed(2)}x gain is high but possible. Allowing update.`);
  }
  
  return { isValid: true, multiplier };
}

// Fetch token prices and symbols in batch from Jupiter + DexScreener
async function fetchTokenData(tokenMints: string[]): Promise<Record<string, TokenData>> {
  const tokenData: Record<string, TokenData> = {};
  
  if (tokenMints.length === 0) return tokenData;
  
  try {
    // Jupiter supports batching up to 100 tokens
    const batchSize = 100;
    for (let i = 0; i < tokenMints.length; i += batchSize) {
      const batch = tokenMints.slice(i, i + batchSize);
      const ids = batch.join(',');
      
      const response = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`);
      const data = await response.json();
      
      if (data.data) {
        for (const mint of batch) {
          if (data.data[mint]?.price) {
            const price = parseFloat(data.data[mint].price);
            console.log(`[PRICE_SOURCE] Jupiter: ${mint} = $${price}`);
            tokenData[mint] = {
              price,
              symbol: null, // Jupiter doesn't return symbol in price endpoint
              source: 'jupiter'
            };
          }
        }
      }
    }
  } catch (error) {
    console.error('[telegram-fantasy-price-update] Error fetching Jupiter prices:', error);
  }
  
  // Use DexScreener for missing prices AND to get symbols
  const mintsNeedingData = tokenMints.filter(m => !tokenData[m] || !tokenData[m].symbol);
  for (const mint of mintsNeedingData) {
    try {
      const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
      const data = await response.json();
      const pair = data.pairs?.[0];
      if (pair) {
        const priceFromDex = parseFloat(pair.priceUsd || '0');
        const existingPrice = tokenData[mint]?.price;
        
        // If we have Jupiter price, keep it but add symbol; otherwise use DexScreener price
        if (existingPrice) {
          console.log(`[PRICE_SOURCE] DexScreener symbol for ${mint}: ${pair.baseToken?.symbol}, keeping Jupiter price $${existingPrice}`);
          tokenData[mint] = {
            price: existingPrice,
            symbol: pair.baseToken?.symbol || null,
            source: 'jupiter'
          };
        } else {
          console.log(`[PRICE_SOURCE] DexScreener: ${mint} = $${priceFromDex} (${pair.baseToken?.symbol})`);
          tokenData[mint] = {
            price: priceFromDex,
            symbol: pair.baseToken?.symbol || null,
            source: 'dexscreener'
          };
        }
      }
    } catch (error) {
      console.error(`[telegram-fantasy-price-update] Error fetching DexScreener data for ${mint}:`, error);
    }
  }
  
  return tokenData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const { action, positionId } = body;

    // Handle cleanup action
    if (action === 'cleanup') {
      return await handleCleanup(supabase);
    }

    // Handle scan for corrupted data
    if (action === 'scan_corrupted') {
      return await scanCorruptedPositions(supabase);
    }

    // Get open fantasy positions
    let query = supabase
      .from('telegram_fantasy_positions')
      .select('*')
      .eq('status', 'open');

    if (positionId) {
      query = query.eq('id', positionId);
    }

    const { data: positions, error: fetchError } = await query;

    if (fetchError) {
      console.error('[telegram-fantasy-price-update] Error fetching positions:', fetchError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to fetch fantasy positions'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
    }

    if (!positions || positions.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No open fantasy positions',
        updated: 0
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get unique token mints
    const tokenMints = [...new Set(positions.map(p => p.token_mint))];
    console.log(`[telegram-fantasy-price-update] Fetching data for ${tokenMints.length} tokens`);

    // Fetch current prices and symbols
    const tokenData = await fetchTokenData(tokenMints);
    console.log(`[telegram-fantasy-price-update] Got data for ${Object.keys(tokenData).length} tokens`);

    // Update each position
    let updatedCount = 0;
    let skippedCount = 0;
    const updates: any[] = [];
    const skipped: any[] = [];

    for (const position of positions) {
      const data = tokenData[position.token_mint];
      
      if (data?.price !== undefined) {
        const entryPrice = position.entry_price_usd;
        const entryAmount = position.entry_amount_usd;
        
        // SANITY CHECK: Validate price change is reasonable
        const sanityCheck = validatePriceChange(entryPrice, data.price, position.token_mint);
        
        if (!sanityCheck.isValid) {
          skippedCount++;
          skipped.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            entryPrice,
            fetchedPrice: data.price,
            priceSource: data.source,
            reason: sanityCheck.reason,
            multiplier: sanityCheck.multiplier
          });
          continue; // Skip this update
        }
        
        // Calculate current value and PnL
        const tokenAmount = position.token_amount || (entryPrice > 0 ? entryAmount / entryPrice : 0);
        const currentValue = tokenAmount * data.price;
        const pnlUsd = currentValue - entryAmount;
        const pnlPercent = entryAmount > 0 ? ((currentValue - entryAmount) / entryAmount) * 100 : 0;

        // Build update object - include symbol if we got it and position doesn't have one
        const updateObj: Record<string, any> = {
          current_price_usd: data.price,
          unrealized_pnl_usd: pnlUsd,
          unrealized_pnl_percent: pnlPercent
        };
        
        // Update symbol if we have one and position is missing it
        if (data.symbol && !position.token_symbol) {
          updateObj.token_symbol = data.symbol;
        }

        const { error: updateError } = await supabase
          .from('telegram_fantasy_positions')
          .update(updateObj)
          .eq('id', position.id);

        if (!updateError) {
          updatedCount++;
          updates.push({
            id: position.id,
            token: data.symbol || position.token_symbol || position.token_mint.slice(0, 8),
            entryPrice: entryPrice,
            currentPrice: data.price,
            priceSource: data.source,
            pnlUsd: pnlUsd.toFixed(2),
            pnlPercent: pnlPercent.toFixed(2),
            multiplier: sanityCheck.multiplier?.toFixed(2)
          });
        }
      }
    }

    console.log(`[telegram-fantasy-price-update] Updated ${updatedCount}, Skipped ${skippedCount} positions`);
    if (skipped.length > 0) {
      console.log(`[telegram-fantasy-price-update] Skipped positions:`, JSON.stringify(skipped));
    }

    return new Response(JSON.stringify({
      success: true,
      updated: updatedCount,
      skipped: skippedCount,
      totalPositions: positions.length,
      updates,
      skippedDetails: skipped,
      timestamp: new Date().toISOString()
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('[telegram-fantasy-price-update] Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
});

// Scan for corrupted positions with impossible PnL values
async function scanCorruptedPositions(supabase: any) {
  console.log('[telegram-fantasy-price-update] Scanning for corrupted positions...');
  
  const { data: allPositions, error } = await supabase
    .from('telegram_fantasy_positions')
    .select('*');
  
  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
  
  const corrupted: any[] = [];
  
  for (const pos of allPositions || []) {
    const entryPrice = pos.entry_price_usd || 0;
    const currentPrice = pos.current_price_usd || 0;
    const soldPrice = pos.sold_price_usd || 0;
    
    // Check for impossible multipliers
    if (entryPrice > 0) {
      const currentMultiplier = currentPrice / entryPrice;
      const soldMultiplier = soldPrice > 0 ? soldPrice / entryPrice : 0;
      
      if (currentMultiplier > MAX_MULTIPLIER || soldMultiplier > MAX_MULTIPLIER) {
        corrupted.push({
          id: pos.id,
          token_symbol: pos.token_symbol,
          token_mint: pos.token_mint,
          status: pos.status,
          entry_price_usd: entryPrice,
          current_price_usd: currentPrice,
          sold_price_usd: soldPrice,
          current_multiplier: currentMultiplier.toFixed(2),
          sold_multiplier: soldMultiplier.toFixed(2),
          unrealized_pnl_usd: pos.unrealized_pnl_usd,
          realized_pnl_usd: pos.realized_pnl_usd,
          issue: currentMultiplier > MAX_MULTIPLIER ? 'impossible_current_price' : 'impossible_sold_price'
        });
      }
    }
  }
  
  console.log(`[telegram-fantasy-price-update] Found ${corrupted.length} corrupted positions`);
  
  return new Response(JSON.stringify({
    success: true,
    corruptedCount: corrupted.length,
    corrupted,
    scannedTotal: allPositions?.length || 0
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Clean up corrupted positions
async function handleCleanup(supabase: any) {
  const body = await Deno.readTextFile('/dev/stdin').catch(() => '{}');
  const { positionIds, action: cleanupAction } = JSON.parse(body || '{}');
  
  // First scan for corrupted
  const { data: allPositions } = await supabase
    .from('telegram_fantasy_positions')
    .select('*');
  
  const corrupted: any[] = [];
  
  for (const pos of allPositions || []) {
    const entryPrice = pos.entry_price_usd || 0;
    const currentPrice = pos.current_price_usd || 0;
    const soldPrice = pos.sold_price_usd || 0;
    
    if (entryPrice > 0) {
      const currentMultiplier = currentPrice / entryPrice;
      const soldMultiplier = soldPrice > 0 ? soldPrice / entryPrice : 0;
      
      if (currentMultiplier > MAX_MULTIPLIER || soldMultiplier > MAX_MULTIPLIER) {
        corrupted.push(pos);
      }
    }
  }
  
  if (corrupted.length === 0) {
    return new Response(JSON.stringify({
      success: true,
      message: 'No corrupted positions found',
      fixed: 0
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
  
  // Mark corrupted positions
  let fixed = 0;
  for (const pos of corrupted) {
    const { error } = await supabase
      .from('telegram_fantasy_positions')
      .update({
        status: 'corrupted',
        notes: `Auto-flagged: impossible PnL detected. Entry: $${pos.entry_price_usd}, Current: $${pos.current_price_usd}, Sold: $${pos.sold_price_usd}`
      })
      .eq('id', pos.id);
    
    if (!error) fixed++;
  }
  
  return new Response(JSON.stringify({
    success: true,
    fixed,
    totalCorrupted: corrupted.length
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
