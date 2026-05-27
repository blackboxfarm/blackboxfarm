# Plan — Public-Channel Image Cards + Per-Profile Trade Bots + Asset Library

Three connected pieces. Build in this order: **Asset Library → Image Card Generator → Per-Profile Trade Bot scaffold**.

---

## 1. Asset Library (admin-managed, Supabase Storage)

A super-admin panel under `/super-admin` → new tab **"No Lube → Assets"**.

**Storage:** new public bucket `no-lube-assets`.

**Table:** `no_lube_assets`
- `id`, `category` (enum: `background`, `character`, `frame`, `sticker`, `logo`)
- `name`, `tags` (text[]), `storage_path`, `public_url`
- `language` (nullable — for language-specific meme variants: `en`, `ko`, `zh`, `ja`, `universal`)
- `enabled` (bool), `usage_count`, `last_used_at`
- `created_by`, `created_at`

**Admin UI:** upload, tag, preview grid, toggle enable/disable, filter by category/language, delete. Each row shows a thumbnail + usage stats.

Assets feed the image generator as **style references** (sent to Gemini-3-pro-image as multimodal input) — not composited literally. Library = inspiration pool the AI mixes per post.

---

## 2. Image Card Generator (`no-lube-render-card` edge function)

Called by `no-lube-orchestrate` when a re-sighting hits ≥2x **AND** the channel = `public`.

**Inputs:** mint, ticker, current mcap, entry mcap, multiplier (2x/3x/8x…), channel branding, token PFP URL (from mint metadata), language (channel locale).

**Pipeline:**
1. Fetch token mint image from Helius/DexScreener metadata.
2. Pick 1–3 random enabled assets from `no_lube_assets` matching the language + categories needed (1 character, optional background).
3. Build a prompt grounded in the uploaded **BLACKBOX IMAGE GENERATION + TG CARD** style guide (matte black, cyan neon, gold accents, pulse cube branding, multiplier as huge typographic accent — like the `8X` in your screenshot).
4. Call **Lovable AI Gateway** `openai/gpt-image-2` (quality `medium`, `1024x1536` portrait — Telegram card-friendly), passing the token PFP + selected library assets as reference images.
5. Upload result to `no-lube-rendered-cards` bucket. Stamp `no_lube_post_log.image_url`.

**Post structure (public channel):**
```
[ AI-generated image card ]
🎉 $TICKER  8X! 🎉
💎 Token: $TICKER
📝 CA: <mint>
💰 Entry: $103k → Now: $914k
DexScreener | DexTools
[👑 JOIN PREMIUM INSIDERS] ← inline button → deep link to profile's trade bot
```

The bottom button is a `t.me/<ProfileBot>?start=access_<mint>` deep link (per Q4 below).

---

## 3. Per-Profile Trade Bot Scaffold

You said: **one trade bot per profile**, nicknamed to the profile (Luna's VIP Calls → `@LunaVIPTradeBot`, etc.). This is exactly how the competitor's `InsiderAccessBot` works — but theirs is a Mini App with `startapp=`; **ours will be a plain bot with inline-keyboard quick-buy** (cheaper, faster, no Mini App hosting overhead, identical UX for the user).

**Schema:** extend `no_lube_channel_profiles` with:
- `trade_bot_username` (text) — e.g. `LunaVIPTradeBot`
- `trade_bot_token_secret_name` (text) — name of the secret holding that bot's token (e.g. `LUNA_TRADE_BOT_TOKEN`)
- `trade_bot_webhook_set` (bool)
- `access_purchase_url` (text, fallback) — Stripe / SOL payment link until trade bot is provisioned

**New edge function:** `profile-trade-bot-webhook` (single function, routes by `bot_id` query param so all profile bots share one endpoint).

**Phase 1 (this build):** scaffold the table columns + webhook router skeleton + admin UI fields to paste in BotFather token. **No trade execution yet** — the public card's CTA button initially routes to `access_purchase_url` (Stripe/SOL pay-for-access flow you already have).

**Phase 2 (next iteration, not in this plan):** wire trade execution into the webhook (reuse existing wallet infra from CommunityWallet / campaign wallets), inline buttons for `Buy 0.1 / 0.5 / 1 SOL`, `Ape Max`.

---

## What this plan does NOT do
- No actual trade execution (Phase 2).
- No Mini App (not needed — costs nothing on TG side, but adds hosting/UI complexity for zero user benefit at this stage).
- Doesn't touch the private-channel template (already working).

---

## Open follow-up questions (answer in chat, not blocking the plan)

1. **AI model:** `openai/gpt-image-2 medium` (~$0.04/image, very strong typography for the `8X` accent) or `google/gemini-3-pro-image-preview` (~$0.03, better at integrating reference images / token PFP)? My recommendation: **Gemini-3-pro** because we're feeding it the real token mint PFP + library assets as references, which is its strength.

2. **Card aspect ratio:** Portrait `1024x1536` (matches your competitor screenshot, dominates mobile TG feed) or landscape `1536x1024` (more "trading card")? Recommend portrait.

3. **Language detection:** Pull from the channel profile's `language` field (already exists?) or detect from channel name? Need to confirm where channel locale lives so I select language-tagged assets correctly.

4. **CTA target now:** For the public 2x+ post's bottom button — point it at (a) the existing Stripe access checkout, (b) a `t.me/<bot>?start=...` link that the per-profile bot will eventually own (button text just says "Get Premium Access"), or (c) both — Stripe primary + small "Pay with SOL via bot" secondary?
