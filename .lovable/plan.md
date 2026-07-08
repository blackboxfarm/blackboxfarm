
## Why those placeholders render as `{...}` or `pending`

`supabase/functions/no-lube-compose/index.ts` builds a `vars` map (lines ~934-1045) that `renderTemplate` uses to substitute template placeholders. It never sets these keys, so the template either leaves the literal `{name}` or falls back to the `pending` collapser:

- `totalWallets` — not in the vars map. The same number **is** already resolved as `totalHolders` / `holders` from `token_health_snapshots.total_holders` (+ bagless fallback). It's a missing alias, nothing more.
- `athDrawdown` — not in the vars map. `athMcapUsd` and current `mcUsd` are both already resolved in that same block; no new data needed.
- `mintRevoked`, `freezeRevoked`, `lpBurned`, `buyTax`, `sellTax`, `devHoldings`, `devSold` — never fetched. They come from Phanes / Dr Rick / GMGN / Trojan replies, which the blackbox aggregator already parses and unions into `blackbox_aggregator_runs.var_bag_jsonb` (fields: `mint_authority_revoked`, `freeze_authority_revoked`, `lp_burned`, `buy_tax_pct`, `sell_tax_pct`, `dev_holdings_pct`, `dev_sold`). Compose doesn't query that table today.

## Fix (single file: `supabase/functions/no-lube-compose/index.ts`)

1. **Alias `totalWallets`** — mirror the existing `holders` resolution.

2. **Compute `athDrawdown`** — when `athMcapUsd > 0` and `mcUsd` is known, render `-XX.X%` (or `0%` at ATH); else `pending`.

3. **Load latest aggregator run for the mint** (best-effort; skip silently on failure):
   ```
   supabase.from('blackbox_aggregator_runs')
     .select('var_bag_jsonb, digest_jsonb, updated_at')
     .eq('token_mint', mint)
     .order('updated_at', { ascending: false })
     .limit(1).maybeSingle()
   ```
   Read from `var_bag_jsonb` (the union view built by `buildUnionView`) with `token_metadata.mint_authority` / `freeze_authority` as a chain-side fallback for the two revoke flags (null authority = revoked).

4. **Add the new vars** using the same `DASH = 'pending'` convention as the rest of the file:
   - `mintRevoked` / `freezeRevoked` / `lpBurned` → `✅` / `❌` / `pending`
   - `buyTax` / `sellTax` → `"3%"` style, `pending` when unknown
   - `devHoldings` → `"4.2%"`, `pending` when unknown
   - `devSold` → `Yes` / `No` / `pending`

5. **Also feed the on-chain-derived `devSold` flag into `classifyPostability`** in place of the current hard-coded `false` (line 848), so postability scoring benefits from the same signal. (No behavior change when the value is unknown — stays `false`.)

## Out of scope

- No template edits — the template already references these vars.
- No schema changes — every field comes from existing tables (`token_health_snapshots`, `blackbox_aggregator_runs.var_bag_jsonb`, `token_metadata`).
- Server-side eligibility guard stays as-is per the prior decision.

## Verification

After deploy, re-render a No-Lube preview for a known token (e.g., `$BULLSET` from the screenshot) and confirm:
- `Holders` shows the number instead of `pending`
- `ATH` line shows drawdown %
- Security block flips from all-`pending` to real values wherever Phanes/Dr Rick replied

Any field still `pending` after that means the aggregator hasn't received a reply yet for that mint — not a compose bug.
