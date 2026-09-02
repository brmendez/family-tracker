-- supabase/tests/verify_ft19_group_visibility_overrides.sql
-- FT-19 verification script: group_visibility_overrides table + RLS
--
-- Runs 5 scenarios from ARCHITECTURE.md's FT-19 verification section:
-- (a) No override row, B sees A's location
-- (b) Hide with future expiry, B's next fetch shows A gone
-- (c) After expiry passes, A visible again with no new row
-- (d) Indefinite hide stays hidden until unhide
-- (e) Self always sees own location regardless of hide row
--
-- Usage: Run this script in Supabase SQL editor AFTER applying migration 0014.
-- It creates temporary test users/group, verifies all 5 scenarios with
-- RAISE EXCEPTION on failure, then cleans itself up.

-- ============================================================================
-- Setup: Create two test users and a shared group
-- ============================================================================
--
-- profiles.id is a real FK to auth.users(id) (see 0001_profiles.sql) — a
-- plain insert with a made-up UUID would fail with a foreign key
-- violation. `session_replication_role = replica` disables constraint
-- trigger enforcement (FKs + the handle_new_user trigger) for this
-- session only, so these test-only profile rows can exist without a
-- matching auth.users row. Must run this whole script as a superuser
-- (Supabase SQL editor's default connection) — only a superuser may set
-- this. Restored to 'origin' immediately after setup; RLS itself is
-- unaffected either way since setup runs before any `set local role`.
set session_replication_role = replica;

-- Create test user A (will be hidden in some scenarios)
insert into public.profiles (id, display_name, avatar_color)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'Test User A',
  '#FF0000'
);

-- Create test user B (will be the viewer in most scenarios)
insert into public.profiles (id, display_name, avatar_color)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  'Test User B',
  '#0000FF'
);

-- Create a test group
insert into public.groups (id, name, created_by)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
  'Test Group',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
);

-- Add both users to the group
insert into public.group_members (group_id, user_id, role)
values
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'owner'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'member');

-- Insert test location history for both users
insert into public.location_history (id, user_id, latitude, longitude, recorded_at)
values
  ('dddd1111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 40.7128, -74.0060, now()),
  ('dddd2222-2222-2222-2222-222222222222'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 40.7580, -73.9855, now());

set session_replication_role = origin;

-- ============================================================================
-- Scenario (a): No override row, B sees A's location
-- ============================================================================

do $$
declare
  v_can_see_count int;
begin
  -- Set session for user B to test RLS
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text, true);

  -- User B should see user A's location (no hide row exists yet)
  select count(*)
  into v_can_see_count
  from public.location_history
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  if v_can_see_count != 1 then
    raise exception 'Scenario (a) FAILED: B should see A''s location (no override row). Count: %', v_can_see_count;
  end if;

  raise notice 'Scenario (a) PASSED: No override row, B sees A''s location';
  reset role;
end $$;

-- ============================================================================
-- Scenario (b): Hide with future expiry, B's next fetch shows A gone
-- ============================================================================

do $$
declare
  v_can_see_count int;
begin
  -- Insert a hide row for A in the test group, expiring in 5 minutes
  -- created_at is set explicitly via clock_timestamp() (the real wall
  -- clock), not the column default — now() is frozen to this whole
  -- script's single transaction start time, so every row inserted here
  -- would otherwise get an identical created_at, making the "latest row"
  -- ordering that is_hidden_from_group relies on ambiguous.
  insert into public.group_visibility_overrides (id, group_id, user_id, event_type, expires_at, created_at)
  values (
    'eeee0001-0001-0001-0001-000100010001'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'hide',
    now() + interval '5 minutes',
    clock_timestamp()
  );

  -- Set session for user B
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text, true);

  -- User B should NOT see user A's location (hide is active)
  select count(*)
  into v_can_see_count
  from public.location_history
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  if v_can_see_count != 0 then
    raise exception 'Scenario (b) FAILED: B should not see A''s location (hide active). Count: %', v_can_see_count;
  end if;

  raise notice 'Scenario (b) PASSED: Hide with future expiry, B cannot see A';
  reset role;
end $$;

-- ============================================================================
-- Scenario (c): After expiry passes, A visible again (no new row needed)
-- ============================================================================

do $$
declare
  v_can_see_count int;
