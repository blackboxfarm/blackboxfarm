## Problem

`blackbox-tick` is working end-to-end up to the final send:
- Bait CA posted to BLACKBOX as `system_reset` ✅
- Trader-bot replies harvested into `blackbox_bot_replies` (2–4 per run) ✅
- `composeDigest()` builds the 🐸 message ✅
- `sendViaHoldersIntel()` to No Lube → **HTTP 400** from Telegram:
  `can't parse entities: Can't find end of the entity starting at byte offset 480`
- Run row flips to `status='failed'`, `digest_message_id=null`, No Lube stays empty.

Cause: digest is sent with `parse_mode: 'Markdown'` (legacy). Several interpolated values can contain unescaped `_ * [ ] ` ` characters:
- `Funded By: ${fundedBy}` — KYC root labels like `binance_hot_wallet`, `kraken_2`, etc. blow up underscores
- `$${symbol}` — occasional tickers contain `_`
- AI bullet strings / `ageText` from bots can include `*` or `_`
- `Reputation: ${devRep}` and `prior_tickers` entries

## Fix

Make the send bulletproof, in `supabase/functions/blackbox-tick/index.ts`:

1. Switch `sendViaHoldersIntel()` to `parse_mode: 'MarkdownV2'` **or** `'HTML'`. HTML is simpler and forgiving.
2. Rewrite `composeDigest()` to emit HTML:
   - `<b>…</b>` for bold instead of `*…*`
   - `<a href="URL">label</a>` for the link rows
   - `<code>MINT</code>` for the CA
   - Helper `esc(s)` that escapes `& < >` on every interpolated value (symbol, fundedBy, devRep, ageText, AI bullets, pastLaunches, rugs).
3. Keep the exact visual layout from the No Lube template (headline, dividers, sections, score line, two button rows, CA footer).
4. Add a fallback: if the HTML send still 400s, retry once with `parse_mode` omitted (plain text) and log the offending text snippet, so we never silently drop a digest again.
5. Backfill: re-queue the last N `failed` runs whose `replies_collected > 0` by resetting `status='harvesting'` and bumping `harvest_until = now()` so the next tick re-composes and posts them (optional one-shot SQL — included as a separate apply step the user can approve).

## Files touched

- `supabase/functions/blackbox-tick/index.ts` — only the `sendViaHoldersIntel` helper and `composeDigest` body. No changes to harvest, parsers, scoring, or DB writes.

## Verification

- After deploy, watch `blackbox-tick` logs for absence of `sendMessage failed`.
- Confirm new rows in `blackbox_aggregator_runs` show `status='published'` and non-null `digest_message_id`.
- Confirm a 🐸 post appears in No Lube Alpha Calls within ~30s of the next bait.
