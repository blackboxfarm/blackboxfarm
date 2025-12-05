import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

// Known tokens to NEVER flag as new mints (stablecoins, wSOL, etc.)
const KNOWN_TOKENS = new Set([
  'So11111111111111111111111111111111111111112',  // wSOL
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // USDT
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',  // mSOL
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', // BONK
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj', // stSOL
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  // JUP
  'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE',  // ORCA
  'RLBxxFkseAZ4RgJH3Sqn8jXxhmGoz9jWxDNJMh8pL7a',  // RLBB
  'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3', // PYTH
]);

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  feePayer: string;
  tokenTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    mint: string;
    tokenAmount: number;
    tokenStandard?: string;
  }>;
  nativeTransfers?: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges?: Array<{
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      userAccount: string;
    }>;
  }>;
  instructions?: Array<{
    programId: string;
    accounts: string[];
    data: string;
  }>;
}

// KILL SWITCH - Set to true to disable all processing
const WEBHOOK_DISABLED = true;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Early exit if disabled
  if (WEBHOOK_DISABLED) {
    return new Response(JSON.stringify({ status: 'disabled', message: 'Webhook processing is currently disabled' }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const payload = await req.json();
    const transactions: HeliusTransaction[] = Array.isArray(payload) ? payload : [payload];
    
    console.log(`[MEGA-WHALE-WEBHOOK] Processing ${transactions.length} transactions`);

    // Get all active mega whales and their offspring
    const { data: megaWhales } = await supabase
      .from('mega_whales')
      .select('id, user_id, wallet_address, nickname')
      .eq('is_active', true);

    if (!megaWhales?.length) {
      console.log('[MEGA-WHALE-WEBHOOK] No active mega whales found');
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const megaWhaleAddresses = new Set(megaWhales.map(mw => mw.wallet_address));
    const megaWhaleMap = new Map(megaWhales.map(mw => [mw.wallet_address, mw]));

    // Get all offspring wallets
    const { data: allOffspring } = await supabase
      .from('mega_whale_offspring')
      .select('id, mega_whale_id, wallet_address, depth_level, parent_offspring_id');

    const offspringMap = new Map<string, any>();
    const offspringByWhale = new Map<string, any[]>();
    
    allOffspring?.forEach(o => {
      offspringMap.set(o.wallet_address, o);
      const existing = offspringByWhale.get(o.mega_whale_id) || [];
      existing.push(o);
      offspringByWhale.set(o.mega_whale_id, existing);
    });

    const allTrackedAddresses = new Set([
      ...megaWhaleAddresses,
      ...(allOffspring?.map(o => o.wallet_address) || [])
    ]);

    let alertsCreated = 0;
    let offspringCreated = 0;
    
    // Track patterns for this batch
    const fundingsByWhale = new Map<string, { count: number; addresses: string[]; total_sol: number }>();
    const buysByToken = new Map<string, { buyers: string[]; whale_id: string; user_id: string }>();

    for (const tx of transactions) {
      const feePayer = tx.feePayer;
      const timestamp = new Date(tx.timestamp * 1000).toISOString();

      // Check if fee payer is a mega whale - detect new offspring
      if (megaWhaleAddresses.has(feePayer)) {
        const megaWhale = megaWhaleMap.get(feePayer)!;
        
        // Check native transfers (SOL sent to new wallets)
        for (const transfer of tx.nativeTransfers || []) {
          if (transfer.fromUserAccount === feePayer && 
              transfer.amount > 0.001 * 1e9 && // More than 0.001 SOL
              !allTrackedAddresses.has(transfer.toUserAccount)) {
            
            // Track funding for pattern detection
            const existing = fundingsByWhale.get(megaWhale.id) || { count: 0, addresses: [], total_sol: 0 };
            existing.count++;
            existing.addresses.push(transfer.toUserAccount);
            existing.total_sol += transfer.amount / 1e9;
            fundingsByWhale.set(megaWhale.id, existing);
            
            // New offspring wallet detected at depth 1
            const { data: newOffspring, error } = await supabase
              .from('mega_whale_offspring')
              .upsert({
                mega_whale_id: megaWhale.id,
                wallet_address: transfer.toUserAccount,
                depth_level: 1,
                first_funded_at: timestamp,
                total_sol_received: transfer.amount / 1e9
              }, { onConflict: 'mega_whale_id,wallet_address' })
              .select()
              .single();

            if (!error && newOffspring) {
              offspringCreated++;
              allTrackedAddresses.add(transfer.toUserAccount);
              offspringMap.set(transfer.toUserAccount, newOffspring);
              
              // Atomically increment offspring count
              await supabase.rpc('increment_offspring_count', { whale_id: megaWhale.id, amount: 1 });
              
              console.log(`[MEGA-WHALE-WEBHOOK] New offspring detected: ${transfer.toUserAccount} from ${megaWhale.nickname || megaWhale.wallet_address.slice(0, 8)}`);
            }
          }
        }
      }

      // Check if fee payer is an offspring - detect deeper offspring or token activity
      if (offspringMap.has(feePayer)) {
        const offspring = offspringMap.get(feePayer);
        const megaWhale = megaWhales.find(mw => mw.id === offspring.mega_whale_id);

        if (!megaWhale) continue;

        // Detect SOL transfers to new wallets (creating deeper offspring)
        if (offspring.depth_level < 4) {
          for (const transfer of tx.nativeTransfers || []) {
            if (transfer.fromUserAccount === feePayer && 
                transfer.amount > 0.001 * 1e9 &&
                !allTrackedAddresses.has(transfer.toUserAccount)) {
              
              const { data: newOffspring, error } = await supabase
                .from('mega_whale_offspring')
                .upsert({
                  mega_whale_id: megaWhale.id,
                  wallet_address: transfer.toUserAccount,
                  depth_level: offspring.depth_level + 1,
                  parent_offspring_id: offspring.id,
                  first_funded_at: timestamp,
                  total_sol_received: transfer.amount / 1e9
                }, { onConflict: 'mega_whale_id,wallet_address' })
                .select()
                .single();

              if (!error && newOffspring) {
                offspringCreated++;
                allTrackedAddresses.add(transfer.toUserAccount);
                offspringMap.set(transfer.toUserAccount, newOffspring);
                
                // Atomically increment offspring count
                await supabase.rpc('increment_offspring_count', { whale_id: megaWhale.id, amount: 1 });
                
                console.log(`[MEGA-WHALE-WEBHOOK] Depth ${newOffspring.depth_level} offspring: ${transfer.toUserAccount}`);
              }
            }
          }
        }

        // Detect token mints
        const mintInstructions = tx.instructions?.filter(i => 
          i.programId === TOKEN_PROGRAM_ID || i.programId === PUMP_PROGRAM_ID
        ) || [];

        const isPumpFunInteraction = tx.instructions?.some(i => i.programId === PUMP_PROGRAM_ID);
        
        if (isPumpFunInteraction) {
          await supabase
            .from('mega_whale_offspring')
            .update({ is_pump_fun_dev: true })
            .eq('id', offspring.id);
        }

        // Detect token buys and sells
        for (const transfer of tx.tokenTransfers || []) {
          // Skip known tokens (wSOL, USDC, etc.)
          if (KNOWN_TOKENS.has(transfer.mint)) continue;
          
          const isBuy = transfer.toUserAccount === feePayer && transfer.tokenAmount > 0;
          const isSell = transfer.fromUserAccount === feePayer && transfer.tokenAmount > 0;

          if (isBuy || isSell) {
            // Check for duplicate alert (same token + same signature)
            const { data: existingAlert } = await supabase
              .from('mega_whale_token_alerts')
              .select('id')
              .eq('token_mint', transfer.mint)
              .eq('metadata->>signature', tx.signature)
              .maybeSingle();
            
            if (existingAlert) {
              console.log(`[MEGA-WHALE-WEBHOOK] Skipping duplicate alert for ${transfer.mint}`);
              continue;
            }
            
            // Get token metadata
            const tokenMeta = await fetchTokenMetadata(supabase, transfer.mint);
            
            // Calculate SOL amount from native transfers
            let solAmount = 0;
            for (const native of tx.nativeTransfers || []) {
              if (isBuy && native.fromUserAccount === feePayer) {
                solAmount += native.amount / 1e9;
              } else if (isSell && native.toUserAccount === feePayer) {
                solAmount += native.amount / 1e9;
              }
            }

            // Track coordinated buys
            if (isBuy) {
              const tokenKey = `${megaWhale.id}:${transfer.mint}`;
              const existing = buysByToken.get(tokenKey) || { buyers: [], whale_id: megaWhale.id, user_id: megaWhale.user_id };
              if (!existing.buyers.includes(feePayer)) {
                existing.buyers.push(feePayer);
              }
              buysByToken.set(tokenKey, existing);
              
              // Notify auto-trader of buy activity
              await supabase.functions.invoke('mega-whale-auto-trader', {
                body: { action: 'increment_buy_count', token_mint: transfer.mint }
              }).catch(() => {}); // Don't fail if auto-trader isn't ready
            }

            // Build funding chain
            const fundingChain = await buildFundingChain(supabase, offspring, megaWhale);

            // Create alert
            const { error: alertError } = await supabase
              .from('mega_whale_token_alerts')
              .insert({
                user_id: megaWhale.user_id,
                mega_whale_id: megaWhale.id,
                offspring_id: offspring.id,
                alert_type: isBuy ? 'token_buy' : 'token_sell',
                token_mint: transfer.mint,
                token_symbol: tokenMeta?.symbol,
                token_name: tokenMeta?.name,
                token_image: tokenMeta?.image,
                amount_sol: solAmount,
                funding_chain: fundingChain,
                detected_at: timestamp,
                metadata: {
                  signature: tx.signature,
                  token_amount: transfer.tokenAmount,
                  offspring_wallet: feePayer,
                  depth_level: offspring.depth_level
                }
              });

            if (!alertError) {
              alertsCreated++;
              console.log(`[MEGA-WHALE-WEBHOOK] Alert: ${isBuy ? 'BUY' : 'SELL'} ${tokenMeta?.symbol || transfer.mint.slice(0, 8)} by offspring at depth ${offspring.depth_level}`);
            }

            // Update offspring with token activity
            await supabase.from('mega_whale_offspring')
              .update({ is_active_trader: true, last_activity_at: timestamp })
              .eq('id', offspring.id);
          }
        }

        // Detect token mints (creator is the fee payer)
        if (tx.type === 'CREATE' || tx.type === 'TOKEN_MINT' || mintInstructions.length > 0) {
          // Check if any new tokens were created
          for (const transfer of tx.tokenTransfers || []) {
            // Skip known tokens (wSOL, USDC, etc.) - these are NOT new mints
            if (KNOWN_TOKENS.has(transfer.mint)) continue;
            
            if (transfer.toUserAccount === feePayer && transfer.tokenAmount > 0) {
              // Check for duplicate mint alert
              const { data: existingMint } = await supabase
                .from('mega_whale_token_alerts')
                .select('id')
                .eq('token_mint', transfer.mint)
                .eq('alert_type', 'token_mint')
                .maybeSingle();
              
              if (existingMint) {
                console.log(`[MEGA-WHALE-WEBHOOK] Skipping duplicate mint alert for ${transfer.mint}`);
                continue;
              }
              
              const tokenMeta = await fetchTokenMetadata(supabase, transfer.mint);
              const fundingChain = await buildFundingChain(supabase, offspring, megaWhale);
              
              // Fetch actual token creation time from pump.fun
              const tokenCreatedAt = await getTokenCreationTime(transfer.mint);
              const marketCapData = await getTokenMarketData(transfer.mint);

              const { error: alertError } = await supabase
                .from('mega_whale_token_alerts')
                .insert({
                  user_id: megaWhale.user_id,
                  mega_whale_id: megaWhale.id,
                  offspring_id: offspring.id,
                  alert_type: 'token_mint',
                  token_mint: transfer.mint,
                  token_symbol: tokenMeta?.symbol,
                  token_name: tokenMeta?.name,
                  token_image: tokenMeta?.image,
                  funding_chain: fundingChain,
                  detected_at: timestamp,
                  token_created_at: tokenCreatedAt,
                  market_cap_at_detection: marketCapData?.marketCap,
                  bonding_curve_progress: marketCapData?.bondingProgress,
                  metadata: {
                    signature: tx.signature,
                    creator_wallet: feePayer,
                    depth_level: offspring.depth_level,
                    is_pump_fun: isPumpFunInteraction
                  }
                });

              if (!alertError) {
                alertsCreated++;
                
                // Update mega whale stats
                await supabase
                  .from('mega_whales')
                  .update({ 
                    total_tokens_minted: megaWhale.total_tokens_minted + 1,
                    last_activity_at: timestamp
                  })
                  .eq('id', megaWhale.id);

                console.log(`[MEGA-WHALE-WEBHOOK] TOKEN MINT ALERT: ${tokenMeta?.symbol || transfer.mint.slice(0, 8)} by depth-${offspring.depth_level} offspring`);
                
                // Create pattern alert for mint
                await createPatternAlert(supabase, {
                  user_id: megaWhale.user_id,
                  mega_whale_id: megaWhale.id,
                  alert_type: 'new_launch_imminent',
                  severity: 'critical',
                  title: `🚀 New Token Minted: ${tokenMeta?.symbol || 'Unknown'}`,
                  description: `Offspring wallet at depth ${offspring.depth_level} just minted a new token. This could be a new launch opportunity.`,
                  metadata: {
                    token_mint: transfer.mint,
                    token_symbol: tokenMeta?.symbol,
                    token_name: tokenMeta?.name,
                    creator_wallet: feePayer,
                    signature: tx.signature,
                    token_created_at: tokenCreatedAt,
                    market_cap: marketCapData?.marketCap
                  }
                });
                
                // Check if user has auto-buy enabled and create pending trade
                const { data: alertConfig } = await supabase
                  .from('mega_whale_alert_config')
                  .select('*')
                  .eq('user_id', megaWhale.user_id)
                  .single();
                
                if (alertConfig?.auto_buy_on_mint) {
                  const { error: tradeError } = await supabase
                    .from('mega_whale_auto_trades')
                    .insert({
                      user_id: megaWhale.user_id,
                      mega_whale_id: megaWhale.id,
                      token_mint: transfer.mint,
                      token_symbol: tokenMeta?.symbol,
                      token_name: tokenMeta?.name,
                      trade_type: 'buy',
                      status: 'pending',
                      amount_sol: alertConfig.auto_buy_amount_sol || 0.5,
                      buys_required: alertConfig.auto_buy_wait_for_buys || 5,
                      monitoring_started_at: new Date().toISOString(),
                      monitoring_expires_at: new Date(Date.now() + (alertConfig.auto_buy_max_wait_minutes || 5) * 60 * 1000).toISOString()
                    });
                  
                  if (!tradeError) {
                    console.log(`[MEGA-WHALE-WEBHOOK] Auto-trade pending for ${tokenMeta?.symbol}, waiting for ${alertConfig.auto_buy_wait_for_buys} buys`);
                  }
                }
              }
            }
          }
        }
      }
    }

    // PATTERN DETECTION - Check for funding bursts
    for (const [whaleId, funding] of fundingsByWhale) {
      const megaWhale = megaWhales.find(mw => mw.id === whaleId);
      if (!megaWhale) continue;
      
      // Get user's config for thresholds
      const { data: alertConfig } = await supabase
        .from('mega_whale_alert_config')
        .select('*')
        .eq('user_id', megaWhale.user_id)
        .single();
      
      const threshold = alertConfig?.funding_burst_count || 5;
      
      if (funding.count >= threshold) {
        await createPatternAlert(supabase, {
          user_id: megaWhale.user_id,
          mega_whale_id: megaWhale.id,
          alert_type: 'funding_burst',
          severity: 'high',
          title: `⚡ Funding Burst: ${funding.count} wallets funded`,
          description: `${megaWhale.nickname || 'Mega whale'} just funded ${funding.count} wallets with ${funding.total_sol.toFixed(2)} SOL total. This often indicates imminent bundle/launch activity.`,
          metadata: {
            wallets_funded: funding.count,
            total_sol: funding.total_sol,
            addresses: funding.addresses.slice(0, 10) // First 10 for reference
          }
        });
      }
    }
    
    // PATTERN DETECTION - Check for coordinated buys
    for (const [tokenKey, buyData] of buysByToken) {
      const [whaleId, tokenMint] = tokenKey.split(':');
      const megaWhale = megaWhales.find(mw => mw.id === whaleId);
      if (!megaWhale) continue;
      
      const { data: alertConfig } = await supabase
        .from('mega_whale_alert_config')
        .select('*')
        .eq('user_id', megaWhale.user_id)
        .single();
      
      const threshold = alertConfig?.coordinated_buy_count || 3;
      
      if (buyData.buyers.length >= threshold) {
        const tokenMeta = await fetchTokenMetadata(supabase, tokenMint);
        
        await createPatternAlert(supabase, {
          user_id: megaWhale.user_id,
          mega_whale_id: megaWhale.id,
          alert_type: 'coordinated_buy',
          severity: 'high',
          title: `🎯 Coordinated Buy: ${tokenMeta?.symbol || tokenMint.slice(0, 8)}`,
          description: `${buyData.buyers.length} offspring wallets are buying ${tokenMeta?.symbol || 'this token'} simultaneously. This is a strong pump signal.`,
          metadata: {
            token_mint: tokenMint,
            token_symbol: tokenMeta?.symbol,
            buyers_count: buyData.buyers.length,
            buyer_addresses: buyData.buyers.slice(0, 5)
          }
        });
      }
    }

    console.log(`[MEGA-WHALE-WEBHOOK] Complete: ${alertsCreated} alerts, ${offspringCreated} new offspring`);

    return new Response(
      JSON.stringify({ 
        processed: transactions.length,
        alerts_created: alertsCreated,
        offspring_created: offspringCreated
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[MEGA-WHALE-WEBHOOK] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function createPatternAlert(supabase: any, alert: {
  user_id: string;
  mega_whale_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  metadata?: any;
}): Promise<void> {
  try {
    const { data: newAlert, error } = await supabase
      .from('mega_whale_pattern_alerts')
      .insert({
        user_id: alert.user_id,
        mega_whale_id: alert.mega_whale_id,
        alert_type: alert.alert_type,
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        metadata: alert.metadata || {},
        expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[MEGA-WHALE-WEBHOOK] Failed to create pattern alert:', error);
      return;
    }

    await supabase.functions.invoke('mega-whale-notifier', {
      body: { alert_id: newAlert.id }
    }).catch((e: any) => console.error('[MEGA-WHALE-WEBHOOK] Notification error:', e));

    console.log(`[MEGA-WHALE-WEBHOOK] Pattern alert created: ${alert.alert_type} - ${alert.title}`);
  } catch (e) {
    console.error('[MEGA-WHALE-WEBHOOK] createPatternAlert error:', e);
  }
}

async function fetchTokenMetadata(supabase: any, mint: string): Promise<{ symbol?: string; name?: string; image?: string } | null> {
  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('token_metadata_cache')
      .select('symbol, name, image')
      .eq('mint', mint)
      .single();

    if (cached?.symbol) return cached;

    let metadata: { symbol?: string; name?: string; image?: string } | null = null;

    // Source 1: Try Helius getAsset
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (heliusApiKey) {
      try {
        const response = await fetch(`https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'metadata',
            method: 'getAsset',
            params: { id: mint }
          })
        });

        const data = await response.json();
        const content = data?.result?.content;
        
        if (content?.metadata?.symbol) {
          metadata = {
            symbol: content.metadata.symbol,
            name: content.metadata.name,
            image: content.links?.image || content.files?.[0]?.uri
          };
        }
      } catch (e) {
        console.log('[MEGA-WHALE-WEBHOOK] Helius metadata fetch failed, trying DexScreener');
      }
    }

    // Source 2: Try DexScreener
    if (!metadata?.symbol) {
      try {
        const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
          headers: { 'Accept': 'application/json' }
        });
        const dexData = await dexResponse.json();
        const pair = dexData?.pairs?.[0];
        
        if (pair?.baseToken) {
          metadata = {
            symbol: pair.baseToken.symbol,
            name: pair.baseToken.name,
            image: pair.info?.imageUrl || metadata?.image
          };
        }
      } catch (e) {
        console.log('[MEGA-WHALE-WEBHOOK] DexScreener metadata fetch failed, trying pump.fun');
      }
    }

    // Source 3: Try pump.fun API for .pump tokens
    if (!metadata?.symbol && mint.endsWith('pump')) {
      try {
        const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
        if (pumpResponse.ok) {
          const pumpData = await pumpResponse.json();
          if (pumpData?.symbol) {
            metadata = {
              symbol: pumpData.symbol,
              name: pumpData.name,
              image: pumpData.image_uri || pumpData.metadata?.image
            };
          }
        }
      } catch (e) {
        console.log('[MEGA-WHALE-WEBHOOK] pump.fun metadata fetch failed');
      }
    }

    // Cache whatever we found (even partial data)
    if (metadata) {
      await supabase
        .from('token_metadata_cache')
        .upsert({ mint, ...metadata, updated_at: new Date().toISOString() })
        .catch(() => {}); // Ignore cache errors

      return metadata;
    }

    // Return truncated mint as fallback symbol
    return { symbol: mint.slice(0, 6) + '...', name: 'Unknown Token', image: null };
  } catch (e) {
    console.error('[MEGA-WHALE-WEBHOOK] Token metadata fetch error:', e);
    return { symbol: mint.slice(0, 6) + '...', name: 'Unknown Token', image: null };
  }
}

// Fetch actual token creation time from pump.fun
async function getTokenCreationTime(mint: string): Promise<string | null> {
  try {
    // For pump.fun tokens, get creation time from API
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (response.ok) {
      const data = await response.json();
      // pump.fun returns created_timestamp as unix ms or ISO string
      if (data.created_timestamp) {
        const ts = typeof data.created_timestamp === 'number' 
          ? new Date(data.created_timestamp).toISOString()
          : data.created_timestamp;
        return ts;
      }
    }
    return null;
  } catch (e) {
    console.log('[MEGA-WHALE-WEBHOOK] Failed to get token creation time:', e);
    return null;
  }
}

// Fetch token market data for buyability assessment
async function getTokenMarketData(mint: string): Promise<{ marketCap: number; bondingProgress: number; price: number } | null> {
  try {
    const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (response.ok) {
      const data = await response.json();
      return {
        marketCap: data.usd_market_cap || 0,
        bondingProgress: data.bonding_curve_progress || 0,
        price: data.price || 0
      };
    }
    return null;
  } catch (e) {
    console.log('[MEGA-WHALE-WEBHOOK] Failed to get token market data:', e);
    return null;
  }
}

async function buildFundingChain(supabase: any, offspring: any, megaWhale: any): Promise<any[]> {
  const chain = [];
  let current = offspring;

  while (current) {
    chain.unshift({
      wallet: current.wallet_address,
      depth: current.depth_level,
      funded_at: current.first_funded_at
    });

    if (current.parent_offspring_id) {
      const { data: parent } = await supabase
        .from('mega_whale_offspring')
        .select('*')
        .eq('id', current.parent_offspring_id)
        .single();
      current = parent;
    } else {
      break;
    }
  }

  // Add the mega whale at the start
  chain.unshift({
    wallet: megaWhale.wallet_address,
    nickname: megaWhale.nickname,
    depth: 0,
    is_source: true
  });

  return chain;
}