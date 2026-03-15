import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface KOLEntry {
  wallet_address: string;
  twitter_handle?: string;
  twitter_followers?: number;
  kolscan_rank?: number;
  display_name?: string;
  kol_tier?: string;
  is_verified?: boolean;
  manual_trust_level?: string;
  manual_override_reason?: string;
  source?: string;
  kolscan_weekly_score?: number;
}

interface RefreshResult {
  added: number;
  updated: number;
  total_kols: number;
  errors: string[];
  scraped_count: number;
}

interface ParsedKOL {
  rank: number;
  nickname: string;
  wallet_address: string;
  wins: number;
  losses: number;
  pnl_sol: number;
  pnl_usd: number;
  has_twitter: boolean;
  has_telegram: boolean;
  pfp_url: string | null;
}

// Parse the kolscan leaderboard markdown into structured KOL entries
function parseLeaderboardMarkdown(markdown: string): ParsedKOL[] {
  const kols: ParsedKOL[] = [];

  // Match pattern: account URL contains full wallet, name is in bold
  // Pattern: [![pfp](...)]  **Name**](https://kolscan.io/account/<WALLET>?timeframe=...)
  const entryRegex = /(?:\!\[trophy\].*?\n)?(?:\[?\!\[pfp\]\(([^)]*)\)\]?)?\s*\[?\\\n?\*\*([^*]+)\*\*\]\(https:\/\/kolscan\.io\/account\/([A-Za-z0-9]+)\?/g;

  // Simpler approach: extract all account links with names
  const accountPattern = /\*\*([^*]+)\*\*\]\(https:\/\/kolscan\.io\/account\/([1-9A-HJ-NP-Za-km-z]{32,44})\?/g;
  const pfpPattern = /\!\[pfp\]\((https:\/\/cdn\.kolscan\.io\/profiles\/[^)]+)\)/g;
  const rankPattern = /^# (\d+)$/gm;
  const pnlSolPattern = /# \+?([\d,.]+) Sol/g;
  const pnlUsdPattern = /# \(\$([\d,.]+)\)/g;
  const winsLossesPattern = /(\d+)\s*\n\s*\/\s*\n\s*(\d+)/g;
  const twitterPattern = /!\[twitter logo\]/g;
  const telegramPattern = /!\[telegram logo\]/g;

  // Split by rank headers to get individual entries
  const sections = markdown.split(/^# (\d+)$/m);
  
  // sections[0] = header content before first rank
  // sections[1] = "1" (rank number from trophy section)
  // sections[2] = content for rank 1... but trophy winner is special

  // Alternative: find all account matches first
  const accounts: Array<{ name: string; wallet: string; index: number }> = [];
  let match;
  
  const mdCopy = markdown;
  const accountRegex = /\*\*([^*]+)\*\*\]\(https:\/\/kolscan\.io\/account\/([1-9A-HJ-NP-Za-km-z]{32,44})\?/g;
  while ((match = accountRegex.exec(mdCopy)) !== null) {
    accounts.push({ name: match[1], wallet: match[2], index: match.index });
  }

  // For each account, extract surrounding context
  for (let i = 0; i < accounts.length; i++) {
    const acc = accounts[i];
    const nextStart = i + 1 < accounts.length ? accounts[i + 1].index : mdCopy.length;
    const section = mdCopy.substring(acc.index, nextStart);
    
    // Extract PnL
    const pnlSolMatch = section.match(/\+?([\d,.]+)\s*Sol/);
    const pnlUsdMatch = section.match(/\(\$([\d,.]+)\)/);
    
    // Extract wins/losses  
    const wlMatch = section.match(/(\d+)\s*\n\s*\/\s*\n\s*(\d+)/);
    
    // Check for social icons
    const hasTwitter = section.includes('twitter logo') || section.includes('Twitter.webp');
    const hasTelegram = section.includes('telegram logo') || section.includes('Telegram.webp');
    
    // Extract pfp - look backwards from current position
    const beforeSection = mdCopy.substring(Math.max(0, acc.index - 200), acc.index);
    const pfpMatch = beforeSection.match(/\!\[pfp\]\((https:\/\/cdn\.kolscan\.io\/profiles\/[^)]+)\)/);
    
    kols.push({
      rank: i + 1,
      nickname: acc.name.trim(),
      wallet_address: acc.wallet,
      wins: wlMatch ? parseInt(wlMatch[1]) : 0,
      losses: wlMatch ? parseInt(wlMatch[2]) : 0,
      pnl_sol: pnlSolMatch ? parseFloat(pnlSolMatch[1].replace(',', '')) : 0,
      pnl_usd: pnlUsdMatch ? parseFloat(pnlUsdMatch[1].replace(',', '')) : 0,
      has_twitter: hasTwitter,
      has_telegram: hasTelegram,
      pfp_url: pfpMatch ? pfpMatch[1] : null,
    });
  }

  return kols;
}

