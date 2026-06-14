# Waterfall Tab — 10×10 Solana Wallet Grid

A 10-column × 10-row matrix of 100 generated Solana wallets. Each column is a "waterfall" (column header = wallet 1, rows 1–10 list wallets 1–10 of that column? — clarified below). Every wallet supports nickname, live SOL balance, USD value, SPL token listing, withdraw, and bulk private-key export.

## Layout interpretation

```text
            Col 1        Col 2        Col 3   ...  Col 10
header      Wallet C1H   Wallet C2H   ...           (header wallet, nickname-editable)
row 1       W1-1         W2-1         ...
row 2       W1-2         W2-2         ...
...
row 10      W1-10        W2-10        ...
```

- 10 column-header wallets + 10×10 body wallets = **110 wallets total**.
  If you'd rather have **exactly 100** (header IS row 1), I'll switch to that on your "Plan Approved" — just say "100 only".
- Each cell shows: short pubkey, nickname, SOL balance, USD value, token count badge, [Withdraw] button.
- Clicking a cell opens a side drawer with full details: full pubkey (copy), SPL token list with balances + USD, per-token Withdraw form (amount + destination address), and rename nickname.

## Database

New migration creates one table:

```text
waterfall_wallets
  id uuid pk
  user_id uuid (owner, super admin only)
  column_index int  (0..9)
  row_index int     (-1 for header, 0..9 for body)
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
1. `waterfall-generate-all` — generates any missing wallets to fill the 10×11 grid (idempotent).
2. `waterfall-refresh-balances` — batches `getBalance` + `getTokenAccountsByOwner` via Helius RPC for all 110 wallets; updates DB and returns token holdings keyed by pubkey.
3. `waterfall-withdraw` — body: `{ walletId, mint ('SOL' or SPL mint), amount, destination }`. Decrypts key, signs, sends (SystemProgram.transfer for SOL, SPL transfer + close-if-empty for tokens), returns signature.
4. `waterfall-export-keys` — super-admin-only; returns decrypted secret keys as JSON `[{column,row,nickname,pubkey,secret_base58}]` for one-time download.

USD pricing: SOL via existing `useSolPrice` hook; SPL tokens via DexScreener token-price lookup (already in the codebase) — falls back to "—" if no price.

## UI

New file `src/components/admin/WaterfallGrid.tsx` rendered inside the existing Waterfall tab in `SuperAdmin.tsx`. Components:

- Top toolbar: **Generate Missing Wallets**, **Refresh Balances**, **Export Private Keys (.json)**, total SOL + total USD summary.
- Sticky-header table, 10 columns. Header row = the column-header wallet card. Body rows 1–10 = the column's waterfall wallets.
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

## Open question

Grid totals **110 wallets (10 header + 100 body)** as written above, or **100 wallets** where the header row IS row 1? Default is 110 unless you say "100 only" when approving.

Reply **Plan Approved** to build.