# No Lube Waterfall — Spec Alignment Plan

Aligns `no-lube-orchestrate` + `no-lube-compose` + the templates table with the updated waterfall, adds the new **Intel Update** template, raises the public multiplier threshold to 3x, and adopts Insiders MILESTONE labels when we missed the token.

## Target waterfall (after this plan)

```text
Insider call -> CA + entry/current MC
   |
   v
Post CA to BlackBox -> wait 10-15s -> scrape 3 bot replies
   |
   v
Mesh write:
   - new token          -> write ALL immutable fields (BB scrapes + HoldersIntel)
   - existing token     -> refresh mutable, preserve immutable
   - Insiders MILESTONE -> adopt their multiplier + stats into mesh now,
                           enrichment runs in background
   |
   v
ratio = currentMC / entryMC
   |
   +-- first-touch (no prior post)
   |        Private: SNAPSHOT  (kind=snapshot)
   |        Private: BIG_PICTURE reply (kind=big_picture, after enrichment)   [unchanged]
   |        Public : LEAK if currentMC >= $75k                                [one-shot]
   |
   +-- re-sighting, ratio < 2x
   |        Private: INTEL UPDATE  (kind=intel_update)   <-- NEW
   |        Public : LEAK if not yet fired and currentMC >= $75k
   |
   +-- ratio >= 2x AND < 3x
   |        Private: NO_LUBE_PRIVATE  (multiplier card)
   |        Public : (nothing)                           <-- changed
   |
   +-- ratio >= 3x (integer milestone gate)
            Private: NO_LUBE_PRIVATE
            Public : NO_LUBE_PUBLIC

For any {var} not in mesh/system: render literal "pending".
```

## Code changes

### 1. `supabase/functions/no-lube-orchestrate/index.ts`
- Widen the `kind` union to `'snapshot' | 'big_picture' | 'leaks' | 'intel_update'`.
- After the milestone gate, branch by `currentMilestone`:
  - `currentMilestone >= 3` → compose+push **both** Private (`no_lube_private`) and Public (`no_lube_public`) as today.
  - `currentMilestone == 2` → compose+push **Private only**. Skip the public render entirely.
- New `ratio < threshold` re-sighting branch (currently early-returns after `maybeFireLeaks`):
  - Fire `composeAndPush('private', mint, ratio, { kind: 'intel_update' })`.
  - Still call `maybeFireLeaks(probeMcap)` afterwards (one-shot public leak rule unchanged).
  - Stamp `no_lube_post_log` with `post_kind='intel_update'`, do **not** advance `last_multiplier` past the integer band so the milestone gate still fires when we cross 2x later.
- New "adopt-from-Insiders" path at the top of the handler:
  - When the inbound payload carries `insiders_milestone: { multiplier, entry_mcap, current_mcap }` (added to the trigger payload from `insiders-row-ingest`), write the floor into mesh via the existing `lock_entry_mcap` RPC and seed `prev.last_multiplier = floor(multiplier) - 1` so the standard branching immediately routes to the matching tier (≥3x → Private + Public, 2x → Private only).
  - Enrichment chain in `no-lube-ingest` keeps running in parallel; nothing blocks the adopted post.

### 2. `supabase/functions/no-lube-compose/index.ts`
- Extend the `kind` parser (line ~345) and the template name resolver (line ~358) with:
  - `intel_update` → primary `no_lube_intel_update_private`, fallback `no_lube_snapshot_private`.
- Hard-coded text fallback (line ~463) gets an `intel_update` branch:
  `🛰 *INTEL UPDATE* — {ticker}\nEntry {mcEntry} → Now {mcNow} ({ratio}x)\n{ca}`.
- **Pending rendering**: replace the current `"—"` placeholder substitution with the literal string `"pending"` for every `{var}` whose source returned null/undefined. Centralize through a single `renderVar()` helper so snapshot, leaks, intel_update, big_picture, and multiplier templates all behave identically.

### 3. `supabase/functions/no-lube-compose-card/index.ts`
- Today templates are keyed only by `(profile_kind, language)`. Add an optional `template_variant` column (`'default' | 'intel_update'`) and resolve it in priority:
  1. exact `(profile_kind, language, template_variant)` enabled row
  2. `(profile_kind, language)` enabled row
  3. `(profile_kind)` default
- Pass `template_variant: 'intel_update'` from orchestrate when `kind === 'intel_update'`.

### 4. Database migration
- `ALTER TABLE no_lube_card_templates ADD COLUMN template_variant text NOT NULL DEFAULT 'default';`
- Index: `CREATE INDEX ON no_lube_card_templates(profile_kind, language, template_variant) WHERE enabled = true;`
- Seed two empty Intel Update template rows (private, en) so the admin Templates tab shows the slot ready for an image upload.
- Insert text template `no_lube_intel_update_private` into `holders_intel_templates` with a sensible default body using `{ticker}`, `{mcEntry}`, `{mcNow}`, `{ratio}`, `{ca}`, `{health}`, `{topHolders}`, `{lpStatus}` (each unfilled value renders as "pending").

### 5. Admin UI — Templates tab
- `src/components/social/NoLubeChannelPanel.tsx` (template manager): add a third tab/section under **Private** for "Intel Update" mirroring the existing Snapshot/Big Picture upload UX. The Public tab keeps Snapshot+Leak+Multiplier (no Intel Update — Intel Update is private-only by spec).
- No layout change for the public Leak slot (already lives under Public per the last fix).

### 6. Insiders ingest payload
- `supabase/functions/insiders-row-ingest/index.ts`: when the source Telegram message parses as a MILESTONE (existing detector), include `{ insiders_milestone: { multiplier, entry_mcap, current_mcap } }` in the body sent to `no-lube-ingest` → `no-lube-orchestrate`.

## Out of scope (intentionally not touching)
- The Snapshot → Big Picture private reply chain stays exactly as it is today.
- Public Leak template stays one-shot per mint.
- The `lock_entry_mcap` RPC and entry-floor logic are unchanged.
- Milestone integer gate (`Math.floor(ratio)` band) is unchanged — only the per-band channel routing changes.

## Verification after build
1. Force a sub-2x re-sighting via the admin "Force re-evaluate" button → expect one Private Intel Update post, no public.
2. Force a 2x milestone → expect Private only.
3. Force a 3x milestone → expect Private + Public.
4. Replay an Insiders MILESTONE message for a token we don't have → expect immediate post on the matching tier with stats from the Insiders payload, mesh row populated.
5. Render a template against a token missing `topHolders` → expect literal "pending" in the rendered card and text post.
