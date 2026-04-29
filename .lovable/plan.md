## Plan: Bubble Map Zoom + Social Discovery Fixes

Three independent issues, all rooted in `useMeshGraph.ts` + `PublicBubbleMap.tsx`.

---

### 1. Responsive auto-fit zoom (desktop too zoomed-in on small graphs)

**Problem:** Current cap is a flat `zoom > 1.4 → 1.4`. With 2–4 nodes (Solar Min on a fresh token) bubbles render the size of golf balls on desktop.

**Fix in `src/components/bubble-map/PublicBubbleMap.tsx`:**
- Replace the three `zoomToFit` blocks (lines ~127–135, ~1024–1033, ~1705–1714) with a shared helper:
  ```ts
  const fitGraph = () => {
    const isMob = window.innerWidth < 768;
    const padding = isMob ? 60 : 140;
    graphRef.current?.zoomToFit?.(600, padding);
    requestAnimationFrame(() => {
      const z = graphRef.current?.zoom?.() ?? 1;
      const cap = isMob ? 2.0 : 1.0;          // mobile ~80% fill, desktop ~50% fill
      const floor = isMob ? 0.6 : 0.4;
      if (z > cap)   graphRef.current?.zoom?.(cap, 400);
      if (z < floor) graphRef.current?.zoom?.(floor, 400);
    });
  };
  ```
- Use the existing `useIsMobile()` hook (already in `src/hooks/use-mobile.tsx`) instead of the ad-hoc `isMobileDevice()` so it reacts to viewport changes.
- Apply identical caps to the Schematic view via `schematicRef.current?.fitView()` followed by an explicit `setViewport({ zoom: cap })` exposed through `SchematicHandle` (extend the imperative handle in `BubbleMapSchematic.tsx`).

---

### 2. Website + Telegram never appear on the bubble map

**Root cause:** In `src/hooks/useMeshGraph.ts` `autoDiscoverCommunity` (lines ~380–560) we fetch DexScreener + Pump.fun, collect `allSocialUrls`, and **only insert `x_account` and `x_community` rows** into `reputation_mesh`. We literally hold `telegramUrls` (line 441) and website URLs but never write them, so the renderer has nothing to draw — even though `ENTITY_COLORS` / `ENTITY_LABELS` already define `telegram` and `website` node types.

**Fix:** After the X-handle insert loop (~line 474), add sibling inserts:
```ts
// Telegram groups/channels
for (const tgUrl of telegramUrls) {
  const m = tgUrl.match(/t\.me\/(?:s\/)?([a-zA-Z0-9_+]+)/i);
  const handle = m?.[1]?.toLowerCase();
  if (!handle || handle === 'joinchat') continue;
  await supabase.from('reputation_mesh').upsert({
    source_type: 'token', source_id: tokenMint,
    linked_type: 'telegram', linked_id: handle,
    relationship: 'social_account',
    confidence: 80, discovered_via: discoverySource,
  }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
}

// Websites
const websiteUrls = allSocialUrls.filter(u =>
  !u.includes('x.com/') && !u.includes('twitter.com/') &&
  !u.includes('t.me/')  && !u.includes('telegram.me/')
);
for (const wUrl of websiteUrls) {
  const host = (() => { try { return new URL(wUrl).hostname.replace(/^www\./,''); } catch { return null; } })();
  if (!host) continue;
  await supabase.from('reputation_mesh').upsert({
    source_type: 'token', source_id: tokenMint,
    linked_type: 'website', linked_id: host,
    relationship: 'social_account',
    confidence: 75, discovered_via: discoverySource,
    evidence: { url: wUrl },
  }, { onConflict: 'source_type,source_id,linked_type,linked_id,relationship' });
}
```
- Also fire `supabase.functions.invoke('harvest-token-socials', { body: { tokenMint } })` once per discovery so the canonical edge function (which already handles website rows, line 200/431) keeps its own table in sync — single source of truth, no drift.
- Verify the renderer `pruneToTokenAndSocials` in `BubbleMapSchematic.tsx` already keeps `telegram` + `website` (it does — `SOCIAL_TYPES` includes both).

