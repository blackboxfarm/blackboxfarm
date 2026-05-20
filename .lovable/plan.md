## Remove "Manual PUSH" column from Funnel Feed Discoveries

The PUSH button bypasses the Manual X Post review queue and tweets directly to @HoldersIntel — exact opposite of the intended flow. The funnel already auto-feeds `holders_intel_post_queue` for human review. Killing the column.

### Changes

**`src/components/admin/funnel-feeds/FunnelFeedDiscoveries.tsx`**
- Remove `<TableHead>Manual PUSH</TableHead>` and its `<TableCell>` (the PUSH button + spinner + posted timestamp).
- Remove the `handleManualPush` function, the `pushing` / `pushedAt` state, and the now-unused imports (`Zap` icon, `fetchTemplate`, `processTemplate`, `TokenShareData`, holders-report invocation, `post-share-card-twitter` invocation, `holders_intel_templates` fetch).
- Keep all other columns intact: Token, Mint, Source, Discovered, Mesh, Watchlist, X Post (status badge only), KILL, Padre.

### Not touched
- `post-share-card-twitter` edge function stays — used by other legitimate flows.
- Funnel → `holders_intel_post_queue` auto-feed stays exactly as it is.
- `xpost_status` column on `funnel_feed_discoveries` stays (still reflects queue state).
