
# Master Variable Registry — "Everything We Know About This Token"

Goal: after Phanes+Rick reply → after /holders pipeline → after Helius/DexScreener fetches → after AI derivations, we end up with **one flat key/var dictionary per token per run** (hundreds of entries), viewable on `/nolube`, reusable by any output template (X posts, TG cards, intel briefings, AI prompts).

---

## 1. The 4 collection stages

Each stage writes into ONE per-run bag, namespaced by source so nothing collides.

```text
Stage 1  BLACKBOX SCRAPE           bb.phanes.*   bb.rick.*   bb.entities.*   bb.webpreview.*
Stage 2  ON-CHAIN + MARKET         helius.*      dex.*       birdeye.*       pumpfun.*
Stage 3  HOLDERS PIPELINE          holders.*     wallets.*   distribution.*  cex.*
Stage 4  DERIVED / AI              calc.*        ai.*        risk.*          narrative.*
```

Every leaf is `{ value, source, captured_at, ttl, mutability: 'immutable'|'transient' }`.

**Immutable** (write once, never overwrite): mint, creator, launch tx, launch time, ATH-at-time-of-scrape, DexScreener pair URL, initial socials, first-seen entities, webPreview snapshot.

**Transient** (refresh allowed, latest wins, keep history): price, mcap, liquidity, holder count, top10%, volume, price_change_*, holder movements, dex status.

---

## 2. Stage 1 — squeeze the Blackbox scrape dry

We already capture `text`, `entities_jsonb`, `link_urls`, `web_preview`. Extend the ingest to also emit:

- `bb.<bot>.raw_text`
- `bb.<bot>.entities[]` — each with `{type, offset, length, url?, user_id?, slice_text}`
- `bb.<bot>.links.twitter`, `.telegram`, `.website`, `.dexscreener`, `.solscan`, `.birdeye`, `.pumpfun`, `.dextools`, `.chart`, `.other[]` — bucketed from `link_urls` by host
- `bb.<bot>.mentions[]` — `@handles` + resolved `user_id` from `MessageEntityMentionName`
- `bb.<bot>.hashtags[]`, `bb.<bot>.cashtags[]`
- `bb.<bot>.emoji_flags[]` — 🐦 🌐 📊 etc. (bot uses these as icon-links)
- `bb.<bot>.webpreview` — full `{url, display_url, site_name, title, description, type}`
- `bb.<bot>.numbers[]` — every `$xxx / xxxk / xx% / xxh` token with its label context (2 words before)
- `bb.<bot>.parsed.*` — the existing NormalizedBotFields flattened
- `bb.union.*` — merged view across bots with divergence flags

Nothing is thrown away. If a parser doesn't know a field, it lands in `bb.<bot>.extras.<label>`.

## 3. Stage 2 — enrich immediately after scrape

Triggered by `blackbox-tick` right after `parseReply` succeeds. Parallel fetches:

- **Helius** → `helius.mint_authority`, `.freeze_authority`, `.supply`, `.decimals`, `.metadata_uri`, `.metadata_json`, `.creators[]`, `.first_signature`, `.first_block_time`, `.tx_count_24h`
- **DexScreener** (from `bb.union.links.dexscreener` or lookup) → `dex.pair_address`, `.dex_id`, `.chain_id`, `.price_usd`, `.price_native`, `.liquidity_usd`, `.fdv`, `.mcap`, `.volume.{m5,h1,h6,h24}`, `.price_change.{m5,h1,h6,h24}`, `.txns.{...}`, `.info.socials[]`, `.info.websites[]`, `.pair_created_at`, `.url`
- **Pump.fun** (if applicable) → `pumpfun.bonding_curve`, `.progress_pct`, `.king_of_hill_ts`, `.graduated`, `.reply_count`, `.creator_profile.*`
- **Birdeye** (already-cached only, no burn) → `birdeye.security.*`, `.holders_top`
- **Cached SOL price** → `market.sol_usd`, `market.sol_usd_at`

Every field tagged `immutable` or `transient` per §1.

## 4. Stage 3 — pipe token into /holders pipeline, harvest its output

Reuse existing `capture-holder-snapshot` + `track-holder-movements` + holders report generator. Flatten their output into:

- `holders.count`, `holders.top10_pct`, `holders.top25_pct`, `holders.gini`, `holders.tier_counts.{whale,baby_whale,super_boss,kingpin,boss,real,large,medium,small}`
- `holders.fresh_wallets_pct`, `.sniper_pct`, `.insider_pct`, `.bundler_pct`, `.dev_holdings_pct`
- `wallets.top[]` — first 25 with `{address, balance, usd, tier, first_seen, funding_source, cex_root?}`
- `distribution.concentration_score`, `.entropy`, `.bag_holder_ratio`
- `cex.kyc_roots[]`, `cex.roots_pct`
- `movements.last_1h[]`, `.last_24h[]` — inflows/outflows
- `bad_actor.hits[]`, `cto.status`, `optimistic.summary_id`

## 5. Stage 4 — derived + AI

Cheap deterministic calcs first, then one Gemini call to fill narrative fields:

