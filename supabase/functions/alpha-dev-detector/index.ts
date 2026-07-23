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

// ---------- Live-buy helpers (FlipIt wallet) ----------
async function fetchSolBalance(pubkey: string): Promise<number | null> {
  const heliusKey = Deno.env.get('HELIUS_API_KEY');
  const rpcs = [
    heliusKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}` : null,
    'https://api.mainnet-beta.solana.com',
  ].filter(Boolean) as string[];
  for (const url of rpcs) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [pubkey] }),
      });
      const j = await r.json();
      const lamports = j?.result?.value;
      if (typeof lamports === 'number') return lamports / 1e9;
    } catch {}
  }
  return null;
}

async function fetchSolPriceUsd(): Promise<number | null> {
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
    const j = await r.json();
    const p = (j?.pairs || []).find((x: any) => Number(x?.priceUsd) > 0);
    if (p) return Number(p.priceUsd);
  } catch {}
  try {
    const r = await fetch('https://price.jup.ag/v6/price?ids=SOL');
    const j = await r.json();
    const p = Number(j?.data?.SOL?.price);
    if (p > 0) return p;
  } catch {}
  return null;
}

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

async function sendSms(
  body: string,
  mediaUrl?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TWILIO_API_KEY = Deno.env.get('TWILIO_API_KEY');
  if (!LOVABLE_API_KEY || !TWILIO_API_KEY) return { ok: false, error: 'missing_twilio_creds' };
  try {
    const message = body.length > 1600 ? body.slice(0, 1597) + '...' : body;
    const params: Record<string, string> = { To: ADMIN_PHONE, From: TWILIO_FROM, Body: message };
    if (mediaUrl) params.MediaUrl = mediaUrl;
    const res = await fetch(`${TWILIO_GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TWILIO_API_KEY,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(params),
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
  // Test SMS mode — sends a sample alpha alert to admin
  if (body?.test_sms) {
    const testMint = body.mint || '33eum82LaAhtv5YkUq1BdwEviSErH5CnFxqVNLT5pump';
    const testTicker = body.ticker || 'WORLDCUP';
    const testMc = body.entry_mcap || 255000;
    const msg =
      `🚨 ALPHA DEV DETECTED (TEST)\n` +
      `$${testTicker}\n` +
      `Entry MC: ${fmtMoney(testMc)}\n` +
      `Match: dev 3fKF…9xy2\n` +
      `Dev best: 12x on $SAMPLE\n` +
      `Paper buy: $100 → HOLD\n\n` +
      `CA (tap to copy):\n${testMint}\n\n` +
      `Pump: https://pump.fun/coin/${testMint}\n` +
      `Dex:  https://dexscreener.com/solana/${testMint}`;
    const r = await sendSms(msg);
    return new Response(JSON.stringify({ ok: r.ok, error: r.error, sent_to: ADMIN_PHONE }), {
      status: r.ok ? 200 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
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
  let matchKind: 'dev' | 'person' | 'kyc' | null = null;
  let devHit: any = null;
  let personHit: any = null;
  let kycHit: any = null;
  let reason = '';
  let personRoot: string | null = null;

  if (devWallet) {
    const { data: rows } = await supabase.from('insiders_recap_entries')
      .select('ticker, token_mint, multiplier')
      .eq('dev_wallet', devWallet);
    if (rows && rows.length > 0) {
      const mults = rows.map((r: any) => Number(r.multiplier || 0));
      const best = Math.max(...mults, 0);
      const avg = mults.reduce((a: number, b: number) => a + b, 0) / mults.length;
      const bestRow = rows.reduce((a: any, b: any) =>
        Number(a.multiplier || 0) >= Number(b.multiplier || 0) ? a : b);
      const agg = {
        token_count: rows.length,
        avg_multiplier: avg,
        best_multiplier: best,
        best_ticker: bestRow.ticker,
        best_mint: bestRow.token_mint,
      };
      const qBest = best >= Number(config.min_best_multiplier);
      const qRepeat = rows.length >= Number(config.min_repeat_token_count)
        && avg >= Number(config.min_repeat_avg_multiplier);
      if (qBest || qRepeat) {
        matchKind = 'dev';
        devHit = agg;
        reason = qBest
          ? `dev best ${best}x on $${bestRow.ticker}`
          : `dev repeat ${rows.length} tokens, avg ${avg.toFixed(1)}x`;
      }
    }
  }

  if (!matchKind && kycRoot) {
    // Resolve/lookup person_root for this dev (fire-and-wait, best-effort).
    if (devWallet) {
      const { data: existing } = await supabase
        .from('insiders_recap_entries')
        .select('person_root_wallet')
        .eq('dev_wallet', devWallet)
        .not('person_root_wallet', 'is', null)
        .limit(1)
        .maybeSingle();
      if (existing?.person_root_wallet) {
        personRoot = existing.person_root_wallet as string;
      } else {
        try {
          const { data: pr } = await supabase.functions.invoke('insiders-person-root-resolver', {
            body: { mode: 'single', dev_wallet: devWallet },
          });
          personRoot = pr?.results?.[0]?.person_root_wallet ?? null;
        } catch (_e) { /* best-effort */ }
      }
    }

    // 2a) Person-root match — same individual across dev-wallet rotations.
    if (personRoot) {
      const { data: rows } = await supabase
        .from('insiders_recap_entries')
        .select('ticker, token_mint, multiplier, dev_wallet')
        .eq('person_root_wallet', personRoot);
      if (rows && rows.length > 0) {
        const mults = rows.map((r: any) => Number(r.multiplier || 0));
        const best = Math.max(...mults, 0);
        const avg = mults.reduce((a: number, b: number) => a + b, 0) / (mults.length || 1);
        const distinctDevs = new Set(rows.map((r: any) => r.dev_wallet).filter(Boolean)).size;
        const bestRow = rows.reduce((a: any, b: any) => Number(a.multiplier || 0) >= Number(b.multiplier || 0) ? a : b);
        const agg = { token_count: rows.length, distinct_dev_count: distinctDevs, avg_multiplier: avg, best_multiplier: best, best_ticker: bestRow.ticker, best_mint: bestRow.token_mint };
        const qBest = best >= Number(config.min_best_multiplier);
        const qGroup = distinctDevs >= Number(config.kyc_min_distinct_devs) && avg >= Number(config.kyc_min_avg_multiplier);
        if (qBest || qGroup) {
          matchKind = 'person';
          personHit = agg;
          reason = qBest
            ? `person best ${best}x on $${bestRow.ticker}`
            : `person ${distinctDevs} wallets, ${rows.length} tokens, avg ${avg.toFixed(1)}x`;
        }
      }
    }
  }

  // Legacy KYC-root fallback — ONLY when the root is NOT a CEX/bridge/onramp (that would false-positive on Binance).
  if (!matchKind && kycRoot) {
    const { data: rootRow } = await (supabase as any)
      .from('insiders_recap_entries')
      .select('kyc_source_type')
      .eq('kyc_root_wallet', kycRoot)
      .limit(1)
      .maybeSingle();
    const infraSrc = rootRow?.kyc_source_type && ['cex','onramp','bridge'].includes(String(rootRow.kyc_source_type));
    if (infraSrc) {
      // skip — CEX hot wallets don't identify a person
    } else {
    const { data: rows } = await supabase.from('insiders_recap_entries')
      .select('ticker, token_mint, multiplier, dev_wallet, kyc_root_label')
      .eq('kyc_root_wallet', kycRoot);
    if (rows && rows.length > 0) {
      const mults = rows.map((r: any) => Number(r.multiplier || 0));
      const best = Math.max(...mults, 0);
      const avg = mults.reduce((a: number, b: number) => a + b, 0) / mults.length;
      const distinctDevs = new Set(rows.map((r: any) => r.dev_wallet).filter(Boolean)).size;
      const bestRow = rows.reduce((a: any, b: any) =>
        Number(a.multiplier || 0) >= Number(b.multiplier || 0) ? a : b);
      if (!kycLabel) {
        const lbl = rows.find((r: any) => r.kyc_root_label)?.kyc_root_label;
        if (lbl) kycLabel = lbl;
      }
      const agg = {
        token_count: rows.length,
        distinct_dev_count: distinctDevs,
        avg_multiplier: avg,
        best_multiplier: best,
        best_ticker: bestRow.ticker,
        best_mint: bestRow.token_mint,
      };
      const qBest = best >= Number(config.min_best_multiplier);
      const qGroup = distinctDevs >= Number(config.kyc_min_distinct_devs)
        && avg >= Number(config.kyc_min_avg_multiplier);
      if (qBest || qGroup) {
        matchKind = 'kyc';
        kycHit = agg;
        reason = qBest
          ? `KYC group best ${best}x on $${bestRow.ticker}`
          : `KYC group ${distinctDevs} devs, ${rows.length} tokens, avg ${avg.toFixed(1)}x`;
      }
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
    strategy: '2x_target',
    target_multiplier: 2,
    status: 'open',
    match_kind: matchKind,
    matched_dev_wallet: devWallet,
    matched_kyc_root: kycRoot,
    matched_kyc_label: kycLabel,
    dev_best_multiplier: devHit?.best_multiplier ?? personHit?.best_multiplier ?? kycHit?.best_multiplier ?? null,
    dev_best_ticker: devHit?.best_ticker ?? personHit?.best_ticker ?? kycHit?.best_ticker ?? null,
    group_token_count: personHit?.token_count ?? kycHit?.token_count ?? devHit?.token_count ?? null,
    group_avg_multiplier: personHit?.avg_multiplier ?? kycHit?.avg_multiplier ?? devHit?.avg_multiplier ?? null,
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

  // ---------- LIVE BUY via FlipIt wallet ----------
  let liveStatus: string = 'skipped';
  let liveError: string | null = null;
  let liveSol: number | null = null;
  let liveUsd: number | null = null;
  let liveSig: string | null = null;
  try {
    if (config.live_buy_enabled && config.live_buy_wallet_id) {
      const buyUsd = Number(config.live_buy_usd || 100);
      const capUsd = Number(config.live_buy_daily_cap_usd || 300);

      // Daily cap: sum today's UTC executed live buys
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { data: todayRows } = await supabase.from('alpha_paper_trades')
        .select('live_buy_usd')
        .eq('live_buy_status', 'executed')
        .gte('live_buy_at', dayStart.toISOString());
      const spentToday = (todayRows || []).reduce((s: number, r: any) => s + Number(r.live_buy_usd || 0), 0);
      if (spentToday + buyUsd > capUsd) {
        liveStatus = 'skipped_daily_cap';
        liveError = `daily cap ${capUsd} reached (spent ${spentToday.toFixed(2)})`;
      } else {
        // Wallet lookup
        const { data: w } = await supabase.from('super_admin_wallets')
          .select('id, pubkey, is_active').eq('id', config.live_buy_wallet_id).maybeSingle();
        if (!w || !w.is_active) {
          liveStatus = 'skipped_no_wallet';
          liveError = 'FlipIt wallet missing or inactive';
        } else {
          const [balSol, solPrice] = await Promise.all([fetchSolBalance(w.pubkey), fetchSolPriceUsd()]);
          if (!balSol || !solPrice) {
            liveStatus = 'skipped_chain_read';
            liveError = `balSol=${balSol} solPrice=${solPrice}`;
          } else {
            const balUsd = balSol * solPrice;
            if (balUsd < buyUsd) {
              liveStatus = 'skipped_insufficient';
              liveError = `wallet has $${balUsd.toFixed(2)} < $${buyUsd}`;
            } else {
              const buyAmountSol = Number((buyUsd / solPrice).toFixed(6));
              try {
                const { data: execRes, error: execErr } = await supabase.functions.invoke('flipit-execute', {
                  body: {
                    action: 'buy',
                    tokenMint: mint,
                    walletId: w.id,
                    buyAmountSol,
                    buyAmountUsd: buyUsd,
                    slippageBps: Number(config.live_buy_slippage_bps || 3000),
                    priorityFeeMicroLamports: Number(config.live_buy_priority_fee_microlamports || 300000),
                    jitoTipLamports: Number(config.live_buy_jito_tip_lamports || 300000),
                    priorityFeeMode: 'custom',
                    source: 'alpha-dev-detector',
                  },
                });
                if (execErr) {
                  liveStatus = 'failed';
                  liveError = execErr.message || 'invoke error';
                } else if (execRes?.skipped) {
                  liveStatus = 'skipped_execute';
                  liveError = execRes?.reason || 'flipit-execute skipped';
                } else if (execRes?.error) {
                  liveStatus = 'failed';
                  liveError = String(execRes.error).slice(0, 500);
                } else {
                  liveStatus = 'executed';
                  liveSol = buyAmountSol;
                  liveUsd = buyUsd;
                  liveSig = execRes?.signature || execRes?.buyTxSignature || execRes?.tx || null;
                }
              } catch (e: any) {
                liveStatus = 'failed';
                liveError = (e?.message || String(e)).slice(0, 500);
              }
            }
          }
        }
      }
    } else {
      liveStatus = config.live_buy_enabled ? 'skipped_no_wallet' : 'disabled';
    }
  } catch (e: any) {
    liveStatus = 'failed';
    liveError = (e?.message || String(e)).slice(0, 500);
  }

  if (config.sms_enabled) {
    const shortDev = devWallet ? `${devWallet.slice(0, 4)}…${devWallet.slice(-4)}` : '—';
    const shortMint = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    const newTicker = ticker ? `$${ticker}` : `(${shortMint})`;
    // Historical best prior — separate from the newly-triggering token
    const priorTicker = devHit?.best_ticker ?? kycHit?.best_ticker ?? null;
    const priorMult = devHit?.best_multiplier ?? kycHit?.best_multiplier ?? null;
    const priorLine = priorTicker && priorMult
      ? `Prior best: $${priorTicker} @ ${priorMult}x`
      : reason;
    const liveLine =
      liveStatus === 'executed'
        ? `Live buy: $${liveUsd?.toFixed(0)} (${liveSol?.toFixed(4)} SOL) ✅`
        : liveStatus === 'skipped_insufficient'
          ? `Live buy: SKIP (${liveError})`
          : liveStatus === 'skipped_daily_cap'
            ? `Live buy: SKIP (daily cap)`
            : liveStatus === 'disabled'
              ? `Live buy: off`
              : `Live buy: ${liveStatus}${liveError ? ` (${liveError.slice(0, 60)})` : ''}`;
    const smsBody =
      `🚨 ALPHA DEV DETECTED\n` +
      `NEW: ${newTicker} (${shortMint})\n` +
      `Entry MC: ${fmtMoney(entry.mcap)}\n` +
      `Match: ${matchKind === 'dev' ? `dev ${shortDev}` : `KYC ${kycLabel || kycRoot?.slice(0, 8)}`}\n` +
      `${priorLine}\n` +
      `Paper buy: $${config.paper_size_usd} → HOLD\n` +
      `${liveLine}\n\n` +
      `NEW CA (tap to copy):\n${mint}\n\n` +
      `Pump (NEW): https://pump.fun/coin/${mint}\n` +
      `Dex (NEW):  https://dexscreener.com/solana/${mint}`;
    const r = await sendSms(smsBody);
    smsStatus = r.ok ? 'sent' : 'failed';
    smsError = r.error ?? null;
  }
  await supabase.from('alpha_paper_trades').update({
    sms_status: smsStatus, sms_error: smsError, sms_sent_at: new Date().toISOString(),
    live_buy_status: liveStatus,
    live_buy_signature: liveSig,
    live_buy_sol: liveSol,
    live_buy_usd: liveUsd,
    live_buy_error: liveError,
    live_buy_at: liveStatus === 'executed' ? new Date().toISOString() : null,
  }).eq('id', trade.id);

  return new Response(JSON.stringify({
    ok: true, matched: true, match_kind: matchKind, paper_trade_id: trade.id,
    ticker, entry_mcap: entry.mcap, reason, sms_status: smsStatus,
    live_buy_status: liveStatus, live_buy_signature: liveSig, live_buy_error: liveError,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});