// Determine tier based on rank
function getTier(rank: number): string {
  if (rank <= 10) return 'top_10';
  if (rank <= 50) return 'top_50';
  return 'top_100';
}

// Scrape kolscan.io leaderboard using Firecrawl
async function scrapeKolscanLeaderboard(timeframe: string = '1'): Promise<string | null> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlKey) {
    console.error('[KOL] FIRECRAWL_API_KEY not configured');
    return null;
  }

  const url = `https://kolscan.io/leaderboard`;
  console.log(`[KOL] Scraping kolscan leaderboard...`);

  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: false,
        waitFor: 3000, // Wait for JS rendering
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[KOL] Firecrawl error:', data);
      return null;
    }

    const markdown = data?.data?.markdown || data?.markdown;
    if (!markdown) {
      console.error('[KOL] No markdown in Firecrawl response');
      return null;
    }

    console.log(`[KOL] Got ${markdown.length} chars of markdown`);
    return markdown;
  } catch (err) {
    console.error('[KOL] Firecrawl fetch error:', err);
    return null;
  }
}

// Main refresh function - scrapes and upserts
async function refreshKolscanData(supabase: any, timeframe: string = '1'): Promise<RefreshResult> {
  const result: RefreshResult = { added: 0, updated: 0, total_kols: 0, errors: [], scraped_count: 0 };

  try {
    const markdown = await scrapeKolscanLeaderboard(timeframe);
    if (!markdown) {
      result.errors.push('Failed to scrape kolscan.io leaderboard');
      return result;
    }

    const parsed = parseLeaderboardMarkdown(markdown);
    result.scraped_count = parsed.length;
    console.log(`[KOL] Parsed ${parsed.length} KOLs from leaderboard`);

    if (parsed.length === 0) {
      result.errors.push('Parsed 0 KOLs - page structure may have changed');
      return result;
    }

    // Get existing wallets to determine add vs update
    const wallets = parsed.map(k => k.wallet_address);
    const { data: existing } = await supabase
      .from('pumpfun_kol_registry')
      .select('wallet_address, kolscan_rank')
      .in('wallet_address', wallets);

    const existingSet = new Set((existing || []).map((e: any) => e.wallet_address));

    // Upsert all parsed KOLs
    for (const kol of parsed) {
      const isNew = !existingSet.has(kol.wallet_address);
      
      const upsertData: any = {
        wallet_address: kol.wallet_address,
        display_name: kol.nickname,
        kolscan_rank: kol.rank,
        kol_tier: getTier(kol.rank),
        source: 'kolscan',
        is_active: true,
        total_trades: kol.wins + kol.losses,
        successful_pumps: kol.wins,
        last_refreshed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Only set these on new entries
      if (isNew) {
        upsertData.first_seen_at = new Date().toISOString();
        upsertData.created_at = new Date().toISOString();
        upsertData.trust_score = 50; // Neutral starting score
      }

      const { error } = await supabase
        .from('pumpfun_kol_registry')
        .upsert(upsertData, { onConflict: 'wallet_address' });

      if (error) {
        result.errors.push(`Upsert error for ${kol.nickname}: ${error.message}`);
      } else {
        if (isNew) result.added++;
        else result.updated++;
      }
    }

    // Get total count
    const { count } = await supabase
      .from('pumpfun_kol_registry')
      .select('*', { count: 'exact', head: true });

    result.total_kols = count || 0;

    console.log(`[KOL] Refresh complete: ${result.added} added, ${result.updated} updated, ${result.total_kols} total`);

    // Log API usage
    await supabase.from('api_usage_log').insert({
      service_name: 'firecrawl',
      endpoint: '/v1/scrape',
      function_name: 'pumpfun-kol-registry',
      success: true,
      metadata: { 
        scraped_count: result.scraped_count, 
        added: result.added, 
        updated: result.updated,
        timeframe 
      },
    });

  } catch (err: any) {
    result.errors.push(`Refresh error: ${err.message}`);
    console.error('[KOL] Refresh error:', err);
  }

  return result;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, ...params } = await req.json();

    switch (action) {
      case 'refresh-kolscan': {
        const timeframe = params.timeframe || '1'; // 1=daily, 7=weekly, 30=monthly
        const result = await refreshKolscanData(supabase, timeframe);
        return new Response(JSON.stringify({ success: true, ...result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'add-manual': {
        const { kol } = params as { kol: KOLEntry };
        const { data, error } = await supabase
          .from('pumpfun_kol_registry')
          .upsert({
            ...kol,
            source: 'manual',
            first_seen_at: new Date().toISOString(),
            last_refreshed_at: new Date().toISOString()
          }, { onConflict: 'wallet_address' })
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, kol: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'update-trust': {
        const { wallet_address, trust_level, reason, user_id } = params;
        const { data, error } = await supabase
          .from('pumpfun_kol_registry')
          .update({
            manual_trust_level: trust_level,
            manual_override_reason: reason,
            manual_override_by: user_id,
            manual_override_at: new Date().toISOString()
          })
          .eq('wallet_address', wallet_address)
          .select()
          .single();

        if (error) throw error;
        return new Response(JSON.stringify({ success: true, kol: data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-kols': {
        const { tier, active_only, limit = 100, offset = 0 } = params;
        let query = supabase
          .from('pumpfun_kol_registry')
          .select('*')
          .order('kolscan_rank', { ascending: true, nullsFirst: false })
          .range(offset, offset + limit - 1);

        if (tier) query = query.eq('kol_tier', tier);
        if (active_only) query = query.eq('is_active', true);

        const { data, error, count } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, kols: data, count }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'check-wallets': {
        const { wallets } = params as { wallets: string[] };
        const { data, error } = await supabase
          .from('pumpfun_kol_registry')
          .select('*')
          .in('wallet_address', wallets)
          .eq('is_active', true);

        if (error) throw error;

        const kolMap = new Map(data?.map((k: any) => [k.wallet_address, k]) || []);
        const results = wallets.map(w => ({
          wallet: w,
          is_kol: kolMap.has(w),
          kol_data: kolMap.get(w) || null
        }));

        return new Response(JSON.stringify({ 
          success: true, 
          results,
          kols_found: data?.length || 0,
          total_checked: wallets.length
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'delete-kol': {
        const { wallet_address } = params;
        const { error } = await supabase
          .from('pumpfun_kol_registry')
          .delete()
          .eq('wallet_address', wallet_address);

        if (error) throw error;
        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      case 'get-stats': {
        const { data: stats } = await supabase
          .from('pumpfun_kol_registry')
          .select('kol_tier, trust_score, chart_kills, successful_pumps, is_active');

        const total = stats?.length || 0;
        const active = stats?.filter((k: any) => k.is_active).length || 0;
        const byTier = {
          top_10: stats?.filter((k: any) => k.kol_tier === 'top_10').length || 0,
          top_50: stats?.filter((k: any) => k.kol_tier === 'top_50').length || 0,
          top_100: stats?.filter((k: any) => k.kol_tier === 'top_100').length || 0,
          verified: stats?.filter((k: any) => k.kol_tier === 'verified').length || 0,
          suspected: stats?.filter((k: any) => k.kol_tier === 'suspected').length || 0,
        };
        const avgTrust = stats?.reduce((sum: number, k: any) => sum + (k.trust_score || 50), 0) / (total || 1);
        const totalKills = stats?.reduce((sum: number, k: any) => sum + (k.chart_kills || 0), 0) || 0;
        const totalPumps = stats?.reduce((sum: number, k: any) => sum + (k.successful_pumps || 0), 0) || 0;

        return new Response(JSON.stringify({
          success: true,
          stats: { total, active, byTier, avgTrust, totalKills, totalPumps }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Unknown action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
  } catch (error: any) {
    console.error('KOL Registry error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
