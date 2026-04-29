## Goal

Stand up a simple public-facing "Autopsies" section, mirroring the Intel Briefings pattern but lightweight (no DB, file-based), with the GPT autopsy as the seed entry. Add an estimated PnL section (USD + SOL) to the .md and embed full copyright notice.

## What ships

1. **Nav menu item** — "💀 Autopsies" added to `BASE_NAV_ITEMS` in `SiteLayout.tsx`, route `/autopsy`. Always public (no system_settings gate).
2. **List page** `/autopsy` — `src/pages/Autopsies.tsx`. Uses `SiteLayout`. Renders a single card (GPT autopsy) styled like `BriefingCard`. Header with skull icon, "Forensic post-mortems on coordinated rugs and exit-liquidity events" subtitle.
3. **Detail page** `/autopsy/:slug` — `src/pages/AutopsyArticle.tsx`. Renders the .md file as black-on-white content block (light card on the dark site bg), inside our normal SiteLayout. Includes:
   - Title, date, verdict badge (RUG 10/10)
   - Markdown rendered via the existing `ArticleContent` renderer (`src/components/intel/ArticleMarkdownRenderer.tsx`) so styling matches Intel articles
   - **"Download .md"** button (triggers download of the raw file)
   - **Share buttons** — reuse `SocialShareBar` (X, Telegram, copy link)
   - Back link to `/autopsy`
4. **Static autopsy registry** — `src/data/autopsies.ts` exports an array of `{ slug, title, subtitle, mintAddress, verdict, publishedAt, mdPath, downloadName }`. Keeps it dead-simple — no DB, no migrations. Adding a new autopsy = drop .md in `public/autopsies/` + push entry to array.
5. **The .md file** — copy `/mnt/documents/autopsies/GPT_Greedy_Pissing_Testicle_AUTOPSY.md` to `public/autopsies/gpt-greedy-pissing-testicle.md` so it's served statically and downloadable. Fetch via `fetch('/autopsies/...md')` at runtime.
6. **PnL + Copyright additions to the .md**:
   - **New section "PnL Reconstruction"** added before the postmortem with:
     - Dev wallet: ~86 SOL spent on dev-buy, exited via cascade — reconstructed take ≈ 0 SOL net (acted as token-source for funder)
     - Funder wallet: net **~+213 SOL** realized (299.9 SOL final balance + USDC chunks consolidated − 89.1 SOL launch funding − 86 SOL dev-buy reimbursement). At SOL ≈ $150 ⇒ **~$32K USD profit**
     - Sniper `2SXWyH...`: 84.98 SOL spent, sold into the pump pre-cascade; estimated **+50 to +120 SOL realized (~$7.5K–$18K)** pending tx-by-tx confirm
     - Combined operation realized profit estimate: **~265–335 SOL (~$40K–$50K USD)** off retail flow of ~$893K 24h volume
     - All figures marked "estimated, on-chain reconstruction, subject to refinement once Solscan Pro tx-trace is enabled"
   - **Copyright footer** appended:
     - `© 2026 BlackBox Farm / HoldersIntel. All rights reserved.`
     - License: CC BY-NC-ND 4.0 (share with attribution, no commercial use, no derivatives)
     - Attribution string + link to https://blackbox.farm/autopsy/gpt-greedy-pissing-testicle
     - Disclaimer: "This report is on-chain forensic analysis based on public Solana ledger data. Wallet labels are inferred from behavioral evidence. No legal accusation is asserted; readers should perform independent verification."
     - Contact: research@blackbox.farm
7. **SEO** — page title, meta description, JSON-LD `Article` schema on the detail page (mirroring `ArticleStructuredData` usage but inlined — keep simple).

## Technical details

- **Route registration**: add two `<Route>` entries in `src/App.tsx` above the catch-all — `/autopsy` → `Autopsies`, `/autopsy/:slug` → `AutopsyArticle`. Both lazy-loaded.
- **Markdown rendering**: import `ArticleContent` from `@/components/intel/ArticleMarkdownRenderer`. Wrap in a `bg-white text-black` content card (rounded, padded, max-w-4xl mx-auto) so it reads as a "document on the dark site" — matches user's "white and black as normal" ask.
- **Download**: anchor `<a href="/autopsies/gpt-greedy-pissing-testicle.md" download="GPT_Autopsy_BlackBoxFarm.md">` — browser handles it, no JS needed.
- **Share**: reuse `SocialShareBar` component, pass `url`, `title`, `description`.
- **No DB / no migration** — explicitly chosen to keep this lightweight per user's "keep it simple for now". Future expansion (admin editor, DB-backed) can mirror the Intel Briefings stack later.
- **Files created**:
  - `src/pages/Autopsies.tsx`
  - `src/pages/AutopsyArticle.tsx`
  - `src/data/autopsies.ts`
  - `public/autopsies/gpt-greedy-pissing-testicle.md` (copied + augmented)
- **Files edited**:
  - `src/App.tsx` (2 routes)
  - `src/components/layout/SiteLayout.tsx` (nav item with 💀)
  - `/mnt/documents/autopsies/GPT_Greedy_Pissing_Testicle_AUTOPSY.md` → versioned `_v2` with PnL + copyright, then mirrored into `public/`

## Out of scope (per "keep simple for now")

- No DB table, no admin CRUD UI, no category filter, no related-autopsies grid, no view-tracking edge function, no sitemap entry (can add later).
- Not wiring blacklist actions into `dev_wallet_reputation` / `mesh_blacklist` (the autopsy recommends them; execution stays a separate task).
