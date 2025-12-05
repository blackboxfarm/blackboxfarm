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

        // Perform a quick initial scan (only first-level) for immediate feedback
        const quickScanResult = await performQuickScan(supabase, heliusApiKey, megaWhale);

        // Create webhook for monitoring
        await updateWebhook(supabase, heliusApiKey, user_id);

        return new Response(
          JSON.stringify({ 
            success: true, 
            mega_whale: megaWhale,
            initial_scan: quickScanResult,
            message: 'Mega whale added. Quick scan complete - offspring will be discovered via real-time monitoring.'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'remove': {
        // Remove mega whale and its offspring
        await supabase
          .from('mega_whale_token_alerts')
          .delete()
          .eq('mega_whale_id', mega_whale_id);

        await supabase
          .from('mega_whale_offspring')
          .delete()
          .eq('mega_whale_id', mega_whale_id);

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
        // Perform quick scan for a specific mega whale
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

        const scanResult = await performQuickScan(supabase, heliusApiKey, megaWhale);

        // Update webhook with new addresses
        await updateWebhook(supabase, heliusApiKey, user_id);

        return new Response(
          JSON.stringify({ success: true, scan_result: scanResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'deep_scan': {
        // Perform deeper scan - runs in chunks to avoid timeout
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

        const scanResult = await performDeepScan(supabase, heliusApiKey, megaWhale);
        await updateWebhook(supabase, heliusApiKey, user_id);

        return new Response(
          JSON.stringify({ success: true, scan_result: scanResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'status': {
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

// Quick scan - only first level, limited transactions
async function performQuickScan(supabase: any, heliusApiKey: string, megaWhale: any): Promise<any> {
  console.log(`[MEGA-WHALE-MANAGER] Quick scan for ${megaWhale.wallet_address}`);

  const results = {
    total_scanned: 0,
    new_offspring: 0,
    transactions_scanned: 0
  };

  try {
    // Get existing offspring addresses BEFORE scanning
    const { data: existingOffspring } = await supabase
      .from('mega_whale_offspring')
      .select('wallet_address')
      .eq('mega_whale_id', megaWhale.id);
    
    const existingAddresses = new Set(existingOffspring?.map((o: any) => o.wallet_address) || []);
    console.log(`[MEGA-WHALE-MANAGER] Existing offspring count: ${existingAddresses.size}`);

    // Fetch recent transactions (limited to 50)
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${megaWhale.wallet_address}/transactions?api-key=${heliusApiKey}&limit=50`
    );
    const transactions = await response.json();

    if (!Array.isArray(transactions)) {
      console.log(`[MEGA-WHALE-MANAGER] No transactions found or invalid response`);
      return results;
    }

    results.transactions_scanned = transactions.length;
    const offspringToInsert: any[] = [];

    for (const tx of transactions) {
      // Look for SOL transfers from this wallet
      for (const transfer of tx.nativeTransfers || []) {
        if (transfer.fromUserAccount === megaWhale.wallet_address && 
            transfer.amount > 0.01 * 1e9) { // More than 0.01 SOL
          
          // Check if already in this batch
          const alreadyInBatch = offspringToInsert.find(o => o.wallet_address === transfer.toUserAccount);
          if (!alreadyInBatch) {
            offspringToInsert.push({
              mega_whale_id: megaWhale.id,
              wallet_address: transfer.toUserAccount,
              depth_level: 1,
              first_funded_at: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
              total_sol_received: transfer.amount / 1e9
            });
          }
        }
      }
    }

    results.total_scanned = offspringToInsert.length;
    
    // Calculate truly new offspring (not in existing set)
    const newOffspring = offspringToInsert.filter(o => !existingAddresses.has(o.wallet_address));
    results.new_offspring = newOffspring.length;

    console.log(`[MEGA-WHALE-MANAGER] Scanned ${results.total_scanned} wallets, ${results.new_offspring} are new`);

    // Batch insert offspring (upsert handles duplicates)
    if (offspringToInsert.length > 0) {
      const { error } = await supabase
        .from('mega_whale_offspring')
        .upsert(offspringToInsert, { 
          onConflict: 'mega_whale_id,wallet_address',
          ignoreDuplicates: true
        });

      if (error) {
        console.error('[MEGA-WHALE-MANAGER] Error inserting offspring:', error);
      }
    }

    // Get actual total count from database
    const { count: actualTotal } = await supabase
      .from('mega_whale_offspring')
      .select('*', { count: 'exact', head: true })
      .eq('mega_whale_id', megaWhale.id);

    // Update mega whale stats with REAL total
    await supabase
      .from('mega_whales')
      .update({ 
        total_offspring_wallets: actualTotal || 0,
        last_activity_at: new Date().toISOString()
      })
      .eq('id', megaWhale.id);

    console.log(`[MEGA-WHALE-MANAGER] Quick scan complete. Total offspring in DB: ${actualTotal}`);
    return results;

  } catch (e) {
    console.error(`[MEGA-WHALE-MANAGER] Error in quick scan:`, e);
    return results;
  }
}

// Deep scan - scans offspring wallets up to depth 2 (avoids timeout)
async function performDeepScan(supabase: any, heliusApiKey: string, megaWhale: any): Promise<any> {
  console.log(`[MEGA-WHALE-MANAGER] Deep scan for ${megaWhale.wallet_address}`);

  const results = {
    offspring_found: 0,
    transactions_scanned: 0,
    depth_reached: 0
  };

  // Get existing level-1 offspring
  const { data: level1Offspring } = await supabase
    .from('mega_whale_offspring')
    .select('id, wallet_address')
    .eq('mega_whale_id', megaWhale.id)
    .eq('depth_level', 1)
    .limit(20); // Limit to avoid timeout

  if (!level1Offspring?.length) {
    console.log('[MEGA-WHALE-MANAGER] No level-1 offspring to scan');
    return results;
  }

  results.depth_reached = 2;

  // Scan each level-1 offspring for their transfers
  for (const offspring of level1Offspring) {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${offspring.wallet_address}/transactions?api-key=${heliusApiKey}&limit=30`
      );
      const transactions = await response.json();

      if (!Array.isArray(transactions)) continue;
      results.transactions_scanned += transactions.length;

      for (const tx of transactions) {
        // Look for SOL transfers from this offspring
        for (const transfer of tx.nativeTransfers || []) {
          if (transfer.fromUserAccount === offspring.wallet_address && 
              transfer.amount > 0.01 * 1e9) {
            
            const { error } = await supabase
              .from('mega_whale_offspring')
              .upsert({
                mega_whale_id: megaWhale.id,
                wallet_address: transfer.toUserAccount,
                depth_level: 2,
                parent_offspring_id: offspring.id,
                first_funded_at: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
                total_sol_received: transfer.amount / 1e9
              }, { 
                onConflict: 'mega_whale_id,wallet_address',
                ignoreDuplicates: true
              });

            if (!error) results.offspring_found++;
          }
        }

        // Check for token activity
        for (const transfer of tx.tokenTransfers || []) {
          const isBuy = transfer.toUserAccount === offspring.wallet_address;
          const isSell = transfer.fromUserAccount === offspring.wallet_address;

          if (isBuy || isSell) {
            await supabase
              .from('mega_whale_token_alerts')
              .upsert({
                user_id: megaWhale.user_id,
                mega_whale_id: megaWhale.id,
                offspring_id: offspring.id,
                alert_type: isBuy ? 'token_buy' : 'token_sell',
                token_mint: transfer.mint,
                detected_at: tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString(),
                metadata: {
                  signature: tx.signature,
                  historical_scan: true
                }
              }, { onConflict: 'mega_whale_id,offspring_id,token_mint,alert_type' });

            await supabase
              .from('mega_whale_offspring')
              .update({ is_active_trader: true })
              .eq('id', offspring.id);
          }
        }
      }

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 150));

    } catch (e) {
      console.error(`[MEGA-WHALE-MANAGER] Error scanning offspring ${offspring.wallet_address}:`, e);
    }
  }

  // Update mega whale stats
  const { count } = await supabase
    .from('mega_whale_offspring')
    .select('*', { count: 'exact', head: true })
    .eq('mega_whale_id', megaWhale.id);

  await supabase
    .from('mega_whales')
    .update({ 
      total_offspring_wallets: count || 0,
      last_activity_at: new Date().toISOString()
    })
    .eq('id', megaWhale.id);

  console.log(`[MEGA-WHALE-MANAGER] Deep scan complete:`, results);
  return results;
}

async function updateWebhook(supabase: any, heliusApiKey: string, userId: string): Promise<void> {
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
    await supabase
      .from('mega_whales')
      .update({ helius_webhook_id: webhookData.webhookID })
      .eq('user_id', userId);

    console.log(`[MEGA-WHALE-MANAGER] Webhook created: ${webhookData.webhookID}`);
  } else {
    console.error('[MEGA-WHALE-MANAGER] Failed to create webhook:', webhookData);
  }
}
