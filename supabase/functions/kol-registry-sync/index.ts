import { createClient } from "npm:@supabase/supabase-js@2.54.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KOLSCAN_URL = 'https://kolscan.io/leaderboard';

interface ParsedKOL {
  displayName: string;
  walletAddress: string;
  avatarUrl: string;
  xHandle: string;
  xUrl: string;
  rank: number;
  solProfit: number;
  usdProfit: number;
}

function parseLeaderboardHTML(html: string): ParsedKOL[] {
  const kols: ParsedKOL[] = [];

  // Debug: find first few x.com patterns with surrounding context
  const xDebugRe = /.{0,80}x\.com\/[A-Za-z0-9_]{1,30}.{0,30}/g;
  let debugMatch;
  const debugSamples: string[] = [];
  while ((debugMatch = xDebugRe.exec(html)) !== null && debugSamples.length < 5) {
    debugSamples.push(debugMatch[0]);
  }
  console.log('[kol-sync] X.com link samples:', JSON.stringify(debugSamples));

  // Find all account wallet links to identify each KOL block
  const allWallets: { wallet: string; index: number }[] = [];
  const walletRe = /href="(?:https:\/\/kolscan\.io)?\/account\/([A-Za-z0-9]{32,44})\?/g;
  let m;
  const seenWallets = new Set<string>();
  while ((m = walletRe.exec(html)) !== null) {
    if (!seenWallets.has(m[1])) {
      seenWallets.add(m[1]);
      allWallets.push({ wallet: m[1], index: m.index });
    }
  }

  console.log(`[kol-sync] Found ${allWallets.length} unique wallets`);

  for (let i = 0; i < allWallets.length && i < 100; i++) {
    const { wallet, index } = allWallets[i];
    // Get a generous block around this wallet's section
    const blockStart = Math.max(0, index - 1000);
    const blockEnd = i + 1 < allWallets.length 
      ? allWallets[i + 1].index + 200 
      : Math.min(html.length, index + 4000);
    const block = html.substring(blockStart, blockEnd);

    // Extract display name - look for <h1> inside the account link
    const nameRe = /<h1[^>]*>([^<]+)<\/h1>/g;
    let nameMatch;
    let displayName = wallet.slice(0, 8);
    const skipNames = new Set(['Pump app', 'App', 'KOL Leaderboard', 'Theme', 'Sounds', 'Custom Settings']);
    while ((nameMatch = nameRe.exec(block)) !== null) {
      const candidate = nameMatch[1].trim();
      if (candidate && !/^\d+$/.test(candidate) && !skipNames.has(candidate) && candidate.length > 0 && candidate.length < 50) {
        displayName = candidate;
        break;
      }
    }

    // Extract X handle - try multiple patterns
    // Pattern 1: href="https://x.com/HANDLE"
    // Pattern 2: href='https://x.com/HANDLE'  
    // Pattern 3: href=https://x.com/HANDLE
    // Pattern 4: x.com/HANDLE in any context near this wallet
    let xHandle = '';
    let xUrl = '';
    
    const xPatterns = [
      /href="https?:\/\/x\.com\/([A-Za-z0-9_]+)"/,
      /href='https?:\/\/x\.com\/([A-Za-z0-9_]+)'/,
      /href=https?:\/\/x\.com\/([A-Za-z0-9_]+)/,
      /https?:\/\/x\.com\/([A-Za-z0-9_]{1,30})/,
    ];
    
    for (const pattern of xPatterns) {
      const xMatch = pattern.exec(block);
      if (xMatch && xMatch[1] !== 'intent' && xMatch[1] !== 'share') {
        xHandle = xMatch[1];
        xUrl = `https://x.com/${xMatch[1]}`;
        break;
      }
    }

    // Avatar
    const avatarRe = new RegExp(`src="(https://cdn\\.kolscan\\.io/profiles/${wallet}\\.[^"]+)"`);
    const avatarMatch = avatarRe.exec(block);
    const avatarUrl = avatarMatch ? avatarMatch[1] : '';

    // SOL profit
    const solRe = /([+-]?\d+\.?\d*)\s*Sol/i;
    const solMatch = solRe.exec(block);
    const solProfit = solMatch ? parseFloat(solMatch[1]) : 0;

    // USD profit
    const usdRe = /\(\$?([\d,]+\.?\d*)\)/;
    const usdMatch = usdRe.exec(block);
    const usdProfit = usdMatch ? parseFloat(usdMatch[1].replace(/,/g, '')) : 0;

    kols.push({
      displayName,
      walletAddress: wallet,
      avatarUrl,
      xHandle,
      xUrl,
      rank: i + 1,
      solProfit,
      usdProfit,
    });
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

    // Fetch weekly for broader KOL set
    console.log('[kol-sync] Fetching kolscan.io leaderboard...');

    const response = await fetch(`${KOLSCAN_URL}?timeframe=7`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });

    if (!response.ok) {
      console.error('[kol-sync] Kolscan fetch failed:', response.status);
      return new Response(
        JSON.stringify({ success: false, error: `Kolscan returned ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const html = await response.text();
    console.log(`[kol-sync] Received ${html.length} bytes`);

    const xComCount = (html.match(/x\.com\//g) || []).length;
    console.log(`[kol-sync] x.com occurrences: ${xComCount}`);

    const kols = parseLeaderboardHTML(html);
    console.log(`[kol-sync] Parsed ${kols.length} KOLs, X handles: ${kols.filter(k => k.xHandle).length}`);

    if (kols.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No KOLs parsed', synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    let upserted = 0;

    const upsertRows = kols.map((kol) => {
      const handle = kol.xHandle
        ? kol.xHandle.toLowerCase()
        : kol.displayName.toLowerCase().replace(/[^a-z0-9_]/g, '');

      return {
        x_handle: handle,
        x_url: kol.xUrl || `https://kolscan.io/account/${kol.walletAddress}`,
        display_name: kol.displayName,
        avatar_url: kol.avatarUrl || null,
        followers_count: 0,
        rank: kol.rank,
        score: kol.solProfit,
        win_rate: null,
        avg_multiplier: null,
        categories: ['kolscan_leaderboard'],
        wallet_addresses: [kol.walletAddress],
        last_synced_at: now,
        updated_at: now,
      };
    });

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

    // Sync wallets (without display_name since column doesn't exist)
    const walletInserts = kols.map((kol) => ({
      wallet_address: kol.walletAddress,
      x_handle: kol.xHandle
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
          wallet: k.walletAddress.slice(0, 8) + '...',
          rank: k.rank,
          sol: k.solProfit,
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
