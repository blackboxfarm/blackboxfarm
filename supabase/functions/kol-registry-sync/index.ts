import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KOLSCAN_URL = 'https://kolscan.io/leaderboard';

interface ParsedKOL {
  displayName: string;
  walletAddress: string;
  xHandle: string;
  xUrl: string;
  telegramUrl: string;
  rank: number;
  solProfit: number;
  avatarUrl: string;
}

function parseLeaderboardData(html: string): ParsedKOL[] {
  const kols: ParsedKOL[] = [];

  // The data is embedded as escaped JSON in the HTML (Next.js serialized props)
  // Pattern: "wallet":"WALLET","name":"NAME","telegram":"URL_OR_NULL","twitter":"URL_OR_NULL","profit":NUMBER
  const entryRe = /\\?"wallet\\?":\s*\\?"([A-Za-z0-9]{32,44})\\?"[^}]*?\\?"name\\?":\s*\\?"([^"\\]+)\\?"[^}]*?\\?"telegram\\?":\s*(?:\\?"([^"\\]*)\\?"|null)[^}]*?\\?"twitter\\?":\s*(?:\\?"([^"\\]*)\\?"|null)[^}]*?\\?"profit\\?":\s*(-?[\d.]+)/g;

  let match;
  const seenWallets = new Set<string>();
  let rank = 0;

  while ((match = entryRe.exec(html)) !== null) {
    const wallet = match[1];
    if (seenWallets.has(wallet)) continue;
    seenWallets.add(wallet);
    rank++;

    const displayName = match[2];
    const telegramUrl = match[3] || '';
    const twitterUrl = match[4] || '';
    const solProfit = parseFloat(match[5]) || 0;

    // Extract X handle from URL like "https://x.com/clukzSOL"
    let xHandle = '';
    if (twitterUrl) {
      const handleMatch = twitterUrl.match(/x\.com\/([A-Za-z0-9_]+)/);
      if (handleMatch) xHandle = handleMatch[1];
    }

    // Avatar URL follows kolscan CDN pattern
    const avatarUrl = `https://cdn.kolscan.io/profiles/${wallet}.png`;

    kols.push({
      displayName,
      walletAddress: wallet,
      xHandle,
      xUrl: twitterUrl,
      telegramUrl,
      rank,
      solProfit,
      avatarUrl,
    });

    if (rank >= 100) break;
  }

  return kols;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[kol-sync] Fetching kolscan.io leaderboard...');

    const response = await fetch(`${KOLSCAN_URL}?timeframe=7`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ success: false, error: `Kolscan returned ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    console.log(`[kol-sync] Received ${html.length} bytes`);

    const kols = parseLeaderboardData(html);
    console.log(`[kol-sync] Parsed ${kols.length} KOLs, X handles: ${kols.filter(k => k.xHandle).length}`);

    if (kols.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No KOLs parsed', synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    let upserted = 0;

    // Deduplicate by x_handle to avoid ON CONFLICT duplicate row errors
    const seenHandles = new Set<string>();
    const upsertRows = [];
    
    for (const kol of kols) {
      const handle = kol.xHandle
        ? kol.xHandle.toLowerCase()
        : kol.displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') || kol.walletAddress.slice(0, 12).toLowerCase();

      if (seenHandles.has(handle)) continue;
      seenHandles.add(handle);

      upsertRows.push({
        x_handle: handle,
        x_url: kol.xUrl || `https://kolscan.io/account/${kol.walletAddress}`,
        display_name: kol.displayName,
        avatar_url: kol.avatarUrl,
        followers_count: 0,
        rank: kol.rank,
        score: kol.solProfit,
        win_rate: null,
        avg_multiplier: null,
        categories: ['kolscan_leaderboard'],
        wallet_addresses: [kol.walletAddress],
        last_synced_at: now,
        updated_at: now,
      });
    }

    // Upsert in batches of 50
    for (let i = 0; i < upsertRows.length; i += 50) {
      const batch = upsertRows.slice(i, i + 50);
      const { error } = await supabase
        .from('kol_registry')
        .upsert(batch, { onConflict: 'x_handle', ignoreDuplicates: false });

      if (error) {
        console.error(`[kol-sync] Upsert error:`, error.message);
      } else {
        upserted += batch.length;
      }
    }

    // Sync wallets - check what columns exist
    const walletInserts = kols.map((kol) => ({
      wallet_address: kol.walletAddress,
      kol_handle: kol.xHandle
        ? kol.xHandle.toLowerCase()
        : kol.displayName.toLowerCase().replace(/[^a-z0-9_]/g, ''),
    }));

    if (walletInserts.length > 0) {
      const { error: walletError } = await supabase
        .from('kol_wallets')
        .upsert(walletInserts, { onConflict: 'wallet_address', ignoreDuplicates: false });

      if (walletError) {
        console.warn('[kol-sync] kol_wallets error:', walletError.message);
      } else {
        console.log(`[kol-sync] Synced ${walletInserts.length} wallets`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[kol-sync] Done: ${upserted} synced in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        kolsParsed: kols.length,
        synced: upserted,
        walletsSynced: walletInserts.length,
        xHandlesFound: kols.filter(k => k.xHandle).length,
        executionTimeMs: elapsed,
        sampleKols: kols.slice(0, 5).map(k => ({
          name: k.displayName,
          xHandle: k.xHandle || '(none)',
          xUrl: k.xUrl || '',
          wallet: k.walletAddress.slice(0, 8) + '...',
          rank: k.rank,
          sol: Math.round(k.solProfit * 100) / 100,
        })),
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
