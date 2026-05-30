## Daily Multiplier Leaderboard — per-profile, "No Lube" first

### Goal
At each profile's local day-rollover (No Lube = 04:00 Toronto, covering the prior 06:00→06:00 Toronto window), generate a Top 20 leaderboard of tokens **first called inside that window**, ranked by **peak multiplier** achieved during the window. Render a branded 2×10 pill image (Public + Private variants) and post to that profile's X account.

### Data model

**1. `leaderboard_profiles`** (reusable template per persona)
- `id` (text, pk) e.g. `no_lube`
- `profile_id` → link to `no_lube_global_profile` / future personas
- `display_name`, `handle_public`, `handle_private`
- `day_start_hour` (int, 0–23) — e.g. 6
- `timezone` (text) — e.g. `America/Toronto`
- `post_offset_hours` (int) — e.g. 22 (post at 04:00 next day = window_end − 2h… stored as absolute post hour: `post_hour` 0–23 = 4)
- `background_asset_url`, `accent_hex`, `font_family`
- `post_targets` jsonb — `{ x_public: true, x_private: true }`
- `enabled` bool

**2. `leaderboard_daily_runs`**
- `id`, `profile_id`, `window_start_utc`, `window_end_utc`, `local_date` (date in profile tz)
- `status` (pending / rendered / posted / failed)
- `entries` jsonb — array of 20 `{ rank, mint, ticker, image_url, multiplier, called_at_mcap, ath_mcap, called_at_ts }`
- `image_public_url`, `image_private_url`
- `x_post_id_public`, `x_post_id_private`
- `created_at`
- Unique on `(profile_id, local_date)`

### Edge functions

**`leaderboard-daily-builder`** (cron, runs hourly)
- For each enabled profile, compute current local time in tz. If local hour == `post_hour` and no row exists for prior `local_date` → build.
- Query `telegram_insider_token_lifecycle` for tokens where `first_called_at` ∈ [window_start_utc, window_end_utc), profile-scoped.
- Compute multiplier = `peak_market_cap / entry_market_cap`, sort desc, take top 20.
- Resolve ticker + mint image (existing token metadata helpers).
- Insert `leaderboard_daily_runs` row.
- Invoke `leaderboard-render`.

**`leaderboard-render`**
- Takes run_id, profile.
- Builds an HTML/SVG template (2 columns × 10 pills, 10° / 10px rounded corners, mint image circle bordered, `#RANK · $TICKER · 50x · called @ $Xk · ATH $Yk`).
- Two background variants from profile: Public + Private. Regenerate-background button in UI calls AI image gen for new bg, saves to `leaderboard_profiles.background_asset_url` (public/private split).
- Renders to PNG via existing rendering path (similar to no-lube post images), uploads to storage, stores both URLs on run row.

**`leaderboard-post`**
- Posts public PNG to public X account, private PNG to private X account, using existing No Lube X posting path. Stores message ids.

### Cron
- Hourly `leaderboard-daily-builder` (pg_cron + pg_net).

### UI — Super Admin → No Lube tab, new sub `dailies`
- Profile editor card: day_start_hour, tz, post_hour, X handles (public/private), accent, font.
- **Background mockup panel** (Public + Private side-by-side):
  - Current background preview with the 2×10 pill grid overlaid (live preview using latest run or stub data)
  - **"Regenerate background"** button per variant — calls AI image gen with profile-specific prompt, updates `background_asset_url`.
- Recent runs list with thumbnails, status, "Re-render", "Re-post" buttons.
- Layout template is profile-driven, so adding another persona later just needs a new `leaderboard_profiles` row.

### Brand/content rules
- Ticker sanitized via `sanitizeTickerForTwitter` for any caption.
- Caption: "🏆 No Lube Daily Top 20 — {local_date}\nBest multiplier calls 6am→6am Toronto.\n#Solana #NoLube" (public) / private variant references subscriber-only framing.
- Image only, no spoilery mint addresses in caption (avoid bot loops per Thin Formatting memory).

### Technical details
- Use `assertDbWrite` for every insert/update (Zero Tolerance memory).
- Timezone math via `Intl.DateTimeFormat` with `timeZone` option in edge runtime; window_start = today-in-tz at `day_start_hour` minus 24h; window_end = today-in-tz at `day_start_hour`.
- Idempotent: unique `(profile_id, local_date)` prevents double posts.
- Image gen: reuse existing AI image gateway used by other no-lube assets; transparent overlay PNG composited on background server-side (sharp/skia) inside `leaderboard-render`.
- All new edge functions guarded by `function_toggles` row so they can be disabled instantly.

### Out of scope (future)
- Weekly / monthly leaderboards (same template, different window).
- Telegram channel mirror (template already supports `post_targets`; wire later).
