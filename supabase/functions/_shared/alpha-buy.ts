// Shared Alpha buy executor — used by alpha-dev-detector (immediate buys)
// and alpha-watch-monitor (deferred dip-buys). Handles: entry price snapshot,
// paper-trade insert, live FlipIt buy (with daily cap), SMS to admin.

const TWILIO_GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';
const TWILIO_FROM = '+16624814161';
const ADMIN_PHONE = '+12265835975';

export function fmtMoney(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Number(n).toFixed(2)}`;
}

export async function fetchSolBalance(pubkey: string): Promise<number | null> {
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

export async function fetchSolPriceUsd(): Promise<number | null> {
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

export interface DexInfo {
  mcap: number | null;
  price: number | null;
  ticker: string | null;
  pairCreatedAt: number | null; // unix ms
  ath: number | null;           // priceUsd all-time-high approximation (via priceChange)
}

export async function fetchDexInfo(mint: string): Promise<DexInfo> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    if (!r.ok) return { mcap: null, price: null, ticker: null, pairCreatedAt: null, ath: null };
    const j = await r.json();
    const pairs = (j?.pairs || []) as any[];
    if (pairs.length === 0) return { mcap: null, price: null, ticker: null, pairCreatedAt: null, ath: null };
    const best = pairs.reduce((a: any, b: any) =>
      Number(a?.liquidity?.usd || 0) >= Number(b?.liquidity?.usd || 0) ? a : b);
    return {
      mcap: Number(best.marketCap ?? best.fdv ?? null) || null,
      price: Number(best.priceUsd) || null,
      ticker: best.baseToken?.symbol || null,
      pairCreatedAt: Number(best.pairCreatedAt) || null,
    ath: null,
    };
  } catch { return { mcap: null, price: null, ticker: null, pairCreatedAt: null, ath: null }; }
}

export async function fetchPumpInfo(mint: string): Promise<{ mcap: number | null; ticker: string | null; createdAt: number | null }> {
  try {
    const r = await fetch(`https://frontend-api.pump.fun/coins/${mint}`);
    if (!r.ok) return { mcap: null, ticker: null, createdAt: null };
    const j = await r.json();
    return {
      mcap: Number(j?.usd_market_cap) || null,
      ticker: j?.symbol || null,
      createdAt: Number(j?.created_timestamp) || null,
    };
  } catch { return { mcap: null, ticker: null, createdAt: null }; }
}

/** Fetch max historical USD price via GeckoTerminal daily OHLCV. */
export async function fetchAthUsd(mint: string): Promise<{ athPrice: number | null; athMcap: number | null }> {
  try {
    const pools = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mint}/pools?page=1`);
    if (!pools.ok) return { athPrice: null, athMcap: null };
    const pj = await pools.json();
    const pool = pj?.data?.[0]?.attributes;
    const poolAddr = pool?.address;
    if (!poolAddr) return { athPrice: null, athMcap: null };
    const currentPrice = Number(pool.base_token_price_usd) || 0;
    const currentFdv = Number(pool.fdv_usd) || Number(pool.market_cap_usd) || 0;
    const oh = await fetch(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddr}/ohlcv/day?aggregate=1&limit=365&currency=usd`);
    if (!oh.ok) return { athPrice: null, athMcap: null };
    const oj = await oh.json();
    const candles: any[] = oj?.data?.attributes?.ohlcv_list ?? [];
    let maxHigh = 0;
    for (const c of candles) {
      const h = Number(c[2]);
      if (Number.isFinite(h) && h > maxHigh) maxHigh = h;
    }
    if (maxHigh <= 0) return { athPrice: null, athMcap: null };
    const athMcap = (currentPrice > 0 && currentFdv > 0) ? (maxHigh / currentPrice) * currentFdv : null;
    return { athPrice: maxHigh, athMcap };
  } catch { return { athPrice: null, athMcap: null }; }
}

