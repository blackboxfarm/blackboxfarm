---
name: DeadTokens X Post Template
description: Locked tweet format for @DeadTokens83517 manual posting from autopsy reports; composer in admin + super-admin floating button on article page
type: feature
---

Manual X-post pipeline (until automation):

- Handle: **@DeadTokens83517** (constant `DEAD_TOKENS_HANDLE` in `src/lib/deadTokensPost.ts`).
- Composer: `src/components/admin/autopsies/AutopsyTweetComposer.tsx` — editable textarea, char counter (limit 280), Copy Post / Copy Image URL / Download Banner / Open X Compose buttons, mock X card preview.
- Builder: `buildDeadTokensPost()` in `src/lib/deadTokensPost.ts` — pure function, picks verdict from `death_cause` and rotates hashtag set by intent bucket (rug / soft_rug / abandoned / organic / default).
- Surfaces:
  1. Admin → Autopsies → Published rows: "🐦 X Post" button per row.
  2. Public `/autopsy/:slug`: floating bottom-right "Generate X Post" button **only** for super-admins (`useUserRoles().isSuperAdmin`).
- Always trail with `🌐 https://blackbox.farm/autopsy/{slug}` for back-link.
- Harm headline drives the body line — never fabricate numbers; if missing, falls back to harm score, else generic line.

Future automation should reuse `buildDeadTokensPost()` directly so format stays canonical.