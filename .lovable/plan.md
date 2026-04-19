

User wants a sell trigger tied to **bonding curve graduation** (99.9% → Raydium migration), which often causes a price spike. They want to:
1. Set a sell at 99.9% bonding curve completion (i.e., right as it migrates to Raydium)
2. Allow huge slippage tolerance because graduation spikes are violent
3. Auto-capture spikes up to ~400% above their target if the price runs

This is a real pump.fun mechanic — when a token graduates (~$69k mcap), liquidity moves to Raydium and price often pumps hard (the "graduation candle"). Catching this is high-value.

Let me check the current position structure and monitor logic to design this properly.

Need to understand:
- `flip_positions` already has `is_on_curve`, `bonding_curve_progress`, `price_source`
- `flipit-unified-monitor` / `flipit-price-monitor` runs every cycle
- Need a new trigger type: "graduation sell"

Design:
- New columns on `flip_positions`: `graduation_sell_enabled`, `graduation_sell_trigger_pct` (default 99.9), `graduation_sell_max_capture_pct` (default 400 — meaning allow up to 4x above the trigger price), `graduation_sell_status`, `graduation_sell_armed_at`, `graduation_sell_executed_at`
- Monitor logic: when `bonding_curve_progress >= trigger_pct` AND token has migrated to Raydium (`is_on_curve = false` or `price_source = 'dexscreener'/'raydium'`), arm the sell. Then watch the post-graduation price; sell when either (a) price stops climbing (peak detection — drops X% from local high) OR (b) hits max_capture_pct cap OR (c) drops below arming price (graduation dump protection)
- Use very high slippage (e.g., 2000-3000 bps = 20-30%) because graduation candles are chaotic
- UI: new section on position card "🎓 Graduation Sell" with toggle + trigger % + max capture % + minimum capture %

## Plan

### 1. DB migration
Add to `flip_positions`:
- `graduation_sell_enabled` boolean default false
- `graduation_sell_trigger_pct` numeric default 99.9
- `graduation_sell_max_capture_pct` numeric default 400 (allow capturing up to 4x above arming price)
- `graduation_sell_min_capture_pct` numeric default 0 (don't sell below arming price unless this triggers — graduation dump protection floor)
- `graduation_sell_trail_drop_pct` numeric default 15 (peak detection: sell when price drops X% from post-graduation peak)
- `graduation_sell_slippage_bps` integer default 2500 (25% — graduation candles need wide tolerance)
- `graduation_sell_status` text default 'disabled' ('disabled' | 'armed_pre_grad' | 'watching_post_grad' | 'executed' | 'failed')
- `graduation_sell_armed_at` timestamptz
- `graduation_sell_arming_price_usd` numeric (price at the moment graduation detected)
- `graduation_sell_peak_price_usd` numeric (highest seen post-grad)
- `graduation_sell_executed_at` timestamptz

### 2. Monitor logic (`flipit-unified-monitor` / `flipit-price-monitor`)
For each `holding` position with `graduation_sell_enabled = true`:

```
if status = 'disabled' AND bonding_curve_progress >= trigger_pct:
    → status = 'armed_pre_grad', armed_at = now(), arming_price = current_price

if status = 'armed_pre_grad' AND (is_on_curve = false OR price_source != 'pumpfun_curve'):
    → status = 'watching_post_grad', peak_price = current_price

if status = 'watching_post_grad':
    peak_price = max(peak_price, current_price)
    capture_x = current_price / arming_price
    drop_from_peak_pct = (peak_price - current_price) / peak_price * 100
    
    SELL_TRIGGER if any of:
      (a) capture_x >= max_capture_pct/100   → "max capture hit"
      (b) drop_from_peak_pct >= trail_drop_pct AND current_price > arming_price → "trailing peak protection"
      (c) current_price < arming_price * (1 - min_capture_pct/100) → "graduation dump floor"
    
    on trigger: execute sell with graduation_sell_slippage_bps
```

### 3. UI — `FlipPositionCard.tsx` (or wherever single-position controls live)
New collapsible section "🎓 Graduation Sell (Raydium Spike Capture)":
- Toggle: Enable/Disable
- Trigger %: number input (default 99.9, range 95–100)
- Max capture %: number input (default 400, "Sell if price runs this far above graduation point")
- Trail drop %: number input (default 15, "Sell if price drops this far from post-grad peak")
- Min capture floor %: number input (default 0, "Emergency sell if price dumps below grad point by this much")
- Slippage bps: number input (default 2500 = 25%)
- Status badge showing current state (disabled / armed / watching / executed)
- Live readout when armed: "Armed at $0.0000XX | Peak $0.0000YY | Current Xx"

### 4. Files changed
- One DB migration (8 new columns on `flip_positions`)
- `supabase/functions/flipit-unified-monitor/index.ts` — add graduation sell evaluator
- `supabase/functions/flipit-price-monitor/index.ts` — same evaluator (whichever runs the actual sell logic; will check on approval)
- `src/components/flipit/FlipPositionCard.tsx` (or equivalent) — new UI section
- One new shared helper: `supabase/functions/_shared/graduation-sell-evaluator.ts` — keeps logic in one place

No new secrets. No breaking changes to existing positions (defaults to disabled).

### Why this works
- 99.9% trigger arms the sell *before* migration completes, so by the time Raydium liquidity is live, the watcher is active
- 25% default slippage handles the chaotic first seconds on Raydium
- Peak-trailing logic captures the spike without you having to predict the exact top — if it runs 200%, then drops 15% off peak, sell. If it runs 400%, hard cap fires.
- Min capture floor protects against the alternate scenario: graduation dumps instead of pumps

### Question

One clarifier before building — for the "potential 400% increase" handling, do you want:
- **A:** Hard cap (sell exactly at 400% above arming) — predictable but might leave money on the table if it runs further
- **B:** Trailing-only with no cap (just peak-trailing — captures whatever the peak is, sells X% below peak) — maximizes upside but can give back gains
- **C:** Both — trail until 400%, then hard sell (default in plan above) — best of both, most complex

Default in the plan is **C**.

