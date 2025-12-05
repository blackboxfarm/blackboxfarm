import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { csvData, whaleAddress } = await req.json();
    
    if (!csvData || !whaleAddress) {
      return new Response(
        JSON.stringify({ error: 'Missing csvData or whaleAddress' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Import CSV] Processing transfers from whale: ${whaleAddress}`);

    // Parse CSV
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    
    // Find column indices
    const fromIdx = headers.findIndex((h: string) => h.trim() === 'From');
    const toIdx = headers.findIndex((h: string) => h.trim() === 'To');
    const flowIdx = headers.findIndex((h: string) => h.trim() === 'Flow');
    const amountIdx = headers.findIndex((h: string) => h.trim() === 'Amount');
    const tokenIdx = headers.findIndex((h: string) => h.trim() === 'Token Address');
    const timeIdx = headers.findIndex((h: string) => h.trim() === 'Human Time');
    const actionIdx = headers.findIndex((h: string) => h.trim() === 'Action');
    
    console.log(`[Import CSV] Column indices: from=${fromIdx}, to=${toIdx}, flow=${flowIdx}, action=${actionIdx}`);
    
    // Extract unique destination wallets
    const childWallets = new Map<string, { totalSol: number, firstSeen: string, lastSeen: string }>();
    
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      
      const from = cols[fromIdx]?.trim();
      const to = cols[toIdx]?.trim();
      const flow = cols[flowIdx]?.trim();
      const action = cols[actionIdx]?.trim();
      const token = cols[tokenIdx]?.trim();
      const time = cols[timeIdx]?.trim();
      
      // Only count outgoing SOL transfers from the whale wallet
      if (from === whaleAddress && flow === 'out' && (action === 'TRANSFER' || action === 'CREATE ACCOUNT') && (token === 'SOL' || !token)) {
        const amountStr = cols[amountIdx]?.trim() || '0';
        const amount = parseFloat(amountStr) || 0;
        // Convert from lamports to SOL if needed
        const amountSol = amount > 1000000 ? amount / 1_000_000_000 : amount;
        
        if (to && to !== whaleAddress && to.length >= 32 && to.length <= 44) {
          const existing = childWallets.get(to);
          if (existing) {
            existing.totalSol += amountSol;
            if (time && new Date(time) > new Date(existing.lastSeen)) {
              existing.lastSeen = time;
            }
            if (time && new Date(time) < new Date(existing.firstSeen)) {
              existing.firstSeen = time;
            }
          } else {
            childWallets.set(to, { 
              totalSol: amountSol, 
              firstSeen: time || new Date().toISOString(),
              lastSeen: time || new Date().toISOString()
            });
          }
        }
      }
    }

    console.log(`[Import CSV] Found ${childWallets.size} unique child wallets`);

    // Get or create the mega whale record
    let { data: whale, error: whaleError } = await supabase
      .from('mega_whales')
      .select('id')
      .eq('wallet_address', whaleAddress)
      .single();

    if (whaleError || !whale) {
      // Create the whale record
      const { data: newWhale, error: createError } = await supabase
        .from('mega_whales')
        .insert({
          wallet_address: whaleAddress,
          label: 'Imported Mega Whale',
          total_offspring_wallets: 0,
          is_active: true
        })
        .select('id')
        .single();

      if (createError) {
        console.error(`[Import CSV] Failed to create whale record:`, createError);
        return new Response(
          JSON.stringify({ error: 'Failed to create whale record', details: createError }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      whale = newWhale;
    }

    const whaleId = whale.id;
    console.log(`[Import CSV] Using whale ID: ${whaleId}`);

    // Prepare batch insert
    const insertBatch: any[] = [];
    
    for (const [walletAddress, data] of childWallets) {
      insertBatch.push({
        mega_whale_id: whaleId,
        wallet_address: walletAddress,
        depth: 1,
        total_sol_received: data.totalSol,
        first_seen_at: data.firstSeen,
        last_activity_at: data.lastSeen,
        is_dust: false,
        has_minted: false,
        current_sol_balance: 0 // Will be checked later
      });
    }

    // Insert in batches of 100
    const batchSize = 100;
    let insertedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < insertBatch.length; i += batchSize) {
      const batch = insertBatch.slice(i, i + batchSize);
      
      const { data: insertResult, error: insertError } = await supabase
        .from('mega_whale_offspring')
        .upsert(batch, { 
          onConflict: 'mega_whale_id,wallet_address',
          ignoreDuplicates: false 
        })
        .select('id');

      if (insertError) {
        console.error(`[Import CSV] Batch insert error:`, insertError);
        skippedCount += batch.length;
      } else {
        insertedCount += insertResult?.length || batch.length;
      }
    }

    // Update whale's offspring count
    const { error: updateError } = await supabase
      .from('mega_whales')
      .update({ total_offspring_wallets: childWallets.size })
      .eq('id', whaleId);

    if (updateError) {
      console.error(`[Import CSV] Failed to update offspring count:`, updateError);
    }

    console.log(`[Import CSV] Import complete: ${insertedCount} inserted, ${skippedCount} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        whaleId,
        whaleAddress,
        totalUniqueWallets: childWallets.size,
        insertedCount,
        skippedCount,
        sampleWallets: Array.from(childWallets.entries()).slice(0, 10).map(([addr, data]) => ({
          address: addr,
          totalSol: data.totalSol.toFixed(4),
          firstSeen: data.firstSeen
        }))
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Import CSV] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
