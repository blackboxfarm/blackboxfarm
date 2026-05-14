# Dedupe `useUserTier` — eliminate duplicate `check-subscription` calls

## Problem

Every component that calls `useUserTier()` independently:
1. Fetches `web_user_subscriptions` from DB
2. Invokes `check-subscription` edge function
3. Sets its own 60s polling interval

With 3–4 consumers mounted per page (TierGate, badges, paywall checks, header), the same user gets 3–4 parallel calls to each, visible in edge function logs.

## Fix — module-level shared state

Convert `useUserTier` from per-hook fetching to a singleton store, similar to how `useAuth` works.

### Mechanics

1. Lift `tierInfo` and `isLoading` into module-level state outside the hook
2. Add `let fetchPromise: Promise<void> | null` so concurrent callers await the same in-flight fetch
3. Add `let lastFetchAt = 0` and skip re-fetching within a 30s window
4. Replace the per-hook 60s `setInterval` with a single module-level interval that fires only when at least one consumer is mounted (refcount)
5. Hooks subscribe via a tiny pub/sub (`Set<listener>`) and rerender on store updates
6. Public API stays identical (`tierInfo`, `isLoading`, `meetsMinimumTier`, `hasFeature`, `isAnonymous`, `isPro`, `checkSubscription`) so no consumer changes needed
7. Reset cache when `user.id` changes (login/logout/account switch)

### File touched

- `src/hooks/useUserTier.ts` — rewrite internals, keep exports identical

### Expected outcome

- 1 `check-subscription` call per user per page load instead of 3–4
- 1 timer firing every 60s globally instead of N timers
- No behavior change for consumers — same shape, same values

## Verification

After deploy, reload an article page and check edge function logs for `check-subscription`. Should see one call per user per minute, not four.
