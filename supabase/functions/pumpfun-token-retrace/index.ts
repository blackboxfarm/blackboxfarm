import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PumpfunCoin {
  mint: string;
  name: string;
  symbol: string;
  description?: string;
  image_uri?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  creator: string;
  created_timestamp?: number;
  complete?: boolean;
  usd_market_cap?: number;
}

interface RetraceResult {
  tokenMint: string;
  status: 'completed' | 'partial' | 'failed';
  data: {
    token: any;
    mintWallet: string;
    parentWallet?: string;
    walletGenealogy: any;
    pumpfunSocials: any;
    dexscreenerSocials: any;
    isCTO: boolean;
    kolsInvolved: string[];
    communityData: any;
    developerProfile?: any;
  };
  errors: string[];
}

// Fetch token data from pump.fun API
async function fetchPumpfunToken(mint: string): Promise<PumpfunCoin | null> {
  try {
    const response = await fetch(
      `https://frontend-api.pump.fun/coins/${mint}`,
      {
        headers: {
          'Accept': 'application/json',
          'Origin': 'https://pump.fun'
        }
      }
    );
    
    if (!response.ok) {
      console.log(`Pump.fun token fetch failed: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Pump.fun token fetch error:', error);
    return null;
  }
}

// Fetch community replies for a token
async function fetchTokenReplies(mint: string, limit = 50): Promise<any[]> {
  try {
    // Pump.fun stores replies by mint address
    const response = await fetch(
      `https://frontend-api.pump.fun/replies/${mint}?limit=${limit}&offset=0`,
      {
        headers: {
          'Accept': 'application/json',
          'Origin': 'https://pump.fun'
        }
      }
    );
    
    if (!response.ok) return [];
    return await response.json();
  } catch (error) {
    console.error('Replies fetch error:', error);
    return [];
  }
}

// Check for livestream/clips for a token
async function checkLivestream(mint: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://frontend-api.pump.fun/clips/${mint}`,
      {
        headers: {
          'Accept': 'application/json',
          'Origin': 'https://pump.fun'
        }
      }
    );
    
    if (!response.ok) return false;
    const data = await response.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

// Fetch DexScreener data for graduated tokens
async function fetchDexScreenerData(mint: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { signal: AbortSignal.timeout(5000) }
    );
    
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error('DexScreener fetch error:', error);
    return null;
  }
}

// Extract socials from DexScreener
function extractDexSocials(dexData: any): { twitter?: string; telegram?: string; website?: string } {
  const socials: { twitter?: string; telegram?: string; website?: string } = {};
  
  if (!dexData?.pairs?.[0]?.info) return socials;
  
  const info = dexData.pairs[0].info;
  
  if (Array.isArray(info.socials)) {
    for (const social of info.socials) {
      const url = social.url || social;
      if (!url) continue;
      
      if (url.includes('twitter.com') || url.includes('x.com')) {
        socials.twitter = url;
      } else if (url.includes('t.me') || url.includes('telegram')) {
        socials.telegram = url;
      }
    }
  }
  
  if (Array.isArray(info.websites)) {
    for (const site of info.websites) {
      const url = site.url || site;
      if (url && !url.includes('pump.fun') && !url.includes('raydium')) {
        socials.website = url;
        break;
      }
    }
  }
  
  return socials;
}

// Check if socials changed (CTO detection)
function detectCTO(pumpfunSocials: any, dexSocials: any): boolean {
  // If pump.fun had Twitter and DexScreener has a different one, likely CTO
  if (pumpfunSocials.twitter && dexSocials.twitter) {
    const pfHandle = extractTwitterHandle(pumpfunSocials.twitter);
    const dexHandle = extractTwitterHandle(dexSocials.twitter);
    if (pfHandle && dexHandle && pfHandle !== dexHandle) {
      return true;
    }
  }
  
  // If pump.fun had no socials but DexScreener has them, might be CTO
  if (!pumpfunSocials.twitter && !pumpfunSocials.telegram && dexSocials.twitter) {
    return true;
  }
  
  return false;
}

function extractTwitterHandle(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
  return match ? match[1].toLowerCase() : null;
}

// Trace wallet genealogy (simplified - calls developer-wallet-tracer internally)
async function traceWalletGenealogy(
  supabase: any,
  mintWallet: string,
  authToken: string
): Promise<{ parentWallet?: string; grandparent?: string; genealogy: any; cexSource?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('developer-wallet-tracer', {
      body: { walletAddress: mintWallet, maxDepth: 5, minAmountSol: 0.1 },
      headers: { Authorization: `Bearer ${authToken}` }
    });
    
    if (error || !data?.success) {
      console.log('Wallet tracer failed:', error || data?.error);
      return { genealogy: {} };
    }
    
    // Extract parent from funding tree
    let parentWallet: string | undefined;
    let grandparent: string | undefined;
    let cexSource: string | undefined;
    
    if (data.fundingTree?.children?.length > 0) {
      parentWallet = data.fundingTree.children[0].wallet;
      
      if (data.fundingTree.children[0].children?.length > 0) {
        grandparent = data.fundingTree.children[0].children[0].wallet;
      }
    }
    
    if (data.cexSources?.length > 0) {
      cexSource = data.cexSources[0].exchange;
    }
    
    return {
      parentWallet,
      grandparent,
      genealogy: data.fundingTree,
      cexSource
    };
  } catch (error) {
    console.error('Wallet genealogy error:', error);
    return { genealogy: {} };
  }
}

