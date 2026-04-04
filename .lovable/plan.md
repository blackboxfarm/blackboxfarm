

## Fix X/Twitter OAuth Login

### What's Wrong

1. **X Developer Console Website URL is wrong**: Shows `https://blackbox.farm/holders` instead of `https://blackbox.farm`. You should change this to `https://blackbox.farm` in the X Developer Console right now — it's a manual config fix, not code.

2. **Zero successful X logins ever**: No Twitter-provider accounts exist in the database. Zero OAuth callback logs in Supabase. The flow is dying before reaching Supabase's callback.

3. **No OAuth error diagnostics**: When the X OAuth flow fails and redirects back with error params in the URL, the app silently ignores them. Users see nothing — just the login page again with no explanation.

### The Fix (2 code changes + 1 manual config change)

**Manual (you do this):**
- Go to X Developer Console → App Settings → change Website URL from `https://blackbox.farm/holders` to `https://blackbox.farm`
- Verify Callback URI remains `https://apxauapuusmgwbbzjgfl.supabase.co/auth/v1/callback`
- Verify Supabase Dashboard → Authentication → Providers → Twitter is enabled with correct Client ID and Secret
- Verify Supabase Dashboard → Authentication → URL Configuration → Redirect URLs includes `https://blackbox.farm/`

**Code change 1: Add OAuth error detection to AuthContext**
- After the app loads, parse `window.location.hash` and `window.location.search` for `error`, `error_description`, and `error_code` params that Supabase appends on failed OAuth callbacks
- Display the error via toast so users see exactly why login failed (e.g., "provider not enabled", "access denied", "invalid callback")
- Clear the error params from the URL after displaying

**Code change 2: Harden redirect URL in OAuthButtons**
- Replace hardcoded `https://blackbox.farm/` with a canonical origin helper that uses `window.location.origin` when on the production domain, preventing mismatch if testing from preview domains
- Apply same fix to `GoogleAuthButton.tsx` for consistency

### Files to Edit
- `src/contexts/AuthContext.tsx` — add OAuth error param detection + toast
- `src/components/auth/OAuthButtons.tsx` — dynamic redirect URL
- `src/components/auth/GoogleAuthButton.tsx` — same redirect fix

### What This Achieves
- If X OAuth is properly configured in Supabase dashboard, login will work
- If it's still misconfigured, users will see the exact error message instead of silent failure
- Preview/staging domains will work correctly for OAuth testing

