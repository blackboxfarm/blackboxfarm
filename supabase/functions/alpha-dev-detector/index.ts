// alpha-dev-detector
// Called by insiders-row-ingest for every new mint. Checks whether the
// mint's dev wallet or KYC funding root matches a known-alpha group in
// alpha_dev_wallets / alpha_kyc_groups. If quality gate passes:
//   1. Fetch live entry mcap (DexScreener → Pump.fun bonding curve)
//   2. Insert alpha_paper_trades row ($100 paper buy, hold)
//   3. SMS admin (+1-226-583-5975) via Twilio gateway
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TWILIO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM = '+16624814161';
const ADMIN_PHONE = '+12265835975';

async function fetchDexEntry(mint: string): Promise<{ mcap: number | null; price: number | null; ticker: string | null }> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!r.ok) return { mcap: null, price: null, ticker: null };
    const j = await r.json();
    const p = (j?.pairs || [])[0];
    if (!p) return { mcap: null, price: null, ticker: null };
    return {
      mcap: Number(p.marketCap ?? p.fdv ?? null) || null,
      price: Number(p.priceUsd) || null,
      ticker: p.baseToken?.symbol || null,
    };
  } catch { return { mcap: null, price: null, ticker: null }; }
}

async function fetchPumpEntry(mint: string): Promise<{ mcap: number | null; price: number | null; ticker: string | null }> {
  try {
    const r = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!r.ok) return { mcap: null, price: null, ticker: null };
    const j = await r.json();
    return {
      mcap: Number(j?.usd_market_cap) || null,
      price: null,
      ticker: j?.symbol || null,
    };
  } catch { return { mcap: null, price: null, ticker: null }; }
}