// Check KOL involvement from our registry
async function checkKOLInvolvement(
  supabase: any,
  tokenMint: string
): Promise<{ kols: string[]; buyCount: number; sellCount: number; timeline: any[] }> {
  try {
    const { data: activity } = await supabase
      .from('pumpfun_kol_activity')
      .select('*, pumpfun_kol_registry!inner(wallet_address, display_name, twitter_handle)')
      .eq('token_mint', tokenMint)
      .order('detected_at', { ascending: true });
    
    if (!activity || activity.length === 0) {
      return { kols: [], buyCount: 0, sellCount: 0, timeline: [] };
    }
    
    const kols = [...new Set(activity.map((a: any) => a.kol_wallet))];
    const buyCount = activity.filter((a: any) => a.action === 'buy').length;
    const sellCount = activity.filter((a: any) => a.action === 'sell').length;
    
    const timeline = activity.map((a: any) => ({
      wallet: a.kol_wallet,
      name: a.pumpfun_kol_registry?.display_name || a.pumpfun_kol_registry?.twitter_handle,
      action: a.action,
      amountSol: a.amount_sol,
      timestamp: a.detected_at,
      chartKilled: a.chart_killed
    }));
    
    return { kols, buyCount, sellCount, timeline };
  } catch (error) {
    console.error('KOL check error:', error);
    return { kols: [], buyCount: 0, sellCount: 0, timeline: [] };
  }
}

// Get developer profile from our database
async function getDeveloperProfile(
  supabase: any,
  creatorWallet: string
): Promise<any | null> {
  try {
    const { data } = await supabase
      .from('dev_wallet_reputation')
      .select('*')
      .eq('wallet_address', creatorWallet)
      .maybeSingle();
    
    return data;
  } catch (error) {
    return null;
  }
}

