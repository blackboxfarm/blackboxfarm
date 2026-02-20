
## Add Wallet Label Editing to Master Wallets Dashboard

### What this does
Adds an inline edit capability for wallet labels/nicknames directly on each wallet card in the Master Wallets Dashboard. Clicking the label (or a pencil icon) opens an inline edit field to rename wallets like "W9" to something meaningful.

### How it works
1. **Add an edit button (pencil icon)** next to the wallet label in `SortableWalletCard`
2. **Inline editing mode**: clicking the pencil toggles an Input field where the label text is, with save/cancel
3. **Save handler** in `MasterWalletsDashboard` that updates the correct table based on wallet source:
   - `super_admin_wallets` -> updates `label` column
   - `airdrop_wallets` -> updates `nickname` column
   - `rent_reclaimer_wallets` (custom) -> updates `nickname` via the `rent-reclaimer-wallets` edge function
   - `wallet_pools` -> needs a new `nickname` column (or we add one)
   - `blackbox_wallets` -> needs a new `nickname` column (or we add one)
4. **Optimistic UI update**: label changes instantly, reverts on error

### Technical details

**Files to modify:**

1. **`src/components/admin/SortableWalletCard.tsx`**
   - Add `onEditLabel` callback prop: `(wallet: MasterWallet, newLabel: string) => void`
   - Add local state for inline editing (`isEditingLabel`, `editLabelValue`)
   - Replace the static label span with an editable component: pencil icon to enter edit mode, Input + check/X buttons in edit mode
   - Show the pencil icon for ALL wallets (even those without a label yet)

2. **`src/components/admin/MasterWalletsDashboard.tsx`**
   - Add `handleEditLabel` function that routes the update to the correct table/edge function based on `wallet.source`
   - For `custom` source: call `rent-reclaimer-wallets` edge function with `action: 'update'`
   - For `super_admin`: update `label` column in `super_admin_wallets`
   - For `airdrop`: update `nickname` column in `airdrop_wallets`
   - For `wallet_pool`: update `nickname` column in `wallet_pools`
   - For `blackbox`: update `nickname` column in `blackbox_wallets`
   - Pass `onEditLabel` to `SortableWalletCard`
   - Optimistically update the wallet's label in local state

3. **Database migration** - Add `nickname` column to `wallet_pools` and `blackbox_wallets` tables (if they don't already have one), so all wallet types support labeling.

4. **`loadAllWallets` in MasterWalletsDashboard** - Update queries to also select `nickname` from `wallet_pools` and `blackbox_wallets`, and use it as the `label` field.
