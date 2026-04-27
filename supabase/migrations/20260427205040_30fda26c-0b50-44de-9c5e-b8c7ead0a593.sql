
-- Phase 3: Demand-Weighted Scheduler — surface real public demand to the ranker.

-- Materialised aggregation isn't worth the refresh complexity here; a regular
-- view backed by the existing index on (last_seen_at, times_seen) is fast enough.
create or replace view public.holders_intel_demand_24h as
select
  s.token_mint,
  s.symbol,
  s.name,
  s.times_seen,
  s.last_seen_at,
  s.last_trigger_source,
  -- Weight signals: tg/web bumps in the last 24h count more than older history.
  case
    when s.last_seen_at > now() - interval '1 hour'  then s.times_seen * 4
    when s.last_seen_at > now() - interval '6 hours' then s.times_seen * 2
    when s.last_seen_at > now() - interval '24 hours' then s.times_seen
    else 0
  end as demand_score_24h
from public.holders_intel_seen_tokens s
where s.last_seen_at > now() - interval '24 hours';

comment on view public.holders_intel_demand_24h is
  'Phase 3 mesh-symmetry: 24h public-input demand per token, weighted by recency. Read by holders-intel-scheduler.';

-- Grant read to the service role (used by edge functions).
grant select on public.holders_intel_demand_24h to service_role;
grant select on public.holders_intel_demand_24h to authenticated;
