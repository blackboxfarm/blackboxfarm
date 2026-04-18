

User wants: an auto-buy rule for the **Insiders** TG channel. First-time-seen token mints in that channel → auto-buy 0.10 SOL via FlipIt wallet → auto-sell at 2× TP. Rule UI lives at top of FlipIt tab under the header.

## Investigation needed

Let me check what I know from context:
- `telegram_channel_calls` already captures channel calls with `channel_id`, `token_mint`, `message_timestamp`
- FlipIt has: `flip_positions`, `flipit-execute` edge fn, auto-TP infrastructure (auto-sell at multiplier exists per recent reconciliation work)
- Need to find: which channel is "Insiders", how FlipIt buys are triggered, where the FlipIt header lives

Let me explore.
