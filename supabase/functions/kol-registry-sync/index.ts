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
}

function parseLeaderboardData(html: string): ParsedKOL[] {
  const kols: ParsedKOL[] = [];

  // Debug: check various escape patterns 
  const patterns = [
    { name: 'backslash-quote-wallet', pat: '\\"wallet\\"' },
    { name: 'raw-wallet-colon', pat: '"wallet":' },
    { name: 'escaped-json', pat: '\\u0022wallet\\u0022' },
    { name: 'just-wallet-quote', pat: 'wallet":"' },
    { name: 'wallet-backslash', pat: 'wallet\\"' },
  ];
  
  for (const { name, pat } of patterns) {
    const idx = html.indexOf(pat);
    console.log(`[kol-sync] Pattern "${name}" => index: ${idx}`);
    if (idx > -1) {
      console.log(`[kol-sync] Context for "${name}":`, JSON.stringify(html.substring(idx, idx + 200)));
    }
  }

  // Strategy 1: Try to find __NEXT_DATA__ script tag which contains JSON
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    console.log('[kol-sync] Found __NEXT_DATA__, length:', nextDataMatch[1].length);
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      // Navigate the Next.js data structure to find leaderboard entries
      const props = nextData?.props?.pageProps;
      if (props) {
        console.log('[kol-sync] pageProps keys:', Object.keys(props).join(', '));
        // Try common key names
        const leaderboard = props.leaderboard || props.kols || props.data || props.accounts || props.users;
        if (Array.isArray(leaderboard)) {
          console.log(`[kol-sync] Found leaderboard array with ${leaderboard.length} entries`);
          for (let i = 0; i < leaderboard.length && i < 100; i++) {
            const entry = leaderboard[i];
            const wallet = entry.wallet || entry.address || entry.pubkey || '';
            const name = entry.name || entry.displayName || entry.username || wallet.slice(0, 8);
            const twitter = entry.twitter || entry.twitterUrl || entry.x_url || '';
            const profit = entry.profit || entry.pnl || entry.sol_profit || 0;
            
            let xHandle = '';
            if (twitter) {
              const hm = twitter.match(/x\.com\/([A-Za-z0-9_]+)/);
              if (hm) xHandle = hm[1];
            }
            
            kols.push({
              displayName: name,
              walletAddress: wallet,
              avatarUrl: `https://cdn.kolscan.io/profiles/${wallet}.png`,
              xHandle,
              xUrl: twitter,
              rank: i + 1,
              solProfit: typeof profit === 'number' ? profit : parseFloat(profit) || 0,
            });
          }
          return kols;
        }
      }
    } catch (e) {
      console.error('[kol-sync] Failed to parse __NEXT_DATA__:', e.message);
    }
  }

  // Strategy 2: Find JSON-like data anywhere in the HTML
  // The data contains patterns like: "wallet":"ADDR","name":"NAME","twitter":"URL","profit":NUM
  // Try to find the JSON blob by looking for the characteristic pattern
  const jsonBlobRe = /"wallet":"([A-Za-z0-9]{32,44})","name":"([^"]+)"/g;
  let match;
  const seenWallets = new Set<string>();
  let rank = 0;

  while ((match = jsonBlobRe.exec(html)) !== null) {
    const wallet = match[1];
    if (seenWallets.has(wallet)) continue;
    seenWallets.add(wallet);
    rank++;

    const displayName = match[2];
    const ctx = html.substring(match.index, match.index + 500);

    // Get twitter
    const twMatch = ctx.match(/"twitter":"(https?:\/\/x\.com\/[A-Za-z0-9_]+)"/);
    const twitterUrl = twMatch ? twMatch[1] : '';
    let xHandle = '';
    if (twitterUrl) {
      const hm = twitterUrl.match(/x\.com\/([A-Za-z0-9_]+)/);
      if (hm) xHandle = hm[1];
    }

    // Get profit
    const profitMatch = ctx.match(/"profit":(-?[\d.]+)/);
    const solProfit = profitMatch ? parseFloat(profitMatch[1]) : 0;

    kols.push({
      displayName,
      walletAddress: wallet,
      avatarUrl: `https://cdn.kolscan.io/profiles/${wallet}.png`,
      xHandle,
      xUrl: twitterUrl,
      rank,
      solProfit,
    });

    if (rank >= 100) break;
  }

  if (kols.length > 0) return kols;

  // Strategy 3: The JSON might be escaped (e.g. in a script with escaped quotes)
  // Unescape and retry
  console.log('[kol-sync] Strategy 2 found 0. Trying unescaped...');
  const unescaped = html.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  
  const jsonBlobRe2 = /"wallet":"([A-Za-z0-9]{32,44})","name":"([^"]+)"/g;
  let match2;
  rank = 0;

  while ((match2 = jsonBlobRe2.exec(unescaped)) !== null) {
    const wallet = match2[1];
    if (seenWallets.has(wallet)) continue;
    seenWallets.add(wallet);
    rank++;

    const displayName = match2[2];
    const ctx = unescaped.substring(match2.index, match2.index + 500);

    const twMatch = ctx.match(/"twitter":"(https?:\/\/x\.com\/[A-Za-z0-9_]+)"/);
    const twitterUrl = twMatch ? twMatch[1] : '';
    let xHandle = '';
    if (twitterUrl) {
      const hm = twitterUrl.match(/x\.com\/([A-Za-z0-9_]+)/);
      if (hm) xHandle = hm[1];
    }

    const profitMatch = ctx.match(/"profit":(-?[\d.]+)/);
    const solProfit = profitMatch ? parseFloat(profitMatch[1]) : 0;

    kols.push({
      displayName,
      walletAddress: wallet,
      avatarUrl: `https://cdn.kolscan.io/profiles/${wallet}.png`,
      xHandle,
      xUrl: twitterUrl,
      rank,
      solProfit,
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

    // Deduplicate by handle
    const seenHandles = new Set<string>();
    const upsertRows = [];
    
    for (const kol of kols) {
      const handle = kol.xHandle
        ? kol.xHandle.toLowerCase()
        : kol.displayName.toLowerCase().replace(/[^a-z0-9_]/g, '') || kol.walletAddress.slice(0, 12).toLowerCase();

      if (seenHandles.has(handle) || !handle) continue;
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

    const elapsed = Date.now() - startTime;
    console.log(`[kol-sync] Done: ${upserted} synced in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        kolsParsed: kols.length,
        synced: upserted,
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