async function sendSms(body: string): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) return { ok: false, error: 'missing_twilio_creds' };
  try {
    const message = body.length > 1600 ? body.slice(0, 1597) + '...' : body;
    const res = await fetch(`${TWILIO_GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: ADMIN_PHONE, From: TWILIO_FROM, Body: message }),
    });
    if (!res.ok) return { ok: false, error: `twilio_${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

function fmtMoney(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const mint: string | undefined = body?.mint;
  const source: string = body?.source || 'insiders';
  if (!mint || mint.length < 32) {
    return new Response(JSON.stringify({ ok: false, error: 'mint required' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Config
  const { data: cfg } = await supabase.from('alpha_config').select('*').eq('id', 1).maybeSingle();
  const config = cfg || {
    min_best_multiplier: 10, min_repeat_token_count: 2, min_repeat_avg_multiplier: 3,
    kyc_min_distinct_devs: 3, kyc_min_avg_multiplier: 2, paper_size_usd: 100,
    enabled: true, sms_enabled: true,
  };
  if (!config.enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'disabled' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Idempotent — don't re-buy the same mint
  const { data: existing } = await supabase.from('alpha_paper_trades').select('id').eq('mint', mint).maybeSingle();
  if (existing) {
    return new Response(JSON.stringify({ ok: true, skipped: 'already_bought', paper_trade_id: existing.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Resolve dev wallet — check known-cache tables + insider lifecycle row
  let devWallet: string | null = null;
  const { data: lc } = await supabase.from('telegram_insider_token_lifecycle')
    .select('dev_wallet, creator_wallet, genealogy_kyc_root, kyc_label, token_symbol')
    .eq('token_mint', mint).maybeSingle();
  if (lc?.dev_wallet) devWallet = lc.dev_wallet;

  if (!devWallet) {
    for (const tbl of ['pumpfun_watchlist', 'scraped_tokens', 'token_lifecycle', 'developer_tokens']) {
      const { data } = await (supabase as any).from(tbl).select('creator_wallet').eq('token_mint', mint).maybeSingle();
      if (data?.creator_wallet) { devWallet = data.creator_wallet; break; }
    }
  }

  // If still no dev wallet, invoke resolver (best-effort, quick)
  if (!devWallet) {
    try {
      const { data } = await supabase.functions.invoke('creator-wallet-resolver', { body: { tokenMint: mint, batchSize: 1 } });
      const r = data?.results?.[0];
      if (r?.ok && r.creator) devWallet = r.creator;
    } catch {}
  }

  // Resolve KYC root for this dev
  let kycRoot: string | null = lc?.genealogy_kyc_root ?? null;
  let kycLabel: string | null = lc?.kyc_label ?? null;
  if (devWallet && !kycRoot) {
    const { data: dp } = await (supabase as any).from('developer_profiles')
      .select('kyc_root_wallet, kyc_root_label').eq('master_wallet_address', devWallet).maybeSingle();
    if (dp?.kyc_root_wallet) { kycRoot = dp.kyc_root_wallet; kycLabel = dp.kyc_root_label || kycLabel; }
  }
  if (devWallet && !kycRoot) {
    const { data: dr } = await (supabase as any).from('dev_wallet_reputation')
      .select('trail_end_kyc_root').eq('wallet_address', devWallet).maybeSingle();
    if (dr?.trail_end_kyc_root) kycRoot = dr.trail_end_kyc_root;
  }
  if (kycRoot && !kycLabel) {
    const { data: cex } = await (supabase as any).from('known_cex_wallets')
      .select('cex_name, cex_label').eq('wallet_address', kycRoot).maybeSingle();
    if (cex) kycLabel = cex.cex_label || cex.cex_name || null;
  }

  // Match against alpha lists
  let matchKind: 'dev' | 'kyc' | null = null;
  let devHit: any = null;
  let kycHit: any = null;
  let reason = '';

  if (devWallet) {
    const { data } = await supabase.from('alpha_dev_wallets').select('*').eq('dev_wallet', devWallet).maybeSingle();
    if (data) {
      const qBest = Number(data.best_multiplier || 0) >= config.min_best_multiplier;
      const qRepeat = Number(data.token_count || 0) >= config.min_repeat_token_count
        && Number(data.avg_multiplier || 0) >= config.min_repeat_avg_multiplier;
      if (qBest || qRepeat) {
        matchKind = 'dev';
        devHit = data;
        reason = qBest
          ? `dev best ${data.best_multiplier}x on $${data.best_ticker}`
          : `dev repeat ${data.token_count} tokens, avg ${Number(data.avg_multiplier).toFixed(1)}x`;
      }
    }
  }

  if (!matchKind && kycRoot) {
    const { data } = await supabase.from('alpha_kyc_groups').select('*').eq('kyc_root', kycRoot).maybeSingle();
    if (data) {
      const qBest = Number(data.best_multiplier || 0) >= config.min_best_multiplier;
      const qGroup = Number(data.distinct_dev_count || 0) >= config.kyc_min_distinct_devs
        && Number(data.avg_multiplier || 0) >= config.kyc_min_avg_multiplier;
      if (qBest || qGroup) {
        matchKind = 'kyc';
        kycHit = data;
        reason = qBest
          ? `KYC group best ${data.best_multiplier}x on $${data.best_ticker}`
          : `KYC group ${data.distinct_dev_count} devs, ${data.token_count} tokens, avg ${Number(data.avg_multiplier).toFixed(1)}x`;
      }
    }
  }

  if (!matchKind) {
    return new Response(JSON.stringify({
      ok: true, matched: false, mint, dev_wallet: devWallet, kyc_root: kycRoot,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  // Live entry mcap
  let entry = await fetchDexEntry(mint);
  if (!entry.mcap) entry = await fetchPumpEntry(mint);
  const ticker = entry.ticker || lc?.token_symbol || null;

  // Insert paper trade
  const insertRow: any = {
    mint,
    ticker,
    entry_market_cap: entry.mcap,
    entry_price_usd: entry.price,
    size_usd: config.paper_size_usd,
    strategy: 'hold',
    status: 'open',
    match_kind: matchKind,
    matched_dev_wallet: devWallet,
    matched_kyc_root: kycRoot,
    matched_kyc_label: kycLabel,
    dev_best_multiplier: devHit?.best_multiplier ?? kycHit?.best_multiplier ?? null,
    dev_best_ticker: devHit?.best_ticker ?? kycHit?.best_ticker ?? null,
    group_token_count: kycHit?.token_count ?? devHit?.token_count ?? null,
    group_avg_multiplier: kycHit?.avg_multiplier ?? devHit?.avg_multiplier ?? null,
    reason,
    source,
  };
  const { data: trade, error: insErr } = await supabase.from('alpha_paper_trades')
    .insert(insertRow).select('id').single();
  if (insErr) {
    // Race: another invocation already bought this mint
    if (String(insErr.message || '').includes('duplicate')) {
      return new Response(JSON.stringify({ ok: true, skipped: 'race_duplicate' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    console.error('[alpha-dev-detector] insert failed', insErr.message);
    return new Response(JSON.stringify({ ok: false, error: insErr.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // SMS
  let smsStatus = 'skipped';
  let smsError: string | null = null;
  if (config.sms_enabled) {
    const shortDev = devWallet ? `${devWallet.slice(0, 4)}…${devWallet.slice(-4)}` : '—';
    const smsBody =
      `🚨 ALPHA DEV DETECTED\n` +
      `$${ticker || mint.slice(0, 6)}\n` +
      `Entry MC: ${fmtMoney(entry.mcap)}\n` +
      `Match: ${matchKind === 'dev' ? `dev ${shortDev}` : `KYC ${kycLabel || kycRoot?.slice(0, 8)}`}\n` +
      `${reason}\n` +
      `Paper buy: $${config.paper_size_usd} → HOLD\n\n` +
      `CA (tap to copy):\n${mint}\n\n` +
      `Pump: https://pump.fun/coin/${mint}\n` +
      `Dex:  https://dexscreener.com/solana/${mint}`;
    const r = await sendSms(smsBody);
    smsStatus = r.ok ? 'sent' : 'failed';
    smsError = r.error ?? null;
  }
  await supabase.from('alpha_paper_trades').update({
    sms_status: smsStatus, sms_error: smsError, sms_sent_at: new Date().toISOString(),
  }).eq('id', trade.id);

  return new Response(JSON.stringify({
    ok: true, matched: true, match_kind: matchKind, paper_trade_id: trade.id,
    ticker, entry_mcap: entry.mcap, reason, sms_status: smsStatus,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});