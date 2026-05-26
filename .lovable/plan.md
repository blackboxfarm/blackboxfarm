
## Goal

Stop No Lube from posting garbage (dead rugs AND insane rockets), add proper iconography and time/bonding vars to the template, and keep a full audit log of every token that was considered — posted or not, with reason.

---

## 1. "Crazy Filter" — gate every Compose → Push

In `no-lube-compose` compute a `verdict_class` after we gather metrics:

- **dead** — price down ≥ 80% from ATH within 24h, OR dev sold + liq < $5k, OR 24h vol < $1k on a >1h old token
- **crazy** — age < 10m AND (mcap ≥ $500k OR 5m price change ≥ +100% OR 24h vol ≥ $500k on a <10m token), OR top10 ≥ 80% + age < 30m
- **healthy** — everything else (still subject to existing momentum/risk classification)

Compose response gains:
```
{ ok, text, vars, sources, verdict_class, post_eligible, block_reason }
```
- `post_eligible = verdict_class === 'healthy'`
- UI: when `post_eligible=false`, the "Push to No Lube" button is disabled and shows the `block_reason` ("⛔ Anomaly — 1M mcap in 2m, not posting"). Compose preview still renders so user can see why.
- `no-lube-push` re-checks `post_eligible` server-side (defense in depth) — refuses if false unless an `override:true` flag is sent (admin only).

## 2. Post log table

New table `no_lube_post_log`:
```
id uuid pk, token_mint text, ticker text,
verdict_class text,     -- dead | crazy | healthy
posted boolean,
block_reason text,      -- null when posted
mcap numeric, vol_24h numeric, liq_usd numeric,
price_change_24h numeric, top10_pct numeric,
age_minutes int, mint_time timestamptz,
composed_at timestamptz default now(),
posted_at timestamptz, tg_message_id bigint,
composed_by uuid        -- auth.uid()
```
- `no-lube-compose` writes a row on every compose (posted=false initially)
- `no-lube-push` updates row with `posted=true, posted_at, tg_message_id` on success
- RLS: super_admin select-all; service_role full.
- Admin UI: small log panel under the Compose widget showing last 50 rows with mint, verdict, posted Y/N, reason.

## 3. Template variable additions

New vars exposed by `no-lube-compose` and documented in the template editor:

| Var | Meaning |
|---|---|
| `{momentumIcon}` | 🚀 strong / ➡️ flat / 📉 fading |
| `{riskIcon}` | 🟢 low / 🟡 med / 🔴 high / ☠️ dead / 🤯 crazy |
| `{verdictIcon}` | ✅ send / 👀 watch / ⛔ pass / ☠️ dead / 🤯 anomaly |
| `{age}` | DEX pair age (existing — bonded age) |
| `{mintTime}` | Human-readable "X mins ago" / "Yh Zm ago" / "Xd Yh ago" |
| `{bondingState}` | If not yet bonded: `Not Yet Bonded! 55% Bonding Curve!`; else empty |

Formatter rules for `{mintTime}`:
- `< 1h` → `36 mins ago`
- `< 1d` → `7 hrs 21 mins ago`
- `≥ 1d` → `2 days 4 hrs ago`

Mint time source order: Helius `getAsset` → first signature via Helius `getSignaturesForAddress(mint, limit=1, before=null)` reversed → fall back to DexScreener `pairCreatedAt` with a `(approx)` suffix.

Bonding curve %: Pump.fun curve progress via existing pump-fun pricer (already in codebase per memory). If `bondedAt` exists → `bondingState = ''`.

## 4. Default `no_lube` template (updated)

```
{verdictIcon} *${ticker}*
{momentumIcon} Momentum: {momentum}
{riskIcon} Risk: {risk}
{verdictIcon} Verdict: {verdict}

💰 Market
MC: {mc}  ({mcChange})
VOL: {vol24h}
LP: {lp}
Age: {age}
Minted: {mintTime}
{bondingState}

🧠 Holder Health
Top 10: {top10}
Fresh Wallets: {freshWallets}
Wallet Spread: {walletSpread}
Bundled Risk: {bundledRisk}
```
(User can still edit in DB; this is just the new default.)

## 5. UI changes (ShareCardDemo / Compose widget)

- Show `verdict_class` badge above preview (healthy/dead/crazy)
- Disable Push button when not healthy; tooltip = `block_reason`
- Add collapsible "Post Log" panel pulling from `no_lube_post_log`

---

## Technical notes

- Files touched:
  - `supabase/functions/no-lube-compose/index.ts` — add classifier, mint-time fetch, bonding lookup, log insert, new vars
  - `supabase/functions/no-lube-push/index.ts` — re-check eligibility, update log row
  - `src/components/social/ShareCardDemo.tsx` — badge, disabled button + reason, log panel
  - New migration: `no_lube_post_log` table + GRANTs + RLS + super_admin policy
  - Seed/update `holders_intel_templates` row `no_lube` with new default body
- No new secrets needed; Helius + DexScreener already wired.
- Bundled Risk stays `—` unless we have a signal — not part of this change.

---

## Out of scope (flag for later)

- Auto-suggesting an alternate ticker when one is blocked
- Backfilling log for historical compose runs
- Per-channel filter tuning (currently global to No Lube)
