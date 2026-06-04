## Public Channel Welcome — Upload + Test

Three small changes to the "Public channel welcome — Luna Dusk" card in `SubscriptionAdminPanel.tsx` and one new edge function.

### 1. Replace image URL field with file upload

- Remove the free-text `https://...` input.
- Add a file picker (PNG/JPG/WebP, ≤5 MB).
- On select: upload to existing public `no-lube-assets` bucket under `welcome/{profileKey}/{timestamp}.{ext}` via `supabase.storage.from('no-lube-assets').upload(...)`, get the public URL, save into the same `public_welcome_image_url` column (DB stays unchanged).
- Show a thumbnail preview if a value exists, with a "Remove image" button (clears the field + saves).
- Manual URL paste is dropped per request; if someone needs to revert, they can clear and re-upload.

### 2. Add nickname input + Test button

- New "Test nickname" input (defaults to "Tester"); used as the `{name}` placeholder when previewing.
- New "Send test welcome" button. Sends the welcome (current unsaved copy + image) to the admin's Telegram DM (`admin_telegram_id`) so it never spams the public channel. If `admin_telegram_id` is empty, toast an error explaining to set it above first.

### 3. New edge function `profile-subscription-test-welcome`

Inputs: `{ profile_key, nickname, copy, image_url }`.
Auth: requires logged-in super_admin (verify via `has_role`).
Behavior:
- Loads bot token via `getProfileBotToken(profile_key)` and reads `admin_telegram_id` from `profile_subscription_configs`.
- Substitutes `{name}` → nickname, `{username}` → `@nickname`, falls back to `LUNA_DEFAULT_WELCOME` if `copy` is blank (same logic as the real handler).
- If `image_url` provided → `sendPhoto` with caption; else `sendMessage` HTML.
- Returns `{ ok, telegram_response }` for toast feedback.

### Technical notes

- No DB schema change. `public_welcome_image_url` keeps its column type (text URL).
- The `no-lube-assets` bucket is already public and has super_admin upload policies — no new storage policies needed.
- Test sends to admin DM only (not public channel) to avoid live spam; nickname is purely a placeholder preview value.
- Files touched:
  - `src/components/social/subscriptions/SubscriptionAdminPanel.tsx` (welcome card UI)
  - `supabase/functions/profile-subscription-test-welcome/index.ts` (new)

### Out of scope

- Changing how the real join-event handler renders the welcome.
- Sending the test to the public channel itself.
- Image cropping/resizing.
