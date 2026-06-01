import { withRunLog } from '../_shared/run-logger.ts';
import { assertInsert } from '../_shared/db-assert.ts';
import {
  getSupabaseAdmin,
  newDepositWallet,
  priceFiatToSol,
  getFxRates,
  tgSendDM,
} from '../_shared/profile-subscription.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(withRunLog('profile-subscription-quote', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const supabase = getSupabaseAdmin();
    const body = await req.json();
    const {
      profile_key,
      tier_months,
      telegram_user_id,
      telegram_username,
      language,
      country,
      send_dm = true,
    } = body ?? {};

    if (!profile_key || !tier_months || !telegram_user_id) {
      return new Response(JSON.stringify({ error: 'profile_key, tier_months, telegram_user_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: config, error: cErr } = await supabase
      .from('profile_subscription_configs')
      .select('*')
      .eq('profile_key', profile_key)
      .maybeSingle();
    if (cErr || !config) throw new Error(`Config not found for ${profile_key}`);
    if (!config.is_active) throw new Error(`Profile ${profile_key} subscriptions disabled`);

    const { data: tier, error: tErr } = await supabase
      .from('profile_subscription_tiers')
      .select('*')
      .eq('profile_key', profile_key)
      .eq('tier_months', tier_months)
      .eq('is_active', true)
      .maybeSingle();
    if (tErr || !tier) throw new Error(`Tier ${tier_months}m not found`);

    // Reuse a still-valid pending quote if one exists
    const { data: existing } = await supabase
      .from('profile_subscriptions')
      .select('*')
      .eq('profile_key', profile_key)
      .eq('telegram_user_id', telegram_user_id)
      .eq('status', 'pending')
      .gt('quote_window_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let sub = existing;
    if (!sub) {
      const wallet = await newDepositWallet();
      const { sol, solPriceUsd } = await priceFiatToSol(Number(tier.price_fiat), config.base_currency);
      sub = await assertInsert(
        supabase.from('profile_subscriptions').insert({
          profile_key,
          telegram_user_id,
          telegram_username: telegram_username ?? null,
          language: language ?? null,
          country: country ?? null,
          tier_months: tier.tier_months,
          price_fiat: tier.price_fiat,
          base_currency: config.base_currency,
          quoted_sol: sol,
          sol_price_at_order: solPriceUsd,
          payment_wallet_pubkey: wallet.pubkey,
          payment_wallet_secret_encrypted: wallet.encrypted,
          quote_window_expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        }).select().single(),
        'profile_subscriptions',
      );
    }

    const displayCurrencies = (config.display_currencies ?? []) as string[];
    const fxRates = await getFxRates(config.base_currency, displayCurrencies);
    const displayFiats: Record<string, number> = {};
    for (const c of displayCurrencies) {
      const r = fxRates[c] ?? 0;
      if (r > 0) displayFiats[c] = Math.round(Number(sub.price_fiat) * r * 100) / 100;
    }

    const solscan = `https://solscan.io/account/${sub.payment_wallet_pubkey}`;
    const fiatLine = Object.entries(displayFiats).map(([c, v]) => `${c} ${v.toFixed(2)}`).join('  ·  ');

    const dmText =
      `💎 <b>${tier.tier_months}-month subscription</b>\n` +
      `Send <b>◆ ${sub.quoted_sol} SOL</b>\n` +
      `to: <code>${sub.payment_wallet_pubkey}</code>\n` +
      `<a href="${solscan}">View on Solscan</a>\n\n` +
      `Equivalent: ${config.base_currency} ${Number(sub.price_fiat).toFixed(2)}` +
      (fiatLine ? `  ·  ${fiatLine}` : '') + `\n\n` +
      `⏳ Quote valid for 30 minutes. I'll add you to the channel automatically once payment lands.`;

    if (send_dm) {
      try {
        await tgSendDM(profile_key, telegram_user_id, dmText);
      } catch (e) {
        console.warn('[quote] DM send failed', e);
      }
    }

    return new Response(JSON.stringify({
      subscription_id: sub.id,
      payment_wallet: sub.payment_wallet_pubkey,
      quoted_sol: Number(sub.quoted_sol),
      price_fiat: Number(sub.price_fiat),
      base_currency: sub.base_currency,
      display_fiats: displayFiats,
      solscan_url: solscan,
      expires_at: sub.quote_window_expires_at,
      dm_text: dmText,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[profile-subscription-quote]', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}));