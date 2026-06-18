## Plan: Key Export Enhancements

Add both export options from the previous sanity check, each gated by a confirmation prompt.

### 1. Bulk Export → CSV + JSON Download
- In `src/components/admin/WaterfallGrid.tsx`, modify the existing `exportKeys()` handler bound to the "Export Keys" toolbar button.
- Flow:
  1. `confirm("Export ALL 100 private keys to your device? They will download as CSV + JSON files. Anyone with these files controls the wallets.")` → abort if no.
  2. Invoke `waterfall-export-keys` (already returns `{wallets: [{column, wallet, nickname, pubkey, secret_base58}]}`).
  3. Build two Blobs client-side:
     - `waterfall-keys-YYYYMMDD-HHmm.json` — pretty JSON of the array.
     - `waterfall-keys-YYYYMMDD-HHmm.csv` — header `column,wallet,nickname,pubkey,secret_base58` with proper quoting.
  4. Trigger two sequential `<a download>` clicks (object URLs, revoked after).
  5. Toast: `Exported 100 keys (CSV + JSON)`.
- No edge function changes needed.

### 2. Per-Wallet "Show Key" Button
- In `src/components/admin/WaterfallWalletDrawer.tsx`, add a new section inside `DrawerBody` (below Holdings, above Withdraw) titled "Private Key".
- Default state: key hidden, single destructive-outline button `Show Private Key`.
- Click flow:
  1. `confirm("Reveal the private key for W{col}·{row}? Anyone who sees your screen will be able to drain this wallet.")` → abort if no.
  2. Call existing `export-wallet-key` edge function with `{ wallet_id: wallet.id, source: "waterfall_wallets" }`.
     - Note: `export-wallet-key`'s `WALLET_SOURCES` array does NOT currently include `waterfall_wallets`. **Add** `{ table: 'waterfall_wallets', secretCol: 'secret_key_encrypted', encrypted: true }` to that list in `supabase/functions/export-wallet-key/index.ts`. No other edge-function changes.
  3. On success, render the base58 secret in a monospace readonly `<Input>` with:
     - `Copy` button (clipboard + toast).
     - `Hide` button (clears local state).
  4. Auto-hide after 60 seconds (timeout cleared on unmount / hide).
- Drawer-local state only: `revealedKey: string | null`, `revealing: boolean`. Never written to any global store, never persisted, never logged.

### Files Touched
- `src/components/admin/WaterfallGrid.tsx` — augment `exportKeys()` with confirm + dual download.
- `src/components/admin/WaterfallWalletDrawer.tsx` — add "Private Key" reveal section.
- `supabase/functions/export-wallet-key/index.ts` — register `waterfall_wallets` in `WALLET_SOURCES`.

### Security Notes
- All reveals/exports remain super-admin gated on the server (unchanged).
- Audit rows continue to write (`activity_logs` for single reveal, `secret_access_audit` for bulk export).
- Keys never enter localStorage; reveal state is component-local and timer-cleared.
