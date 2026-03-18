
What’s happening is not imaginary — there are two separate problems, and both are real.

1. Why it does not look like last night’s /bubblepromo
- The codebase I just inspected contains the “new” version:
  - Hacker terminal overlay exists: `src/components/bubble-map/HackerTerminal.tsx`
  - The X reveal panel exists with blue checkmarks and admin/mod roles: `src/components/bubble-map/PublicBubbleMap.tsx`
  - The button label in code is currently `Trace`, not `Focus`
  - The code also contains the “X Community Mapped!” panel and the one-line handles UI
- But the published site I fetched at `blackbox.farm/bubblepromo` / `blackboxfarm.lovable.app/bubblepromo` is serving an older build:
  - it shows `Focus`
  - it does not reflect the richer version you described
- So yes: published frontend is behind the code that exists now.

2. Why preview/backend/public feel inconsistent
- Your preview URL is gated/authenticated, so I could not fetch the live preview page HTML directly.
- The published site is public and I confirmed it is older.
- That means your current repo state and your live published frontend are not aligned.

3. Why the X Community is not showing for this mint
For `EiuQYp2myA3zPDUitGgpUFuftdiHNaMvoqMbcQUcpump`, the frontend discovery logic currently does this:
- first checks DexScreener API social URLs
- if empty, falls back to Pump.fun metadata
- from Pump.fun it only reads:
  - `twitter`
  - `telegram`
  - `website`
- then it searches those URLs for `/communities/`

So if Pump.fun is displaying the community on the coin page but that community URL is not present in the API fields being read, the app will miss it.

In other words:
- the app is not “reading the visible Pump.fun page”
- it is only reading a narrow metadata/API subset
- so the community can absolutely exist on the Pump.fun page while the current discovery path still fails

4. Why your old amazing version seems “gone”
Based on the files, the special UI work is not gone from the repo.
It looks more like:
- the live published frontend is still on an older build
- and/or the current bubble map component was partially overwritten after last night, especially around labels/buttons and discovery flow
- but the terminal + X handles panel are still present in the current source

5. Most likely root cause summary
```text
Current source code: has terminal + X reveal panel
Published site: older build
Current X discovery logic: only API-field extraction, not full Pump.fun page extraction
Result:
- UI looks older on public site
- button names differ
- X community can be present on Pump.fun page but not discovered
```

6. Recommended implementation plan once you approve coding again
- Frontend parity fix
  - compare current `PublicBubbleMap.tsx` behavior against the exact last-night design
  - restore the intended labels, action order, terminal behavior, and one-line admin/mod handle display
- Discovery fix
  - make community discovery use a stronger source order:
    1. DexScreener socials
    2. Pump.fun API metadata
    3. Pump.fun page extraction for visible community links
  - if a Pump.fun page visibly links an X Community, that URL should be captured and fed into `x-community-enricher`
- Publish-state fix
  - verify the final desired frontend is the one actually shipped to the public route
- Safety fix
  - add very explicit diagnostics for community discovery source:
    - found on DexScreener
    - found on Pump.fun API
    - found on Pump.fun page
    - not found anywhere

7. Technical notes
- Current “good” UI pieces are in:
  - `src/components/bubble-map/PublicBubbleMap.tsx`
  - `src/components/bubble-map/HackerTerminal.tsx`
- Current community discovery logic is in:
  - `src/hooks/useMeshGraph.ts`
  - specifically `autoDiscoverCommunity(...)`
- Current backend community enrichment is in:
  - `supabase/functions/x-community-enricher/index.ts`
- The about-page scraper is already set up for admin/mod extraction in:
  - `supabase/functions/_shared/x-community-about-admin.ts`

8. Direct answer to your question
- I can’t currently show that X Community because the app is not reading the same source you are visually seeing on Pump.fun.
- It is reading API metadata fields, and those can miss the visible community link on the Pump.fun coin page.
- And yes, your public frontend appears to be serving an older version than the source I inspected.

If you want, the next implementation should be narrowly scoped to:
- restore the exact /bubblepromo presentation you had,
- make Pump.fun visible community links count as a valid source,
- and force the public version to match the current intended frontend.
