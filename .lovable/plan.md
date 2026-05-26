## Three changes to Super Admin → Holders Intel

### 1. Kill the "Backfill Review" panel

`src/components/admin/tabs/HoldersIntelTab.tsx`
- Remove the `🧪 Backfill Review` `TabsTrigger` and its lazy import + `<Suspense>` block.
- Same removal inside `src/components/admin/holders-intel/TokenArchive.tsx` (it embeds `<BackfillReview />` under a "Backfill Review" inner tab).
- Leave `BackfillReview.tsx` on disk for now (no deletion) so we can resurrect if needed — just unmount it from every tab tree.

### 2. Suspend AI / API calls in Manual X Posting Queue

`src/components/admin/holders-intel/ManualXPostingQueue.tsx` — turn it into a pure review/copy/mark-posted surface. Suspend (comment-gate with a "Suspended" toast, do not delete) every button + auto-trigger that hits an edge function or AI:

- `composeOne` → button disabled, calls no-op'd
- `composeMissing` ("Compose all missing")
- `decorateBanner` (AI banner decorate)
- `holders-intel-autopsy-now` trigger
- Auto-refresh interval that re-invokes compose
- Any "Post 50 to Archive" path that calls a backend cron

The list/paginate/search/`mark-as-posted` flow stays live. A small amber banner at the top of the panel explains "AI compose & banner decoration suspended — manual mode only."

### 3. New "No Lube" template tab

Goal: same Telegram-Markdown editor UX as the existing "TG Report" (`tg_search`) tab, sitting one slot to the right of `📣 TG Ad3`.

#### Files

**`src/lib/share-template.ts`**
- Add `'no_lube'` to the `TemplateName` union.
- Add `no_lube` entry to `DEFAULT_TEMPLATES` using the post template you approved earlier (the `🐸 HOPPY` BlackBox-Score layout), with `{ticker}`, `{verdict}`, `{momentum}`, `{risk}`, `{mc}`, `{mcChange}`, `{vol24h}`, `{lp}`, `{age}`, `{top10}`, `{freshWallets}`, `{walletSpread}`, `{bundledRisk}`, `{aiBullet1..4}`, `{fundedBy}`, `{pastLaunches}`, `{rugs}`, `{devReputation}`, `{blackboxScore}`, `{chartUrl}`, `{bubbleMapUrl}`, `{intelUrl}`, `{buyUrl}`, `{scanHistoryUrl}`, `{socialsUrl}` etc.
- Add the same keys to `TEMPLATE_VARIABLES` so the variable-chip grid at the bottom of the editor renders them.

**`src/components/social/ShareCardDemo.tsx`**
- Add `no_lube: false` to the `savedStatus` initializer.
- Add `<TabsTrigger value="no_lube" className="text-xs">🐸 No Lube</TabsTrigger>` immediately after the TG Ad3 trigger.
- Add `'no_lube'` to the array on the line `(['small', 'large', ... 'tg_advert_3'] as TemplateName[]).map(...)` so the editor + preview render for it.
- No advert-specific config needed (`no_lube` is treated like `tg_search` — plain template + preview + variables, no `AdvertTemplateConfig` block).

#### Variable list shown at the bottom of the No Lube tab

Grouped chips (rendered in the same `Available variables` row style as TG Report):

- **Identity:** `{ticker}` `{name}` `{ca}`
- **Verdict block:** `{momentum}` `{risk}` `{verdict}` `{blackboxScore}`
- **Market:** `{price}` `{mc}` `{mcChange}` `{fdv}` `{vol24h}` `{vol1h}` `{lp}` `{age}` `{ath}` `{athDrawdown}`
- **Holder Health:** `{totalHolders}` `{top10}` `{freshWallets}` `{walletSpread}` `{bundledRisk}` `{snipersPct}` `{insidersPct}` `{bundlersPct}`
- **Safety:** `{mintRevoked}` `{freezeRevoked}` `{lpBurned}` `{buyTax}` `{sellTax}` `{devHoldings}` `{devSold}`
- **BlackBox AI bullets:** `{aiBullet1}` `{aiBullet2}` `{aiBullet3}` `{aiBullet4}`
- **Developer Intel:** `{fundedBy}` `{pastLaunches}` `{rugs}` `{devReputation}` `{kycRoot}` `{priorTickers}`
- **Action URLs:** `{chartUrl}` `{bubbleMapUrl}` `{intelUrl}` `{buyUrl}` `{scanHistoryUrl}` `{socialsUrl}` `{twitterUrl}` `{telegramUrl}` `{websiteUrl}`

(Wiring these variables to real consensus values from `blackbox_bot_replies` is a follow-up — this plan only delivers the editor surface + variable catalog so the template can be authored and previewed with mock data, matching the TG Report tab pattern.)

### Out of scope
- No DB migration. `flipit_tweet_templates`/share template storage already supports arbitrary `template_type` strings.
- No changes to `blackbox-tick` `composeDigest()` yet — once you lock the No Lube template text in this new tab, a follow-up loop will switch the tick composer to read it from DB instead of the hardcoded TS string.