- `calc.age_minutes`, `calc.age_bucket`, `calc.ath_drawdown_pct`, `calc.liquidity_to_mcap`, `calc.volume_to_liquidity`, `calc.price_change_agreement` (do bots agree?)
- `risk.score_0_100`, `risk.flags[]` (mint_live, freeze_live, low_liq, top10_high, fresh_wallets_high, bundler_high, divergent_bot_data)
- `ai.one_liner`, `ai.thesis`, `ai.red_flags[]`, `ai.green_flags[]`, `ai.suggested_action`
- `narrative.template_ready` — boolean gate telling composers "you have enough vars to render"

## 6. Storage

Additive columns on `blackbox_aggregator_runs`:

```sql
ALTER TABLE public.blackbox_aggregator_runs
  ADD COLUMN IF NOT EXISTS var_bag_jsonb   jsonb,      -- flat { "bb.phanes.parsed.price_usd": {value,source,...}, ... }
  ADD COLUMN IF NOT EXISTS var_bag_stage   text,       -- 'scrape'|'enrich'|'holders'|'derived'|'complete'
  ADD COLUMN IF NOT EXISTS var_bag_counts  jsonb,      -- { total, immutable, transient, filled, blank, by_source }
  ADD COLUMN IF NOT EXISTS var_bag_updated timestamptz;
```

Plus a separate append-only history for transient fields per token:

```sql
CREATE TABLE public.token_var_history (
  id bigserial PRIMARY KEY,
  token_mint text NOT NULL,
  run_id uuid,
  var_key text NOT NULL,
  value_jsonb jsonb,
  source text,
  captured_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.token_var_history (token_mint, var_key, captured_at DESC);
```

Immutable fields also mirror into a `token_var_immutable` table keyed by `(token_mint, var_key)` with `ON CONFLICT DO NOTHING` so they can never be overwritten.

## 7. Pipeline wiring

```text
blackbox-tick
   └─ parseReply  → writes bb.*   → var_bag_stage='scrape'
   └─ enrich-token (new fn, parallel fanout: helius+dex+pumpfun+birdeye)
                  → writes helius.* dex.* pumpfun.* birdeye.* market.*
                  → var_bag_stage='enrich'
   └─ holders-run (invokes existing capture-holder-snapshot + report)
                  → writes holders.* wallets.* distribution.* cex.* movements.* bad_actor.* cto.* optimistic.*
                  → var_bag_stage='holders'
   └─ derive-token (new fn: deterministic calcs + one Gemini call)
                  → writes calc.* risk.* ai.* narrative.*
                  → var_bag_stage='complete'
```

Each stage upserts into `var_bag_jsonb` and appends to `token_var_history` for transient keys; immutable keys additionally insert into `token_var_immutable`. Every stage is idempotent by `(run_id, stage)`.

## 8. /nolube — the master-list view

Extend the existing right pane with a new top-level section **"Master Variable Bag"**:

- Header chips: `Stage: complete` · `Filled 312 / 480` · `Immutable 84` · `Transient 228` · `Blank 168`
- Group tree (collapsible), one group per namespace prefix (`bb.phanes`, `bb.rick`, `bb.union`, `helius`, `dex`, `pumpfun`, `birdeye`, `market`, `holders`, `wallets`, `distribution`, `cex`, `movements`, `bad_actor`, `cto`, `optimistic`, `calc`, `risk`, `ai`, `narrative`)
- Each row: `key` · `value` (truncated + copy) · `source` badge · `immutable/transient` badge · `captured_at` · click → history sparkline for transient
- Top-of-page: search box + "show blanks only" toggle so you can eyeball what still isn't landing
- Existing `FIELD_MENU` coverage stays; it just becomes one lens over the same bag

Composers (X post, TG card, intel briefing prompts) read from `var_bag_jsonb` by dotted key — no more per-composer scraping logic.

---

## Technical notes

- Var bag is a flat `Record<string, {value, source, captured_at, ttl?, mutability}>` — cheap to diff, cheap to render, cheap to feed an LLM as `Object.entries()`.
- Prefix discipline is enforced by a small `varBag.set(prefix, key, value, opts)` helper in `_shared/var-bag.ts` so no stage can pollute another's namespace.
- Enrichment fanout uses `Promise.allSettled` — one provider dying never blocks the bag from completing.
- No new secrets required; Helius/DexScreener/Pump.fun/Birdeye/Gemini already configured.
- No changes to command posting, MTProto auth, or existing parser text logic — this layer sits on top.

## Files touched

1. `supabase/migrations/<new>.sql` — 4 columns on `blackbox_aggregator_runs`, `token_var_history`, `token_var_immutable` (with GRANTs)
2. `supabase/functions/_shared/var-bag.ts` — helper + typed setters + persist
3. `supabase/functions/blackbox-tick/index.ts` — call var-bag setters after parseReply, kick off enrich
4. `supabase/functions/enrich-token/index.ts` — new, parallel provider fanout
5. `supabase/functions/holders-run/index.ts` — new thin orchestrator that calls existing holders fns and flattens output into the bag
6. `supabase/functions/derive-token/index.ts` — new, deterministic calcs + Gemini narrative call
7. `src/pages/NoLube.tsx` — new "Master Variable Bag" section with search, blanks toggle, group tree, history sparkline

## Outcome

After one Phanes+Rick reply on a fresh CA, `/nolube` shows a single expandable dictionary with 300–500 key/var pairs across `bb.*`, `helius.*`, `dex.*`, `holders.*`, `calc.*`, `ai.*` — every immutable value locked, every transient value timestamped with history, ready for any output template to consume by dotted key.
