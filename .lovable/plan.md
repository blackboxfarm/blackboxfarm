
## Per-Profile Central Wallet — Generate, Custody, Manage

Today each profile (`no_lube`, etc.) needs a `central_wallet_pubkey` set manually, and there's no internal custody for it. This plan makes Lovable **generate and own** one central wallet per profile, store the encrypted key the same way subscription deposit wallets do (AES-256-GCM via `SecureStorage`), and add a Super Admin panel to view balance, transactions, and withdraw.

### 1. Schema change (single migration)

Extend `profile_subscription_configs` so the central wallet is self-managed:

- `central_wallet_secret_encrypted text` — AES-GCM encrypted secret key (NULL = externally-owned legacy wallet)
- `central_wallet_generated_at timestamptz`
- `central_wallet_label text` (e.g. "No Lube Treasury")

Existing rows with a manually-set `central_wallet_pubkey` are left untouched (treated as external/read-only — no withdraw button, only balance).

### 2. New edge functions

| Function | Purpose |
|---|---|
| `profile-central-wallet-generate` | Super-admin only. If a profile has no `central_wallet_pubkey`, generate Keypair, encrypt secret, store pubkey + encrypted secret. Refuses to overwrite an existing wallet (must explicitly rotate). |
| `profile-central-wallet-balance` | Returns live SOL balance via Helius RPC for a given `profile_key`. |
| `profile-central-wallet-transactions` | Returns last N (default 50) signatures + parsed transfers for the central wallet via Helius. |
| `profile-central-wallet-withdraw` | Super-admin only. Body: `{ profile_key, destination_pubkey, amount_sol \| "all" }`. Loads encrypted keypair, builds `SystemProgram.transfer`, leaves ≥ `FEE_BUFFER_LAMPORTS` if `all`, signs, sends, confirms, logs to a new `profile_central_wallet_withdrawals` audit table. |
| `profile-central-wallet-rotate` (optional, deferred) | Generate new wallet, sweep old → new, mark old as retired. Flagged but not built in this pass unless you want it now. |

All four are super-admin-gated via the existing `assertSuperAdmin` pattern used by `profile-subscription-admin`.

### 3. Audit table

`profile_central_wallet_withdrawals`:
- `profile_key`, `from_pubkey`, `to_pubkey`, `lamports`, `signature`, `requested_by` (admin user id), `status` (`pending|confirmed|failed`), `error`, `created_at`, `confirmed_at`.
- RLS: select/insert via service_role only; admin UI reads through the admin edge function.

### 4. Super Admin UI

In `SubscriptionAdminPanel.tsx`, add a new **"Treasury"** tab (next to Profiles / Affiliates / Contacts), one card per profile:

```text
┌───────────────────────────────────────────────────────────┐
│ no_lube — No Lube Treasury                                │
│ Address: 9xK…wQ2  [copy] [solscan]                        │
│ Balance: 4.812 SOL  ($812.34)        [Refresh]            │
│ ─────────────────────────────────────────────────────────  │
│ Recent transactions (last 50)                              │
│   ↓ +0.45 SOL  from 3aB…  2m ago   tx                     │
│   ↑ −2.00 SOL  to 8nM…   1h ago   tx (withdraw)           │
│ ─────────────────────────────────────────────────────────  │
│ [ Withdraw ]   (opens modal: destination, amount, confirm) │
└───────────────────────────────────────────────────────────┘
```

For profiles with no wallet yet → big **"Generate Central Wallet"** button.
For legacy externally-owned wallets (only `central_wallet_pubkey` set, no encrypted secret) → balance + tx shown, withdraw button disabled with tooltip "Externally owned — withdraw from source wallet".

Withdraw modal:
- Destination pubkey (validated as base58 / 32-byte)
- Amount: SOL input + **"Max (leave fee buffer)"** shortcut
- Confirmation step showing exact lamports, fee, remaining balance
- Two-click confirm (no auto-submit)

### 5. Security notes

- Encrypted secrets follow the same `SecureStorage` (`ENCRYPTION_KEY`) pattern already used for subscription deposit wallets — **no new secret needed**.
- All four new endpoints require super-admin JWT; withdraw additionally logs `requested_by`.
- Raw secret keys never returned to the client. Export-key flow is **not** part of this plan (can add later as a separate gated function if you want a break-glass).
- Fail-loud DB writes via `assertDbWrite` per the zero-tolerance rule.

### 6. Out of scope (call out explicitly)

- SPL token (USDC etc.) balances/withdrawals — SOL-only for now.
- Multi-sig / hardware-wallet custody — single-key custody, same model as subscription wallets.
- Auto-sweep from central → external cold wallet — manual withdraw only.

### Open question

Do you want a **"Generate now"** button per profile (manual one-time click), or should the migration auto-generate a wallet for every existing active profile on first deploy? Manual is safer; auto is one-click-zero-touch.
