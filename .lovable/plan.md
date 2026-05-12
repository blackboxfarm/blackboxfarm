# Forum Identity Choice + Per-Autopsy Social Share

Two additions on top of the mini-forum already shipped.

---

## 1. Identity Source — "How do you want to appear?"

When a logged-in user opens the comment composer for the first time (or visits Profile → Forum Identity), they pick **once** how they appear in autopsy comments. They can change it anytime.

### The choice (clearly worded)

```text
How should other holders see you in the WTF Forum?

( ) Use my @X handle and X profile picture
    "Linked: @yourhandle — your X avatar will show next to comments."
    [shown only if X is linked]

( ) Use my Google name and Google profile picture
    "Linked: you@gmail.com — your Google avatar will show."
    [shown only if Google is linked]

(•) Use a custom forum identity  ← default if no socials linked
    Nickname: [__________]   (3–20 chars, letters/numbers/_-)
    Avatar:   [ Upload .jpg or .gif ]  (scanned for safety)

Note: choosing a social option only shares your public handle and profile
picture with this forum. We never post on your behalf.
```

### Storage

Add to `profiles` (already extended last build):
- `forum_identity_source` text — `'x' | 'google' | 'custom'` (default `'custom'`)
- `forum_display_name_cached` text — snapshot of @handle / Google name at pick time
- `forum_avatar_url_cached` text — snapshot of OAuth avatar URL at pick time

When a comment renders, we resolve in this order:
1. If `forum_identity_source = 'x'|'google'` → use cached values (refreshed on login).
2. Else → use `nickname` + `avatar_url` (custom, scanned).

OAuth avatars are **proxied** through a tiny edge function `forum-avatar-proxy` so we don't leak the user's IP to Google/X CDNs and so we can cache + content-type-validate the bytes (still JPG/GIF/PNG only, ≤2 MB, magic-byte sniffed). No AI scan needed for OAuth avatars — the provider already vetted them.

### UI

- New `ForumIdentityPicker.tsx` inside `ProfilePanel` ("Forum Identity" section).
- First-time prompt rendered above the comment composer if `forum_identity_source IS NULL`.
- Live preview chip: "You'll appear as [avatar] **@handle** [rank badge]".
- "Switch identity" link always visible under the composer.

---

## 2. Per-Autopsy Social Share

A share row at the top of every `/autopsy/:slug` page **and** at the bottom of each comment thread, mirroring the existing `ShareToXButton` pattern.

### Component: `AutopsyShareBar.tsx`

Buttons: **Share on X · Telegram · Copy for Discord · Copy link**

Pre-filled text (pulled from autopsy meta):
```text
🪦 Autopsy: $TICKER — {death_cause_short}
ATH: ${ath} → Died at: ${died_at_mcap}
Verdict: {verdict_one_liner}

Read the full forensic report 👉 https://blackbox.farm/autopsy/{slug}
```

Each comment gets a small "Share" icon that copies a deep link to that comment (`#c-{commentId}`).

### Tracking

Re-use `feature_usage_analytics` with `feature_name = 'autopsy_share_x' | '_tg' | '_discord' | '_link' | '_comment'` and `token_mint = autopsy.token_mint`.

---

## 3. Build order

1. Migration: add `forum_identity_source`, `forum_display_name_cached`, `forum_avatar_url_cached` to `profiles`.
2. Edge fn `forum-avatar-proxy` (validates + caches OAuth avatar bytes).
3. `ForumIdentityPicker.tsx` + integrate into `ProfilePanel` and as a first-time gate above the composer in `AutopsyComments.tsx`.
4. Update `AutopsyComments.tsx` to read the resolved identity (cached fields when source is `x`/`google`).
5. `AutopsyShareBar.tsx` + mount on `AutopsyArticle.tsx` (top) and `AutopsyComments.tsx` (footer).
6. Per-comment share-deep-link icon.
7. QA: linked X user → shows X avatar/handle; switch to custom → upload + AI scan path; logged-out share works without identity.

---

Reply **"Plan Approved — BUILD"** and I'll ship it in that order. If you want different wording in the identity picker, paste your preferred copy and I'll use it verbatim.
