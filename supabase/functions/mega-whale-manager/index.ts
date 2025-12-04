import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_DEPTH = 4;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const heliusApiKey = Deno.env.get('HELIUS_API_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const { action, user_id, mega_whale_id, wallet_address, nickname, source_cex, notes } = await req.json();

    console.log(`[MEGA-WHALE-MANAGER] Action: ${action}, User: ${user_id}`);

    switch (action) {
      case 'add': {
        // Add a new mega whale
        const { data: megaWhale, error } = await supabase
          .from('mega_whales')
          .insert({
            user_id,
            wallet_address,
            nickname,
            source_cex,
            notes,
            is_active: true
          })
          .select()
          .single();

        if (error) throw error;

        // Start initial historical scan
        const scanResult = await performHistoricalScan(supabase, heliusApiKey, megaWhale);

        // Create webhook for this mega whale's network
        await updateWebhook(supabase, heliusApiKey, user_id);

        return new Response(
          JSON.stringify({ 
            success: true, 
            mega_whale: megaWhale,
            initial_scan: scanResult
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'remove': {
        // Remove mega whale and its offspring
        const { error } = await supabase
          .from('mega_whales')
          .delete()
          .eq('id', mega_whale_id)
          .eq('user_id', user_id);

        if (error) throw error;

        // Update webhook to remove addresses
        await updateWebhook(supabase, heliusApiKey, user_id);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'scan': {
        // Perform historical scan for a specific mega whale
        const { data: megaWhale } = await supabase
          .from('mega_whales')
          .select('*')
          .eq('id', mega_whale_id)
          .eq('user_id', user_id)
          .single();

        if (!megaWhale) {
          return new Response(
            JSON.stringify({ error: 'Mega whale not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const scanResult = await performHistoricalScan(supabase, heliusApiKey, megaWhale);

        // Update webhook with new addresses
        await updateWebhook(supabase, heliusApiKey, user_id);

        return new Response(
          JSON.stringify({ success: true, scan_result: scanResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
        // Get status of mega whale monitoring
        const { data: megaWhales } = await supabase
          .from('mega_whales')
          .select(`
            *,
            offspring:mega_whale_offspring(count),
            alerts:mega_whale_token_alerts(count)
          `)
          .eq('user_id', user_id);

        const { data: config } = await supabase
          .from('mega_whales')
          .select('helius_webhook_id')
          .eq('user_id', user_id)
          .not('helius_webhook_id', 'is', null)
          .limit(1)
          .single();

        return new Response(
          JSON.stringify({ 
            mega_whales: megaWhales,
            webhook_active: !!config?.helius_webhook_id,
            webhook_id: config?.helius_webhook_id
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'start_monitoring': {
        await updateWebhook(supabase, heliusApiKey, user_id);
        return new Response(
          JSON.stringify({ success: true, message: 'Monitoring started' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'stop_monitoring': {
        // Delete existing webhook
        const { data: megaWhales } = await supabase
          .from('mega_whales')
          .select('helius_webhook_id')
          .eq('user_id', user_id)
          .not('helius_webhook_id', 'is', null);

        for (const mw of megaWhales || []) {
          if (mw.helius_webhook_id) {
            await fetch(`https://api.helius.xyz/v0/webhooks/${mw.helius_webhook_id}?api-key=${heliusApiKey}`, {
              method: 'DELETE'
            });
          }
        }

        await supabase
          .from('mega_whales')
          .update({ helius_webhook_id: null })
          .eq('user_id', user_id);

        return new Response(
          JSON.stringify({ success: true, message: 'Monitoring stopped' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Invalid action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[MEGA-WHALE-MANAGER] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function performHistoricalScan(supabase: any, heliusApiKey: string, megaWhale: any): Promise<any> {
  console.log(`[MEGA-WHALE-MANAGER] Starting historical scan for ${megaWhale.wallet_address}`);

  const results = {
    offspring_found: 0,
    transactions_scanned: 0,
    depth_reached: 0
  };

  // Queue of wallets to scan: [wallet_address, depth, parent_offspring_id]
  const queue: [string, number, string | null][] = [[megaWhale.wallet_address, 0, null]];
  const scanned = new Set<string>();

  while (queue.length > 0) {
    const [walletAddress, depth, parentOffspringId] = queue.shift()!;

    if (scanned.has(walletAddress) || depth > MAX_DEPTH) continue;
    scanned.add(walletAddress);

    if (depth > results.depth_reached) {
      results.depth_reached = depth;
    }

    try {
      // Fetch transaction history
      const response = await fetch(`https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=100`);
      const transactions = await response.json();

      if (!Array.isArray(transactions)) continue;

      results.transactions_scanned += transactions.length;

      for (const tx of transactions) {
        // Look for SOL transfers from this wallet
        for (const transfer of tx.nativeTransfers || []) {
          if (transfer.fromUserAccount === walletAddress && 
              transfer.amount > 0.001 * 1e9 && // More than 0.001 SOL
              !scanned.has(transfer.toUserAccount)) {
            
            if (depth < MAX_DEPTH) {
              // This is a potential offspring wallet
              const offspringData: any = {
                mega_whale_id: megaWhale.id,
                wallet_address: transfer.toUserAccount,
                depth_level: depth + 1,
                first_funded_at: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
                total_sol_received: transfer.amount / 1e9
              };

              if (parentOffspringId) {
                offspringData.parent_offspring_id = parentOffspringId;
              }

              const { data: newOffspring, error } = await supabase
                .from('mega_whale_offspring')
                .upsert(offspringData, { onConflict: 'mega_whale_id,wallet_address' })
                .select()
                .single();

              if (!error && newOffspring) {
                results.offspring_found++;
                
                // Add to queue for deeper scanning
                if (depth + 1 < MAX_DEPTH) {
                  queue.push([transfer.toUserAccount, depth + 1, newOffspring.id]);
                }
              }
            }
          }
        }

        // Check for token mints or buys from this wallet
        for (const transfer of tx.tokenTransfers || []) {
          const isMint = tx.type === 'CREATE' || tx.type === 'TOKEN_MINT';
          const isBuy = transfer.toUserAccount === walletAddress && transfer.tokenAmount > 0;
          const isSell = transfer.fromUserAccount === walletAddress && transfer.tokenAmount > 0;

          if ((isMint || isBuy || isSell) && depth > 0) {
            // This is an offspring wallet with token activity - create alert
            const { data: offspring } = await supabase
              .from('mega_whale_offspring')
              .select('id')
              .eq('mega_whale_id', megaWhale.id)
              .eq('wallet_address', walletAddress)
              .single();

            if (offspring) {
              let alertType = 'token_buy';
              if (isMint) alertType = 'token_mint';
              else if (isSell) alertType = 'token_sell';

              // Fetch token metadata
              const tokenMeta = await fetchTokenMetadataSimple(heliusApiKey, transfer.mint);

              await supabase
                .from('mega_whale_token_alerts')
                .insert({
                  user_id: megaWhale.user_id,
                  mega_whale_id: megaWhale.id,
                  offspring_id: offspring.id,
                  alert_type: alertType,
                  token_mint: transfer.mint,
                  token_symbol: tokenMeta?.symbol,
                  token_name: tokenMeta?.name,
                  token_image: tokenMeta?.image,
                  detected_at: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
                  metadata: {
                    signature: tx.signature,
                    historical_scan: true,
                    depth_level: depth
                  }
                });

              // Update offspring as active trader
              await supabase
                .from('mega_whale_offspring')
                .update({ is_active_trader: true })
                .eq('id', offspring.id);
            }
          }
        }
      }

      // Rate limiting - wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));

    } catch (e) {
      console.error(`[MEGA-WHALE-MANAGER] Error scanning ${walletAddress}:`, e);
    }
  }

  // Update mega whale stats
  await supabase
    .from('mega_whales')
    .update({ 
      total_offspring_wallets: results.offspring_found,
      last_activity_at: new Date().toISOString()
    })
    .eq('id', megaWhale.id);

  console.log(`[MEGA-WHALE-MANAGER] Scan complete:`, results);
  return results;
}

async function updateWebhook(supabase: any, heliusApiKey: string, userId: string): Promise<void> {
  // Get all mega whales and their offspring for this user
  const { data: megaWhales } = await supabase
    .from('mega_whales')
    .select('id, wallet_address, helius_webhook_id')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (!megaWhales?.length) return;

  const { data: offspring } = await supabase
    .from('mega_whale_offspring')
    .select('wallet_address, mega_whale_id')
    .in('mega_whale_id', megaWhales.map((mw: any) => mw.id));

  // Collect all addresses to monitor
  const addresses = new Set<string>();
  megaWhales.forEach((mw: any) => addresses.add(mw.wallet_address));
  offspring?.forEach((o: any) => addresses.add(o.wallet_address));

  const addressArray = Array.from(addresses);
  console.log(`[MEGA-WHALE-MANAGER] Updating webhook with ${addressArray.length} addresses`);

  // Delete existing webhook if any
  const existingWebhookId = megaWhales[0]?.helius_webhook_id;
  if (existingWebhookId) {
    await fetch(`https://api.helius.xyz/v0/webhooks/${existingWebhookId}?api-key=${heliusApiKey}`, {
      method: 'DELETE'
    }).catch(() => {});
  }

  // Create new webhook
  const webhookUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/mega-whale-webhook`;
  
  const response = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${heliusApiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhookURL: webhookUrl,
      transactionTypes: ['ANY'],
      accountAddresses: addressArray,
      webhookType: 'enhanced'
    })
  });

  const webhookData = await response.json();

  if (webhookData.webhookID) {
    // Update all mega whales with the new webhook ID
    await supabase
      .from('mega_whales')
      .update({ helius_webhook_id: webhookData.webhookID })
      .eq('user_id', userId);

    console.log(`[MEGA-WHALE-MANAGER] Webhook created: ${webhookData.webhookID}`);
  } else {
    console.error('[MEGA-WHALE-MANAGER] Failed to create webhook:', webhookData);
  }
}

async function fetchTokenMetadataSimple(heliusApiKey: string, mint: string): Promise<any> {
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
    
    return content ? {
      symbol: content.metadata?.symbol,
      name: content.metadata?.name,
      image: content.links?.image || content.files?.[0]?.uri
    } : null;
  } catch {
    return null;
  }
}