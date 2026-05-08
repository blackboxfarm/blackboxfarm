## What's happening

The green "46gXYf…pump" bubble and the gold `$ANUNNAKI` bubble are the **same token mint** rendered twice — once correctly as a `token` and once incorrectly as a `wallet`.

Confirmed from `reputation_mesh` for that address:

```
linked_id=46gXYf…pump  linked_type=token   relationship=created          (correct)
linked_id=46gXYf…pump  linked_type=token   relationship=created_token    (correct)
linked_id=46gXYf…pump  linked_type=wallet  relationship=same_kyc_root    (WRONG — mint treated as wallet)
```

A KYC-cluster writer is emitting mint addresses (those ending in `pump`) under `linked_type='wallet'`, so the bubble map's `buildGraph` keys them as `wallet:46gXYf…pump` — a separate green node from `token:46gXYf…pump`. Scope across DB: 64 rows where a `…pump` mint is on the linked side as `wallet`, 17 where it's on the source side. Same bug will hit any pump.fun mint sharing a KYC root with the dev.

## Fix (3 layers)

### 1. Frontend defensive guard — `src/hooks/useMeshGraph.ts` (`buildGraph`)

Before inserting a node:
- If `type === 'wallet'` AND id ends in `pump` (or `bonk`), reclassify it as `token`.
- Then dedupe: if a `token:<id>` node already exists, drop the wallet node and **remap any edges** that pointed to `wallet:<id>` so they target `token:<id>` instead.

This stops the double-bubble immediately, even with dirty DB rows.

### 2. Backend writer fix

Audit and patch the four files that write `same_kyc_root` edges so they classify a mint address as `token` (suffix `pump`/`bonk`, or present in `token_metadata`) instead of defaulting to `wallet`:
- `supabase/functions/_shared/holder-intelligence.ts`
- `supabase/functions/oracle-unified-lookup/index.ts`
- `supabase/functions/oracle-master-spider/index.ts`
- `supabase/functions/mesh-kyc-deep-search/index.ts`

(The blacklist-mesh-guard and KYC-override paths only read, but I'll verify in implementation.)

### 3. Cleanup migration

One-shot migration to fix existing rows in `reputation_mesh`:
- `UPDATE reputation_mesh SET source_type='token' WHERE source_type='wallet' AND source_id LIKE '%pump'`
- `UPDATE reputation_mesh SET linked_type='token' WHERE linked_type='wallet' AND linked_id LIKE '%pump'`
- Then `DELETE` any rows that become exact duplicates of an existing (source,linked,relationship) triple.

## Out of scope

- Why `$ANUNNAKI` (gold) and the `…pump` mint (green) appear as separate tokens — they probably *are* two different mints by the same dev. The bug is only that the `…pump` one is also drawn a second time as a wallet. After the fix you'll see one node per real token.
- Bonk/letsbonk suffix logic (0 rows currently affected; will keep the guard generic anyway).
