

## What happened

You typed `/pnl` in a public group. `/pnl` is **not** a HoldersIntel bot command. The group-redirect logic at `holdersintel-bot-webhook/index.ts:4344` treats *any* message starting with `/` as a "ours, redirect to DM" command. Because `/pnl` doesn't match any case in the switch, it falls into `default:` → calls `handleAiFreeChat()` in the user's DM, which is why The Signal AI replied "I don't have that command" privately.

This is wrong on two counts:
1. The bot should ignore commands it doesn't own when in a group (so Phanes/other bots can answer them).
2. It should never silently DM a user about an unrecognized command they typed in a group.

## The fix

In `supabase/functions/holdersintel-bot-webhook/index.ts`, in the group-routing block (around lines 4344–4440):

1. **Define an explicit `KNOWN_GROUP_REDIRECT_COMMANDS` allow-list** — exactly the commands handled in that switch (`/dev /d /insiders /i /concentration /con /compare /cmp /holders /ca /ai /momentum /m /mom /oracle /o /wallet /w /alerts /add /channels /ch /config /payment /pay /ticket`).

2. **Change the gate condition** from:
   ```
   isGroupChat && command.startsWith('/') && !GROUP_PUBLIC_COMMANDS.includes(command)
   ```
   to:
   ```
   isGroupChat && KNOWN_GROUP_REDIRECT_COMMANDS.includes(command)
   ```
   So we only redirect commands we actually own.

3. **Remove the `default → handleAiFreeChat`** branch inside the redirect switch entirely. If somehow it gets there, do nothing (silent ignore). No DMs about unknown commands ever.

4. **In group context, unknown slash commands fall through to `default`** in the lower switch (line 4554). That branch already correctly does nothing for groups except auto-detect CAs and registration codes — which is the desired behavior. `/pnl`, `/lb`, `/buy`, etc. from Phanes/BonkBot/etc. will simply be ignored by us.

5. **Keep "Did you mean?" suggestions DM-only** (already the case at line 4574 — gated on `!isGroupChat`). No change needed.

### Result

- `/pnl` in a group → our bot stays silent. Phanes replies as expected.
- `/holders <CA>` in a group → still works, still redirects to DM.
- `/pnl` in a DM → still gets the "Did you mean /pnl..." suggestion (DM is the right place for that).
- The Signal AI never auto-DMs users based on group activity.

### Files changed
- `supabase/functions/holdersintel-bot-webhook/index.ts` (one block, ~lines 4340–4440)

No DB changes. No new secrets.

