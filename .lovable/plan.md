## Problem

`/super-admin` is stuck on "Loading Super Admin…" forever.

Console shows `AuthRetryableFetchError: NetworkError when attempting to fetch resource` from Supabase Auth. In `AuthContext.tsx`, the initial bootstrap call:

```ts
supabase.auth.getSession().then(({ data: { session } }) => {
  setSession(session);
  setUser(session?.user ?? null);
  setLoading(false);
});
```

…has no `.catch`. When the network fetch rejects (transient DNS/network blip, or token refresh failure), the promise rejects, `setLoading(false)` is never called, `authLoading` stays `true`, and `SuperAdmin.tsx`'s guard `if (!hydrated || isLoading || authLoading)` keeps showing the spinner indefinitely.

The same issue can occur on the `INITIAL_SESSION` event path — if it never fires because the initial network call failed, loading never resolves.

## Fix

Two small, defensive changes in `src/contexts/AuthContext.tsx`:

1. Add `.catch` to `supabase.auth.getSession()` so a network failure still flips `loading` to `false` (treat as "no session"). Log the error for debugging.
2. Add a safety watchdog: if `loading` is still `true` 5 seconds after mount, force it to `false`. The auth listener will still update state if a session arrives later.

No other files need to change. This unblocks Super Admin (and every other route gated on `authLoading`) the moment the network hiccup clears or the user is treated as logged-out.

## Technical detail

```ts
supabase.auth.getSession()
  .then(({ data: { session } }) => {
    setSession(session);
    setUser(session?.user ?? null);
  })
  .catch((err) => {
    console.error('[Auth] getSession failed:', err);
  })
  .finally(() => setLoading(false));

const watchdog = setTimeout(() => setLoading(false), 5000);
// clear in cleanup
```

No changes to roles logic, SuperAdminRoute, or SuperAdmin.tsx required.