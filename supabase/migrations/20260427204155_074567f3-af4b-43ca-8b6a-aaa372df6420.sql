
-- Phase 1: Mesh symmetry — public demand signal
alter table public.holders_intel_seen_tokens
  add column if not exists last_trigger_source text;

create index if not exists idx_seen_tokens_last_seen
  on public.holders_intel_seen_tokens (last_seen_at desc);

create index if not exists idx_seen_tokens_demand
  on public.holders_intel_seen_tokens (times_seen desc, last_seen_at desc);

create or replace function public.bump_seen_token(
  p_mint text,
  p_source text,
  p_symbol text default null,
  p_name text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_mint is null or length(p_mint) < 30 then
    return;
  end if;

  insert into public.holders_intel_seen_tokens (
    token_mint, symbol, name, first_seen_at, last_seen_at, times_seen, last_trigger_source
  ) values (
    p_mint, p_symbol, p_name, now(), now(), 1, p_source
  )
  on conflict (token_mint) do update
    set last_seen_at = now(),
        times_seen   = public.holders_intel_seen_tokens.times_seen + 1,
        last_trigger_source = coalesce(p_source, public.holders_intel_seen_tokens.last_trigger_source),
        symbol = coalesce(public.holders_intel_seen_tokens.symbol, excluded.symbol),
        name   = coalesce(public.holders_intel_seen_tokens.name,   excluded.name);
end;
$$;

grant execute on function public.bump_seen_token(text, text, text, text) to anon, authenticated, service_role;
