# Autopsy Comments Mini-Forum + User Avatars/Ranks

A public-read, login-to-post comment thread on every `/autopsy/:slug` page, with avatar uploads, rank badges, upvotes, Cloudflare Turnstile gating, deep sanitization, and AI image safety scanning.

---

## 1. Database (new tables)

```text
autopsy_comments
  id, autopsy_slug (FK→autopsy_reports.slug), user_id (FK→auth.users),
  parent_id (self-FK, nullable, for 1-level replies),
  body (text, max 1000), body_clean (sanitized cache),
  upvote_count (int), is_hidden (bool), is_pinned (bool),
  created_at, updated_at, edited_at

autopsy_comment_votes
  comment_id, user_id, value (1 only — upvote system),
  UNIQUE(comment_id, user_id)

profiles  (extend existing)
  + avatar_url (text)            -- public URL in user-avatars bucket
  + nickname (text, unique CI)   -- 3-20 chars [a-z0-9_-]
  + rank_slug (text)             -- 'newbie' | 'degen' | 'chad' | 'veteran' | 'oracle'
  + comment_karma (int default 0)
  + avatar_scan_status (text)    -- pending | clean | rejected
  + avatar_scan_reason (text)

user_ranks (lookup)
  slug, label, icon_emoji, min_karma, is_awardable_only (bool)
  Seed: newbie(0), degen(25), chad(100), veteran(500), oracle(awarded)
```

**RLS**
- `autopsy_comments`: SELECT public (where `is_hidden = false`); INSERT auth + Turnstile-verified edge function only; UPDATE/DELETE own row OR super_admin.
- `autopsy_comment_votes`: SELECT public; INSERT/DELETE own.
- `profiles.avatar_url / nickname`: public-readable (already are); writes self-only.
- Trigger maintains `upvote_count` and bumps `profiles.comment_karma` (auto-promotes rank when threshold crossed, except `is_awardable_only`).

## 2. Storage

Bucket **`user-avatars`** (public read). Path: `{user_id}/avatar.{ext}`.
- RLS: insert/update only own folder.
- Only `.jpg`/`.jpeg`/`.gif` accepted (validated server-side, not just MIME — magic-byte sniff).
- Max 2 MB, max 1024×1024 after crop.

## 3. Edge Functions

| Function | Purpose |
|---|---|
| `autopsy-comment-post` | Verify Turnstile token → sanitize body (DOMPurify + zod + telegram-input-sanitizer pattern) → insert |
| `autopsy-comment-vote` | Toggle upvote, recompute count |
| `avatar-upload-scan` | Receive base64 image → magic-byte check → strip EXIF → re-encode (sharp/imagescript) → send to Lovable AI Gateway (`gemini-2.5-flash-image` vision) for: (a) NSFW/violence check, (b) hidden-text/prompt-injection check, (c) file-format integrity → write to bucket, set `avatar_scan_status` |
| `autopsy-comment-moderate` | Super-admin: hide/pin/delete |

All POST endpoints require: valid JWT + Turnstile token + per-user rate limit (5 comments/min, 1 avatar/hour) tracked in existing rate-limit table.

## 4. Sanitization Layers (defense in depth)

1. **Client**: zod schema (length, charset), strip control chars before submit.
2. **Edge function**: re-validate with zod, run through `_shared/telegram-input-sanitizer.ts` patterns, then DOMPurify (server build) to strip any HTML/script.
3. **DB**: store raw `body` + pre-sanitized `body_clean`; render only `body_clean`.
4. **Render**: React text node only (never `dangerouslySetInnerHTML`); auto-linkify via safe regex with `rel="nofollow ugc noopener"`.
5. **Turnstile**: server-side `siteverify` on every write.
6. **Rate limit + karma gating**: new accounts (<24h, 0 karma) get 1 comment/10min.

## 5. Avatar Pipeline

```text
Browser  → react-easy-crop (square, output JPEG ≤1024² ≤2MB)
        → POST base64 to avatar-upload-scan
Edge fn  → magic-byte check (FFD8FF / GIF87a / GIF89a only)
        → strip EXIF + re-encode (kills embedded payloads)
        → AI Gateway vision scan: NSFW + injection text + integrity
        → if clean: upload to user-avatars/{uid}/avatar.jpg
        → update profiles.avatar_url + scan_status
        → if rejected: keep old avatar, return reason
```

Rejected reasons surfaced inline ("Image contained hidden text — please upload a clean photo").

## 6. Ranks

Auto-awarded by karma (newbie→degen→chad→veteran). `oracle` is admin-awarded only. Icon shown next to nickname in every comment. Admin UI (in HoldersIntel/Autopsies tab) to award `oracle` and to revoke ranks.

## 7. UI

**`src/components/autopsy/AutopsyComments.tsx`** mounted at bottom of `/autopsy/:slug`:
- Header: "WTF Happened? — Front-row holders, weigh in."
- Logged-out: read-only list + "Sign in to comment" CTA.
- Logged-in: composer with Turnstile widget, char counter (1000), post button.
- Each comment: avatar, nickname, rank icon, timestamp, body, ▲ upvote, reply (1 level), super-admin moderation kebab.
- Sort: Top / New toggle.

**`src/components/profile/AvatarUploader.tsx`** (in ProfilePanel):
- Drop/select → react-easy-crop modal → upload → live scan-status indicator.

**X-Post P.S. line** appended in `src/lib/deadTokensPost.ts`:
> "Is our Autopsy on target or did we miss something? Got an insider tip or a front-row view? WTF happened? Comment on the latest @DeadTokens83517 report 👉 https://blackbox.farm/autopsy/{slug}#comments"

(Only added when length budget allows; trimmed gracefully.)

## 8. Secrets needed

- `TURNSTILE_SECRET_KEY` (server) — already configured per memory ✅ verify presence
- `TURNSTILE_SITE_KEY` is publishable — fine in code
- `LOVABLE_API_KEY` for avatar vision scan ✅ already present

## 9. Order of build

1. Migration: tables, ranks seed, storage bucket, RLS, karma trigger.
2. Edge functions: `autopsy-comment-post`, `autopsy-comment-vote`, `avatar-upload-scan`, `autopsy-comment-moderate`.
3. Profile extension: nickname + avatar uploader + rank display.
4. `AutopsyComments` component + mount on autopsy article page.
5. Update `deadTokensPost.ts` with WTF P.S. line.
6. Admin moderation panel tab.
7. QA: post/upvote/reply/moderate flow; upload clean + dirty image; Turnstile fail path; rate-limit trip.

---

Reply **"Plan Approved"** (any order is fine, or tell me which slice to ship first) and I'll build it.