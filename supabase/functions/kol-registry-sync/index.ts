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

  // From debug logs, the escaped JSON in HTML contains patterns like:
  // ...WALLET_ADDR\",\"name\":\"NAME\",\"telegram\":null,\"twitter\":\"https://x.com/HANDLE\",\"profit\":NUM
  // 
  // The \" in the HTML is a literal backslash+quote character pair.
  // In JS string matching, we need to match the literal characters \ and "
  // which in a JS regex means we write: \\\" (or in a string: \\\\\\")
  
  // Simplest approach: find all x.com/HANDLE patterns with surrounding context
  // and extract wallet+name+profit from the same JSON blob
  
  // First, find all the JSON data blobs containing twitter links
  // The regex matches: \"name\":\"SOMETHING\", followed eventually by \"twitter\":\"https://x.com/HANDLE\"
  // Using a regex that matches the escaped JSON format: \" in HTML = literal backslash + quote
  
  // Match the characteristic pattern: WALLET_ADDRESS\",\"name\":\"
  // In regex, to match a literal \", we need \\\" in the regex string
  const blobRe = /([A-Za-z0-9]{32,44})\\",\\"name\\":\\"([^\\]+)\\"/g;
  
  let match;
  const seenWallets = new Set<string>();
  let rank = 0;

  while ((match = blobRe.exec(html)) !== null) {
    const wallet = match[1];
    if (seenWallets.has(wallet)) continue;
    
    // Validate it's a proper Solana address (base58)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) continue;
    
    seenWallets.add(wallet);
    rank++;

    const displayName = match[2];
    
    // Get context after this match for twitter and profit
    const ctx = html.substring(match.index, Math.min(html.length, match.index + 600));

    // Find twitter URL: \"twitter\":\"https://x.com/HANDLE\"
    const twMatch = ctx.match(/\\"twitter\\":\\"(https:\/\/x\.com\/[A-Za-z0-9_]+)\\"/);
    const twitterUrl = twMatch ? twMatch[1] : '';
    let xHandle = '';
    if (twitterUrl) {
      const hm = twitterUrl.match(/x\.com\/([A-Za-z0-9_]+)/);
      if (hm) xHandle = hm[1];
    }

    // Find profit: \"profit\":NUMBER
    const profitMatch = ctx.match(/\\"profit\\":(-?[\d.]+)/);
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
    
    // Debug: test our exact regex pattern
    const testRe = /([A-Za-z0-9]{32,44})\\",\\"name\\":\\"/;
    const testMatch = testRe.exec(html);
    console.log(`[kol-sync] Test regex match: ${testMatch ? 'YES at ' + testMatch.index + ' wallet=' + testMatch[1].slice(0,8) : 'NO'}`);
    
    // Also try without escaping to see what format the data actually is in
    const testRe2 = /([A-Za-z0-9]{32,44})","name":"/;
    const testMatch2 = testRe2.exec(html);
    console.log(`[kol-sync] Test regex2 (unescaped) match: ${testMatch2 ? 'YES at ' + testMatch2.index : 'NO'}`);

    const kols = parseLeaderboardData(html);
    console.log(`[kol-sync] Parsed ${kols.length} KOLs, X handles: ${kols.filter(k => k.xHandle).length}`);

    if (kols.length === 0) {
      // Last resort debug: find where x.com appears and show 200 chars before it
      const xIdx = html.indexOf('x.com/');
      if (xIdx > -1) {
        const before = html.substring(Math.max(0, xIdx - 200), xIdx + 50);
        console.log('[kol-sync] DEBUG context before first x.com:', JSON.stringify(before));
      }
      
      return new Response(
        JSON.stringify({ success: true, message: 'No KOLs parsed', synced: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    let upserted = 0;

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
