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
| 11 | Cross-group visibility | **Locked (2026-08-20):** each group's membership is its own independent authorization boundary. Sharing group B with someone still lets them see your location even after you remove them from group A — removal from one group never revokes visibility granted by another shared group. The map's per-group switcher (#4) is a display filter only, not a visibility control; it doesn't affect who can see you. |
| 12 | Geofence permissions | **Locked (2026-08-20):** any group member can create a geofence — a non-owner member shouldn't have to ask the owner to add a zone. Only the geofence's creator, or the group owner, can edit/delete it. No admin/co-owner role. |

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
| FT-9 | Invite to group — email-match-at-signup per #3 (reserve nullable `token` column for future deep-link path) | FT-7, FT-8 | ✅ Done |
| FT-10 | Accept/decline invite | FT-9 | ✅ Done |
| FT-11 | Leave group (auto-delete on last member per #2) | FT-7 | ✅ Done |
| FT-12 | Group-scoped location visibility — rewrites `location_history` RLS to require shared group membership; map uses per-group switcher per #4 | FT-6, FT-7 | ✅ Done |
| FT-24 | Password reset flow (in scope starting here per #8). **Note:** lives in this table for historical reasons (was originally flagged here as `FT-New`) but is a parallel-track auth ticket, not Groups & Membership — depends only on FT-2, unaffected by and doesn't affect v2/v3/v4/v5/v6 sequencing. | FT-2 (auth only — independent of FT-7–12) | ⬜ |

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

### FT-10 detail — Accept/decline invite

**Type:** Feature

**Why:** FT-9 only auto-grants membership on a *brand-new* signup matching
a pending invite. An **existing** account with a pending invite has no way
to see or act on it. FT-10 adds that: list a signed-in user's own pending
invites, accept or decline each. Accept reuses FT-9's
`grant_group_membership_from_invite` rather than reimplementing the grant;
decline is new (`status = 'declined'` + `responded_at`, both reserved by
FT-9's schema but unused until now).

**Schema:** No new tables/columns/indexes — `invites.status`'s
`'declined'` value and `responded_at` were reserved for this ticket.

**RLS / grants:** No new grant or policy on `invites` or `groups`. Listing
invites needs each invite's group name, but `groups_select_member` (FT-7)
only lets members read a group row — an invitee isn't one yet, so a raw
client `SELECT` + embed would silently return `groups: null`. Rather than
also widening FT-7's policy, everything stays RPC-mediated (list, accept,
decline), preserving the "no client grants on `invites`" posture FT-9
already established.

**Server-side logic** (new migration `0006_invite_responses.sql`, doesn't
touch `0004_groups.sql`/`0005_invites.sql`):
- `list_my_pending_invites()` — SECURITY DEFINER, resolves caller's email
  via `auth.users`/`auth.uid()` (same pattern as
  `match_pending_invites_for_new_profile`), returns pending invites joined
  live to `group_name`. Omits inviter name (out of scope).
- `accept_invite(p_invite_id)` / `decline_invite(p_invite_id)` — both
  SECURITY DEFINER, both re-check the invite exists, is still `'pending'`,
  and belongs to the caller's email before acting (defense in depth +
  handles the double-response/cascaded-group races in Edge cases below).
  Accept then calls FT-9's `grant_group_membership_from_invite` unchanged.
  Decline must be an RPC, not a raw `UPDATE` grant — otherwise a client
  could set `status = 'accepted'` directly without ever granting
  membership, breaking that invariant.
- All three use the default `PUBLIC` execute grant, like `send_invite`.

**Client scope** (mirrors FT-8/FT-9 conventions, no new route):
- `features/groups/hooks/usePendingInvites.ts` — mirrors `useGroups`'
  shape: `{ invites, loading, errorMessage, refetch, respond, respondingId,
  respondErrorMessage }`. `respond(inviteId, decision)` calls
  `accept_invite`/`decline_invite`, refetches on success so the row just
  drops out (already filtered server-side).
- `features/groups/components/PendingInvitesSection.tsx` — controlled
  props, renders nothing when empty (unlike `GroupsScreen`'s own
  groups-list empty state — this section is incidental, usually empty).
  Per-row Accept/Decline, per-row spinner, per-row inline error.
- **Touches `GroupsScreen.tsx`, additive only**: renders
  `<PendingInvitesSection />` above the groups list. On a successful
  *accept* (not decline), also calls `useGroups()`'s `refetch()` — the two
  hooks are independent, so an accepted invite's new group wouldn't
  otherwise appear without this one bit of cross-hook coordination.

**Edge cases:** invite ID not owned by caller (checked server-side
regardless of what the client passes); double-response race (second call
finds `status != 'pending'`, friendly error); invite's group deleted
between list and tap (cascade removes the row, same "no longer available"
error as above — worth an explicit test since it's FT-7 + FT-9's cleanup
interacting, not obviously covered by either ticket alone); decline
doesn't block a future re-invite (pending-only unique index); multiple
pending invites act independently; accepting into a group already joined
is a harmless no-op via `on conflict do nothing`.

**Out of scope:** inviter display name, any notification on new invite,
changes to `send_invite`/`grant_group_membership_from_invite`/signup
trigger, changes to `groups_select_member` or other FT-7 RLS, revoking a
sent invite, token/deep-link resolution, sign-out UI.

**On-device verification:** Run two iOS Simulator instances concurrently
(no physical second device or sign-out UI needed), Account A signed into
one and an already-registered Account B into the other. A invites B to a
group; confirm B sees the invite with correct group name. B accepts:
invite disappears, group appears in B's list with no manual refresh. A
second invite, declined: disappears, no group added. Two pending at once,
respond to each independently. Separately: A invites not-yet-member B,
then the group auto-deletes (last member leaves) before B responds —
confirm B gets a friendly "no longer available" message, not a crash.

---

### FT-11 detail — Leave group

**Type:** Feature

**Why:** FT-7 already implements the mechanics this ticket exposes:
`group_members_delete_self_or_owner` (RLS) already lets a member delete
their own membership row, and `delete_group_if_empty` (trigger) already
auto-deletes a group once its last member row is gone, cascading
geofences/invites/visibility overrides via each table's own FK (per
decision #2). There is no client affordance to trigger any of that — no
Leave button exists anywhere. FT-11 is therefore mostly a client-facing
ticket (button, confirmation, error handling), plus one new guard the
existing schema doesn't yet enforce: nothing today stops the *owner* from
leaving a group that still has other members, which would leave the group
ownerless (no one can rename/delete it per decision #1's owner-only
checks, since `is_group_owner` would then match nobody).

**Owner-leaves-with-members-remaining — resolved for this ticket, flagged
for the PO:** Decision #1/#2 don't cover this case. Rather than silently
picking an answer (auto-transfer ownership, or letting the group go
ownerless), FT-11 **blocks** it: an owner can only leave a group they're
the sole member of (which then auto-deletes, same as today). If other
members remain, the owner must first remove them (existing FT-7
grant/RLS already permits owner-removes-member, though no UI exposes it
either — separate, unticketed gap) or wait for a future explicit-delete/
ownership-transfer ticket. This is the smallest change that doesn't leave
an invariant broken, but it's a real dead end today (an owner with an
unwanted group and members who won't leave has no way out) — worth
flagging to the PO as a follow-up decision, not assumed resolved by this
ticket alone.

**Schema:** No new tables/columns. FT-7's
`group_members_delete_self_or_owner` RLS policy and
`delete_group_if_empty` trigger (migration `0004_groups.sql`) are reused
unchanged.

**Server-side logic** (new migration `0007_leave_group_owner_guard.sql`):
- New `BEFORE DELETE` trigger on `group_members`,
  `prevent_ownerless_group_leave()`: if the row being deleted has `role =
  'owner'` and any *other* `group_members` row still exists for that
  `group_id`, raises an exception (distinct message the client hook maps
  to a friendly string) instead of allowing the delete. Otherwise
  (non-owner, or owner with no other members left) the delete proceeds
  untouched, and FT-7's existing `AFTER DELETE` trigger handles cleanup
  as it already does.
- No RPC needed — the client uses the same raw `group_members` delete the
  RLS policy already permits; this new trigger is the only addition.

**Client scope** (mirrors FT-9/FT-10's `features/groups/` conventions, no
new route):
- `features/groups/hooks/useLeaveGroup.ts` — `{ leaveGroup(groupId),
  leaving, leaveErrorMessage }`. Calls `supabase.from('group_members')
  .delete()` filtered to the caller's own row; maps the owner-guard's
  Postgres error to a friendly message, distinct from a generic failure
  message.
- **Touches `GroupDetailScreen.tsx` (FT-9), additive only:** adds a
  "Leave group" button, native `Alert.alert` destructive confirmation
  before calling `leaveGroup`, inline error on failure. On success, calls
  the screen's existing `useGroups()` `refetch()` (same cross-hook
  coordination FT-10 established) and navigates back to the groups list.
- No changes to `GroupsScreen.tsx`, `useGroups.ts`, or FT-9/FT-10's
  hooks/components beyond the one additive button above.

**Edge cases:**
1. Sole member (owner or not) leaves — trigger allows it, FT-7's cascade
   deletes the group as designed; client has already navigated away,
   doesn't rely on the "not found" state.
2. Owner leaves with others remaining — blocked server-side (defense in
   depth, not just a client-side disable) with a friendly inline error.
3. Non-owner leaves a group with others remaining — unaffected by the new
   trigger, works as FT-7 already allows.
4. Concurrent last-two-members-leave race — already covered by FT-7's
   per-row `AFTER DELETE` semantics (documented in `0004_groups.sql`),
   not new to this ticket.
5. Leaving while another screen still references the group (e.g.
   background tab) — same "group not found" handling FT-9 already built
   into `GroupDetailScreen.tsx` for the auto-delete-mid-navigation case.

**Out of scope:**
- Owner-initiated explicit group delete (#10, "Still open") — separate
  concern, not this ticket.
- Ownership transfer — no mechanism exists to hand off `role = 'owner'`
  to another member; the owner-guard above blocks the problematic case
  rather than solving it. Worth its own future ticket if it becomes a
  real need.
- Owner-remove-member UI — RLS/grant already permit it
  (`group_members_delete_self_or_owner`'s owner branch), but no button
  exists; flagging alongside this ticket, not building it here.
- Any change to `useGroups.ts`, `GroupsScreen.tsx`, invite tables/RPCs, or
  FT-7's RLS policies beyond the one new trigger.

**On-device verification:** Two Simulator instances, Account A owns a
group Account B has joined. From B's device, open the group, tap Leave,
confirm the dialog, confirm B lands back on their (now empty) groups list
and the group is gone from B's list; confirm A still sees the group with
B removed. Then, from A's device (the owner) with only A remaining in
that group, tap Leave, confirm, confirm the group disappears from A's
list too (auto-delete). Separately, create a second group with A as owner
and B still a member, and confirm A tapping Leave produces an inline
error and the group is untouched.

---

### FT-12 detail — Group-scoped location visibility

**Type:** Feature

**Why:** `location_history`'s SELECT policy (`0002_location_history.sql`) is
still `using (true)` — every authenticated user can read every row, a v1
hardcode that predates groups entirely (its own comment already flags this:
"narrows in FT-12 — not this ticket's concern," referring to itself).
Likewise `useOtherProfile`/`useOtherUserLocation` hardcode "the one other
profile" — `useOtherProfile`'s own comment says a third profile's result is
"undefined... accepted v1 limitation" pending this ticket. FT-12 replaces
both: RLS narrows to shared group membership, and the map generalizes from
"the other user" to "the active group's other members," switchable per
decision #4.

**Schema:** No new tables/columns. One new SECURITY DEFINER helper
alongside FT-7's `is_group_member`/`is_group_owner`.

**RLS / grants** (new migration `0008_group_scoped_location_visibility.sql`,
doesn't touch `0002_location_history.sql`):
- `public.shares_group_with(p_user_id uuid) returns boolean` — stable,
  pinned `search_path`, same hardening as FT-7's helpers. Existing
  `is_group_member(group_id)` checks membership in *one named* group; this
  checks "is there *any* group both `auth.uid()` and `p_user_id` belong
  to" — a genuinely different predicate FT-7 doesn't provide, needed here.
- Drops `location_history_select_authenticated`; replaces with
  `location_history_select_shared_group_member`: `using (auth.uid() =
  user_id or public.shares_group_with(user_id))`. The self-clause is
  load-bearing, not redundant — a user in zero groups must still always
  read their own rows.
- No grant changes (`select, insert` to `authenticated` already exists);
  INSERT policy (own rows only) is untouched.
- No new index — `group_members`'s existing PK `(group_id, user_id)` and
  `group_members_user_id_idx` (both from FT-7) already cover the join.

**RLS scope — confirmed by PO, locked as decision #11:** the policy gates
on *any* shared group, not the caller's currently-*active* one. Two users
who share Group A and B can always see each other's location, even while
one has Group B selected in the switcher — the switcher is a display
filter, not an authorization boundary, and each group's membership is an
independent visibility grant (removing someone from Group A does not
revoke visibility they still have via shared Group B).

**Client scope:**
- `context/groups.context.tsx` (new) — `GroupsProvider`. Runs its own
  minimal `group_members` → `groups` query (`id, name, joined_at` only) on
  mount, exposing `{ groups, activeGroupId, setActiveGroupId, loading,
  errorMessage, refetchGroups }`. Persists `activeGroupId` via the
  project's existing `@react-native-async-storage/async-storage` dependency
  (already used by `lib/supabase.ts` for session persistence, same
  read-on-mount/write-on-change pattern): on mount, reads the stored id and
  uses it if it's still present in the fresh `groups` fetch; `setActiveGroupId`
  writes through to storage as well as state. Falls back to the
  earliest-joined group whenever there's no stored id, or the stored id is
  null/no longer present in a fresh fetch (covers first load and having
  left/lost access to the previously-active group). Deliberately does
  **not** reuse `features/groups/hooks/useGroups.ts`
  — same layering precedent as `AuthProvider` fetching its own `profiles`
  row directly rather than depending on a feature hook; context is a lower
  layer than features and shouldn't import from one. `useGroups.ts` is
  unchanged, still owns the richer groups-management screens.
- `app/(app)/_layout.tsx` — touched, additive only: wraps the existing
  `Stack` in `<GroupsProvider>`. No header/route logic changes. Mounting it
  here (not root `_layout.tsx`) means it naturally remounts fresh on
  sign-out/sign-in via the existing `Stack.Protected` swap — no manual
  reset logic needed.
- `features/map/hooks/useActiveGroupMembers.ts` (new, **replaces**
  `useOtherProfile.ts`, deleted) — given `activeGroupId`, fetches
  `group_members` joined to `profiles` for that group excluding self:
  `{ id, displayName, avatarColor }[]`. Refetches on screen focus (new
  pattern for this screen, mirrors `GroupsScreen`'s FT-11 focus-refetch).
- `features/map/hooks/useGroupMemberLocations.ts` (new, **replaces**
  `useOtherUserLocation.ts`, deleted) — given `memberIds: string[]`: one
  initial query (`.in('user_id', memberIds)`, reduced client-side to
  latest per id), then **one** realtime channel subscribed to
  `postgres_changes` INSERT on `location_history` with **no row filter** —
  RLS (this ticket's new policy) already scopes which INSERTs the
  subscriber ever receives, so an unfiltered channel is both simpler than
  N per-member channels and correctly bounded by the same authorization
  the client uses for reads. Events for ids outside the current
  `memberIds` set are ignored client-side. Effect resets on `memberIds`
  change (mirrors `useOtherUserLocation`'s per-id cleanup). Returns `{
  locations: Record<string, OtherUserLocation>, loading, errorMessage }`.
- `features/map/components/GroupSwitcher.tsx` (new) — controlled props
  (`groups`, `activeGroupId`, `onSelect`); renders nothing when
  `groups.length < 2` (a single-group household sees no switcher chrome).
- `FamilyMap.tsx` — rewritten to compose `useGroupsContext()` +
  `useActiveGroupMembers(activeGroupId)` + `useGroupMemberLocations`,
  rendering `<GroupSwitcher>` plus one `<OtherUserMarker>` per member with
  a known location. `OtherUserMarker.tsx` and `useLocationStaleness.ts`
  (FT-28) are reused unchanged, just applied per-member now instead of to
  one hardcoded other user. Empty-state copy changes from "Waiting for
  {name}'s first update" to a generic "No other members here yet" (zero
  members) / "Join or create a group to see family members" (zero groups)
  — own marker always renders regardless.

**Edge cases:**
1. No shared group between two users (including v1's original pair, if
   they aren't already in a common group) — marker simply doesn't appear;
   not a bug, but a real behavior cliff the moment this migration ships.
2. Active group has no other members — own marker only, empty-state text.
3. Zero groups at all — switcher hidden, own marker only.
4. Switching `activeGroupId` — member list and locations fully reset (not
   merged), no stale markers bleed across groups.
5. Leaving/joining the active group, or a new member joining, while the
   map is open — not live; resolves on next focus of the map screen via
   the same refetch-on-focus pattern, not mid-session. Acceptable, flagged
   rather than solved live (no `group_members` realtime subscription here).
6. Stored `activeGroupId` points to a group the user has since left —
   falls back to earliest-joined, same as having no stored id at all.

**Out of scope:**
- Per-group/global invisibility overrides (FT-19/20/21) — this ticket is
  authorization (shared group or not), not hide/unhide semantics.
- Historical/playback visibility (FT-22/23) — only the live latest-location
  read path is touched.
- Any change to `location_history` INSERT policy, grants, or
  `useLocationHistoryWriter`.
- Group create/join/invite/leave UI — unchanged from FT-8/9/10/11; the
  switcher only selects among groups the user is already in.

**On-device verification:** With Accounts A and B both already in their
existing "Family" group, confirm the map behaves as before (each sees the
other's live marker, no switcher chrome — only one group). Create a second
group on A containing only A; confirm the switcher now appears on A's map,
and selecting the new group shows A's own marker with no others. Switch
back to "Family," confirm B reappears. Have B leave "Family" (FT-11), then
on A's device navigate away from and back to the map screen — confirm B's
marker disappears without an app restart. Confirm A's own marker is always
visible in every group, including the solo one. Separately, with the solo
group selected, force-quit and relaunch the app — confirm it reopens on
the solo group, not back to "Family."

---

## V3 — Geofencing *(blocked by v2)*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-13 | Schema: `geofences` + `geofence_events`, group-scoped | FT-7 | ✅ Done |
| FT-14 | Create/manage geofence (foreground) | FT-13, FT-9 | ⬜ |
| FT-14b | Autocomplete upgrade for geofence address search (FT-14 already ships exact-match search + map long-press) | FT-14 | ⬜ |
| FT-15 | Push notification infrastructure (shared primitive — reused later by v6) | FT-2 | ⬜ |
| FT-16 | Foreground geofence detection + in-app alert | FT-14, FT-6 | ⬜ |
| FT-17 | Push notification on entry/exit (server-triggered webhook) | FT-15, FT-16 | ⬜ |
| **FT-18** | **Background geofence detection.** Requires the "Always" location permission and background task registration — a bigger native/permissions lift than the dev build requirement itself, which actually started at FT-4. | FT-16, FT-17 | ⬜ |

### FT-13 detail — Schema: `geofences` + `geofence_events`, group-scoped

**Type:** Chore (schema/infra — no user-facing surface; pure Postgres foundation for FT-14/FT-16/FT-18)

**Why:** v3 needs a group-scoped concept of "zones" (FT-14 builds create/manage UI on top) and an append-only record of entry/exit detections (FT-16/18 write to it, FT-17 reacts to it). Neither exists yet. FT-13 is schema-only, same precedent as FT-7 (`groups`/`group_members`): land tables, constraints, and RLS now so every consuming ticket builds on a stable foundation.

**Schema — `geofences`:**
- `id uuid primary key default gen_random_uuid()`
- `group_id uuid not null references public.groups(id) on delete cascade`
- `name text not null check (char_length(btrim(name)) > 0)`
- `latitude float8 not null`, `longitude float8 not null` — plain columns (not PostGIS), matching `location_history`'s convention and `expo-location`'s `startGeofencingAsync` region shape (`{ latitude, longitude, radius }`) with zero conversion.
- `radius_m float8 not null check (radius_m > 0)` — meters, matching the native API's unit. No minimum-radius constraint at the DB level: the ~100–150m iOS region-monitoring accuracy floor is a detection-reliability/UX concern for FT-14's form, not a data-integrity concern.
- `created_by uuid references public.profiles(id) on delete set null`
- `created_at timestamptz not null default now()`

Index: `geofences_group_id_idx on (group_id)`.

**Schema — `geofence_events`:**
- `id uuid primary key default gen_random_uuid()`
- `geofence_id uuid not null references public.geofences(id) on delete cascade`
- `user_id uuid not null references public.profiles(id) on delete cascade`
- `event_type text not null check (event_type in ('enter', 'exit'))`
- `occurred_at timestamptz not null` — device-reported detection time, distinct from `created_at` (server insert time), same split as `location_history`.
- `created_at timestamptz not null default now()`

Indexes: `(geofence_id, occurred_at desc)`, `(user_id, occurred_at desc)`.

No denormalized `group_id` column on `geofence_events` — membership is derived by joining to `geofences.group_id`, same pattern as `location_history` deriving visibility without its own `group_id` (FT-12).

**RLS / grants** (new migration `0009_geofences.sql`): `geofences` has a real `group_id` column, so FT-7's `is_group_member`/`is_group_owner` apply directly — no new helper needed.
- `geofences`: `select`/`insert`/`delete` to `authenticated`; column-level `update (name, latitude, longitude, radius_m)`.
  - `geofences_select_member`: `using (is_group_member(group_id))`.
  - `geofences_insert_member`: `with check (is_group_member(group_id) and created_by = auth.uid())`.
  - `geofences_update_creator_or_owner` / `geofences_delete_creator_or_owner`: `using (is_group_member(group_id) and (created_by = auth.uid() or is_group_owner(group_id)))` — the `is_group_member` clause is load-bearing: without it, a member who has since left the group would still satisfy `created_by = auth.uid()` and retain latent edit/delete rights on a group they can no longer see.
- `geofence_events` (append-only, same posture as `location_history`): `select`/`insert` to `authenticated`, no update/delete grant.
  - `geofence_events_select_group_member`: `using (exists (select 1 from public.geofences g where g.id = geofence_id and is_group_member(g.group_id)))`.
  - `geofence_events_insert_own`: `with check (user_id = auth.uid() and exists (select 1 from public.geofences g where g.id = geofence_id and is_group_member(g.group_id)))`.

**Server-side logic:** None — raw grants + RLS `with check` cover both tables, no multi-table atomicity requirement, so no SECURITY DEFINER RPC needed.

**Client scope:** None. Creating/managing geofences is FT-14; writing `geofence_events` from detected enter/exit is FT-16/FT-18.

**Permission model — locked by PO (2026-08-20):** **any member can create** a geofence (parity with invite per #1 — a non-owner member shouldn't have to ask the owner to add a zone); **only its creator or the group owner can edit/delete it** (new "self or owner" shape, mirroring `group_members_delete_self_or_owner`). No admin/co-owner role — out of scope for now, not needed to satisfy this requirement.

**Edge cases:**
1. Non-member create/read/update/delete — blocked by RLS at every policy.
2. Last member leaves → group auto-deletes (decision #2) → cascades `geofences` → cascades `geofence_events`. Two FK hops, worth an explicit test.
3. Creator leaves the group but it persists — loses `is_group_member`, so loses select **and** edit/delete rights; the geofence itself is untouched and still editable by the owner.
4. Creator's account deleted — `created_by` goes null; edit/delete rights then rest solely on `is_group_owner`.
5. Rapid duplicate enter/exit events from native geofencing false triggers — no dedupe/uniqueness constraint at this layer, same accepted posture as `location_history`'s duplicate-timestamp quirk.

**Out of scope:** create/edit/list UI (FT-14); foreground/background detection logic (FT-16, FT-18); push notification on entry/exit (FT-17); event dedupe/debounce; radius validation/accuracy-floor UX (FT-14's concern); any ownership-transfer mechanism (same open gap class as FT-11).

**Verification (schema-only, no client to run on-device):** apply the migration locally, then confirm the RLS matrix directly against two seeded accounts sharing one group plus a third account in no shared group: (a) the third account cannot select/insert/update/delete a geofence in the shared group; (b) a non-creator member can create a geofence but cannot update/delete another member's; (c) the group owner can update/delete any geofence in their group regardless of creator; (d) an account that leaves the group loses select on geofences it created; (e) inserting a `geofence_events` row for another user's `user_id`, or for a geofence outside a shared group, is rejected; (f) deleting a group (or triggering last-member-leave auto-delete) removes its geofences and their events.

---

### FT-14 detail — Create/manage geofence (foreground)

**Type:** Feature

**Why:** FT-13 landed the `geofences` table (RLS: any member creates; creator-or-owner edits/deletes) but nothing reads or writes it yet. FT-14 is the CRUD surface — list a group's zones, create, edit (name/location/radius), delete. No detection (FT-16/FT-18) and no zone overlay on the map — data management only, reached from a group's detail screen (not the map).

**Depends on correction:** roadmap row (line 631) lists `FT-13, FT-12` — should be `FT-13, FT-9`. Geofences are managed from the group detail screen where invites (FT-9) and leave (FT-11) already live, not from the map's active-group filter (FT-12). Doesn't change sequencing (both Done already), just an accuracy fix.

**Location/radius input — locked by PO (2026-08-20), decision #13:** two entry paths, both ship in FT-14, sharing one marker + radius slider:
- **Map long-press** — `react-native-maps`'s `onLongPress` (already available, no new library) drops/moves the marker.
- **Exact-address search** — a text field + "Search" button (explicit submit, not typeahead) calling `expo-location`'s `geocodeAsync(address)`, on-device, free, no API key/provider needed (already a dependency). First result drops/moves the marker. No suggestions dropdown — that's the autocomplete upgrade, split to FT-14b below since it needs an external provider decision.

Radius slider (`@react-native-community/slider`, new dependency): **250 ft to 10,600 ft, default 1,000 ft** — converted to/from `radius_m` for storage, displayed in feet. 250 ft (~76m) sits above iOS's ~100–150m accuracy floor, so no separate warning/floor UI is needed; the slider's own minimum is the enforcement.

**Data flow** (against FT-13's schema — plain grants, no RPC, so none added here): list = `select * from geofences where group_id = :groupId` (RLS already scopes to membership); create = `insert` with `created_by` set client-side to the caller's id (required — RLS `with check` rejects a mismatch); edit = `update` on the four FT-13 granted columns (name, latitude, longitude, radius_m); delete = plain `delete`. RLS gates who succeeds in every case.

**Client scope** (`features/geofencing/`):
- Routes: `app/(app)/geofences/[groupId]/index.tsx` (list), `.../new.tsx`, `.../[geofenceId].tsx` (edit) — own `_layout.tsx` mirroring `groups/_layout.tsx`; `(app)/_layout.tsx` gets an additive `<Stack.Screen name="geofences" />`.
- `GroupDetailScreen.tsx` (FT-9) gets an additive "Manage Zones" button navigating to `/geofences/${group.id}?role=${group.role}` — `role` rides as a route param (already fetched there) rather than a new hook or cross-feature import. Display hint only; every write still RLS-gated.
- `GeofenceListScreen` — zones for `groupId`; Edit/Delete shown only when `createdBy === userId || role === 'owner'`; other rows read-only. Empty state: "No zones yet for this group."
- `GeofenceFormScreen` — one component, optional `geofenceId` distinguishes create/edit; name field non-empty check (same class as `InviteForm`); map + address-search + radius slider per decision #13; delete in edit mode behind the same ownership check, native `Alert.alert` confirm (mirrors `useLeaveGroup`).
- `useGeofences.ts` (list, refetch-on-focus like `GroupsScreen`), `useCreateGeofence.ts`, `useUpdateGeofence.ts`, `useDeleteGeofence.ts`, `useGeocodeAddress.ts` (thin `geocodeAsync` wrapper: address in, `{ latitude, longitude } | null` out, loading/error state) — one hook per concern, same granularity as `useSendInvite`/`useLeaveGroup`.
- `types/geofence.types.ts` — `Geofence = { id, groupId, name, latitude, longitude, radiusM, createdBy, createdAt }`, camelCase-mapped like `Group`.

**Permissions:** None new — `(app)` already requires foreground location permission (FT-3/FT-4), which is all a long-press-to-drop-a-marker map needs; no additional permission surface.

**Edge cases:**
1. Non-owner member sees every zone (read is unrestricted to members) but no Edit/Delete on rows they don't own; a forced write attempt is rejected server-side anyway.
2. Creator leaves the group but it persists — already loses select/edit rights server-side (FT-13); zone just stops appearing in their list on next fetch.
3. Zone edited/deleted by someone else while this screen is open — not live, resolves on next focus (same accepted gap as FT-12's edge case #5).
4. Duplicate zone names within a group — allowed; name is a label, not an identity key.

**Out of scope:** foreground/background detection (FT-16/FT-18), push on entry/exit (FT-17); zone overlay on `FamilyMap.tsx`; any change to FT-13's schema/RLS; admin/co-owner role or ownership transfer (same gap class as FT-11); autocomplete-as-you-type address search (split to FT-14b — this ticket's address search is exact-match only).

**On-device verification:** Owner (A) opens group detail → Manage Zones → creates a zone → confirm it appears and edits persist after navigating away/back. Non-owner member (B), same group: sees A's zone with no Edit/Delete, can create and edit/delete their own. A can edit/delete B's zone (owner override). Delete a zone from A → disappears from both lists on next focus. B leaves the group → A's list unaffected, B can no longer reach that group's zones route.

### FT-14b detail — Autocomplete upgrade for geofence address search

**Type:** Feature (upgrades FT-14's exact-match address search to as-you-type suggestions)

**Why:** FT-14 ships exact-address search via `expo-location`'s on-device `geocodeAsync` — type a full address, get one result, no suggestions. FT-14b upgrades that to a narrowing dropdown of candidates as the user types, which needs an external places-autocomplete provider (on-device geocoding has no typeahead/suggestion capability). Split out during FT-14 design so the provider/key decision doesn't block FT-14, and because FT-14's exact-match search already covers the core need.

**OPEN — needs a locked PO decision before implementation:** which provider? Google Places Autocomplete (widest coverage, billed API beyond a free tier, needs a Google Cloud project + key) vs. Mapbox Search API (similar shape, separate account/key). Both are plain HTTP APIs — same client integration on iOS/Android. (Apple's `MKLocalSearchCompleter` was considered and rejected: iOS-only, no Android path, moot anyway since Android is currently out of scope for the whole roadmap — see "Other flags.") Not choosing here since it's a billing/account decision, not an architectural one.

**Client scope:** one new component in `features/geofencing/` — an address text input above/alongside FT-14's map, wired to a new `useAddressAutocomplete(query)` hook: debounced (don't fire per keystroke) and **AbortController-cancelled** on each new query so a slow stale response can't overwrite a newer result set. Renders a dropdown of narrowing suggestions below the input; selecting one resolves to a place (a second "place details" call for most providers, since autocomplete predictions return text + an opaque id, not raw coordinates) and drops/moves FT-14's marker to that point — the rest of the form (name, radius slider, save) is unchanged and shared with FT-14.

**New surface:** provider API key (new `.env` entry, follow this repo's existing `.env.example` pattern); new failure states (no network, zero results, rate-limited/quota-exceeded, provider timeout); if Google Places, session-token handling so the autocomplete + details calls bill as one session instead of two.

**Out of scope:** the provider account/billing setup itself (a one-time manual step, not a code task); any change to FT-13's schema (still just lat/lng/radius_m) or FT-14's map long-press path, which remains available alongside this.

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
- **No sign-out UI**: `AuthProvider.signOut()` (FT-2) works but nothing in any screen calls it — there is currently no way to sign out of the app short of deleting and reinstalling it. Discovered during FT-9 on-device QA (needed a second test account on the same device). Not blocking any currently-scoped ticket, but a real, everyday gap once this isn't a single-tester device.
- **Owner-remove-member UI**: `group_members_delete_self_or_owner` (FT-7) already permits an owner to remove another member, but no button/screen exposes it. Same class of gap as #10/rename. Flagged during FT-11 design, not blocking it.
- **Owner leaving a group with other members remaining**: FT-11 blocks this server-side rather than solving it (no ownership-transfer mechanism exists), which means an owner who wants out of a group whose other members won't leave currently has no way to do so. Needs a PO decision (auto-promote another member? explicit transfer?) — flagged during FT-11 design.
- **FT-11's owner-guard trigger vs. #10 (explicit group delete)**: `prevent_ownerless_group_leave` (FT-11) fires on any `group_members` delete, including FK cascades. If #10 is ever built as "owner explicitly deletes the group" while other members still exist, the cascade delete of the owner's own `group_members` row would hit this same guard and could block the cascade, leaving the `groups` row orphaned. Flagged during FT-11 code review — #10's implementation needs to either bypass this trigger for group-delete-initiated cascades or handle it in its own RPC.
- **Address-search provider for FT-14b**: needs a locked decision on Google Places Autocomplete vs. Mapbox Search API (account/key, not architecture). Blocks only FT-14b, not FT-14. See FT-14b detail.

## Other flags worth remembering later
- `location_history` has no retention/pruning policy — revisit before v5 ships at scale.
- `location_history` can receive two rows with the identical `recorded_at` timestamp (down to the millisecond) but different `accuracy` from a single `watchPositionAsync` callback — observed on-device during FT-5 QA (2026-08-04), not reproduced as an app bug (the effect fires once per distinct callback invocation as designed). Likely a CoreLocation quirk delivering two fixes in quick succession with the same GPS timestamp. Harmless today; worth a dedupe pass before v5 playback (FT-22/23) if duplicate-instant points ever cause visible jitter.
- iOS background-location App Store review requires clear in-UX justification (FT-18).
- iOS geofence region monitoring has a practical accuracy floor (~100–150m) — small zones like "front porch" may be unreliable (FT-14).
- Android is explicitly out of scope for the entire roadmap; would need separate handling if ever added.
- **Future: avatar markers.** Eventual direction (not yet scoped to a ticket) is for both yourself and other group members to be represented on the map by profile picture, not a generic pin or the native blue dot — closer to a "chat bubble"/Life360-style avatar marker. This affects FT-4/FT-6 implementation choices now: use a plain `Marker` (customizable) for yourself rather than `MapView`'s `showsUserLocation` blue dot, even though the blue dot is simpler today, so the later upgrade to an avatar image is additive rather than a rework. `profiles.avatar_color` already exists as a placeholder for visual identity (FT-2) — a future `avatar_url` column is the natural next step whenever this gets scoped for real.
- **FT-28's 15-minute staleness threshold is tuned for the current foreground-only reality** (no background location writer exists until FT-18, which is scoped to geofencing only, not general broadcast). If background location tracking is ever broadened beyond FT-18's narrow use case, this threshold should be revisited — a background-tracked app would make "stale" a much rarer, more meaningful signal than it is today.
- **Flaky loading-state tests**: `useSendInvite.test.ts` (FT-9) and `useLeaveGroup.test.ts` (FT-11) both race a real `setTimeout(..., 100)` against `waitFor` to catch a hook's mid-flight loading state — occasionally times out under CPU load in full-suite runs. Not a correctness bug, just test timing. Worth a cleanup pass (deterministic manually-controlled promise instead of a real timer) if it starts causing CI noise. Found during FT-11 verification (2026-08-19).
- **`GroupSwitcher`'s pill-row styling should become a proper select/dropdown** once a user is likely to belong to more than a handful of groups — a horizontal scrolling pill row (FT-12) doesn't scale well past a few groups. Flagged during FT-12 on-device QA (2026-08-20), not blocking.
