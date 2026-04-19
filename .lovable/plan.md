

User got an alert about `helius_api_usage` having 596K rows. Need to check retention policy on this table and recommend a fix.

From context I can see:
- `helius_api_usage` is written to by the fetch interceptor (every Helius call across all edge functions)
- There's a `prune-table` edge function that takes `{table, column, days}` and calls RPC `bulk_prune_table`
- Memory `database-storage-management` mentions tiered retention policy is in place
- Helius runs ~10M credits/month — so 596K log rows over time is plausible

Let me check what retention currently exists for this table and how the cron is configured.
