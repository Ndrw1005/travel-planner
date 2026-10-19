-- Only the authenticated Edge Function's service role accesses provider cache.
create table public.geocode_cache (
  key text primary key,
  results jsonb not null,
  expires_at timestamptz not null
);
alter table public.geocode_cache enable row level security;
revoke all on public.geocode_cache from anon, authenticated;
grant all on public.geocode_cache to service_role;
create index on public.geocode_cache(expires_at);
