-- supabase/migrations/0009_geofences.sql
-- FT-13: geofences + geofence_events — group-scoped zones and an
-- append-only record of enter/exit detections. Schema only, same
-- precedent as FT-7 (0004_groups.sql): FT-14/16/17/18 build on this.

create table if not exists public.geofences (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  -- Plain lat/lng/radius (not PostGIS), matching location_history's
  -- convention and expo-location's startGeofencingAsync region shape
  -- with zero conversion. radius_m in meters, no minimum enforced here —
  -- the iOS region-monitoring accuracy floor is FT-14's UX concern.
  latitude float8 not null,
  longitude float8 not null,
  radius_m float8 not null check (radius_m > 0),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists geofences_group_id_idx
  on public.geofences (group_id);

create table if not exists public.geofence_events (
  id uuid primary key default gen_random_uuid(),
  geofence_id uuid not null references public.geofences (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_type text not null check (event_type in ('enter', 'exit')),
  -- Device-reported detection time, distinct from created_at (server
  -- insert time) — same split as location_history's recorded_at.
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
  -- No denormalized group_id — membership is derived by joining to
  -- geofences.group_id, same pattern as location_history (FT-12).
);

create index if not exists geofence_events_geofence_occurred_at_idx
  on public.geofence_events (geofence_id, occurred_at desc);
create index if not exists geofence_events_user_occurred_at_idx
  on public.geofence_events (user_id, occurred_at desc);

alter table public.geofences enable row level security;
alter table public.geofence_events enable row level security;

-- With "Automatically expose new tables" disabled at the project level,
-- Postgres does not grant table-level privileges to `authenticated` by
-- default. RLS policies below are meaningless without these grants.
grant select, insert, delete on public.geofences to authenticated;
-- Column-level grant — locks down what a client can ever change on this
-- row, even under a permissive policy.
grant update (name, latitude, longitude, radius_m) on public.geofences to authenticated;

-- Append-only, same posture as location_history: no update/delete grant.
grant select, insert on public.geofence_events to authenticated;

drop policy if exists "geofences_select_member" on public.geofences;
create policy "geofences_select_member"
  on public.geofences
  for select
  to authenticated
  using (public.is_group_member(group_id));

-- Any member can create a geofence (parity with invite per decision #1).
drop policy if exists "geofences_insert_member" on public.geofences;
create policy "geofences_insert_member"
  on public.geofences
  for insert
  to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());

-- Only the creator or the group owner can edit/delete, mirroring
-- group_members_delete_self_or_owner. The is_group_member clause is
-- load-bearing: without it, a member who left the group would still
-- satisfy created_by = auth.uid() and retain latent edit/delete rights.
drop policy if exists "geofences_update_creator_or_owner" on public.geofences;
create policy "geofences_update_creator_or_owner"
  on public.geofences
  for update
  to authenticated
  using (public.is_group_member(group_id) and (created_by = auth.uid() or public.is_group_owner(group_id)))
  with check (public.is_group_member(group_id) and (created_by = auth.uid() or public.is_group_owner(group_id)));

drop policy if exists "geofences_delete_creator_or_owner" on public.geofences;
create policy "geofences_delete_creator_or_owner"
  on public.geofences
  for delete
  to authenticated
  using (public.is_group_member(group_id) and (created_by = auth.uid() or public.is_group_owner(group_id)));

drop policy if exists "geofence_events_select_group_member" on public.geofence_events;
create policy "geofence_events_select_group_member"
  on public.geofence_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.geofences g
      where g.id = geofence_id
        and public.is_group_member(g.group_id)
    )
  );

-- A user may only insert their own events, and only for a geofence in a
-- group they belong to.
drop policy if exists "geofence_events_insert_own" on public.geofence_events;
create policy "geofence_events_insert_own"
  on public.geofence_events
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.geofences g
      where g.id = geofence_id
        and public.is_group_member(g.group_id)
    )
  );