export async function sendAdminSms(body: string, mediaUrl?: string | null): Promise<{ ok: boolean; error?: string }> {
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

export interface AlphaMatch {
  matchKind: 'dev' | 'person' | 'kyc';
  devWallet: string | null;
  kycRoot: string | null;
  kycLabel: string | null;
  reason: string;
  devHit?: any;
  personHit?: any;
  kycHit?: any;
  source: string;
}

/** Execute an Alpha buy: paper insert + live FlipIt buy + admin SMS. */
export async function executeAlphaBuy(
  supabase: any,
  config: any,
  m: AlphaMatch,
  mint: string,
  bannerPrefix: string, // e.g. "🚨 ALPHA DEV DETECTED" or "🎯 POST-BOND DIP BUY"
): Promise<any> {
  // Idempotency
  const { data: existing } = await supabase.from('alpha_paper_trades').select('id').eq('mint', mint).maybeSingle();
  if (existing) return { ok: true, skipped: 'already_bought', paper_trade_id: existing.id };

  // Snapshot entry
  const dex = await fetchDexInfo(mint);
  const pump = await fetchPumpInfo(mint);
  const entry = {
    mcap: dex.mcap ?? pump.mcap ?? null,
    price: dex.price ?? null,
    ticker: dex.ticker ?? pump.ticker ?? null,
  };

  const insertRow: any = {
    mint,
    ticker: entry.ticker,
    entry_market_cap: entry.mcap,
    entry_price_usd: entry.price,
    size_usd: config.paper_size_usd,
    strategy: '2x_target',
    target_multiplier: 2,
    status: 'open',
    match_kind: m.matchKind,
    matched_dev_wallet: m.devWallet,
    matched_kyc_root: m.kycRoot,
    matched_kyc_label: m.kycLabel,
    dev_best_multiplier: m.devHit?.best_multiplier ?? m.personHit?.best_multiplier ?? m.kycHit?.best_multiplier ?? null,
    dev_best_ticker: m.devHit?.best_ticker ?? m.personHit?.best_ticker ?? m.kycHit?.best_ticker ?? null,
    group_token_count: m.personHit?.token_count ?? m.kycHit?.token_count ?? m.devHit?.token_count ?? null,
    group_avg_multiplier: m.personHit?.avg_multiplier ?? m.kycHit?.avg_multiplier ?? m.devHit?.avg_multiplier ?? null,
    reason: m.reason,
    source: m.source,
  };
  const { data: trade, error: insErr } = await supabase.from('alpha_paper_trades')
    .insert(insertRow).select('id').single();
  if (insErr) {
    if (String(insErr.message || '').includes('duplicate')) return { ok: true, skipped: 'race_duplicate' };
    return { ok: false, error: insErr.message };
  }

  // Live buy
  let liveStatus = 'skipped';
  let liveError: string | null = null;
  let liveSol: number | null = null;
  let liveUsd: number | null = null;
  let liveSig: string | null = null;
  try {
    if (config.live_buy_enabled && config.live_buy_wallet_id) {
      const buyUsd = Number(config.live_buy_usd || 100);
      const capUsd = Number(config.live_buy_daily_cap_usd || 300);
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const { data: todayRows } = await supabase.from('alpha_paper_trades')
        .select('live_buy_usd').eq('live_buy_status', 'executed')
        .gte('live_buy_at', dayStart.toISOString());
      const spentToday = (todayRows || []).reduce((s: number, r: any) => s + Number(r.live_buy_usd || 0), 0);
      if (spentToday + buyUsd > capUsd) {
        liveStatus = 'skipped_daily_cap';
        liveError = `daily cap ${capUsd} reached (spent ${spentToday.toFixed(2)})`;
      } else {
        const { data: w } = await supabase.from('super_admin_wallets')
          .select('id, pubkey, is_active').eq('id', config.live_buy_wallet_id).maybeSingle();
        if (!w || !w.is_active) { liveStatus = 'skipped_no_wallet'; liveError = 'FlipIt wallet missing/inactive'; }
        else {
          const [balSol, solPrice] = await Promise.all([fetchSolBalance(w.pubkey), fetchSolPriceUsd()]);
          if (!balSol || !solPrice) { liveStatus = 'skipped_chain_read'; liveError = `balSol=${balSol} solPrice=${solPrice}`; }
          else {
            const balUsd = balSol * solPrice;
            if (balUsd < buyUsd) { liveStatus = 'skipped_insufficient'; liveError = `wallet $${balUsd.toFixed(2)} < $${buyUsd}`; }
            else {
              const buyAmountSol = Number((buyUsd / solPrice).toFixed(6));
              try {
                const { data: execRes, error: execErr } = await supabase.functions.invoke('flipit-execute', {
                  body: {
                    action: 'buy', tokenMint: mint, walletId: w.id, buyAmountSol, buyAmountUsd: buyUsd,
                    slippageBps: Number(config.live_buy_slippage_bps || 3000),
                    priorityFeeMicroLamports: Number(config.live_buy_priority_fee_microlamports || 300000),
                    jitoTipLamports: Number(config.live_buy_jito_tip_lamports || 300000),
                    priorityFeeMode: 'custom', source: 'alpha-dev-detector',
                  },
                });
                if (execErr) { liveStatus = 'failed'; liveError = execErr.message || 'invoke error'; }
                else if (execRes?.skipped) { liveStatus = 'skipped_execute'; liveError = execRes?.reason || 'skipped'; }
                else if (execRes?.error) { liveStatus = 'failed'; liveError = String(execRes.error).slice(0, 500); }
                else {
                  liveStatus = 'executed'; liveSol = buyAmountSol; liveUsd = buyUsd;
                  liveSig = execRes?.signature || execRes?.buyTxSignature || execRes?.tx || null;
                }
              } catch (e: any) { liveStatus = 'failed'; liveError = (e?.message || String(e)).slice(0, 500); }
            }
          }
        }
      }
    } else {
      liveStatus = config.live_buy_enabled ? 'skipped_no_wallet' : 'disabled';
    }
  } catch (e: any) { liveStatus = 'failed'; liveError = (e?.message || String(e)).slice(0, 500); }

  // SMS
  let smsStatus = 'skipped'; let smsError: string | null = null;
  let chartThumbUrl: string | null = null;
  if (config.sms_enabled) {
    const shortDev = m.devWallet ? `${m.devWallet.slice(0, 4)}…${m.devWallet.slice(-4)}` : '—';
    const shortMint = `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    const newTicker = entry.ticker ? `$${entry.ticker}` : `(${shortMint})`;
    const priorTicker = m.devHit?.best_ticker ?? m.kycHit?.best_ticker ?? null;
    const priorMult = m.devHit?.best_multiplier ?? m.kycHit?.best_multiplier ?? null;
    const priorLine = priorTicker && priorMult ? `Prior best: $${priorTicker} @ ${priorMult}x` : m.reason;
    const liveLine =
      liveStatus === 'executed' ? `Live buy: $${liveUsd?.toFixed(0)} (${liveSol?.toFixed(4)} SOL) ✅` :
      liveStatus === 'skipped_insufficient' ? `Live buy: SKIP (${liveError})` :
      liveStatus === 'skipped_daily_cap' ? `Live buy: SKIP (daily cap)` :
      liveStatus === 'disabled' ? `Live buy: off` :
      `Live buy: ${liveStatus}${liveError ? ` (${liveError.slice(0, 60)})` : ''}`;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const buyTs = Math.floor(Date.now() / 1000);
    chartThumbUrl = `${supabaseUrl}/functions/v1/chart-thumb?mint=${mint}&buy=${buyTs}`;
    const smsBody =
      `${bannerPrefix}\n` +
      `NEW: ${newTicker} (${shortMint})\n` +
      `Entry MC: ${fmtMoney(entry.mcap)}\n` +
      `Match: ${m.matchKind === 'dev' ? `dev ${shortDev}` : `KYC ${m.kycLabel || m.kycRoot?.slice(0, 8)}`}\n` +
      `${priorLine}\n` +
      `Paper buy: $${config.paper_size_usd} → HOLD\n` +
      `${liveLine}\n\n` +
      `NEW CA (tap to copy):\n${mint}\n\n` +
      `Pump (NEW): https://pump.fun/coin/${mint}\n` +
      `Dex (NEW):  https://dexscreener.com/solana/${mint}`;
    const r = await sendAdminSms(smsBody, chartThumbUrl);
    smsStatus = r.ok ? 'sent' : 'failed';
    smsError = r.error ?? null;
  }

  await supabase.from('alpha_paper_trades').update({
    chart_thumb_url: chartThumbUrl,
    sms_status: smsStatus, sms_error: smsError, sms_sent_at: new Date().toISOString(),
    live_buy_status: liveStatus, live_buy_signature: liveSig,
    live_buy_sol: liveSol, live_buy_usd: liveUsd, live_buy_error: liveError,
    live_buy_at: liveStatus === 'executed' ? new Date().toISOString() : null,
  }).eq('id', trade.id);

  return {
    ok: true, matched: true, match_kind: m.matchKind, paper_trade_id: trade.id,
    ticker: entry.ticker, entry_mcap: entry.mcap, reason: m.reason, sms_status: smsStatus,
    live_buy_status: liveStatus, live_buy_signature: liveSig, live_buy_error: liveError,
  };
}