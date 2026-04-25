# 🧹 Edge Function Build Error Sweep — Round 2

## Goal
Resolve every remaining `Type checking failed` error in the edge function build, then drop a tracking doc into `super_admin_docs` so we have a permanent record of what was fixed (in case a regression appears later).

---

## 📋 Errors to fix (grouped by root cause)

### 1. `_shared/early-warning-writer.ts` — Generic `createClient` returns `never`
The shared writer types `supabase` as `ReturnType<typeof createClient>` without a `Database` generic, so the Supabase v2.x typings collapse table rows to `never`. Every `.from('token_early_warnings')` call then fails (`Property 'scan_count' does not exist on type 'never'`, etc.).

**Fix:** loosen the parameter type to `any` (or `SupabaseClient<any, 'public', any>`) so generic table writes type-check. Same pattern applied to `generatePatternWarnings`.

### 2. `_shared/holder-intelligence.ts`
- **Line 150** — `prev.holder_count` missing from selected columns. Either add `holder_count` to the `.select()` call, or read from the column we already selected and compute holder count differently. Simplest: cast `prev as any` since this is a snapshot row.
- **Line 382** — `kycConfirmed` and `deepestFunder` are returned but the `DevGenealogyResult` interface doesn't declare them. **Fix:** add both fields to the interface (already used by callers).

### 3. `_shared/rugcheck-insiders.ts` — `Set<unknown>` vs `Set<string>`
Line 145: `new Set(nodesWithHoldings.map((n: any) => n.id || n.wallet || n.address))` infers `Set<unknown>`. **Fix:** annotate as `new Set<string>(...)`.

### 4. `_shared/solscan-markets.ts` — `solscanApiKey` undefined
The function is fully disabled with an early `return result;`, but the dead code below references an undeclared `solscanApiKey`. **Fix:** declare `const solscanApiKey = Deno.env.get('SOLSCAN_API_KEY') ?? '';` near the top so the dead code still type-checks (preserving intent to re-enable later).

### 5. `_shared/token-search-logger.ts` — `result.creatorInfo?.wallet`
Line 379: the inline type for `creatorInfo` only declares `creatorAddress`. **Fix:** import the canonical `CreatorInfo` from `_shared/creator-api.ts` for that field, or widen the inline type to include `wallet?: string`.

### 6. `_shared/rpc-provider.ts` — `error.message` on `unknown`
Lines 131 & 137: cast `error` to `Error` (`(error as Error).message`).

### 7. `bagless-holders-report/index.ts` — multiple
- **Line 814–815** — `creatorInfo.createdTimestamp` doesn't exist on `CreatorInfo`. **Fix:** add `createdTimestamp?: number` to the `CreatorInfo` interface in `creator-api.ts` (it's used by callers, just not declared).
- **Line 824** — `tokenCreatedAt` typed as `string | number | null`; `detectFreshWallets` expects `string | null | undefined`. **Fix:** ensure ternary always returns `string | null` (already does, but TS infers wider). Add an explicit cast or type annotation.
- **Line 932** — `vitality.info.socials` not declared. **Fix:** cast `vitality as any` for the social lookup, or extend the `VitalityMetrics` interface in `dexscreener-api.ts`.
- **Line 936 & 940** — `SupabaseClient<any, "public", "public", ...>` vs `SupabaseClient<unknown, ...>` mismatch (caller passes the strict client into helpers typed loosely). **Fix:** cast `supabaseForMesh as any` at the call sites — or apply fix #1 (change writer signature to `any`) which auto-resolves these too.
- **Line 1034** — `logCompleteSearch` expects `symbol: string | undefined` but result has `string | null`. **Fix:** coalesce nulls → `undefined` before passing, or widen the helper's parameter type.
- **Line 1063** — `.then(...).catch(...)` on Supabase query builder. The thenable returned by `.then()` is `PromiseLike`, not a real `Promise`. **Fix:** wrap in `Promise.resolve(...)` or restructure to pure async/await with try/catch.

### 8. `bagless-investigation/index.ts` (and `_shared/rpc-provider.ts`) — `error.message` on `unknown`
Same pattern as #6 — cast `error` to `Error`.

---

## 📝 Documentation deliverable

After the fixes land, write a **single migration** that inserts a new `super_admin_docs` row:
- **Slug:** `edge-function-error-sweep-2026-04`
- **Title:** "🧹 Edge Function Type Error Sweep (Apr 2026)"
- **Tags:** `['edge-functions', 'typescript', 'maintenance', 'changelog']`
- **Content:** A markdown checklist of every file touched, the symptom, the fix applied, and the rationale. This becomes our paper trail if any of these regress.

---

## 📂 Files to edit
| File | Change |
|------|--------|
| `supabase/functions/_shared/early-warning-writer.ts` | Loosen `supabase` param type to `any` in 3 functions |
| `supabase/functions/_shared/holder-intelligence.ts` | Add `kycConfirmed` + `deepestFunder` to interface; cast `prev as any` |
| `supabase/functions/_shared/rugcheck-insiders.ts` | Annotate `new Set<string>(...)` |
| `supabase/functions/_shared/solscan-markets.ts` | Declare `solscanApiKey` const at top |
| `supabase/functions/_shared/token-search-logger.ts` | Widen `creatorInfo` inline type |
| `supabase/functions/_shared/rpc-provider.ts` | Cast `error as Error` (2 spots) |
| `supabase/functions/_shared/creator-api.ts` | Add `createdTimestamp?: number` to `CreatorInfo` |
| `supabase/functions/bagless-holders-report/index.ts` | 4 fixes (cast vitality, fix tokenCreatedAt type, coalesce symbol nulls, restructure .then().catch()) |
| `supabase/functions/bagless-investigation/index.ts` | Cast `error as Error` if needed |
| `supabase/migrations/<ts>_edge_function_sweep_doc.sql` | INSERT into `super_admin_docs` |

## ✅ Acceptance
- `Type checking failed` errors disappear from the build log for all the files listed above.
- New doc visible in **Super Admin → Docs** under the slug `edge-function-error-sweep-2026-04`.
- No behavior change — these are all pure type-correctness fixes (no runtime logic touched).

> ⚠️ Note: there may be a tail of additional `truncated` errors hidden by the build log cap. After this round, if the next build still reports failures, we'll do a Round 3 sweep on whatever surfaces.