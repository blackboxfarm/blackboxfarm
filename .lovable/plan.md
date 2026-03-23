

# Remove Unused Share Card Image Generation

## Problem
The `generate-share-card-satori` edge function runs after every holders report, fails 100% of the time (WASM/resvg issues), generates daily Morning Report alerts, and **its output is never used**. The `ShareToXButton` shares plain text links — it does not reference the generated image or share page URL.

## Verification Summary
- `ShareToXButton` builds plain text + opens Twitter intent links. The `shareCardPageUrl` prop is accepted but **never referenced** in the component body.
- `generateShareCard()` is called in `BaglessHoldersReport.tsx` line 676 after each report — this is the sole caller.
- The returned `shareCardImageUrl` and `shareCardPageUrl` state values are passed as props but ultimately unused.

## Changes

### 1. Remove the share card generation call and state (BaglessHoldersReport.tsx)
- Delete the `generateShareCard` function (lines ~695-776)
- Delete state variables: `shareCardImageUrl`, `shareCardPageUrl`, `isGeneratingShareCard`
- Remove the `generateShareCard(data)` call on line 676
- Remove `shareCardPageUrl` and `isGenerating` props from all `ShareToXButton` and `TokenMetadataDisplay` usages

### 2. Clean up ShareToXButton props
- Remove `shareCardPageUrl` and `isGenerating` props from the interface (they're unused in the component logic anyway)

### 3. Clean up TokenMetadataDisplay props
- Remove `shareCardPageUrl` prop

### 4. Leave edge functions intact (for now)
- `generate-share-card-satori` and `share-card-page` edge functions remain deployed but will no longer be called. They can be deleted later via Supabase dashboard if desired — removing them from the codebase won't delete deployed functions.
- `post-share-card-twitter` is **still actively used** by DailiesAIPanel, PromoTweetManager, ShareCardDemo, holders-intel-poster, and promo-poster — it stays.

### 5. Remove ShareCardDemo page (optional cleanup)
- The `/share-card-demo` route and `ShareCardDemoPage` component exist solely to demo the card generation approach. Since that's abandoned, remove the route from `App.tsx` and the `SpiderRouteMap` entry.

## Impact
- Eliminates 100% failure rate alerts from Morning Report
- Removes a wasted edge function invocation on every holders report
- No user-facing feature loss (sharing works identically via plain text)

