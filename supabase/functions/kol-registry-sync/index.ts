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
  rank: number;
  solProfit: number;
  usdProfit: number;
  tradesWon: number;
  tradesTotal: number;
}

function parseLeaderboardHTML(html: string): ParsedKOL[] {
  const kols: ParsedKOL[] = [];
  
  // Match account links with wallet addresses and display names
  // Pattern: <a ... href="https://kolscan.io/account/WALLET_ADDRESS?timeframe=1">...<h1>NAME</h1>...</a>
  // or from the rendered HTML structure
  
  // Extract all account entries from HTML
  // The HTML has patterns like: href="/account/WALLET_ADDRESS?timeframe=1" or href="https://kolscan.io/account/WALLET_ADDRESS..."
  const accountRegex = /href="(?:https:\/\/kolscan\.io)?\/account\/([A-Za-z0-9]{32,44})\?timeframe=\d"/g;
  const walletAddresses: string[] = [];
  let match;
  
  while ((match = accountRegex.exec(html)) !== null) {
    const addr = match[1];
    if (!walletAddresses.includes(addr)) {
      walletAddresses.push(addr);
    }
  }
  
  console.log(`[kol-sync] Found ${walletAddresses.length} unique wallet addresses in HTML`);
  
  // For each wallet, extract associated data from HTML context
  for (let i = 0; i < walletAddresses.length && i < 100; i++) {
    const wallet = walletAddresses[i];
    
    // Find display name - pattern: bold text near the account link
    // HTML pattern: <h1 class="...">NAME</h1> near the account link
    const nameRegex = new RegExp(
      `href="(?:https:\\/\\/kolscan\\.io)?\\/account\\/${wallet}[^"]*"[^>]*>.*?<h1[^>]*>([^<]+)<\\/h1>`,
      's'
    );
    const nameMatch = nameRegex.exec(html);
    const displayName = nameMatch ? nameMatch[1].trim() : wallet.slice(0, 8);
    
    // Find avatar URL
    const avatarRegex = new RegExp(
      `src="(https://cdn\\.kolscan\\.io/profiles/${wallet}\\.png)"`,
    );
    const avatarMatch = avatarRegex.exec(html);
    const avatarUrl = avatarMatch ? avatarMatch[1] : '';
    
    // Find SOL profit - pattern: +XX.XX Sol or -XX.XX Sol near this entry
    // We'll use position-based extraction from the HTML around this wallet
    const walletIdx = html.indexOf(wallet);
    if (walletIdx === -1) continue;
    
    // Look ahead ~2000 chars for profit data
    const contextAfter = html.substring(walletIdx, walletIdx + 2000);
    
    // Match SOL profit pattern like "+188.87 Sol" or "-5.23 Sol"  
    const solRegex = /([+-]?\d+\.?\d*)\s*Sol/i;
    const solMatch = solRegex.exec(contextAfter);
    const solProfit = solMatch ? parseFloat(solMatch[1]) : 0;
    
    // Match USD profit pattern like "($16,357.9)" or "(-$500.0)"
    const usdRegex = /\(\$?([\d,]+\.?\d*)\)/;
    const usdMatch = usdRegex.exec(contextAfter);
    const usdProfit = usdMatch ? parseFloat(usdMatch[1].replace(/,/g, '')) : 0;
    
    kols.push({
      displayName,
      walletAddress: wallet,
      avatarUrl,
      rank: i + 1,
      solProfit,
      usdProfit,
      tradesWon: 0,
      tradesTotal: 0,
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

    console.log('[kol-sync] Fetching kolscan.io leaderboard...');

    const response = await fetch(KOLSCAN_URL, {
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
    console.log(`[kol-sync] Received ${html.length} bytes of HTML`);

    const kols = parseLeaderboardHTML(html);
    console.log(`[kol-sync] Parsed ${kols.length} KOLs from leaderboard`);

    if (kols.length === 0) {
      // Log a snippet of HTML for debugging
      console.log('[kol-sync] HTML snippet (first 2000 chars):', html.substring(0, 2000));
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No KOLs parsed from HTML', 
          synced: 0,
          htmlLength: html.length,
          debugSnippet: html.substring(0, 500),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const now = new Date().toISOString();
    let upserted = 0;

    // Batch upsert KOLs - use display name as x_handle since kolscan doesn't expose X handles
    const upsertRows = kols.map((kol) => ({
      x_handle: kol.displayName.toLowerCase().replace(/[^a-z0-9_]/g, ''),
      x_url: `https://kolscan.io/account/${kol.walletAddress}`,
      display_name: kol.displayName,
      avatar_url: kol.avatarUrl || null,
      followers_count: 0,
      rank: kol.rank,
      score: kol.solProfit,
      win_rate: kol.tradesTotal > 0 ? (kol.tradesWon / kol.tradesTotal) * 100 : null,
      avg_multiplier: null,
      categories: ['kolscan_leaderboard'],
      wallet_addresses: [kol.walletAddress],
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
    const walletInserts = kols.map((kol) => ({
      wallet_address: kol.walletAddress,
      x_handle: kol.displayName.toLowerCase().replace(/[^a-z0-9_]/g, ''),
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
        kolsParsed: kols.length,
        synced: upserted,
        walletsSynced: walletInserts.length,
        executionTimeMs: elapsed,
        sampleKols: kols.slice(0, 3).map(k => ({ name: k.displayName, wallet: k.walletAddress, rank: k.rank })),
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
