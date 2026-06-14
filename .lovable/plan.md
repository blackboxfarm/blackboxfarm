# Waterfall Tab — 10×10 Solana Wallet Grid

A 10-column × 10-row matrix of exactly 100 generated Solana wallets. Each column is one isolated vertical waterfall of 10 wallets. Funds move wallet 1 → wallet 2 → wallet 3 etc. within the same column only; columns do not mix.

## Layout

```text
            Waterfall 1  Waterfall 2  Waterfall 3 ... Waterfall 10
wallet 1    W1-1         W2-1         ...
wallet 2    W1-2         W2-2         ...
...
wallet 10   W1-10        W2-10        ...
```

- 10 columns × 10 wallets = **100 wallets total**.
- Column headings are labels only, not extra wallets.
- Each cell shows: short pubkey, nickname, SOL balance, USD value, token count badge, [Withdraw] button.
- Clicking a cell opens a side drawer with full details: full pubkey (copy), SPL token list with balances + USD, per-token Withdraw form (amount + destination address), and rename nickname.

## Database

New migration creates one table:

```text
waterfall_wallets
  id uuid pk
  user_id uuid (owner, super admin only)
  column_index int  (0..9)
  row_index int     (0..9)
  nickname text
  pubkey text unique
  secret_key_encrypted text   (AES via existing encrypt-data function)
  sol_balance numeric default 0
  last_balance_at timestamptz
  created_at timestamptz default now()
  unique(column_index, row_index)
```

RLS: super-admin-only (uses existing `is_super_admin` rpc). GRANTs to `authenticated` + `service_role`.

## Edge functions (reuse existing patterns)

Reuse the airdrop-wallet pattern:
1. `waterfall-generate-all` — generates any missing wallets to fill the 10×10 grid (idempotent).
2. `waterfall-refresh-balances` — batches `getBalance` + `getTokenAccountsByOwner` via Helius RPC for all 100 wallets; updates DB and returns token holdings keyed by pubkey.
3. `waterfall-withdraw` — body: `{ walletId, mint ('SOL' or SPL mint), amount, destination }`. Decrypts key, signs, sends (SystemProgram.transfer for SOL, SPL transfer + close-if-empty for tokens), returns signature.
4. `waterfall-export-keys` — super-admin-only; returns decrypted secret keys as JSON `[{column,row,nickname,pubkey,secret_base58}]` for one-time download.

USD pricing: SOL via existing `useSolPrice` hook; SPL tokens via DexScreener token-price lookup (already in the codebase) — falls back to "—" if no price.

## UI

New file `src/components/admin/WaterfallGrid.tsx` rendered inside the existing Waterfall tab in `SuperAdmin.tsx`. Components:

- Top toolbar: **Generate Missing Wallets**, **Refresh Balances**, **Export Private Keys (.json)**, total SOL + total USD summary.
- Sticky-header table, 10 columns. Header labels identify Waterfall 1–10. Rows 1–10 are the actual wallets.
- Cell card: editable nickname (inline), pubkey short + copy, SOL + USD, token badge, Withdraw button.
- `WalletDetailDrawer` — full pubkey, QR (optional), SPL token list, per-token withdraw form with Solana address validation, rename field.
- Confirm modal before private-key export (warns about security).

## Security

- All key material encrypted at rest via existing `encrypt-data` function (AES-256-GCM).
- Every edge function checks `is_super_admin`.
- Export endpoint logs an entry in `secret_access_audit`.
- Withdraw destination validated as base58 32–44 chars before signing.

## Files touched

- `supabase/migrations/<ts>_waterfall_wallets.sql` (new)
- `supabase/functions/waterfall-generate-all/index.ts` (new)
- `supabase/functions/waterfall-refresh-balances/index.ts` (new)
- `supabase/functions/waterfall-withdraw/index.ts` (new)
- `supabase/functions/waterfall-export-keys/index.ts` (new)
- `src/components/admin/WaterfallGrid.tsx` (new)
- `src/components/admin/WaterfallWalletDrawer.tsx` (new)
- `src/pages/SuperAdmin.tsx` (swap "coming soon" for `<WaterfallGrid />`)

## Final decision

Exactly **100 wallets**. No header-wallet rows.