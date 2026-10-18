-- Private trips with optimistic concurrency and explicit membership.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public;
create table public.trips (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
 data jsonb not null check (jsonb_typeof(data) = 'object'),
 version integer not null default 1,
 updated_at timestamptz not null default now()
);
create table public.trip_members (
 trip_id uuid references public.trips(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade,
 primary key(trip_id,user_id)
);
create table private.invitations (
 token uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 email text not null,
 expires_at timestamptz not null default now()+interval '7 days'
);
create function public.is_trip_member(p_trip uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.trips where id=p_trip and owner_id=auth.uid()) or exists(select 1 from public.trip_members where trip_id=p_trip and user_id=auth.uid());
$$;
revoke all on function public.is_trip_member(uuid) from public;
grant execute on function public.is_trip_member(uuid) to authenticated;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
create policy read_trips on public.trips for select to authenticated using(public.is_trip_member(id));
create policy delete_own_trip on public.trips for delete to authenticated using(owner_id=auth.uid());
create policy read_members on public.trip_members for select to authenticated using(public.is_trip_member(trip_id));
-- Writes only through the version-checked function; member/owner IDs cannot be edited by clients.
revoke all on public.trips,public.trip_members from anon,authenticated;
grant select,delete on public.trips to authenticated;
grant select on public.trip_members to authenticated;
create function public.save_trip(p_id uuid,p_data jsonb,p_version integer) returns integer language plpgsql security definer set search_path='' as $$
declare v integer;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 if jsonb_typeof(p_data)<>'object' or (p_data->>'id') is distinct from p_id::text or octet_length(p_data::text)>1000000 then raise exception 'Invalid trip data'; end if;
 if p_version=0 then
  insert into public.trips(id,owner_id,data) values(p_id,auth.uid(),p_data);
  return 1;
 end if;
 if not public.is_trip_member(p_id) then raise exception 'Access denied'; end if;
 update public.trips set data=p_data,version=version+1,updated_at=now() where id=p_id and version=p_version returning version into v;
 if v is null then raise exception 'Another traveler changed this trip. Export your edits and reload before merging.'; end if;
 return v;
end; $$;
create function public.invite_trip(p_trip uuid,p_email text) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid;
begin
 if not exists(select 1 from public.trips where id=p_trip and owner_id=auth.uid()) then raise exception 'Only the owner can invite'; end if;
 if length(p_email)>254 or position('@' in p_email)=0 then raise exception 'Invalid email'; end if;
 insert into private.invitations(trip_id,email) values(p_trip,lower(trim(p_email))) returning token into t;
 return t;
end; $$;
create function public.accept_invite(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare invitation private.invitations;
begin
 select * into invitation from private.invitations where token=p_token and expires_at>now() and email=lower(auth.jwt()->>'email') for update;
 if invitation.token is null or auth.uid() is null then raise exception 'Invalid, expired, or different-email invitation'; end if;
 insert into public.trip_members values(invitation.trip_id,auth.uid()) on conflict do nothing;
 delete from private.invitations where token=p_token;
end; $$;
revoke all on function public.save_trip(uuid,jsonb,integer),public.invite_trip(uuid,text),public.accept_invite(uuid) from public;
grant execute on function public.save_trip(uuid,jsonb,integer),public.invite_trip(uuid,text),public.accept_invite(uuid) to authenticated;
create table public.observations (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips(id) on delete cascade,
 watch_id uuid not null,item_key text not null,kind text not null check(kind in ('flight','hotel')),
 name text not null,amount numeric not null check(amount>=0),currency text not null,
 observed_at timestamptz not null default now(),source text not null,basis text not null,notes text not null default '',url text,
 basis_key text not null
);
create index observations_history on public.observations(trip_id,watch_id,observed_at desc);
create table public.alerts (
 id uuid primary key default gen_random_uuid(),trip_id uuid not null references public.trips(id) on delete cascade,
 fingerprint text not null unique,message text not null,created_at timestamptz not null default now()
);
alter table public.observations enable row level security;
alter table public.alerts enable row level security;
create policy read_prices on public.observations for select to authenticated using(public.is_trip_member(trip_id));
create policy read_alerts on public.alerts for select to authenticated using(public.is_trip_member(trip_id));
revoke all on public.observations,public.alerts from anon,authenticated;
grant select on public.observations,public.alerts to authenticated;
create table private.request_limits(key text primary key,window_start timestamptz not null default now(),count integer not null default 0);
create table private.watch_runs(watch_id uuid primary key,last_attempt timestamptz not null default now(),last_success timestamptz,error text);
-- Atomic budget gate: callers cannot reset their window or increase their allowance.
create function public.consume_request(p_key text,p_limit integer,p_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 insert into private.request_limits(key,count) values(p_key,1) on conflict(key) do update set
 count=case when private.request_limits.window_start<now()-make_interval(secs=>p_seconds) then 1 else private.request_limits.count+1 end,
 window_start=case when private.request_limits.window_start<now()-make_interval(secs=>p_seconds) then now() else private.request_limits.window_start end returning count into n;
 return n<=p_limit;
end; $$;
create function public.claim_watch(p_id uuid,p_hours integer) returns boolean language plpgsql security definer set search_path='' as $$
declare found_id uuid;
begin
 insert into private.watch_runs(watch_id) values(p_id) on conflict(watch_id) do update set last_attempt=now()
 where private.watch_runs.last_attempt<now()-make_interval(hours=>greatest(12,p_hours)) returning watch_id into found_id;
 return found_id is not null;
end; $$;
revoke all on function public.consume_request(text,integer,integer),public.claim_watch(uuid,integer) from public,anon,authenticated;
grant execute on function public.consume_request(text,integer,integer),public.claim_watch(uuid,integer) to service_role;
-- No public storage bucket: booking documents remain external private links.
create table public.monitor_status (
 watch_id uuid primary key,trip_id uuid not null references public.trips(id) on delete cascade,
 last_attempt timestamptz not null default now(),last_success timestamptz,error text
);
alter table public.monitor_status enable row level security;
create policy read_monitor_status on public.monitor_status for select to authenticated using(public.is_trip_member(trip_id));
revoke all on public.monitor_status from anon,authenticated;
grant select on public.monitor_status to authenticated;
