The issue is not your Super Admin role. In preview, the app already has a `usePreviewSuperAdmin()` bypass, but `SuperAdmin.tsx` and `SuperAdminRoute.tsx` still require `isAuthenticated` first. When Supabase auth is having network/lock failures, that sends preview users to `/auth`, where sign-in also hangs.

Plan:
1. Update `SuperAdmin.tsx` so preview Super Admin bypasses the `/auth` redirect and renders Super Admin without requiring Supabase auth.
2. Update `SuperAdminRoute.tsx` the same way for guarded admin routes.
3. In `Auth.tsx`, if preview Super Admin is active, immediately redirect away from `/auth` to `/super-admin` so preview mode never gets stuck on the sign-in modal.
4. Keep production behavior unchanged: published/custom domains still require real Supabase auth and server-backed roles.