import { withRunLog } from '../_shared/run-logger.ts';
import { enableHeliusTracking } from '../_shared/helius-fetch-interceptor.ts';
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { meshFeed } from '../_shared/mesh-feeder.ts';
import { fetchPumpFunCoin, resetPumpFunRunStats } from '../_shared/pumpfun-fetch.ts';
enableHeliusTracking('token-metadata-batch');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TokenInfo {
  mint: string;
  name?: string;
  symbol?: string;
  image?: string;
  createdAt?: string;
  createdTimestampMs?: number;
  description?: string;
  twitter?: string | null;
  telegram?: string | null;
  website?: string | null;
  marketCap?: number;
  launchpad?: string;
}

async function fetchPumpFunData(mint: string): Promise<Partial<TokenInfo>> {
  try {
    const data = await fetchPumpFunCoin(mint, 'token-metadata-batch');
    if (!data) return {};
    return {
      name: data.name,
      symbol: data.symbol,
      image: data.image_uri,
      createdAt: data.created_timestamp ? new Date(data.created_timestamp).toISOString() : undefined,
      createdTimestampMs: data.created_timestamp || undefined,
      description: data.description || undefined,
      twitter: data.twitter || null,
      telegram: data.telegram || null,
      website: data.website || null,
      marketCap: data.usd_market_cap,
      launchpad: 'pump.fun'
    };
  } catch {
    return {};
  }
}

async function fetchDexScreenerData(mint: string): Promise<Partial<TokenInfo>> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!response.ok) return {};
    const data = await response.json();
    const pair = data.pairs?.[0];
    if (!pair) return {};
    return {
      name: pair.baseToken?.name,
      symbol: pair.baseToken?.symbol,
      marketCap: pair.marketCap,
    };
  } catch {
    return {};
  }
}

Deno.serve(withRunLog('token-metadata-batch', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mints } = await req.json();
    
    if (!mints || !Array.isArray(mints)) {
      throw new Error('mints array is required');
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const wanted: string[] = mints.slice(0, 50).filter(Boolean);
    const byMint: Record<string, TokenInfo> = {};

    // ─── 1) MESH-DB FIRST: serve everything we already know from token_metadata ───
    if (wanted.length) {
      const { data: cached } = await supabase
        .from('token_metadata')
        .select('mint_address, name, symbol, logo_uri, description')
        .in('mint_address', wanted);
      for (const r of (cached || []) as any[]) {
        if (!r.name && !r.symbol) continue; // treat as miss
        byMint[r.mint_address] = {
          mint: r.mint_address,
          name: r.name || undefined,
          symbol: r.symbol || undefined,
          image: r.logo_uri || undefined,
          description: r.description || undefined,
        };
      }

      // Pull socials from token_social_links in one shot
      const { data: socials } = await supabase
        .from('token_social_links')
        .select('token_mint, platform, url, is_current')
        .in('token_mint', wanted)
        .eq('is_current', true);
      for (const s of (socials || []) as any[]) {
        const t = (byMint[s.token_mint] ||= { mint: s.token_mint });
        if (s.platform === 'twitter' && !t.twitter) t.twitter = s.url;
        else if (s.platform === 'telegram' && !t.telegram) t.telegram = s.url;
        else if (s.platform === 'website' && !t.website) t.website = s.url;
      }
    }

    // ─── 2) ONLY REMOTE-FETCH THE MISSES (cap at 10 to stay under timeout) ───
    const misses = wanted.filter((m) => !byMint[m]?.name).slice(0, 10);
    const freshlyFetched: TokenInfo[] = [];
    for (const mint of misses) {
      await new Promise((r) => setTimeout(r, 50));
      const pumpData = await fetchPumpFunData(mint);
      let tokenInfo: TokenInfo = { mint, ...pumpData };
      if (!tokenInfo.name) {
        const dexData = await fetchDexScreenerData(mint);
        tokenInfo = { ...tokenInfo, ...dexData };
      }
      byMint[mint] = { ...byMint[mint], ...tokenInfo };
      if (tokenInfo.name || tokenInfo.symbol || tokenInfo.image) freshlyFetched.push(byMint[mint]);
    }

    // ─── 3) WRITE-BACK to token_metadata so next call is instant ───
    if (freshlyFetched.length) {
      const rows = freshlyFetched.map((t) => ({
        mint_address: t.mint,
        name: t.name ?? null,
        symbol: t.symbol ?? null,
        logo_uri: t.image ?? null,
        description: t.description ?? null,
        updated_at: new Date().toISOString(),
      }));
      await supabase.from('token_metadata').upsert(rows, { onConflict: 'mint_address' })
        .then(({ error }) => { if (error) console.warn('[token-metadata-batch] cache write failed:', error.message); });
    }

    // Ensure result preserves request order and every requested mint has an entry
    const results: TokenInfo[] = wanted.map((m) => byMint[m] || { mint: m });

    // 🕸️ MESH FEEDER: passive cross-feed
    try {
      meshFeed.tokenBatch(supabase, freshlyFetched.filter(t => t.name).map(t => ({
        mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        source: 'token-metadata-batch',
      }))).catch(e => console.warn('[mesh-feeder] batch feed failed:', e));
    } catch (e) {
      console.warn('[mesh-feeder] feed failed:', e);
    }

    return new Response(
      JSON.stringify({ tokens: results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
}));

