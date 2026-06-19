Do I know what the issue is? Yes.

**What happened in the screenshot**
- The UI calculated W1 buy from the stored DB balance: `0.1333 SOL` with a persisted `95%` setting.
- It sent `115,277,917 lamports` to `waterfall-swap` for wallet `475NMKG1`.
- `waterfall-swap` delegated to `raydium-swap`.
- `raydium-swap` checked the live on-chain balance, reserved `0.012 SOL`, and found `0` executable SOL.
- So the buy stopped before any real venue trade. It did **not** get to a successful PumpPortal/Raydium/Jupiter buy.

**Root problem**
- The frontend is still sizing buys from stale `waterfall_wallets.sol_balance`.
- The old saved local setting still shows `95%`, even though the intended default is 90%.
- The backend is correctly refusing to spend fee reserve, but the frontend should not be sending stale fixed lamports in the first place.

**Fix plan**
1. **Force buy size to 90 max**
   - Clamp saved/local `buySizePct` to `90` if it is higher.
   - Set the input max to `90`.
   - Make the label clear it is `% of spendable SOL after fees`, not raw wallet SOL.

2. **Stop trusting stale DB SOL for live buys**
   - Before executing a live column buy, call `waterfall-refresh-balances` first.
   - Use the refreshed balances for eligibility and per-wallet buy sizing.
   - Update the grid immediately with refreshed balances before sending swaps.

3. **Move final buy sizing to the backend**
   - Send `buyPct` and reserve settings to `waterfall-swap` / `raydium-swap`, not only precomputed stale `buyLamports`.
   - `raydium-swap` will fetch live SOL and compute:
     `floor((liveSolLamports - buySellFeeReserveLamports) * buyPct / 100)`
   - This guarantees every wallet buys from live chain balance and keeps sell-fee reserve.

4. **Make failures useful, not misleading**
   - If a wallet has no spendable SOL after reserve, show: wallet short pubkey, live SOL, reserve, computed buy size.
   - Toast/log should say `skipped no spendable SOL` instead of looking like a venue/trade failure.

5. **Deploy and verify**
   - Deploy `waterfall-swap` and `raydium-swap`.
   - Test W1 buy path and confirm logs show backend-calculated live buy lamports, not stale UI lamports.

**Files to change**
- `src/components/admin/WaterfallGrid.tsx`
- `supabase/functions/waterfall-swap/index.ts`
- `supabase/functions/raydium-swap/index.ts`

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>