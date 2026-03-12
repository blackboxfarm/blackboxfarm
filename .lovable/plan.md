

## Plan: Fix Community Labels, Click Behavior, and Graph Stability

### Problem 1: X Community shows ID instead of name
The `getNodeLabel` function checks `evidence.community_name` but the `reputation_mesh` evidence field rarely contains community names. The `x-community-enricher` likely stores the name somewhere but it's not propagated to the evidence on mesh links.

**Fix:** After graph loads, look up community names from the DB (`reputation_mesh` evidence or a dedicated query) for any `x_community` nodes still showing numeric IDs. Cache results like the ticker enrichment already does for tokens. Also ensure `x-community-enricher` writes `community_name` into the evidence field when creating mesh links.

### Problem 2: Clicking a bubble triggers unwanted API calls
Currently `handleNodeClick` (line 391-433):
- Calls `triggerSpider(rawId, 'quick')` for every wallet/token click
- Calls `x-community-enricher` for every x_community click
- Then centers and zooms

**Fix:** Split click into two behaviors:
- **Left-click**: Only expand node in graph + center/zoom (positioning). No API calls.
- **Double-click**: Trigger spider/enrichment (the "deep action"). Or use the existing action buttons instead.

Auto-enrichment on first search is already handled by `triggerSpider` in the search flow and the "Enrich All Tokens" button. Community enrichment should be a one-time auto action during initial spider, not on every click.

### Problem 3: Graph jumps wildly on click
Root causes:
- `d3ReheatSimulation()` is called on every `viewMode`/`graphData` change (line 101), which restarts the full physics simulation
- `cooldownTicks={100}` allows 100 ticks of simulation, causing prolonged movement
- `d3AlphaDecay={0.015}` is very slow decay, meaning simulation runs for a long time
- `d3VelocityDecay={0.25}` is low friction, allowing fast movement
- Charge strength of `-120` pushes nodes apart aggressively

**Fix:**
- Increase `d3AlphaDecay` to `0.05` (faster settling)
- Increase `d3VelocityDecay` to `0.4` (more friction, less wild movement)
- Reduce `cooldownTicks` to `60`
- Only call `d3ReheatSimulation()` when `viewMode` changes, not on every `graphData` update — use a ref to track previous mode
- On node click centering, use `graphRef.current.zoom(2, 800)` with smoother transition instead of instant 2.5x

### Files to change

1. **`src/components/admin/oracle/MeshGraphVisualizer.tsx`**
   - Remove `triggerSpider` and community enrichment from `handleNodeClick` — keep only `expandEntity` + center/zoom
   - Tune ForceGraph physics params
   - Only reheat on viewMode change, not graphData change

2. **`src/hooks/useMeshGraph.ts`**
   - Add community name enrichment (similar to ticker enrichment) — query `reputation_mesh` evidence for `x_community` nodes to find stored names
   - Ensure `autoDiscoverCommunity` stores `community_name` in evidence when upserting

