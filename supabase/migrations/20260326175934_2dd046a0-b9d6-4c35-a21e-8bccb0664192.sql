create table if not exists public.social_posts_log (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  post_id text,
  content text,
  metadata jsonb default '{}'::jsonb,
  status text default 'posted',
  created_at timestamptz default now()
);

alter table public.social_posts_log enable row level security;

create policy "Service role full access on social_posts_log"
  on public.social_posts_log
  for all
  to service_role
  using (true)
  with check (true);

create index idx_social_posts_log_platform on public.social_posts_log(platform);
create index idx_social_posts_log_created_at on public.social_posts_log(created_at desc);