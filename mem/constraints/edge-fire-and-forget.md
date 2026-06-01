---
name: Edge fire-and-forget must use EdgeRuntime.waitUntil
description: Cross-function kicks from Supabase Edge Functions die when serve() returns unless wrapped in EdgeRuntime.waitUntil
type: constraint
---
Supabase Deno isolates terminate the instant the `serve()` handler resolves.
Any `fetch(...)` started without `await` (classic "fire-and-forget") is
discarded mid-flight and the downstream function is never invoked.

For trigger-style ingress functions (e.g. `insiders-row-ingest`) that need to
return fast AND kick a downstream pipeline (`no-lube-ingest`,
`*-genealogy-backfill`, etc.), wrap the dispatch in `EdgeRuntime.waitUntil`:

```ts
// @ts-ignore EdgeRuntime is provided by Supabase
if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
  // @ts-ignore
  EdgeRuntime.waitUntil(fetch(...).catch(e => console.warn(e)));
} else {
  await fetch(...);
}
```

Symptom when this is violated: lifecycle row stuck at `enriching`, zero log
lines in the downstream function for that mint, no post_log row.
