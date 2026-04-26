create table if not exists public.x_community_resolution_queue (
  id uuid primary key default gen_random_uuid(),
  community_id text not null unique,
  discovered_via text,
  priority int not null default 5,
  attempts int not null default 0,
  last_error text,
  enqueued_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_xcrq_pending
  on public.x_community_resolution_queue (priority asc, enqueued_at asc)
  where resolved_at is null;

alter table public.x_community_resolution_queue enable row level security;

create policy "service role full access"
  on public.x_community_resolution_queue
  for all
  to service_role
  using (true)
  with check (true);