begin
  -- Update the hide row to expire in the past (simulates time passage)
  update public.group_visibility_overrides
  set expires_at = now() - interval '1 second'
  where group_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
    and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid
    and event_type = 'hide';

  -- Set session for user B
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text, true);

  -- User B should see user A's location again (hide expired, no new row needed)
  select count(*)
  into v_can_see_count
  from public.location_history
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  if v_can_see_count != 1 then
    raise exception 'Scenario (c) FAILED: B should see A''s location after expiry. Count: %', v_can_see_count;
  end if;

  raise notice 'Scenario (c) PASSED: After expiry, A visible again (no new row needed)';
  reset role;
end $$;

-- ============================================================================
-- Scenario (d): Indefinite hide stays hidden until unhide
-- ============================================================================

do $$
declare
  v_can_see_count int;
begin
  -- Insert an indefinite hide (expires_at = null)
  insert into public.group_visibility_overrides (id, group_id, user_id, event_type, expires_at, created_at)
  values (
    'eeee0002-0002-0002-0002-000200020002'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'hide',
    null,
    clock_timestamp()
  );

  -- Set session for user B
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text, true);

  -- User B should NOT see user A's location (indefinite hide is active)
  select count(*)
  into v_can_see_count
  from public.location_history
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  if v_can_see_count != 0 then
    raise exception 'Scenario (d) FAILED: B should not see A''s location (indefinite hide). Count: %', v_can_see_count;
  end if;

  -- Drop back to superuser before writing — group_visibility_overrides
  -- has no insert grant for `authenticated` (write access is RPC-only,
  -- added later by FT-20), so this insert must not run as B.
  reset role;

  -- Insert an unhide row
  insert into public.group_visibility_overrides (id, group_id, user_id, event_type, expires_at, created_at)
  values (
    'eeee0003-0003-0003-0003-000300030003'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'unhide',
    null,
    clock_timestamp()
  );

  -- Set session for user B again (refresh the read)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')::text, true);

  -- User B should now see user A's location (unhide took effect)
  select count(*)
  into v_can_see_count
  from public.location_history
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  if v_can_see_count != 1 then
    raise exception 'Scenario (d) FAILED: B should see A''s location after unhide. Count: %', v_can_see_count;
  end if;

  raise notice 'Scenario (d) PASSED: Indefinite hide stays hidden until unhide';
  reset role;
end $$;

-- ============================================================================
-- Scenario (e): Self always sees own location regardless of hide row
-- ============================================================================

do $$
declare
  v_can_see_count int;
begin
  -- Insert another hide row for A (they're now hidden from the group again)
  insert into public.group_visibility_overrides (id, group_id, user_id, event_type, expires_at, created_at)
  values (
    'eeee0004-0004-0004-0004-000400040004'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'hide',
    now() + interval '1 hour',
    clock_timestamp()
  );

  -- Set session for user A (self)
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')::text, true);

  -- User A should always see their own location, even while hidden from others
  select count(*)
  into v_can_see_count
  from public.location_history
  where user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  if v_can_see_count != 1 then
    raise exception 'Scenario (e) FAILED: A should see their own location despite hide row. Count: %', v_can_see_count;
  end if;

  raise notice 'Scenario (e) PASSED: Self always sees own location regardless of hide row';
  reset role;
end $$;

-- ============================================================================
-- Cleanup: Remove test users, group, and overrides
-- ============================================================================

do $$
begin
  -- Delete in reverse order of foreign key dependencies
  delete from public.group_visibility_overrides
  where group_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
    or user_id in (
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
    );

  delete from public.location_history
  where user_id in (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  );

  -- FT-11's group_members_prevent_ownerless_leave trigger (BEFORE DELETE,
  -- FOR EACH ROW) blocks removing the owner's row while another member's
  -- row still exists. A single blanket DELETE for the whole group doesn't
  -- guarantee row-processing order, so the non-owner (B) must be deleted
  -- explicitly before the owner (A).
  delete from public.group_members
  where group_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
    and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid;

  delete from public.group_members
  where group_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid
    and user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid;

  delete from public.groups
  where id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid;

  delete from public.profiles
  where id in (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid
  );

  raise notice 'Test cleanup complete';
end $$;

-- ============================================================================
-- Summary
-- ============================================================================

do $$
begin
  raise notice '';
  raise notice '========================================';
  raise notice 'FT-19 Verification Complete';
  raise notice '========================================';
  raise notice 'All 5 scenarios passed:';
  raise notice '  (a) No override row - B sees A';
  raise notice '  (b) Hide with expiry - B cannot see A';
  raise notice '  (c) After expiry - A visible again';
  raise notice '  (d) Indefinite hide - hidden until unhide';
  raise notice '  (e) Self always sees own location';
  raise notice '========================================';
end $$;
