
-- ── autopsy_candidates ──────────────────────────────────────────
create table if not exists public.autopsy_candidates (
  id uuid primary key default gen_random_uuid(),
  token_mint text not null unique,
  ticker text,
  token_name text,
  source_feed text not null, -- 'token_lifecycle' | 'pumpfun_watchlist' | 'dex_top_200_dropout' | 'ath_collapsed' | 'admin_manual'
  candidate_score numeric default 0, -- ranking priority (higher = more interesting to autopsy first)
  death_cause text, -- DeathCauseId from autopsy-taxonomy.ts
  death_intent text, -- 'malicious' | 'negligent' | 'neutral' | 'organic'
  death_confidence numeric, -- 0-100
  matched_signals jsonb default '[]'::jsonb,
  tier text, -- 'A' | 'B' | 'C'
  -- social death signals
  social_last_admin_msg_at timestamptz,
  social_no_admin_hours numeric,
  social_spam_pct numeric,
  social_checked_at timestamptz,
  -- on-chain context snapshot at funnel time
  ath_mcap_usd numeric,
  current_mcap_usd numeric,
  liquidity_usd numeric,
  age_hours numeric,
  creator_wallet text,
  -- pipeline state
  status text not null default 'pending', -- pending|analyzing|drafted|approved|rejected|published|failed
  status_reason text,
  draft_md_path text,
  published_slug text,
  -- timestamps
  funneled_at timestamptz default now(),
  analyzed_at timestamptz,
  drafted_at timestamptz,
  decided_at timestamptz,
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_autopsy_candidates_status on public.autopsy_candidates(status, candidate_score desc);
create index if not exists idx_autopsy_candidates_tier on public.autopsy_candidates(tier, status);
create index if not exists idx_autopsy_candidates_funneled on public.autopsy_candidates(funneled_at desc);

alter table public.autopsy_candidates enable row level security;

create policy "autopsy_candidates_admin_all"
  on public.autopsy_candidates for all
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- service role bypasses RLS automatically; edge functions write via service role

-- ── autopsy_reports ─────────────────────────────────────────────
create table if not exists public.autopsy_reports (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  token_mint text not null,
  ticker text,
  title text not null,
  subtitle text,
  verdict text,
  risk_score text,
  death_cause text not null,
  death_intent text,
  death_confidence numeric,
  hero_image_path text, -- e.g. /autopsies/<slug>-autopsy-v2.jpg
  source_banner_url text, -- DexScreener original
  md_content text not null, -- the rendered .md
  md_path text, -- public path: /autopsies/<slug>.md
  tags text[] default array[]::text[],
  candidate_id uuid references public.autopsy_candidates(id) on delete set null,
  published_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_autopsy_reports_published on public.autopsy_reports(published_at desc);
create index if not exists idx_autopsy_reports_mint on public.autopsy_reports(token_mint);

alter table public.autopsy_reports enable row level security;

create policy "autopsy_reports_public_read"
  on public.autopsy_reports for select
  using (true);

create policy "autopsy_reports_admin_write"
  on public.autopsy_reports for insert
  with check (public.has_role(auth.uid(), 'admin'));

create policy "autopsy_reports_admin_update"
  on public.autopsy_reports for update
  using (public.has_role(auth.uid(), 'admin'));

create policy "autopsy_reports_admin_delete"
  on public.autopsy_reports for delete
  using (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger (reuses existing helper if present, else inline)
create or replace function public.set_autopsy_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists trg_autopsy_candidates_updated on public.autopsy_candidates;
create trigger trg_autopsy_candidates_updated before update on public.autopsy_candidates
for each row execute function public.set_autopsy_updated_at();

drop trigger if exists trg_autopsy_reports_updated on public.autopsy_reports;
create trigger trg_autopsy_reports_updated before update on public.autopsy_reports
for each row execute function public.set_autopsy_updated_at();
