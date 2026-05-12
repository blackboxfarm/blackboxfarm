// dev-profile-full-scrape
// Scrape the FULL list of tokens created by a dev wallet from pump.fun
// (paginated, no 200 cap). Writes lean lifecycle rows into dev_token_history.
// Used for Dev Track-Record Engine.

import { withRunLog } from '../_shared/run-logger.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.54.0';
import { fetchPumpFunCreatorCoins } from '../_shared/pumpfun-fetch.ts';
import { assertUpsert } from '../_shared/db-assert.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PAGE_SIZE = 100;
const HARD_PAGE_CAP = 30; // 30 * 100 = 3000 coins, more than enough

Deno.serve(withRunLog('dev-profile-full-scrape', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const dev_wallet: string | undefined = body.dev_wallet?.trim();
  if (!dev_wallet || dev_wallet.length < 32) {
    return new Response(JSON.stringify({ error: 'dev_wallet required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const collected: any[] = [];
  let offset = 0;
  let pages = 0;
  for (let i = 0; i < HARD_PAGE_CAP; i++) {
    const data = await fetchPumpFunCreatorCoins(dev_wallet, 'dev-profile-full-scrape', PAGE_SIZE, offset);
    if (!data || data.length === 0) break;
    collected.push(...data);
    pages++;
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    // be polite to pump.fun
    await new Promise(r => setTimeout(r, 600));
  }

  let upserted = 0;
  for (const c of collected) {
    const mint: string | undefined = c?.mint;
    if (!mint) continue;
    const launchpad = mint.endsWith('pump') ? 'pump'
      : mint.endsWith('BAGS') ? 'bags'
      : mint.endsWith('BONK') ? 'bonk' : 'other';
    const created_at_chain = c?.created_timestamp ? new Date(Number(c.created_timestamp)).toISOString() : null;
    const last_trade_at = c?.last_trade_timestamp ? new Date(Number(c.last_trade_timestamp)).toISOString() : null;
    await assertUpsert(
      supabase.from('dev_token_history').upsert({
        dev_wallet,
        token_mint: mint,
        launchpad,
        ticker: c?.symbol ?? null,
        name: c?.name ?? null,
        image_url: c?.image_uri ?? null,
        created_at_chain,
        pumpfun_market_cap_usd: Number(c?.usd_market_cap) || null,
        pumpfun_complete: c?.complete === true,
        last_trade_at,
        scraped_at: new Date().toISOString(),
      }, { onConflict: 'dev_wallet,token_mint' }),
      'dev_token_history',
    );
    upserted++;
  }

  // Stamp the summary row's last_full_scrape_at + total_tokens
  await assertUpsert(
    supabase.from('dev_track_record_summary').upsert({
      dev_wallet,
      total_tokens: upserted,
      last_full_scrape_at: new Date().toISOString(),
    }, { onConflict: 'dev_wallet' }),
    'dev_track_record_summary',
  );

  return new Response(
    JSON.stringify({ ok: true, dev_wallet, pages, scraped: collected.length, upserted }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
}));