// Analyze community sentiment from replies
function analyzeCommunityReplies(replies: any[]): { count: number; sentiment: string } {
  if (!replies || replies.length === 0) {
    return { count: 0, sentiment: 'unknown' };
  }
  
  const count = replies.length;
  
  // Simple sentiment analysis based on common phrases
  const bullishTerms = ['moon', 'pump', 'lfg', 'buy', 'bullish', 'gem', 'sending', '🚀', '💎'];
  const bearishTerms = ['rug', 'scam', 'dump', 'sell', 'dead', 'rip', 'jeet'];
  
  let bullishCount = 0;
  let bearishCount = 0;
  
  for (const reply of replies) {
    const text = (reply.text || '').toLowerCase();
    bullishCount += bullishTerms.filter(t => text.includes(t)).length;
    bearishCount += bearishTerms.filter(t => text.includes(t)).length;
  }
  
  if (bullishCount > bearishCount * 2) return { count, sentiment: 'bullish' };
  if (bearishCount > bullishCount * 2) return { count, sentiment: 'bearish' };
  if (bullishCount > 0 || bearishCount > 0) return { count, sentiment: 'mixed' };
  return { count, sentiment: 'unknown' };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check super admin
    const { data: isSuperAdmin } = await supabase.rpc('is_super_admin', { _user_id: user.id });
    if (!isSuperAdmin) {
      return new Response(
        JSON.stringify({ error: 'Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { action, tokenMint, tokenMints } = await req.json();

    switch (action) {
      case 'analyze': {
        if (!tokenMint) {
          return new Response(
            JSON.stringify({ error: 'tokenMint required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log(`[TokenRetrace] Starting analysis for ${tokenMint}`);
        const errors: string[] = [];

        // Mark analysis as in progress
        await supabase
          .from('pumpfun_token_retraces')
          .upsert({
            token_mint: tokenMint,
            analysis_status: 'in_progress',
            analysis_started_at: new Date().toISOString()
          }, { onConflict: 'token_mint' });

        // Step 1: Fetch token from pump.fun
        const pumpToken = await fetchPumpfunToken(tokenMint);
        if (!pumpToken) {
          errors.push('Could not fetch token from pump.fun API');
        }

        // Step 2: Fetch DexScreener data
        const dexData = await fetchDexScreenerData(tokenMint);
        const dexSocials = dexData ? extractDexSocials(dexData) : {};
        
        // Step 3: Pump.fun socials (original team)
        const pumpfunSocials = {
          twitter: pumpToken?.twitter,
          telegram: pumpToken?.telegram,
          website: pumpToken?.website,
          description: pumpToken?.description
        };

        // Step 4: Detect CTO
        const isCTO = detectCTO(pumpfunSocials, dexSocials);

        // Step 5: Get community data
        const replies = await fetchTokenReplies(tokenMint);
        const communityAnalysis = analyzeCommunityReplies(replies);
        const hasLivestream = await checkLivestream(tokenMint);

        // Step 6: Get mint wallet
        const mintWallet = pumpToken?.creator || '';

        // Step 7: Trace wallet genealogy
        let walletGenealogy = { genealogy: {}, parentWallet: undefined, cexSource: undefined };
        if (mintWallet) {
          walletGenealogy = await traceWalletGenealogy(supabase, mintWallet, token);
        }

        // Step 8: Check KOL involvement
        const kolData = await checkKOLInvolvement(supabase, tokenMint);

        // Step 9: Get developer profile
        let devProfile = null;
        if (mintWallet) {
          devProfile = await getDeveloperProfile(supabase, mintWallet);
        }

        // Get market cap from DexScreener
        const marketCap = dexData?.pairs?.[0]?.marketCap || dexData?.pairs?.[0]?.fdv || 0;
        const isGraduated = pumpToken?.complete === true;

        // Save to database
        const retraceData = {
          token_mint: tokenMint,
          token_name: pumpToken?.name || dexData?.pairs?.[0]?.baseToken?.name,
          token_symbol: pumpToken?.symbol || dexData?.pairs?.[0]?.baseToken?.symbol,
          token_image: pumpToken?.image_uri || dexData?.pairs?.[0]?.info?.imageUrl,
          launched_at: pumpToken?.created_timestamp 
            ? new Date(pumpToken.created_timestamp).toISOString() 
            : null,
          is_graduated: isGraduated,
          current_market_cap_usd: marketCap,
          mint_wallet: mintWallet,
          parent_wallet: walletGenealogy.parentWallet,
          grandparent_wallet: walletGenealogy.grandparent,
          funding_source_type: walletGenealogy.cexSource ? 'cex_withdrawal' : 'unknown',
          funding_cex_name: walletGenealogy.cexSource,
          wallet_genealogy_json: walletGenealogy.genealogy,
          pumpfun_twitter: pumpfunSocials.twitter,
          pumpfun_telegram: pumpfunSocials.telegram,
          pumpfun_website: pumpfunSocials.website,
          pumpfun_description: pumpfunSocials.description,
          dexscreener_twitter: dexSocials.twitter,
          dexscreener_telegram: dexSocials.telegram,
          dexscreener_website: dexSocials.website,
          is_cto_detected: isCTO,
          socials_changed: isCTO || (!!dexSocials.twitter && dexSocials.twitter !== pumpfunSocials.twitter),
          original_team_socials: pumpfunSocials,
          total_replies: communityAnalysis.count,
          livestream_detected: hasLivestream,
          community_sentiment: communityAnalysis.sentiment,
          kols_involved: kolData.kols,
          kol_buy_count: kolData.buyCount,
          kol_sell_count: kolData.sellCount,
          kol_timeline: kolData.timeline,
          developer_id: devProfile?.id,
          developer_trust_level: devProfile?.trust_level,
          developer_total_tokens: devProfile?.total_tokens_launched,
          developer_success_rate: devProfile?.success_rate_pct,
          analysis_status: errors.length > 0 ? 'partial' : 'completed',
          analysis_completed_at: new Date().toISOString(),
          analysis_notes: errors.length > 0 ? errors.join('; ') : null,
          updated_at: new Date().toISOString()
        };

        await supabase
          .from('pumpfun_token_retraces')
          .upsert(retraceData, { onConflict: 'token_mint' });

        console.log(`[TokenRetrace] Completed analysis for ${tokenMint}`);

        return new Response(
          JSON.stringify({
            success: true,
            status: errors.length > 0 ? 'partial' : 'completed',
            data: retraceData,
            errors
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'get': {
        if (!tokenMint) {
          return new Response(
            JSON.stringify({ error: 'tokenMint required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data } = await supabase
          .from('pumpfun_token_retraces')
          .select('*')
          .eq('token_mint', tokenMint)
          .maybeSingle();

        return new Response(
          JSON.stringify({ success: true, data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'list': {
        const { data } = await supabase
          .from('pumpfun_token_retraces')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);

        return new Response(
          JSON.stringify({ success: true, data: data || [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        if (!tokenMint) {
          return new Response(
            JSON.stringify({ error: 'tokenMint required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        await supabase
          .from('pumpfun_token_retraces')
          .delete()
          .eq('token_mint', tokenMint);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[TokenRetrace] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
