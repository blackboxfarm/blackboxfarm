

## Fix Misleading "Reclaim Rent" Dialog Text

### Problem
The confirmation dialog for "Reclaim Rent from All Wallets" incorrectly states that recovered SOL will be "sent to the FlipIt treasury wallet." In reality, each wallet's reclaimed rent stays in that same wallet -- no cross-wallet transfers occur. This is actually the correct (bundle-safe) behavior, but the UI text is wrong.

### Change
Update the dialog description in `src/components/admin/MasterWalletsDashboard.tsx` (line 771):

**Before:**
> "This will scan ALL {n} wallets for empty token accounts, close them to reclaim ~0.002 SOL each, and send the recovered SOL to the FlipIt treasury wallet."

**After:**
> "This will scan ALL {n} wallets for empty token accounts and close them to reclaim ~0.002 SOL each. Recovered SOL stays in each wallet (no cross-wallet transfers -- bundle-safe)."

### Technical Details
- File: `src/components/admin/MasterWalletsDashboard.tsx`, line 771
- Single line change, no logic changes needed
- The underlying edge function (`token-account-cleaner`) already behaves correctly -- rent goes back to the owning wallet via `createCloseAccountInstruction` with `owner.publicKey` as the destination

