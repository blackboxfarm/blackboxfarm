## Goal

After we drop a CA into BlackBox group, wait ~15s, scoop the 3 bot replies (HoldersIntel · Phanes · Rick), parse what each gave us, fuse it into ONE digest, post that digest to No Lube channel.

## What's already wired (no change)

- Bait CA post via MTProto into BlackBox group — done.
- Run row created in `blackbox_aggregator_runs` with `ca_post_message_id` + `ca_posted_at`.
- Step 2 harvests messages since `ca_posted_at`, filters trader bots + replies-to-our-post + CA mentions, upserts each into `blackbox_bot_replies`.
- `output_channel` in `blackbox_channel_config` already = `-1003973881943` (No Lube). Digest already posts there.

## Changes

### 1. `supabase/functions/blackbox-tick/index.ts`

- `HARVEST_WINDOW_SEC`: `90` → `15`.
- Replace `composeDigest()` with a richer fuser that uses every field the parsers extract. New layout:

```text
🧬 $SYMBOL  ·  Name (if any)
CA: <mint>

━━━ MARKET (consensus across bots) ━━━
Price $X  ·  MC $X  ·  FDV $X
Liq $X  ·  Vol24h $X  ·  Vol1h $X
5m ±%  ·  1h ±%  ·  24h ±%
ATH $X (drawdown -%, age)

━━━ HOLDERS ━━━
Total: N  ·  Top10: %
Fresh wallets: %  ·  Avg age: …
Dev holding: %  ·  Dev sold: yes/no

━━━ SAFETY ━━━
Mint ✅/❌  ·  Freeze ✅/❌  ·  LP burned ✅/❌
Tax B/S: x/y%  ·  Snipers % · Insiders % · Bundlers %

━━━ HOLDERSINTEL NATIVE ━━━
Dev: <wallet>  ·  KYC root: <cex>
Dev rep: N  ·  Prior tickers: …

━━━ SOCIALS / LINKS ━━━
X · TG · Web  (whichever the bots surfaced)

━━━ SOURCE BOTS ━━━
🤖 @holdersintel_bot · @phanes_trading_bot · @ricktradingbot
🔗 blackbox.farm/holders?token=<mint>
```

- Consensus picker stays median-of-available; missing fields render `—`.
- Add 4 new field extractors to `_shared/blackbox-parsers/generic.ts` (so Phanes/Rick parsers pick them up):
  - `ath_usd`, `ath_drawdown_pct`, `dev_sold` (bool), `fresh_wallets_pct`.
- HoldersIntel native pull stays as-is.

### 2. No DB migration

`output_channel` row already points to No Lube. No new targets table entry needed.

## Out of scope

- Phanes RATE-LIMIT cooldown logic — keep as-is.
- 60s minimum bait spacing — keep.
- 1 bait per tick — keep.
- Full Holders Report (suspended) — stays suspended.

## Files touched

- `supabase/functions/blackbox-tick/index.ts` (window + composer)
- `supabase/functions/_shared/blackbox-parsers/generic.ts` (extra fields)
