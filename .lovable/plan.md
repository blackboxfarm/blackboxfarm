## Emergency No Lube posting fix

### Goal
Stop BLACKBOX Telegram posts immediately, and stop enrichment from blocking token posts. Newly called tokens should post snapshot/private flow first, while heavier enrichment continues only as best-effort background work.

### Changes
1. **Hard mute BLACKBOX at the shared Telegram layer**
   - Update `supabase/functions/_shared/telegram-broadcast.ts`.
   - Drop any target whose label is `BLACKBOX` before sending.
   - Log the drop to `notification_delivery_log` as `muted: BLACKBOX kill-switch`.
   - Do not enqueue muted BLACKBOX messages to DLQ.

2. **Make No Lube ingest post first, enrich after**
   - Update `supabase/functions/no-lube-ingest/index.ts`.
   - Call `no-lube-orchestrate` immediately after setting the row to `enriching`.
   - Keep mesh/dev/holders/blackbox harvest as non-blocking best-effort background steps.
   - Always finish rows as `enriched` or `failed`; no more permanent `enriching` rows.

3. **Add stuck-row recovery to the pipeline cron**
   - Update `supabase/functions/insiders-pipeline-orchestrator/index.ts`.
   - Each run finds lifecycle rows stuck in `enriching` older than 10 minutes.
   - Re-dispatches `no-lube-ingest` with `{ force: true, fast_post: true }` so snapshots get posted.

4. **Unstick current backlog**
   - Reset stuck lifecycle rows so the recovery sweep and forced ingest can process them.
   - Explicitly force THRONEROOM and BLUEMOON through `no-lube-ingest` after deploy.

### Result
- BLACKBOX group gets nothing.
- No Lube token snapshots do not wait on enrichment.
- THRONEROOM, BLUEMOON, and the current stuck backlog are reprocessed.
- Future stuck rows self-heal from the orchestrator.