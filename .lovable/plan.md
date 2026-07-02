# You're right — we're currently throwing the links away

## What we're actually capturing today

In `telegram-mtproto-auth` → `fetchRecentMessagesViaMTProto`, every message is mapped down to **just this**:

```ts
{ messageId, text: m.text, date, callerUsername, callerDisplayName }
```

Everything else the MTProto client hands us — `m.entities` (the array with `MessageEntityTextUrl`, `MessageEntityUrl`, `MessageEntityMention`, `MessageEntityMentionName`), and `m.media` / `m.webPreview` (the DexScreener/X link-preview card) — is dropped on the floor before `blackbox-tick` ever sees it.

So when Phanes writes **"Chart: DEX·DEF"** and hides `https://dexscreener.com/solana/<pair>` behind "DEX", we only save `"Chart: DEX·DEF"` as `raw_text`. The URL is gone. Same for the hidden X profile link behind the 🐦 icon, the "about" link, the [info]/[lens] links, etc. That's why `twitter_url`, `telegram_url`, `website_url` are stuck at *"not captured"* on `/nolube` even when the bot's message clearly contains them.

**Nothing about HTML is stopping us — we just aren't asking for the entity list.**

## The fix, in three layers

### 1. MTProto mapper — stop dropping entities and previews
`supabase/functions/telegram-mtproto-auth/index.ts` (the `mapped` block, lines 52–67):

Add to each returned message:
- `entities`: normalized array of `{ type, offset, length, url?, user_id?, language? }` from `m.entities`. Resolves `MessageEntityTextUrl.url` and `MessageEntityMentionName.userId` — the two that carry hidden links.
- `webPreview`: `{ url, displayUrl, siteName, title, description }` from `m.webPreview` when present (the DexScreener/X card).
- `linkUrls`: flat de-duped `string[]` of every URL found across entities + webPreview + a plain-text URL regex fallback. This is the field the parsers will actually read.

Keep `text` unchanged so existing parsers keep working.

### 2. Storage — persist the links so /nolube can show them
Migration on `public.blackbox_bot_replies`:

```sql
ALTER TABLE public.blackbox_bot_replies
  ADD COLUMN IF NOT EXISTS entities_jsonb jsonb,
  ADD COLUMN IF NOT EXISTS link_urls      text[],
  ADD COLUMN IF NOT EXISTS web_preview    jsonb;
```

No new grants/policies — table already has them.

In `blackbox-tick` (around line 546), pass the new fields into the upsert alongside `raw_text` / `parsed_jsonb`. Also forward them into `blackbox-parser-probe`'s `messages` payload so the sample corpus grows with entities too.

### 3. Parsers — actually use the hidden URLs
`supabase/functions/_shared/blackbox-parsers/types.ts` — change `parse(rawText)` to `parse(rawText, ctx?: { linkUrls?: string[]; webPreview?: {...} })`. Existing parsers keep their regex-on-text path; the new ctx just fills fields the text can't:

- `twitter_url` ← first `x.com|twitter.com` URL in `linkUrls`
- `telegram_url` ← first `t.me` URL (excluding `t.me/<bot>` self-refs)
- `website_url` ← first URL that isn't x/twitter/t.me/dexscreener/solscan/pump.fun/birdeye
- Optional extras (nice to have, non-blocking): `chart_url` (dexscreener/dextools), `explorer_url` (solscan), `ath_source_url` etc., surfaced via `extras`.

Fallback order per field: parsed-from-text → ctx URL → null.

### 4. /nolube — surface what we now have
`src/pages/NoLube.tsx` right-pane detail:
- Under the existing "Socials / Links" group, if a field is filled from `linkUrls` vs. from body text, tag the source chip as `entity` vs `text` so you can eyeball which bot embedded the link vs printed it.
- New collapsible block **"Raw links captured"** per reply showing `link_urls[]` and `web_preview` — this is the direct visual confirmation that we're now grabbing hyperlinks.
- No changes to `FIELD_MENU` structure or coverage math.

## What this does NOT touch
- Command posting, MTProto auth flow, session storage, run scheduling.
- Existing `raw_text` / `parsed_jsonb` shape — purely additive columns.
- Parsers' text regex logic — only adds a URL-based fallback.

## Technical notes
- mtcute exposes entities as `m.entities` (array of tagged unions) and the link card as `m.webPreview` (or `m.media` when `_ === 'messageMediaWebPage'`). Both are already fetched by `getHistory` — no extra API call, no extra cost.
- `MessageEntityTextUrl` is the important one: its `url` is the *real* href behind display text like "DEX" or "X". `MessageEntityUrl` covers auto-linked bare URLs. `MessageEntityMentionName` gives us the `user_id` behind an `@handle` mention (useful for Dr_Rick's `@JsonDevs`-style anchors).
- Plain-text URL regex is only a safety net for bots that inline the URL rather than entity-linking it.

## Files touched
1. `supabase/functions/telegram-mtproto-auth/index.ts` — map entities + webPreview + linkUrls
2. `supabase/migrations/<new>.sql` — 3 nullable columns on `blackbox_bot_replies`
3. `supabase/functions/blackbox-tick/index.ts` — persist new fields, forward to probe
4. `supabase/functions/_shared/blackbox-parsers/types.ts` + `index.ts` — parse(ctx)
5. `supabase/functions/_shared/blackbox-parsers/{trojan,gmgn,generic}.ts` — URL fallbacks for twitter/telegram/website
6. `src/pages/NoLube.tsx` — entity/text source chip + raw-links panel

## Expected outcome after this ships
On the next Phanes+Rick reply scrape you run, `/nolube` will show `twitter_url`, `telegram_url`, `website_url` filled (green dots) for tokens where the bots embedded those links, plus a "Raw links captured" panel listing every hidden href — proving we're now reading the whole message, entities and all, not just what your eye sees.
