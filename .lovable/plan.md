# Waterfall Dust Burn + SOL Cascade Plan

Yes — I can do exactly what sol-incinerator.com does (close empty/dust SPL token accounts to reclaim the ~0.002 SOL rent each), then sweep the remaining SOL down the waterfall. We already have `burn-token` deployed which burns a token balance AND closes the account. I just need to wrap it in a batch sweeper and a SOL-transfer step.

## What the sweep does per wallet

For each waterfall wallet N (starting at #1):
1. **Scan** all SPL token accounts owned by the wallet (`getParsedTokenAccountsByOwner`, both TOKEN_PROGRAM_ID and TOKEN_2022_PROGRAM_ID).
2. **For each token account**:
   - If balance == 0 → just close it (reclaims rent, no burn ix needed).
   - If balance > 0 → burn + close in a single tx (already what `burn-token` does).
3. **Batch** up to ~10 close/burn instructions per transaction to minimize fees (one signature fee per tx instead of per account).
4. **Transfer** all remaining SOL (minus a small buffer for the next hop's fees, ~5000 lamports) to wallet N+1.
5. Move to N+1, repeat. Stop after wallet #10.

## Gas / fee optimization

- Batching 10 close ix per tx = ~10x cheaper than one-per-tx.
- Priority fee set to `0` (or minimum) since this is not time-sensitive.
- Skip burn ix entirely when balance is already 0 — just close.
- Each closed account returns ~0.00204 SOL rent → sweep usually earns SOL, doesn't cost it.

## Implementation

### New edge function: `waterfall-dust-sweep`
- Input: `{ start_wallet_index: 1, end_wallet_index: 10, dry_run?: boolean }`
- Super-admin auth required.
- For each wallet in range:
  - Decrypt secret via existing `decryptWalletSecretAuto`.
  - Enumerate token accounts (both token programs).
  - Build batched close/burn transactions (10 ix per tx).
  - Sign + send + confirm.
  - After all accounts processed, read final SOL balance and transfer `(balance - 5000 lamports)` to next wallet's pubkey.
- Return a JSON report: per-wallet accounts scanned, tokens burned, accounts closed, rent reclaimed, SOL forwarded, tx signatures.

### UI trigger
Small "Dust Sweep 1 → 10" button on the Waterfall super-admin page (or I can just run it once via a manual invoke if you'd rather not have a button).

## Safety

- Dry-run mode first — reports what it *would* do without sending any tx.
- Skips wallet if secret can't be decrypted.
- Skips any token account whose balance can't be read.
- Logs every signature to `activity_logs` (same pattern as `burn-token`).

## What I need from you

Just say **Plan Approved** and I'll build + deploy the function and run a dry-run against Waterfall #1 first so you can eyeball the report before it moves real SOL.
