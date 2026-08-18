# Family Tracker — Architecture & Ticket Roadmap

Product Owner: Brian. Delivery pipeline: Mobile Architect (tickets) → Mobile Senior Developer (implementation) → Code Reviewer.

## Stack (locked, do not revisit)
- Expo + TypeScript, **iOS only** for now (`react-native-maps`)
- Supabase: auth, Postgres, realtime subscriptions
- **Dev build required starting FT-4** (`react-native-maps` is a native module Expo Go doesn't bundle — this was locked in by the stack decision above, earlier than originally documented here). FT-1–FT-3 were Expo-Go-compatible in principle since they never rendered a map, but in practice this project moved to a dev build early due to an unrelated Expo Go/SDK version mismatch. Either way, from FT-4 on, a dev build is required regardless.
- No monorepo, no web app

## Folder structure
```
app/                # Expo Router — routes only, no business logic
  _layout.tsx
  (auth)/            # sign-in, sign-up (FT-2)
  (app)/
    map/             # FT-4
    groups/          # v2
    history/         # v5

features/            # one folder per feature: components/, hooks/, types/
  auth/  map/  groups/  geofencing/  visibility/  history/  activity/

shared/               # only things used by 2+ features
  components/  hooks/  types/

context/
  auth.context.tsx     # AuthProvider (FT-2)
  groups.context.tsx   # GroupsProvider (v2) — active group selection, per-group switcher (see #4)

lib/
  supabase.ts   # Supabase client (FT-1)
  constants.ts  # location thresholds etc.
```

## Decisions confirmed by PO

| # | Question | Answer |
|---|---|---|
| 1 | Group permissions | Any member can invite. Owner can remove members. Only owner can rename/delete the group. |
| 2 | Last member leaves a group | Auto-delete the group (cascades geofences, invites, visibility overrides for that group). |
| 3 | Invite mechanism | **Locked (2026-08-18):** email-match-at-signup for now — invite by email, no token; app auto-matches pending invites to the signed-up email at signup. A true tap-to-join link (deferred deep link via e.g. Branch.io) is the ideal long-term UX but only pays for itself once the app is actually distributed via the App Store (deferred deep links exist to survive the install round-trip, which is moot pre-publish). To keep that path additive rather than a rework later, FT-9's `invites` row should include a nullable `token` column now, even though only the email-match path is implemented — the membership-grant logic should be reusable by either "email matched at signup" or "token resolved from a link" trigger, not hardcoded to email lookup only. Estimated LOE to add the link path later: low-to-moderate, mostly native/config work (deep-link SDK, associated domains entitlement, hosted `apple-app-site-association`) — the membership logic itself is reused as-is. Both mechanisms may coexist long-term (different sharing flows, not redundant), but only email-match is being built now. |
| 4 | Multi-group map view | Per-group filter/switcher, not a combined view. `GroupsProvider` holds `activeGroupId`. |
| 5 | "All day" invisibility duration | Until local midnight (device timezone, computed server-side via RPC to avoid clock skew). |
| 6 | Global invisibility toggle | Single global flag, checked **before** any per-group logic — not a convenience action that writes to every group. |
| 7 | v5 playback scope | Any group member can play back **any other member's** historical route within a shared group — not self-only. Must respect v4's visibility windows *as they were at that historical time*. This means **v5 is blocked by v2 and v4, not just v1's schema.** |
| 8 | v1 password reset | Out of scope for v1 (2 known users, self-serviceable via Supabase dashboard). In scope starting v2, once groups introduce users outside the household. |
| 9 | v6 speed/duration thresholds | **Deferred** — revisit when v6 starts. |

## Locked schema consequence (from #6 + #7 combined)
Answer #7 means "was this person hidden from this group at 3pm last Tuesday" has to be answerable later, not just "are they hidden right now." A simple current-state flag that gets overwritten on every hide/unhide can't answer that. So **both the per-group visibility override (v4) and the global visibility flag (v4) must be event-sourced (append-only log of hide/unhide events)**, same pattern as `location_history` already uses, for the same reason. This is locked in for FT-19/FT-21 below — do not implement as a simple upsert row.

---

## V1 — Live Family Map
*Just the PO and his wife, hardcoded, everyone sees everyone. No groups yet.*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-1 | Project scaffold: Expo Router migration, Supabase client (`lib/supabase.ts`), env vars, base folder structure | — | ✅ Done |
| FT-2 | Auth — email/password sign up/sign in, `AuthProvider`, `profiles` table + signup trigger, session persistence | FT-1 | ✅ Done |
| FT-3 | Foreground location permission flow (request, granted, denied + Settings deep link, ask-again) | FT-1 | ✅ Done |
| FT-4 | Map screen showing your own location (local only, no backend write yet) | FT-3 | ✅ Done |
| FT-5 | Write own location to `location_history` (append-only, includes `speed_mps`/`heading_deg` from day one — this is the schema decision v5/v6 depend on later) | FT-4, FT-2 | ✅ Done |
| FT-6 | Realtime — show the other user's location, updates live via Supabase realtime | FT-5 | ✅ Done |
| FT-28 | Staleness display for the other user's marker — "last seen X ago" label + visual staleness styling once a fix crosses a stale threshold. Correctness/trust fix for FT-6 (see detail below). | FT-6 | ✅ Done |

**v1 is done once FT-6 ships** — that's the actual "we see each other" milestone.

### FT-28 detail — Staleness display for the other user's marker

**Type:** Enhancement (trust/correctness fix — the underlying fetch/subscribe
logic from FT-6 is correct; the problem is that a location from a year ago
and a location from ten seconds ago render identically on the map, with no
signal to the viewer that they might be looking at stale data).

**Why:** `useOtherUserLocation` fetches the single most recent
`location_history` row with no time bound. Because v1 has no background
location writer (background tracking doesn't exist until FT-18, and even
then it's scoped to geofencing, not general position broadcast), the other
user's marker only updates while *they* have the app foregrounded. A closed
app is the normal case, not an edge case — so an unflagged stale marker is a
routine, not rare, trust problem.

**Scope:**
- New constant `LOCATION_STALE_THRESHOLD_MS` in `lib/constants.ts` (recommend
  15 minutes — see rationale below), documented alongside the existing watch
  thresholds, tunable without touching component/hook code.
- New hook in `features/map/hooks/` (e.g. `useLocationStaleness`) that takes
  a `recordedAt` ISO string and derives `{ label: string; isStale: boolean }`.
  Purely derived from the timestamp already returned by `useOtherUserLocation`
  — no new Supabase reads, no changes to the FT-6 fetch/subscribe logic.
  Re-renders on an interval (not a refetch) so the label's relative-time text
  advances even when no new location event arrives.
- `FamilyMap.tsx` (or a small extracted marker subcomponent, if the JSX
  starts crowding) renders the "last seen X ago" label near/on the other
  user's marker, and applies an alternate visual style once `isStale` is
  true.
- Applies only to the other user's marker. The current user's own marker
  never shows a staleness state.

**Out of scope:**
- Any change to `useOtherUserLocation`'s query or realtime subscription
  logic — the data fetch itself is correct and unchanged; this ticket is
  display-only.
- Any schema or RLS change to `location_history`.
- A multi-tier severity system (e.g. "recent" vs "very stale") — a single
  threshold + an always-accurate relative-time label, per the PO's original
  two-part ask.
- Push/local notification when the other user's location goes stale.
- Distinguishing "stationary with app open" from "app closed" — both look
  identical via `recorded_at` alone, since there's no periodic heartbeat
  write while stationary (see `LOCATION_WATCH_DISTANCE_INTERVAL_M`). A
  motionless-but-open session may false-flag as stale; solving that would
  require a heartbeat write regardless of movement, an FT-5-level
  battery/data tradeoff, not part of this ticket.
- Any staleness/gap indicator in v5 playback (FT-22/FT-23) — historical
  route rendering is a separate, not-yet-scoped concern.
- Any change to background tracking cadence or introduction of background
  location writes — that's an FT-18-adjacent, dev-build-line decision.

**On-device verification:** With both accounts signed in, let the other
user's device post at least one live fix, then background/quit the app on
that device. Confirm: (a) the label on their marker shows increasing
relative time ("just now" → "2 minutes ago" → ...) without requiring a new
fix to arrive; (b) once past 15 minutes, the marker visibly changes
appearance (e.g. dims / changes color / gains a border); (c) reopening the
other device's app and letting it post a new fix immediately flips the
marker back to its fresh appearance and resets the label.

**Threshold rationale:** 15 minutes, not the PO's floated >1 hour. Given
`LOCATION_WATCH_TIME_INTERVAL_MS`/`LOCATION_WATCH_DISTANCE_INTERVAL_M`
(5s/10m, foreground-only), the realistic cause of staleness in this app is
"the app isn't open," not GPS lag — >1h would leave a closed-app marker
looking live for up to an hour, close to today's actual bug. Too short a
threshold (e.g. 2 min) would instead false-flag someone standing still with
the app genuinely open, since no new row is written until they move 10m. 15
minutes is generous enough to avoid that false positive in ordinary indoor
movement, while catching a closed app meaningfully faster than an hour.

---

## V2 — Groups & Membership *(blocked by v1)*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-7 | Schema: `groups` + `group_members` (generic, no "family" type — just a suggested default name). Role enforcement per #1. Auto-delete-on-last-leave trigger per #2. | v1 | ✅ Done |
| FT-8 | Create a group, name it (default suggestion "Family") | FT-7 | ✅ Done |
| FT-9 | Invite to group — email-match-at-signup per #3 (reserve nullable `token` column for future deep-link path) | FT-7, FT-8 | ⬜ |
| FT-10 | Accept/decline invite | FT-9 | ⬜ |
| FT-11 | Leave group (auto-delete on last member per #2) | FT-7 | ⬜ |
| FT-12 | Group-scoped location visibility — rewrites `location_history` RLS to require shared group membership; map uses per-group switcher per #4 | FT-6, FT-7 | ⬜ |
| FT-New | Password reset flow (in scope starting here per #8) | FT-2 | ⬜ |

### FT-9 detail — Invite to group (email-match-at-signup)

**Type:** Feature

**Why:** Groups (FT-7) and group creation (FT-8) exist, but there is no way
to get anyone else into a group. Per locked decision #3, invites work by
email match at signup for now: any group member sends an invite by email
while inside a group they belong to; if that email signs up fresh, they're
auto-added as a member. A true tap-to-join deferred deep link is deferred
until App Store distribution, but the `invites` table and membership-grant
logic must be shaped so that path is additive later, not a rework.

**Scope boundary vs. FT-10 (resolved below):** Decision #3 says the app
"auto-matches them to the group(s) they were invited to and adds them as a
member," which only mechanically makes sense for **brand-new signups** — the
DB trigger that would do the matching only fires on profile creation. There
is no equivalent event to hook for an **email that already has an account**.
So the boundary is:
- **New signup matching a pending invite:** membership is granted
  immediately, in the same transaction as profile creation. No confirmation
  step — this is what "adds them as a member" means mechanically. FT-9 owns
  this end-to-end.
- **Existing account matching a pending invite:** no signup event fires, so
  nothing happens automatically. The invite just sits as `status =
  'pending'`. Surfacing that to the already-existing user and letting them
  accept/decline it is entirely **FT-10's job** — FT-9 only has to make sure
  the schema doesn't block it (zero client grants on `invites`, everything
  RPC-mediated, so FT-10 adds its own RPCs without touching FT-9's).

This means the "invited email already has an account vs. doesn't yet"
question doesn't change how `send_invite` behaves at write time (same row
either way) — it only changes which mechanism later resolves the row.

**Schema — `invites` table:**
- `id uuid primary key default gen_random_uuid()`
- `group_id uuid not null references public.groups(id) on delete cascade` —
  cascade is load-bearing, see edge case #3 below.
- `invited_email text not null` — normalized (trim + lowercase) in
  `send_invite` before insert; check constraint is a backstop.
- `invited_by uuid references public.profiles(id) on delete set null` —
  provenance only, not a permission source (any member can invite per #1).
- `token text null` — reserved, unused this ticket. `text`, not `uuid`: a
  future deferred-deep-link provider's token format isn't known yet.
- `status text not null default 'pending' check (status in ('pending',
  'accepted', 'declined'))` — `'declined'` included now even though FT-9
  never sets it, since FT-10 will need it.
- `responded_at timestamptz null` — set when status leaves `'pending'`.
- `created_at timestamptz not null default now()`

Indexes: partial unique `(group_id, invited_email) where status = 'pending'`
(backstop for duplicate-invite edge case; old accepted/declined rows for the
same pair don't block a fresh invite); partial unique `(token) where token
is not null` (free today, avoids a later migration); index supporting the
signup-time lookup on `invited_email`.

RLS / grants: RLS enabled, but **no grants to `authenticated`** — no SELECT/
INSERT/UPDATE/DELETE. All interaction goes through SECURITY DEFINER
functions, same rationale as `groups` having no client INSERT grant. No
policies written now — add them when FT-10 adds the grant they'd gate.

**Server-side logic:**
- `send_invite(p_group_id uuid, p_email text)` RPC, SECURITY DEFINER: checks
  `is_group_member` for the caller, normalizes the email, looks up
  `auth.users` (errors if already a member), treats an existing pending
  invite for the same pair as idempotent rather than erroring, then inserts
  the row.
- `grant_group_membership_from_invite(p_invite_id uuid, p_user_id uuid)`,
  SECURITY DEFINER, internal (no client EXECUTE grant): inserts the
  `group_members` row (`on conflict do nothing`), marks the invite
  `'accepted'` + `responded_at`. This is the reusable core decision #3
  requires — FT-9's signup trigger calls it, and FT-10's future
  `accept_invite` RPC (and any later token-resolution path) should call it
  too rather than reimplementing the grant.
- Auto-match trigger: a new AFTER INSERT trigger **on `public.profiles`**
  (not on `auth.users`, and not folded into FT-2's `handle_new_user()`)
  calling `match_pending_invites_for_new_profile()`, SECURITY DEFINER. Looks
  up the new profile's email via `auth.users`, normalizes it, finds all
  pending invites for that email, calls
  `grant_group_membership_from_invite` for each. Triggering on `profiles`
  rather than `auth.users` avoids both touching FT-2's tested trigger and
  any same-table multi-trigger firing-order fragility — by the time this
  fires, the `profiles` row (and the FK it needs) is guaranteed to exist.
- DB trigger, not an Edge Function: this is a same-database operation with
  no external side effect (no email/SMS/webhook). A trigger keeps membership
  atomic with signup and versioned in `supabase/migrations/`, same as
  `handle_new_user()`.

**Client scope** (mirrors FT-8's `features/groups/` conventions):
- `app/(app)/groups/[id].tsx` — thin route → `GroupDetailScreen`.
- `features/groups/components/GroupDetailScreen.tsx` — shows the group,
  renders `InviteForm`. Reuses `useGroups()` unchanged (finds the matching
  id client-side rather than adding a near-duplicate single-row hook).
  Handles loading + "group not found" (e.g. auto-deleted mid-navigation).
- `features/groups/components/InviteForm.tsx` — mirrors `CreateGroupForm`:
  controlled input, light client-side validation (non-empty +
  `@`/`.` — real validation is server-side), submit + spinner + inline
  error, plus a new inline success state ("Invite sent").
- `features/groups/hooks/useSendInvite.ts` — mirrors `useGroups`'
  `createGroup` shape: `{ sendInvite(email), sending, sendErrorMessage }`,
  calls `supabase.rpc('send_invite', ...)`. No new types file.
- **Touches FT-8's `GroupsScreen.tsx`:** list items become pressable →
  navigate to the new detail route. Additive only, not a refactor of FT-8's
  fetch/display logic.

**Edge cases:**
1. Inviting an email already a member — checked in `send_invite`, friendly
   error, no row created.
2. Inviting the same email twice — DB-level partial unique index backstops
   `send_invite`'s pre-check, which treats it as idempotent.
3. Invite to a group that auto-deletes before acceptance — handled by
   `invites.group_id`'s `on delete cascade`; the later signup simply finds
   no row. Worth an explicit test since it's the interaction of two
   separate tickets' cascades (FT-7 + FT-9), not obviously verified by
   either alone.
4. Case sensitivity — normalized at write time and at signup-match time
   identically, so any casing of a previously-invited address matches.
5. Email has no account yet vs. already has one — mechanically identical at
   write time (same pending row); only the resolution mechanism differs
   (auto-grant on new signup vs. FT-10's future accept/decline).

**Out of scope:**
- Any UI for an existing account to see/accept/decline a pending invite —
  FT-10, entirely. Intentional interim gap: an existing user invited to a
  group sees nothing in-app until FT-10 ships.
- Any transactional email/push/in-app notification of the invite — PO
  communicates out of band for now. Flagged as a real product gap, not
  assumed away.
- A "view/manage sent invites" list (pending invites for a group, revoke) —
  only the one-shot send + inline confirmation ships here.
- Any token/deep-link resolution logic — column is reserved only, per #3.
- Any change to the owner/member role model — invited users always join as
  `'member'`.
- Bulk invite (multiple emails per submission).
- Any change to `useGroups.ts` or `CreateGroupForm.tsx`'s internal logic.

**On-device verification:** From Account A's Groups list, tap into a group,
send an invite to a not-yet-registered email; confirm the inline success
message. Sign up a **new** account using that exact email with different
casing than typed (tests normalization); confirm the group appears in that
account's Groups list immediately after signup, no extra step. Separately,
invite an email already a member, and invite the same email twice —
confirm both produce a friendly inline message, not a crash. Finally,
create a group with a second member, have that member leave (triggering
FT-7's auto-delete) while an invite to a third, not-yet-signed-up email is
still pending, then sign that email up — confirm no error and no group
appears.

---

## V3 — Geofencing *(blocked by v2)*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-13 | Schema: `geofences` + `geofence_events`, group-scoped | FT-7 | ⬜ |
| FT-14 | Create/manage geofence (foreground) | FT-13, FT-12 | ⬜ |
| FT-15 | Push notification infrastructure (shared primitive — reused later by v6) | FT-2 | ⬜ |
| FT-16 | Foreground geofence detection + in-app alert | FT-14, FT-6 | ⬜ |
| FT-17 | Push notification on entry/exit (server-triggered webhook) | FT-15, FT-16 | ⬜ |
| **FT-18** | **Background geofence detection.** Requires the "Always" location permission and background task registration — a bigger native/permissions lift than the dev build requirement itself, which actually started at FT-4. | FT-16, FT-17 | ⬜ |

---

## V4 — Per-Group Visibility Controls *(blocked by v2)*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-19 | Schema: `group_visibility_overrides` — **event-sourced/append-only** (see locked consequence above), RLS layered on top of FT-12 | FT-12 | ⬜ |
| FT-20 | Go invisible to a group (1h/2h/4h/all day = local midnight/indefinite) | FT-19 | ⬜ |
| FT-21 | Global invisible toggle — separate event-sourced table, checked before per-group logic per #6 | FT-19 | ⬜ |

---

## V5 — Journey History / Playback *(blocked by v1's schema AND v2 AND v4 — per #7)*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-22 | Journey history list, date range picker, member selector (any group member, not just self, per #7) | FT-5, FT-12 | ⬜ |
| FT-23 | Route playback animation — redacts any time range where the viewed member was hidden (global or per-group) at that historical timestamp | FT-22, FT-19, FT-21 | ⬜ |

---

## V6 — Speed & Activity Detection *(blocked by v3)*

Building against **Option A (GPS-derived, no new native dependency)** — do not commit to native activity recognition (Option B) without re-checking the library landscape at build time.

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-25 | Schema: speed/heading columns (likely already present from FT-5) + `activity_alerts` table | FT-5 | ⬜ |
| FT-26 | Derive/display activity state (stopped/walking/driving) from GPS history | FT-25 | ⬜ |
| FT-27 | Dangerous-activity flag + notification (reuses FT-15's delivery mechanism). **Thresholds deferred per #9.** | FT-26, FT-15/FT-17 | ⬜ |

---

## Still open
- **#9**: speed/duration thresholds for the dangerous-activity flag — needed before FT-27, not before.
- **#10**: should a group owner be able to explicitly delete a group (vs. the existing auto-delete-on-last-member-leaves behavior from FT-7 being the only way a group goes away)? RLS already permits it (`groups_delete_owner` policy) but no ticket/UI exposes it yet. Not needed before any currently-scoped ticket — flagged during FT-8, not blocking it.
- **Rename a group**: same shape as #10 — FT-7 already granted the owner `update (name)` permission and an owner-only RLS policy (`groups_update_owner`), but no ticket/UI exposes it. Flagged during FT-9 design, not blocking it.
- **Rename yourself (display name)**: `profiles.display_name` is a real, user-editable column (RLS already allows a user to update their own row) — it's not derived from email, that's only the signup fallback when no name is provided. No ticket/UI lets a user change it after joining. Flagged during FT-9 design, not blocking it.

## Other flags worth remembering later
- `location_history` has no retention/pruning policy — revisit before v5 ships at scale.
- `location_history` can receive two rows with the identical `recorded_at` timestamp (down to the millisecond) but different `accuracy` from a single `watchPositionAsync` callback — observed on-device during FT-5 QA (2026-08-04), not reproduced as an app bug (the effect fires once per distinct callback invocation as designed). Likely a CoreLocation quirk delivering two fixes in quick succession with the same GPS timestamp. Harmless today; worth a dedupe pass before v5 playback (FT-22/23) if duplicate-instant points ever cause visible jitter.
- iOS background-location App Store review requires clear in-UX justification (FT-18).
- iOS geofence region monitoring has a practical accuracy floor (~100–150m) — small zones like "front porch" may be unreliable (FT-14).
- Android is explicitly out of scope for the entire roadmap; would need separate handling if ever added.
- **Future: avatar markers.** Eventual direction (not yet scoped to a ticket) is for both yourself and other group members to be represented on the map by profile picture, not a generic pin or the native blue dot — closer to a "chat bubble"/Life360-style avatar marker. This affects FT-4/FT-6 implementation choices now: use a plain `Marker` (customizable) for yourself rather than `MapView`'s `showsUserLocation` blue dot, even though the blue dot is simpler today, so the later upgrade to an avatar image is additive rather than a rework. `profiles.avatar_color` already exists as a placeholder for visual identity (FT-2) — a future `avatar_url` column is the natural next step whenever this gets scoped for real.
- **FT-28's 15-minute staleness threshold is tuned for the current foreground-only reality** (no background location writer exists until FT-18, which is scoped to geofencing only, not general broadcast). If background location tracking is ever broadened beyond FT-18's narrow use case, this threshold should be revisited — a background-tracked app would make "stale" a much rarer, more meaningful signal than it is today.
