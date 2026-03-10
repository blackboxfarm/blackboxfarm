
## Pre-Warm Pings for FlipIt Edge Functions

### Approach

Add a lightweight warmup handler to both `flipit-execute` and `flipit-preflight`, then schedule pg_cron jobs to ping them every 5 minutes.

### Changes

**1. `supabase/functions/flipit-execute/index.ts`** (line ~543)
- After `const body = await req.json();`, add an early return check:
  ```typescript
  if (body.action === 'warmup') {
    return ok({ warm: true, ts: Date.now() });
  }
  ```

**2. `supabase/functions/flipit-preflight/index.ts`** (line ~20)
- After `const { tokenMint, ... } = await req.json();`, restructure to check for warmup first:
  ```typescript
  const body = await req.json();
  if (body.action === 'warmup') {
    return new Response(JSON.stringify({ warm: true, ts: Date.now() }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const { tokenMint, solAmount, walletPubkey, slippageBps = 500 } = body;
  ```

**3. pg_cron jobs** (SQL via migration tool)
- Schedule two cron jobs, every 5 minutes, sending `{"action":"warmup"}` to each function using `net.http_post`.

### Why warmup action instead of just pinging?
Both functions call `req.json()` and immediately destructure required fields. Without the warmup check, a minimal ping would hit validation errors and waste CPU on error handling. The warmup action returns in <1ms, keeping the isolate alive without side effects.
