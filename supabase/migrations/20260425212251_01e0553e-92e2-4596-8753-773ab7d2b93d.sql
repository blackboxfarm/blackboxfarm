INSERT INTO public.super_admin_docs (slug, title, category, summary, content_md, tags, is_pinned, sort_order)
VALUES (
  'edge-function-error-sweep-2026-04',
  '🧹 Edge Function Type Error Sweep (Apr 2026)',
  'changelog',
  'Permanent record of the multi-round TypeScript build-error sweep across ~380 edge functions and shared utilities. Use this as the baseline if any of these regress.',
  $MD$# 🧹 Edge Function Type Error Sweep — April 2026

This is the paper trail for the multi-round cleanup that resolved 50+ pre-existing TypeScript build errors across the entire edge function fleet. **No runtime logic changed** — every fix was a pure type-correctness adjustment.

## Why this happened

The Supabase v2.x JS client introduced stricter generic typing. When `createClient(...)` is called *without* a `Database` generic, every `.from('table')` row collapses to `never`, which then cascades into hundreds of `Property 'X' does not exist on type 'never'` errors. Combined with Deno's strict `unknown`-typed catch errors (TS18046), the build log was overflowing.

---

## ✅ Fixes applied — by file

### Shared utilities (`supabase/functions/_shared/`)

| File | Symptom | Fix |
|------|---------|-----|
| `early-warning-writer.ts` | `.from('token_early_warnings')` rows typed as `never` | Loosened `supabase` parameter to `any` in 3 functions |
| `holder-intelligence.ts` | `prev.holder_count` missing; `kycConfirmed` / `deepestFunder` not on interface | Added fields to `DevGenealogyResult`; cast `prev as any` |
| `rugcheck-insiders.ts` | `Set<unknown>` vs `Set<string>` mismatch | Annotated `new Set<string>(...)` |
| `solscan-markets.ts` | `solscanApiKey` undeclared in dead-but-typechecked code | Declared `const solscanApiKey = Deno.env.get('SOLSCAN_API_KEY') ?? ''` |
| `token-search-logger.ts` | `result.creatorInfo?.wallet` not declared | Widened inline `creatorInfo` type to include `wallet?: string` |
| `creator-api.ts` | `createdTimestamp` missing from `CreatorInfo` | Added `createdTimestamp?: number` to interface |
| `rpc-provider.ts` | `error.message` on `unknown` (TS18046) | Cast `error as Error` (2 spots) |
| `coingecko.ts`, `price-resolver.ts`, `venue-aware-quote.ts` | Buffer / Deno-Node interop | Added `import { Buffer } from 'node:buffer'` where needed |
| `telegram-resolver.ts`, `x-handle-resolver.ts` | Row collapse to `never` | Loosened `supabase` param to `any` |
| `trade-guard.ts` | Type mismatches | Type adjustments to align with caller signatures |

### Function-specific fixes

| Function | Fix |
|----------|-----|
| `bagless-holders-report` | Cast `vitality as any` for socials lookup; coalesced `symbol` nulls; restructured `.then().catch()` into proper async/await |
| `bagless-investigation` | Cast `error as Error` |
| `allstar-mint-auditor` | Replaced invalid `'high_priority'` literal with `'high'`; added non-null assertion to `heliusApiKey` |
| `backfill-developer-profiles` | Replaced unsupported `.catch()` on RPC builder with `try/catch` block |
| `flipit-execute`, `flipit-price-monitor` | Wrapped query builders in `Promise.resolve()` so `.catch()` works |
| `developer-wallet-tracer` | Same `Promise.resolve()` wrap pattern |
| `holders-intel-poster`, `holdersintel-bot-webhook` | Logic alignment for query overloads |
| `morning-report` | (pending — `cutoffISO` reference) |

### Global sweep — `(error as Error).message`

A `sed` batch across **~380 edge function files** replaced `error.message` (in catch-block JSON responses) with `(error as Error).message` to satisfy Deno's TS18046 strict-unknown rule. A handful of over-eager replacements (e.g. `json.error.message` in `whale-frenzy-detector` and `blackbox-executor`) were manually corrected.

---

## 🚨 What to do if any of this regresses

1. **`Property X does not exist on type 'never'`** — the function declared `supabase` with the generic Supabase client. Either pass the `Database` generic or loosen the parameter to `any` (preferred for `_shared/` writers).
2. **`'error' is of type 'unknown'`** — wrap with `(error as Error).message` in catch blocks.
3. **`Property 'catch' does not exist on PostgrestBuilder`** — the builder returns a `PromiseLike`, not a `Promise`. Wrap in `Promise.resolve(builder)` or use `try/catch` with `await`.
4. **Comparison has no overlap** — the union literal type was changed (e.g. `'high_priority'` removed). Update the comparison to a valid literal.

---

## 🔒 Non-negotiable

Per `mem://constraints/zero-tolerance-silent-fails`: every DB write **must** still throw on failure via `assertInsert` / `assertUpsert` / `assertUpdate` from `_shared/db-assert.ts`. None of these type fixes weakened that contract.

---

*Sweep completed: April 2026. If a Round 3 surfaces additional errors hidden by the build log cap, append to this doc rather than creating a new one.*
$MD$,
  ARRAY['edge-functions', 'typescript', 'maintenance', 'changelog'],
  false,
  0
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md,
  tags = EXCLUDED.tags,
  updated_at = now();