alter table public.pumpfun_watchlist
  add column if not exists ath_market_cap_usd numeric,
  add column if not exists ath_market_cap_at timestamptz,
  add column if not exists ath_bonding_curve_pct numeric;

create index if not exists idx_pumpfun_watchlist_lamb_gate
  on public.pumpfun_watchlist (status, is_graduated, ath_bonding_curve_pct)
  where status = 'dead';

comment on column public.pumpfun_watchlist.bonding_curve_pct is 'Current pump.fun bonding curve progress percent, 0-100. This is progress toward graduation, not remaining curve tokens.';
comment on column public.pumpfun_watchlist.ath_bonding_curve_pct is 'Peak pump.fun bonding curve progress percent observed while tracking, 0-100. Lamb gate uses 75 <= value < 100.';
comment on column public.pumpfun_watchlist.ath_market_cap_usd is 'Peak pump.fun ATH market cap from pump.fun API or observed tracked market cap. Used for context, not as the Lamb gate.';