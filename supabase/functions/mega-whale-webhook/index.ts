import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PUMP_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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
          const isBuy = transfer.toUserAccount === feePayer && transfer.tokenAmount > 0;
          const isSell = transfer.fromUserAccount === feePayer && transfer.tokenAmount > 0;

          if (isBuy || isSell) {
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
            const tokenEntry = {
              mint: transfer.mint,
              symbol: tokenMeta?.symbol,
              amount: transfer.tokenAmount,
              sol_amount: solAmount,
              timestamp
            };

            if (isBuy) {
              await supabase.rpc('append_to_jsonb_array', {
                table_name: 'mega_whale_offspring',
                column_name: 'tokens_bought',
                row_id: offspring.id,
                new_value: tokenEntry
              }).catch(() => {
                // Fallback if RPC doesn't exist
                supabase.from('mega_whale_offspring')
                  .update({ is_active_trader: true, last_activity_at: timestamp })
                  .eq('id', offspring.id);
              });
            } else {
              await supabase.from('mega_whale_offspring')
                .update({ is_active_trader: true, last_activity_at: timestamp })
                .eq('id', offspring.id);
            }
          }
        }

        // Detect token mints (creator is the fee payer)
        if (tx.type === 'CREATE' || tx.type === 'TOKEN_MINT' || mintInstructions.length > 0) {
          // Check if any new tokens were created
          for (const transfer of tx.tokenTransfers || []) {
            if (transfer.toUserAccount === feePayer && transfer.tokenAmount > 0) {
              const tokenMeta = await fetchTokenMetadata(supabase, transfer.mint);
              const fundingChain = await buildFundingChain(supabase, offspring, megaWhale);

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
              }
            }
          }
        }
      }
    }

    // Note: offspring counts are now updated atomically via RPC when each offspring is created

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

async function fetchTokenMetadata(supabase: any, mint: string): Promise<{ symbol?: string; name?: string; image?: string } | null> {
  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('token_metadata_cache')
      .select('symbol, name, image')
      .eq('mint', mint)
      .single();

    if (cached) return cached;

    // Fetch from Helius
    const heliusApiKey = Deno.env.get('HELIUS_API_KEY');
    if (!heliusApiKey) return null;

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
    
    if (content) {
      const metadata = {
        symbol: content.metadata?.symbol,
        name: content.metadata?.name,
        image: content.links?.image || content.files?.[0]?.uri
      };

      // Cache it
      await supabase
        .from('token_metadata_cache')
        .upsert({ mint, ...metadata, updated_at: new Date().toISOString() })
        .catch(() => {}); // Ignore cache errors

      return metadata;
    }

    return null;
  } catch (e) {
    console.error('[MEGA-WHALE-WEBHOOK] Token metadata fetch error:', e);
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