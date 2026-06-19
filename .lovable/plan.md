Root cause: the buy is failing before any token transaction happens because `waterfall-swap` calls Jupiter once and a DNS/network miss from `quote-api.jup.ag` returns a raw 500. The wallets have SOL; the quote request is what fails.

Plan:
1. In `supabase/functions/waterfall-swap/index.ts`, wrap Jupiter `quote` and `swap` fetches with retry logic.
2. Retry only transient failures: DNS/network errors, 429, and 5xx responses.
3. Do not retry real user/input failures: bad mint, no route/liquidity, 4xx other than 429.
4. Log each failed retry attempt so the next failure clearly shows whether it was quote DNS, swap API, or a real route/liquidity issue.
5. Keep everything else unchanged: no PnL changes, no cascade changes, no wallet/balance logic changes.