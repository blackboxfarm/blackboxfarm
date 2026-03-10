import { createClient } from "npm:@supabase/supabase-js@2.54.0";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

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

  // Strategy: regex-based extraction from the raw HTML string
  // Each KOL entry has:
  //  - account link: href="/account/WALLET?timeframe=..."
  //  - display name in <h1> tag
  //  - X link: href="https://x.com/HANDLE" or href="https://twitter.com/HANDLE"
  //  - avatar: src="https://cdn.kolscan.io/profiles/WALLET.png"
  //  - profit: "+XXX.XX Sol" and "($XXX.X)"

  // Find all account wallet links first to identify each KOL block
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

  console.log(`[kol-sync] Found ${allWallets.length} unique wallets in HTML`);

  for (let i = 0; i < allWallets.length && i < 100; i++) {
    const { wallet, index } = allWallets[i];
    const nextIndex = i + 1 < allWallets.length ? allWallets[i + 1].index : index + 3000;
    const block = html.substring(Math.max(0, index - 500), Math.min(html.length, nextIndex + 200));

    // Extract display name from <h1> tags within the account link area
    const nameRe = /<h1[^>]*>([^<]+)<\/h1>/g;
    let nameMatch;
    let displayName = wallet.slice(0, 8);
    // Get the first h1 that's not a number or generic text
    while ((nameMatch = nameRe.exec(block)) !== null) {
      const candidate = nameMatch[1].trim();
      if (candidate && !/^\d+$/.test(candidate) && candidate !== 'Pump app' && candidate !== 'App' && candidate.length > 0) {
        displayName = candidate;
        break;
      }
    }

    // Extract X/Twitter handle from href
    const xRe = /href="https?:\/\/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)"/;
    const xMatch = xRe.exec(block);
    const xHandle = xMatch ? xMatch[1] : '';
    const xUrl = xMatch ? `https://x.com/${xMatch[1]}` : '';

    // Extract avatar
    const avatarRe = new RegExp(`src="(https://cdn\\.kolscan\\.io/profiles/${wallet}\\.[^"]+)"`);
    const avatarMatch = avatarRe.exec(block);
    const avatarUrl = avatarMatch ? avatarMatch[1] : '';

    // Extract SOL profit
    const solRe = /([+-]?\d+\.?\d*)\s*Sol/i;
    const solMatch = solRe.exec(block);
    const solProfit = solMatch ? parseFloat(solMatch[1]) : 0;

    // Extract USD profit
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

    // Try weekly timeframe for more KOLs (100+)
    const timeframes = ['7', '1']; // weekly first, then daily
    let allKols: ParsedKOL[] = [];

    for (const tf of timeframes) {
      console.log(`[kol-sync] Fetching kolscan.io leaderboard (timeframe=${tf})...`);

      const response = await fetch(`${KOLSCAN_URL}?timeframe=${tf}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        console.error(`[kol-sync] Kolscan fetch failed (tf=${tf}):`, response.status);
        continue;
      }

      const html = await response.text();
      console.log(`[kol-sync] Received ${html.length} bytes of HTML (tf=${tf})`);

      // Debug: check if x.com links exist in the HTML
      const xComCount = (html.match(/x\.com\//g) || []).length;
      const twitterCount = (html.match(/twitter\.com\//g) || []).length;
      console.log(`[kol-sync] Found ${xComCount} x.com links and ${twitterCount} twitter.com links in HTML`);

      const kols = parseLeaderboardHTML(html);
      console.log(`[kol-sync] Parsed ${kols.length} KOLs (tf=${tf}), X handles found: ${kols.filter(k => k.xHandle).length}`);

      // Merge: add KOLs we haven't seen yet
      for (const kol of kols) {
        if (!allKols.find(k => k.walletAddress === kol.walletAddress)) {
          allKols.push(kol);
        }
      }

      if (allKols.length >= 100) break;
    }

    if (allKols.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No KOLs parsed from HTML',
          synced: 0,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    let upserted = 0;

    // Use x_handle if available, otherwise use display name
    const upsertRows = allKols.map((kol) => {
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

    // Sync to kol_wallets for holder matching
    const walletInserts = allKols.map((kol) => ({
      wallet_address: kol.walletAddress,
      x_handle: kol.xHandle
        ? kol.xHandle.toLowerCase()
        : kol.displayName.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      display_name: kol.displayName,
    }));

    if (walletInserts.length > 0) {
      const { error: walletError } = await supabase
        .from('kol_wallets')
        .upsert(walletInserts, {
          onConflict: 'wallet_address',
          ignoreDuplicates: false,
        });

      if (walletError) {
        console.warn('[kol-sync] kol_wallets sync error:', walletError.message);
      } else {
        console.log(`[kol-sync] Synced ${walletInserts.length} KOL wallet addresses`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[kol-sync] Completed: ${upserted} KOLs synced in ${elapsed}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        kolsParsed: allKols.length,
        synced: upserted,
        walletsSynced: walletInserts.length,
        xHandlesFound: allKols.filter(k => k.xHandle).length,
        executionTimeMs: elapsed,
        sampleKols: allKols.slice(0, 5).map(k => ({
          name: k.displayName,
          xHandle: k.xHandle,
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
