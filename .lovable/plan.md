## DeadTokens X-Post Composer for Autopsy Reports

Add a copy-paste X (Twitter) post generator to every autopsy, modelled on the @DeadTokens83517 template, ready for manual posting until automation arrives.

### 1. Post template (locked format)

Generated client-side from the autopsy row + harm fields:

```text
☠️DEADTOKEN : BlackBox Autopsy 🪦
🩸 ${TICKER} '{TITLE_TAG}'
{MINT_ADDRESS}
{X_HANDLE_OR_BLANK}

🪦 {HARM_HEADLINE}     ← e.g. "$18,000 USD Rug Profit · 1,847 bagholders"
See the Players & Profits 💰, the Rug Mechanics, Timeline & Ruggers Wallet💰 — all linked wallets.

Verdict: {VERDICT_UPPER}
🔍 Discover all the Players & Snipers 👇
🪦 Read the FULL AUTOPSY REPORT! 🪦

🌐 https://blackbox.farm/autopsy/{slug}

#Solana #${TICKER} #RugPull #DeadTokens
```

Variants the composer auto-picks based on `death_cause`:
- `coordinated_rug` / `atomic_snipe_rug` → "TEXTBOOK COORDINATED RUG"
- `soft_rug` → "SLOW-DRAIN SOFT RUG"
- `dev_abandonment` → "DEV ABANDONED — BAG HOLDERS LEFT"
- `hype_decay` / `community_burnout` → "HYPE DIED — ORGANIC FLATLINE"
- fallback → uses `verdict` field uppercased

Hashtag set rotates by intent so we don't spam identical tags every post.

### 2. New component — `AutopsyTweetComposer`

`src/components/admin/autopsies/AutopsyTweetComposer.tsx`:
- Props: `report` row (slug, ticker, title, mint, verdict, harm_headline, harm_breakdown, hero_image_path, x_handle?).
- Builds the post string with `buildDeadTokensPost()` helper (`src/lib/deadTokensPost.ts`).
- Renders:
  - **Live char counter** (X limit 280; we expect ~260 — show red if >280, amber if >250).
  - **Editable `<Textarea>`** pre-filled with template (admin can tweak before copying).
  - **Copy Post** button → clipboard.
  - **Copy Image URL** button → public hero banner URL.
  - **Download Image** button → fetches hero banner blob (works around X drag-drop).
  - **"Open X compose"** link → `https://x.com/intent/post?text=...` so two clicks gets it on screen with text pre-filled.
  - Small live preview pane styled like an X card (avatar, handle @DeadTokens83517, body, image thumb).
- Resets to template when admin clicks **Regenerate**.

### 3. Surface the composer in two places

a. **Admin tab — `PublishedAutopsies.tsx`**
   - Add a `<Button>` "🐦 X Post" on each row → opens a `<Dialog>` containing `AutopsyTweetComposer`.

b. **Public autopsy page — `src/pages/AutopsyArticle.tsx`**
   - For super-admins only (gated by `useSuperAdminAuth`), show a floating "🐦 Generate X Post" button bottom-right that opens the same dialog. Hidden for normal visitors.

### 4. Optional schema touch (no migration required now)

`autopsy_reports` already carries everything we need. We just add an optional `x_post_template` jsonb column later when we automate — out of scope for this pass.

### 5. Memory + docs

- Add `mem/features/autopsy/x-post-template.md` documenting the locked format, hashtag rotation rules, and the @DeadTokens83517 handle so future agents don't drift.

### Technical notes

- All-client-side; no edge function or DB write.
- Helper `buildDeadTokensPost()` is pure → easy to unit-test later and reuse when we wire automation.
- Image download uses `fetch(...).blob()` + `<a download>` so it works on Supabase Storage + public `/autopsies/*.jpg` paths.
- For the static GPT entry (no DB row), the public `AutopsyArticle.tsx` button reads from `AUTOPSIES` array, so the composer works there too.
- No hardcoded numbers — harm_headline always sourced from `harm_breakdown` / fields already populated by `autopsy-harm-scorer`.
