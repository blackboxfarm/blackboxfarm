---
name: Zero tolerance for silent database failures
description: Every DB write in every edge function must throw on failure, never log-and-continue. Use assertInsert/assertUpsert/assertUpdate from _shared/db-assert.ts.
type: constraint
---
All edge functions MUST use the `assertDbWrite` family from `_shared/db-assert.ts` for any database write operation. Silent fails (catching a DB error and continuing with `console.warn`) are absolutely forbidden.

**What happened:** On ~Apr 7, the morning-report function gained two new fields (`web_chat_stats`, `sol_subscription_stats`) that didn't exist on the `morning_reports` table. The upsert failed, but the function caught the error, logged it with `console.warn`, continued to return HTTP 200, and `edge_function_runs` recorded "success." For 8 days no morning report was saved while the system appeared healthy.

**The rule:** If a database write fails, the function MUST throw. The `withRunLog` wrapper will catch the throw and record `status: error` in `edge_function_runs`. This ensures the morning report flags it as a failure.

**Pattern to use:**
```ts
import { assertUpsert } from '../_shared/db-assert.ts';
const data = await assertUpsert(supabase.from('table').upsert({...}), 'table');
```

**Pattern that is FORBIDDEN:**
```ts
const { error } = await supabase.from('table').upsert({...});
if (error) console.warn('Failed:', error.message); // ← SILENT FAIL — BANNED
```
