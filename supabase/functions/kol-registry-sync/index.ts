import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KOLEntry {
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  xUrl?: string;
  followers?: number;
  rank?: number;
  score?: number;
  winRate?: number;
  avgMultiplier?: number;
  categories?: string[];
  walletAddresses?: string[];
}

// Cloudflare worker URL - to be deployed by user
const KOL_WORKER_URL = 'https://kol-scanner.yayasanjembatanbali.workers.dev/api/kols';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[kol-sync] Fetching KOL data from worker...');

    const response = await fetch(KOL_WORKER_URL);

    if (!response.ok) {
      console.error('[kol-sync] Worker fetch failed:', response.status);
      return new Response(
        JSON.stringify({ success: false, error: `Worker returned ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const kols: KOLEntry[] = data.kols || data.data || [];

    console.log(`[kol-sync] Received ${kols.length} KOLs from worker`);

    if (kols.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No KOLs returned', synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    let upserted = 0;

    // Batch upsert KOLs
    const upsertRows = kols.map((kol) => ({
      x_handle: kol.handle.replace(/^@/, '').toLowerCase(),
      x_url: kol.xUrl || `https://x.com/${kol.handle.replace(/^@/, '')}`,
      display_name: kol.displayName || kol.handle,
      avatar_url: kol.avatarUrl || null,
      followers_count: kol.followers || 0,
      rank: kol.rank || null,
      score: kol.score || 0,
      win_rate: kol.winRate || null,
      avg_multiplier: kol.avgMultiplier || null,
      categories: kol.categories || [],
      wallet_addresses: kol.walletAddresses || [],
      last_synced_at: now,
      updated_at: now,
    }));

    // Upsert in batches of 50
    for (let i = 0; i < upsertRows.length; i += 50) {
      const batch = upsertRows.slice(i, i + 50);
      const { error } = await supabase
        .from('kol_registry')
        .upsert(batch, {
          onConflict: 'x_handle',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error(`[kol-sync] Batch upsert error:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    // Also sync to kol_wallets table for holder matching
    const walletInserts: { wallet_address: string; x_handle: string; display_name: string }[] = [];
    for (const kol of kols) {
      const handle = kol.handle.replace(/^@/, '').toLowerCase();
      for (const addr of (kol.walletAddresses || [])) {
        walletInserts.push({
          wallet_address: addr,
          x_handle: handle,
          display_name: kol.displayName || kol.handle,
        });
      }
    }

    if (walletInserts.length > 0) {
      const { error: walletError } = await supabase
        .from('kol_wallets')
        .upsert(walletInserts, {
          onConflict: 'wallet_address',
          ignoreDuplicates: false,
        });

      if (walletError) {
        console.warn('[kol-sync] kol_wallets sync skipped:', walletError.message);
      } else {
        console.log(`[kol-sync] Synced ${walletInserts.length} KOL wallet addresses`);
      }
    }

    const elapsed = Date.now() - startTime;

    console.log(`[kol-sync] Completed: ${upserted} KOLs synced in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        kolsReceived: kols.length,
        synced: upserted,
        walletsSynced: walletInserts.length,
        executionTimeMs: elapsed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[kol-sync] Error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