---

### 3. "X handle = community" fallback rule (codify it)

**Rule (per user):**
> If a token's only X link is a profile (`x.com/HANDLE`) and that profile has **no** pinned community → treat the **handle itself** as the de-facto X community, especially when the handle name resembles the token name/ticker/CA.

**Today:** `useMeshGraph.ts` ~lines 498–559 calls `x-pinned-community-finder`. If it returns nothing, we just log "no pinned/bio community link" and walk away. The handle stays as a lonely `x_account` node; no community node, no admin/mod chain.

**Fix — add a shared helper** `supabase/functions/_shared/x-handle-as-community.ts`:
```ts
// Decide if an x_account should be promoted to the de-facto community
export function handleResemblesToken(handle: string, tokenSymbol?: string, tokenName?: string, mint?: string) {
  const h = handle.toLowerCase();
  const candidates = [tokenSymbol, tokenName, mint?.slice(0,6)].filter(Boolean).map(s=>s!.toLowerCase());
  return candidates.some(c => h.includes(c) || c.includes(h));
}
```

**Wire it into:**
- `useMeshGraph.ts` `autoDiscoverCommunity` — after the pinned-community fallback fails, insert a synthetic `reputation_mesh` row:
  ```
  source_type: 'token', linked_type: 'x_community',
  linked_id: `handle:${handle}`,                  // namespaced so it can't collide w/ numeric IDs
  relationship: 'community_for', confidence: 60,
  evidence: { fallback: 'handle_as_community', handle, resembles_token: bool }
  ```
  and a paired `x_community → x_account` `community_admin` row so the bubble map draws the handle as both the community AND its sole admin.
- `supabase/functions/x-community-enricher/index.ts` — when `detectTwitterType()` returns `'account'`, after attempting pinned-community resolution, apply the same fallback (gate on `handleResemblesToken` for confidence ≥ 70; otherwise still insert at confidence 50 so the chain renders but is flagged "unverified community").
- `supabase/functions/oracle-master-spider/index.ts` and `supabase/functions/social-mesh-linker/index.ts` — import the same helper so every discovery path applies the rule uniformly.

**Renderer touch:** in `useMeshGraph.ts` `getNodeLabel`, render `handle:` IDs as `@handle (community)` so the user can tell which node is a real community vs. the fallback.

---

### Acceptance checks
1. Open bubble map on desktop with a token that has 2 nodes → bubbles fill ≈50% of canvas, not golf-ball-tiny. Resize to mobile width → re-fits to ≈80%.
2. Magnifier +/- still works post-fit (manual override unaffected) on Bubble, Tree, Schematic.
3. Search a token whose DexScreener payload has Website + Telegram + Twitter (e.g. the `$GPT` mint in the screenshots) → all three appear as nodes connected to the token.
4. Search a token where the only X link is `x.com/GPT_SOLANA` (no community) → an `x_community` node labeled `@GPT_SOLANA (community)` appears, linked to both the token and the `@GPT_SOLANA` x_account, with evidence `fallback: handle_as_community`.
5. KYC bridge link (already shipped) still renders in Solar Min.

### Files changed
- `src/components/bubble-map/PublicBubbleMap.tsx` (zoom helper, useIsMobile)
- `src/components/bubble-map/BubbleMapSchematic.tsx` (extend `SchematicHandle` with `setZoom`)
- `src/hooks/useMeshGraph.ts` (insert telegram + website rows, handle-as-community fallback, label tweak)
- `supabase/functions/_shared/x-handle-as-community.ts` (new helper)
- `supabase/functions/x-community-enricher/index.ts` (apply fallback)
- `supabase/functions/oracle-master-spider/index.ts` (apply fallback)
- `supabase/functions/social-mesh-linker/index.ts` (apply fallback)

### Out of scope (ask if you want them)
- Backfill: re-running discovery on tokens already searched in the last 30d to populate the new website/telegram/fallback-community rows.
- MTProto deep-inspect for Telegram (you already chose **public metadata only** — not building it).
