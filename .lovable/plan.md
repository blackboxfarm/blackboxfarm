## What you're saying (and you're right)

There is no reason for two extra roster tables. `insiders_recap_entries` already IS the list. 450 entries, 304 unique devs, 194 unique KYC roots, best 756x. The detector should just look at that table directly and apply the thresholds from `alpha_config` at read time.

The "seed the alpha list" step was overengineering. Drop it.

## Fix to implement

1. Rewrite `alpha-dev-detector` to query `insiders_recap_entries` directly.

   For an incoming mint's resolved dev wallet:
   - `select * from insiders_recap_entries where dev_wallet = <dev>`
   - Compute on the fly: `token_count`, `avg_multiplier`, `best_multiplier`, `best_ticker`, `best_mint`.
   - Match if `best_multiplier >= min_best_multiplier` OR (`token_count >= min_repeat_token_count` AND `avg_multiplier >= min_repeat_avg_multiplier`).

   For the resolved KYC root:
   - `select * from insiders_recap_entries where kyc_root_wallet = <root>`
   - Compute: `distinct_dev_count`, `token_count`, `avg_multiplier`, `best_multiplier`, best ticker/mint, label.
   - Match if `best_multiplier >= min_best_multiplier` OR (`distinct_dev_count >= kyc_min_distinct_devs` AND `avg_multiplier >= kyc_min_avg_multiplier`).

   Everything downstream (paper trade insert, SMS, live FlipIt buy, daily cap) stays exactly as it is.

2. Delete the two dead roster tables.
   - Drop `alpha_dev_wallets` and `alpha_kyc_groups` (both empty).
   - Keep `alpha_config` (thresholds/toggles) and `alpha_paper_trades` (trade log). Those are still needed.

3. No new edge function. No seeder. No refresher cron. The recap ingestion already keeps `insiders_recap_entries` current — the detector just reads it.

4. Verify end-to-end.
   - After deploy, run detector in a dry-run with a known dev wallet from the recap list (e.g. `9uw6…mZv1` — WORLDCUP dev, 217x) and confirm it reports a match.
   - Watch the next real insider mint hit the detector and match live.

## Result

New insider token → `insiders-row-ingest` invokes `alpha-dev-detector` → detector resolves dev/KYC → matches against `insiders_recap_entries` directly using `alpha_config` thresholds → paper trade + SMS + live $100 FlipIt buy (if wallet ≥ $100 and daily cap not hit).

One list. The one you already have.
