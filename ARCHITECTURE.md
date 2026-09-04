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
| 11 | Cross-group visibility | **Locked (2026-08-20), amended (2026-09-03) — see FT-38:** each group's membership is its own independent authorization boundary. Sharing group B with someone still lets them see your location even after you remove them from group A — removal from one group never revokes visibility granted by another shared group. **This part is unchanged and still applies to group removal.** It does **not**, however, extend to FT-20/FT-21's temporary hide toggles: confirmed on-device (2026-09-03) that hiding from Group A while still visible via a shared Group B left the viewer able to see you on *both* groups' maps, since `shares_visible_group_with` checks for any mutually shared unhidden group rather than the group actually being viewed. Decided this was not the intended behavior for a per-group hide — "invisible to Group A" should mean invisible on Group A's map specifically, independent of any other group. The map's per-group switcher (#4) remains a display filter only with respect to group *removal*, but per-group *hide* now needs its visibility check scoped to the group being viewed. See FT-38. |
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
| FT-29 | Bug: overlapping/very-close member markers mis-trigger each other's callout — tapping one pin shows its callout, then ~1s later the other pin's callout also fires. Native MapKit/react-native-maps hit-testing quirk when annotations are close together, not app logic (no custom tap/selection state exists in `OtherUserMarker`/`FamilyMap`). Fix options: cluster close markers (e.g. `react-native-map-clustering`, bigger lift — new dependency, migrates marker rendering) or nudge overlapping coordinates apart by a small deterministic display-only offset (smaller lift — no new dependency, fixes the reported near-overlap case, doesn't scale to many members in the exact same spot). | FT-6 | ✅ Done |
| FT-30 | Recenter-to-my-location button — crosshair icon on the map screen that animates (if low-lift) or snaps the camera back to the device owner's current location on tap. Nicety now, becomes a necessity as more members/zones clutter the map. | FT-4 | ⬜ |
| FT-32 | UX polish for `FamilyMap`'s initial load — flagged during on-device QA (2026-08-27): on first open, only your own marker renders; other members' markers and zone pins pop in late once their separate async fetches (`useActiveGroupMembers`, `useGroupMemberLocations`, `useGeofences`) resolve. Expected behavior for now, just a staggered-first-paint UX gap, not a bug. | FT-14, FT-12 | ⬜ |
| FT-37 | Bug: a member's marker doesn't disappear when they go invisible (per-group or global) while their marker is already on screen — confirmed on-device (2026-09-03) during FT-21 QA. `useGroupMemberLocations` only fetches once on mount and otherwise only appends realtime `INSERT`s; it never refetches on focus and never drops a member whose RLS access was revoked. Only a full app kill+relaunch (fresh mount → fresh RLS-filtered fetch) clears a stale marker. Same gap already existed for FT-20's per-group hide, just not noticed until FT-21 made it more visible. Likely fix: a focus-triggered refetch in `useGroupMemberLocations`, mirroring the `refetchGeofences` pattern `FamilyMap.tsx` already uses. | FT-6 | ⬜ |
| FT-38 | **PO-prioritized (2026-09-03) — tackle immediately after FT-21's pipeline completes, ahead of lower-numbered backlog tickets (FT-30–37).** Bug/design gap: per-group hide (FT-20) doesn't actually hide you on that group's map if the viewer shares any other unhidden group with you — confirmed on-device (2026-09-03) during FT-21 QA (two users sharing two groups; hiding from one left the hidden user visible on *both* groups' maps). Root cause: `shares_visible_group_with` (FT-19) checks for any mutually shared group where the target isn't hidden, not the specific group the client is currently querying — so it can't express "invisible on Group A's map, still visible on Group B's." See amended decision #11. Needs the visibility check reworked to be scoped to the group actually being viewed (e.g. an RPC/view taking `p_group_id` and checking `is_hidden_from_group` for just that group, replacing the blanket `location_history` SELECT policy's reliance on "any shared group") rather than a blanket per-row grant. Global hide (FT-21) is unaffected — it already gates uniformly regardless of which group is being viewed. | FT-19, FT-20 | ✅ Done |

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

### FT-29 detail — Deconflict overlapping member markers (display-only coordinate offset)

**Type:** Bug

**Why:** `FamilyMap.tsx` renders one plain `<Marker>` for the current user and one `<OtherUserMarker>` per visible group member, each with its own native title/callout — there's no custom tap/selection state anywhere in this stack. When two markers' true coordinates are very close (the common "two people in the same house/car" case), `react-native-maps`'/MapKit's hit-testing occasionally resolves a tap against both nearby annotations, firing the second one's callout ~1s after the first. This is a rendering/hit-testing artifact, not app logic to debug.

**Decision:** display-only coordinate offset, not `react-native-map-clustering`. Clustering is the right call once member counts are large enough that *visual density* (not just occasional mis-tap) is the problem — it's not, today: v1 has exactly two users, and groups (FT-12) are family/household-sized, not crowds. Clustering would also be a materially bigger blast radius here — new native dependency, and it replaces `<Marker>` rendering for the whole map (own marker, member markers, *and* FT-14's geofence pins all sit in the same `<MapView>`), none of which is otherwise touched by this fix. The offset approach fixes the exact reported case with no new dependency and edits to two existing map-feature files.

**Scope:**
- `lib/constants.ts` — two new constants alongside the existing thresholds: `MARKER_OVERLAP_THRESHOLD_M` (recommend 20 — pins this close are indistinguishable at ordinary zoom and are exactly the mis-tap case) and `MARKER_OFFSET_M` (recommend 8 — enough to separate two pins' native hit targets, small enough that a nudged marker still reads as "here," not "somewhere else").
- `features/map/lib/deconflictMarkerPositions.ts` (new, pure function, no React/hooks — cheaply unit-testable without RNTL): `deconflictMarkerPositions(positions: { id: string; latitude: number; longitude: number }[]): Record<string, { latitude: number; longitude: number }>`. Sorts input by `id` first (stable regardless of array/fetch order), then greedily clusters positions within `MARKER_OVERLAP_THRESHOLD_M` of each other's cluster anchor. The lowest-id member of each cluster keeps its true coordinate; every other member in that cluster is nudged `MARKER_OFFSET_M` out along a distinct angle (evenly split around the anchor by cluster size) so re-renders never flip which pin moves.
- `features/map/hooks/useDeconflictedMarkerPositions.ts` (new, thin `useMemo` wrapper over the pure function above — same "pure derivation behind a small hook" shape as FT-28's `useLocationStaleness`): `useDeconflictedMarkerPositions(positions: { id: string; latitude: number; longitude: number }[]): Record<string, { latitude: number; longitude: number }>`.
- `features/map/components/FamilyMap.tsx` (edited): builds one combined array — the current user (`id: userId`, from `coords`) plus every `visibleMember` (`id`, from `locations[member.id]`) — runs it through `useDeconflictedMarkerPositions`, and passes each entry's resolved `{ latitude, longitude }` as the new `coordinate` prop below instead of the raw `coords`/`location` lat/lng.
- `features/map/components/OtherUserMarker.tsx` (edited): new required prop `coordinate: { latitude: number; longitude: number }`, used for the `<Marker coordinate>` instead of `location.latitude`/`location.longitude`. `location` is still passed and still used for `useLocationStaleness(location.recordedAt)` — only the rendered position is decoupled from it.

**Why the own marker is included:** the reported symptom (tap one pin, the *other* pin's callout follows ~1s later) is exactly what happens when two people are physically together — own marker and one `OtherUserMarker` at nearly the same spot. Restricting the fix to `OtherUserMarker`-vs-`OtherUserMarker` pairs would leave the actual reported case unfixed.

**Edge cases:**
1. v1's two-user case, both at the same location — the reported bug; anchor (lower id) renders true position, the other nudges 8m.
2. Three or more members clustered at one spot (future, larger groups) — each non-anchor member gets its own angle around the anchor; doesn't fully solve dense same-spot clustering (stated up front in the ticket's own description), consistent with why this is the smaller-lift fix, not the scale fix.
3. Members move apart/back together between renders — recomputed fresh each render off current `locations`/`coords`, no animation/tween; a pin can "snap" between offset and true position as a cluster forms/dissolves, acceptable for this bug fix, not a smooth transition.
4. No geofence-pin interaction — FT-14's zone markers already render their own `<Callout>` explicitly and aren't part of the reported bug; left untouched.

**Out of scope:**
- `react-native-map-clustering` or any clustering library adoption.
- Any offset/dedup logic for FT-14's geofence pins.
- Zoom-aware or screen-space (pixel-distance) overlap detection — this is a fixed real-world-meters offset, so how separated two pins *look* still varies with zoom; not solved here, matches the ticket's own stated tradeoff.
- Any UI indicating a pin has been nudged ("approximate position" badge, etc.) — the offset is meant to be small and unnoticed, not disclosed.
- Any change to `useGroupMemberLocations`, `useForegroundLocation`, `useActiveGroupMembers`, or `useLocationStaleness`'s data/fetch logic.

**On-device verification:** Two accounts signed in on devices physically next to each other (same room), both members of the same active group. Confirm both pins render slightly apart (not perfectly stacked). Tap one pin — confirm only that pin's callout appears and no second callout fires ~1s later; tap the other pin, confirm the same. Separate the two devices to a normal distance apart and confirm both markers still look and behave normally.

**Files touched:**
- `lib/constants.ts`
- `features/map/lib/deconflictMarkerPositions.ts` (new)
- `features/map/hooks/useDeconflictedMarkerPositions.ts` (new)
- `features/map/components/FamilyMap.tsx`
- `features/map/components/OtherUserMarker.tsx`

**No overlap with FT-17:** this list shares zero files with FT-17's three touched files (`supabase/migrations/0012_geofence_push_webhook.sql`, `supabase/functions/geofence-alert-push/index.ts`, `app/_layout.tsx`) — FT-29 is entirely map-feature client code, FT-17 is entirely a server-side webhook/edge-function plus root-layout notification-handler edit, so FT-29's senior-dev work is safe to run in parallel with FT-17's in-progress unit-testing pipeline.

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
| FT-39 | Gap: `GroupDetailScreen` never lists the group's members — shows only the group name, invite form, and leave button. Flagged by PO (2026-09-03) while reviewing FT-22's history member selector, which surfaces the full current-member roster but only inside the History screen; nowhere else in the app shows "who's actually in this group." Needs a simple member list added to `GroupDetailScreen` (name per member, owner indicated). | FT-7, FT-8 | ⬜ |

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
| FT-14 | "Zones" — create/manage geofences from the main map (foreground) | FT-13, FT-12 | ✅ Done |
| FT-14b | Autocomplete/named-place upgrade for Zones address search (v1 ships exact-address geocoding only) | FT-14 | ⬜ |
| FT-15 | Push notification infrastructure (shared primitive — reused later by v6) | FT-2 | ✅ Done |
| FT-16 | Foreground geofence detection + in-app alert **to other group members** (not the crossing user themselves — see corrected FT-16 detail below) | FT-14, FT-6 | ✅ Done |
| FT-17 | Push notification to **other group members** on entry/exit (server-triggered webhook) — covers the case where FT-16's in-app alert can't reach them because their app isn't foregrounded | FT-15, FT-16 | ✅ Done |
| **FT-18** | **Background geofence detection.** Keeps the crossing user's own detection running when the app is backgrounded/closed, via iOS native region monitoring — not a JS watch loop. Requires the "Always" location permission plus background task registration; see FT-18 detail below. | FT-16, FT-17 | ✅ Done |
| FT-31 | UX polish for `BackgroundLocationPermissionBanner` (FT-18) — flagged during on-device QA (2026-08-27): the banner doesn't read as tappable (no button styling/affordance) and it's not obvious a tap is even required to grant "Always" location. Not a functional bug — background detection itself works — just a discoverability gap. | FT-18 | ⬜ |
| FT-33 | Bug: `useGeofenceDetection` (FT-16) has no smoothing/debounce against a single noisy GPS fix — confirmed on-device (2026-08-28) when one bad fix flipped 7 zones' inside/outside state simultaneously in one pass (all `occurred_at` timestamps within 24ms of each other), producing a false `exit` event for a zone in another state entirely while the device never left the house. Needs some form of hysteresis (e.g. require N consecutive consistent fixes, or a minimum-accuracy-radius check, before treating a state flip as a real crossing) before writing a `geofence_events` row. | FT-16 | ✅ Done |
| FT-34 | Bug: `useBackgroundGeofenceRegistration` (FT-18) calls `startGeofencingAsync` fresh on every `background` AppState transition, which makes iOS re-evaluate every region's current membership and fire it as a real enter/exit — confirmed on-device (2026-08-28): 5 separate backgroundings that day each produced a simultaneous exit for every geofence except the occupied one, each insert triggering FT-17's push webhook, spamming other group members with false "left {zone}" alerts. Needs monitoring to stay registered continuously instead of stop/restart per transition, or the background task to suppress the initial per-registration state report. | FT-18, FT-17 | ✅ Done |
| FT-35 | Bug: app icon badge count accumulates and never clears — flagged during FT-17 push testing (2026-09-02), badge sat at 4 after several test notifications. `setBadgeCountAsync` is never called anywhere in the app, and push payloads (`sendPush.ts`) never set an explicit `badge` value either, so nothing ever resets it. Needs a badge-clear call (e.g. on app foreground/AppState active) and/or an explicit badge count in the push payload. | FT-15 | ⬜ |
| FT-36 | Bug: phantom geofence exit push received while nowhere near the zone — confirmed during FT-17 push testing (2026-09-02), device got a "left Splash Park" push despite not having been in range that session. Likely the same class of issue FT-34 targeted (iOS's synchronous initial-membership report on `startGeofencingAsync` re-registration), but occurred outside FT-34's fix window — possibly triggered by a full app kill+relaunch rather than an AppState `background` transition, which FT-34's suppress window doesn't cover. Needs investigation into whether FT-34's fix should extend to cold start/relaunch too. | FT-18, FT-34 | ⬜ |

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

### FT-14 detail — "Zones": create/manage geofences from the main map (foreground)

**Type:** Feature

**Why:** FT-13 landed the `geofences` table (RLS: any member creates; creator-or-owner edits/deletes) but nothing reads or writes it yet. FT-14 is the CRUD surface, user-facing name **"Places"** (UI copy only — table stays `geofences`, folder stays `features/geofencing/`). Superseded design as of 2026-08-21: an earlier group-detail-screen-driven build was implemented and reviewed, then discarded in favor of this map-first flow after extended PO design review — see "Design history" below.

**Design history:** the first pass (group detail → "Manage Zones" button → list/form screens, long-press-to-place marker) passed code review but was replaced before testing/commit once the PO worked through the actual UX in detail. The data-layer hooks survived unchanged (`useGeofences`, `useCreateGeofence`, `useUpdateGeofence`, `useDeleteGeofence`, `useGeocodeAddress`, `geofence.types.ts`, `radius.ts` in `features/geofencing/`) — only the screens/routes/entry-point below are new. The old screens/routes (`app/(app)/geofences/[groupId]/...`) and `GroupDetailScreen.tsx`'s "Manage Zones" button are left in place as a working fallback through the build (so there's always some way to create test data) and get deleted as the last step, once this design has full parity on-device.

**Entry point — locked by PO (2026-08-21):** a "Places" button on the main map screen (`FamilyMap.tsx`), **hidden whenever `activeGroupId` is null** (zero groups — mirrors `GroupSwitcher`'s own decision #4 "render nothing rather than empty chrome"). Visible whenever the user has at least one group, including the single-group case where `GroupSwitcher`'s pill itself stays hidden. A place is associated with whatever group is currently active in `GroupsContext` (`activeGroupId`) — no route param needed, unlike the discarded design's `/geofences/${group.id}` link. Places cannot exist without a group at the schema level (`geofences.group_id` is `not null`, RLS-gated on membership), so hiding the entry point when there's no active group isn't a UX nicety, it's a hard requirement.

**UX flow — locked by PO (2026-08-21):**
1. Tap "Places" → **Places list** (overlay/modal over the map): plain list of existing places for the active group, plus "+ Add Place." No map on this screen.
2. "+ Add Place" → **Add Place**: a name field, and location set via *either* typing an address *or* tapping "Select on Map" (not both at once). Radius is **not** adjustable here — always defaults to 1,000 ft on creation; only becomes editable afterward.
   - **Address path:** text field, explicit "Search" (not typeahead — see FT-14b), `expo-location`'s `geocodeAsync`. Name field defaults to the matched address text but is user-editable before saving.
   - **"Select on Map" path:** opens the `MapLocationPicker` (below) full-screen/modal, seeded at the user's current location, default radius. User pans, taps "Next" to confirm → returns to Add Place with location set; name still editable there.
   - Saving (either path) creates the place and returns to **the Places list** (`router.back()`) — corrected from the original "returns to the main map" call once seen on-device (PO, 2026-08-21): staying inside the Places flow after adding felt better than being dropped back on the map. The new place shows in the list immediately (refetch-on-focus).
3. **Main map integration:** place pins render on `FamilyMap.tsx` for the active group (additive to existing member pins). Tapping a pin shows a `react-native-maps` `Callout` (native tap-marker popup, no extra library) with the place's name and an "Edit" button.
4. **Edit** (reached via the list row *or* the map pin's Callout → Edit — same screen either way): shows `MapLocationPicker` **inline, not behind a tap** (there's already a location to display, unlike Add Place's explicit either/or choice) — pre-centered on the place's current location and radius, live-pannable to reposition. Below it: Label/Name field, an **Address row** that opens a shared `AddressSearchModal` (same address-search mechanism as Add Place) as an alternate way to jump the picker's center, and the **radius slider** (kept in sync with the picker's live circle). Actions: Cancel, Save, and below that, Delete Place.

**`MapLocationPicker` — the shared, reusable core** (used both full-screen by "Select on Map" and inline by Edit): a fixed pin at screen-center — plain absolutely-positioned overlay `View`, never map-bound, so it truly never moves — with the map panning freely underneath. The radius circle is **also** a screen-space overlay (not a `react-native-maps` `Circle`), sized in pixels from `radiusM` using `region.latitudeDelta` and the map's measured render height (meters-per-latitude-degree is ~constant, ≈111,320m, so no longitude/cos-latitude correction needed), recalculated on **every** `onRegionChange` (not just `onRegionChangeComplete`) so it visibly tracks live while panning rather than snapping into place only on release — locked by PO 2026-08-21 after evaluating the cheaper "native `Circle`, updates on release only" alternative and preferring the live-tracking feel. Whatever the map's center is when panning stops (`onRegionChangeComplete`) **is** the selected lat/lng — captured directly from `region`, no separate tap-to-confirm on the map itself.

Radius bounds unchanged from the original decision: **250 ft to 10,600 ft, default 1,000 ft** (`@react-native-community/slider`, already added as a dependency), converted to/from `radius_m` for storage. 250 ft (~76m) sits above iOS's ~100–150m accuracy floor.

**Address search is exact-match only in v1** — `geocodeAsync` resolves postal addresses, not business/place names ("123 Main St" works, "Spaghetti Factory" does not). Named-place search needs a places-autocomplete provider — that's FT-14b, unchanged in scope, just now feeding `AddressSearchModal` instead of the discarded `GeofenceFormScreen`.

**Data flow** (against FT-13's schema — plain grants, no RPC): list = `select * from geofences where group_id = :activeGroupId` (RLS scopes to membership); create = `insert` with `created_by` set client-side to the caller's id (required — RLS `with check` rejects a mismatch); edit = `update` on the four FT-13 granted columns; delete = plain `delete`. Unchanged from the discarded design; hooks are reused as-is.

**Client scope** (`features/geofencing/`, routes under `app/(app)/places/`, modal-presented over the map so it doesn't replace it):
- Routes: `_layout.tsx` (Stack, modal presentation), `index.tsx` → `PlacesListScreen`, `new.tsx` → `AddPlaceScreen`, `[placeId].tsx` → `EditPlaceScreen`. "Select on Map" and address search are **not separate routes** — expo-router has no first-class "return a value from a pushed screen" mechanism, so both are local modal state within their parent screen (`AddPlaceScreen`/`EditPlaceScreen` render `MapLocationPicker`/`AddressSearchModal` conditionally, not via navigation).
- `MapLocationPicker.tsx` — the fixed-pin/live-circle/pan core described above; takes `initialRegion`, `initialRadiusM`, `onChange(coords)`; a `mode: 'modal' | 'inline'` prop covers the two presentations (full-screen with a "Next" button vs. embedded directly in `EditPlaceScreen`).
- `AddressSearchModal.tsx` — shared by `AddPlaceScreen`'s address path and `EditPlaceScreen`'s address row; text field + "Search" + `useGeocodeAddress`.
- `PlacesListScreen.tsx`, `AddPlaceScreen.tsx`, `EditPlaceScreen.tsx` as described in the UX flow above.
- `FamilyMap.tsx` (FT-4/6, existing) gets additive place-pin rendering (fetched via `useGeofences(activeGroupId)`) and the `Callout`-based Edit entry point; a "Places" button additive to its header/controls, gated on `activeGroupId`.
- Existing hooks/types unchanged: `useGeofences`, `useCreateGeofence`, `useUpdateGeofence`, `useDeleteGeofence`, `useGeocodeAddress`, `geofence.types.ts`, `radius.ts`.

**Build order (piece by piece, on-device sign-off between each; one formal review→test→commit pipeline at the end, not per piece):**
1. Places list + "Places" entry point on the main map (gated on `activeGroupId`). No map yet.
2. Add Place via address (name defaults from address, editable; save at default radius).
3. "Select on Map" (`MapLocationPicker` in modal mode) wired into Add Place as the alternate location method.
4. Edit screen (`MapLocationPicker` in inline mode + name + address row + radius slider + Cancel/Save/Delete), reached from the list.
5. Main map integration (place pins + `Callout` + Edit entry point on `FamilyMap.tsx`) — **and, once this has full parity with the old flow, delete the discarded `app/(app)/geofences/[groupId]/...` routes, `GeofenceListScreen`/`GeofenceFormScreen`, and `GroupDetailScreen.tsx`'s "Manage Zones" button** as the final step of this piece.

**Progress (updated as each piece lands; all uncommitted until the final pipeline run — check `git status` for exact current file state):**
- Piece 1 ✅ — `app/(app)/places/_layout.tsx`, `app/(app)/places/index.tsx`, `features/geofencing/components/PlacesListScreen.tsx`; additive "Places" button on `FamilyMap.tsx`.
- Piece 2 ✅ (confirmed on-device) — `app/(app)/places/new.tsx`, `features/geofencing/components/AddPlaceScreen.tsx` (name + address + Search, `router.back()` to list on save per the corrected UX flow); `PlacesListScreen`'s "+ Add Place" wired up; `PlacesListScreen` also gained refetch-on-focus (was missing, caused stale list).
- Piece 3 ✅ (confirmed on-device, with fixes) — `features/geofencing/components/MapLocationPicker.tsx` (fixed-pin/live-circle/pan core, `mode: 'modal' | 'inline'`, only `modal` wired so far); `AddPlaceScreen.tsx`'s "Select on Map" now opens it via local `<Modal>` state, seeded from `useForegroundLocation` + `MAP_INITIAL_DELTA`, fixed `radiusM={feetToMeters(RADIUS_DEFAULT_FT)}`. On-device fixes applied post-build: pin/circle centering bug (mismatched flex + negative-margin math — both are now independently `position: 'absolute'` off the true center), header buttons overlapping the status bar (added `useSafeAreaInsets()`), choppy pinch-zoom (circle now resizes via `transform: scale` off a fixed-size base instead of changing `width`/`height`/`borderRadius` — those are layout properties, expensive to recompute every frame of a zoom gesture; a transform is handled natively/on the GPU instead), and a new reverse-geocoded address label (`useReverseGeocode.ts`, new hook) showing the resolved address text below the pin, updating on `onRegionChangeComplete`. `AddPlaceScreen`'s Save button is now disabled until a location is set (either path).
- Piece 3 also gained a name/address-confirmation refinement pass (2026-08-21) — see "Resolved — address-confirmation UX" note below: name auto-fills from whichever of search/"Select on Map" last succeeded, but a manual edit to the name field permanently wins over either (`nameManuallyEdited` flag in `AddPlaceScreen.tsx`); `addressQuery` clears on a successful map-confirm (kept, after weighing the tradeoff against not-clearing — may be revisited).
- Piece 4 ✅ (confirmed on-device, with fixes) — `app/(app)/places/[placeId].tsx`, `features/geofencing/components/EditPlaceScreen.tsx`: `MapLocationPicker` in `mode="inline"` (embedded directly in the screen, not a `<Modal>` — only "Select on Map" in `AddPlaceScreen` uses a real modal), radius slider driving the same `radiusM` prop, name + address-search fields, ownership-gated (`createdBy === userId || role === 'owner'`, role from `useGroups()` matched against `activeGroupId`) with a read-only view for non-managers, Cancel/Save/Delete. `PlacesListScreen` rows navigate to `/places/${id}` and show a ✏️ icon (placeholder emoji, flagged in "Other flags" for a later real-icon pass) on rows the caller can manage. **Fixed post-build:** (1) auto-fill-name-from-address copied from `AddPlaceScreen` was wrong for Edit — a prefilled *existing* name would get silently overwritten by panning/searching alone; removed entirely, name here only ever changes from a direct edit. (2) Searching an address updated location state but left the visible map/pin/circle un-recentered, since `MapLocationPicker` only reads `initialRegion` once on mount with no way to be told "recenter" from outside — fixed by having a successful search also update `initialRegion` and keying `MapLocationPicker` off it, forcing a remount-and-reseed on search while panning (which also updates location, via `onConfirm`) leaves `initialRegion`/the key untouched so the map never jumps mid-pan.
- Piece 5, pin integration ✅ (confirmed on-device, with a fix) — `FamilyMap.tsx` additively renders a `Marker` per active-group place (blue `pinColor`, distinct from the current-user/other-member markers) with a `Callout` (name + "Edit" line, whole callout tappable) navigating to `/places/${id}` — the same `EditPlaceScreen` route from piece 4, a second entry point into it. No radius circle on the main map, pins only, per scope. **Fixed post-build:** `FamilyMap` fetched places once on mount with no refetch, and — being the persistent screen underneath the modal stack, never unmounted when navigating to Add/Edit and back — never picked up changes; same root cause and same fix as `PlacesListScreen`'s earlier staleness bug (`useFocusEffect` calling `refetch()`).
- Piece 5, cleanup ✅ — deleted the discarded `app/(app)/geofences/[groupId]/...` routes, `GeofenceListScreen.tsx`, `GeofenceFormScreen.tsx`, and `GroupDetailScreen.tsx`'s "Manage Zones" button + its route registration in `app/(app)/_layout.tsx`. Considered (and deliberately skipped) restoring a group-detail entry point that would set that group active then open the Zones list — real convenience is marginal since `GroupSwitcher` already makes changing the active group a single tap; revisit only if it turns out people want to manage zones starting from the Groups tab rather than the map.
- **Terminology locked by PO (2026-08-24): "Zones," not "Places."** UI copy only — table stays `geofences`, folder stays `features/geofencing/`, and component/route/file names (`PlacesListScreen`, `AddPlaceScreen`, `EditPlaceScreen`, `/places` routes) were deliberately left as internal-only naming rather than renamed, same precedent as the schema. Every user-visible string was updated: the map's "Places" button → "Zones," screen titles ("Places"/"Add Place"/"Edit Place" → "Zones"/"Add Zone"/"Edit Zone"), empty/loading states, validation messages, the delete confirmation, and the map pin's accessibility label.
- **Code review ✅ approved (2026-08-24)** — no real findings; two doc comments trimmed to this project's 1-2 line standard (`EditPlaceScreen.tsx`, `MapLocationPicker.tsx`, `PlacesListScreen.tsx`). Confirmed the `AddressSearchModal` mentioned in earlier design notes was never built — both Add and Edit ended up with their own inline address field instead, a deliberate simplification, not a gap.
- **Unit tests ✅ written, then substantially corrected (2026-08-24).** The unit-test-writer's first pass had two real problems, both fixed directly: (1) `MapLocationPicker.test.tsx` — the file most likely to hide a regression, given it had two real bugs during the build — was a single no-op smoke test (`expect(true).toBe(true)`) with a comment claiming its real behavior was "better covered by E2E." Replaced with 4 real tests exercising both previously-fixed bugs (modal mode only confirms via "Next," inline mode's `hasPannedRef` gate against firing from its own initial-mount reverse-geocode) by mocking `react-native-maps` and invoking the captured `onRegionChange`/`onRegionChangeComplete` props directly — the same technique `FamilyMap.test.tsx` already uses in this codebase. (2) `AddPlaceScreen.test.tsx` and `EditPlaceScreen.test.tsx` were both 100% tautological (`expect(mockHook).toHaveBeenCalled()`) with zero tests actually driving an interaction, despite the writer's own summary claiming behaviors like "name doesn't auto-fill after manual edit" were covered — they weren't. Rewrote both with real `fireEvent`-driven tests (search/type/press) covering the actual regressions this ticket fixed: Save disabled until a location is set, name auto-fill priority, "Select on Map" clearing the address field, Edit's panning-doesn't-overwrite-name fix, and the full delete-confirmation flow. Also trimmed one genuinely duplicate test from `PlacesListScreen.test.tsx` ("returns to fresh list when navigating back from editing" was a verbatim restatement of "refetches on focus"). **Environment note for future test-writing in this project:** this RNTL version (14.x) made `render`, `rerender`, and `fireEvent.*` all async — every call needs `await`, and effect-driven state cascades (not just the initiating event) need `await act(async () => {...})`, not a bare sync `act(() => {...})` — omitting either causes tests to intermittently fail only when run as part of the full suite, not in isolation, which is a confusing failure mode worth recognizing quickly if it recurs.
- **Independent verification (mobile-qa, 2026-08-24) found one real bug, both fixed.** (1) **Real bug in `MapLocationPicker`'s inline-mode auto-confirm**: it was driven by a `useEffect` keyed on the resolved `address` string, but React skips re-running a state-keyed effect when the new value equals the old one — two different pans that happen to reverse-geocode to the identical formatted address (very plausible: fine-tuning a pin within the same block/building, exactly Edit's core use case) silently dropped the second confirm, so Save could persist a stale position with no visible sign anything was wrong. Fixed by having `useReverseGeocode`'s `reverseGeocode` return a `Promise<string | null>` and having `MapLocationPicker` call `onConfirm` directly once *that specific pan's* request resolves (guarded against a superseded/stale resolution via reference-comparing `lastRegionRef`), instead of reacting to `address` state changing. New regression test in `MapLocationPicker.test.tsx` proves two same-address pans both confirm. (2) Two nits: a stray empty `features/geofencing/components/asdf.tsx` (deleted) and `PlacesListScreen.test.tsx` declaring a `mockPush` it never asserted on (added real navigation tests: "+ Add Zone" → `/places/new`, row tap → `/places/:id`).
- Typecheck clean, full suite passing (293/293, plus one pre-existing unrelated flaky test under CPU load — see "Other flags"). Not yet checked on-device since this fix and the rename/cleanup — next step is on-device confirmation, then commit.

**Resolved — address-confirmation UX (found during piece 3 on-device testing, fixed same day, 2026-08-21):** setting a location via "Select on Map" left no clear indicator of what was actually captured, and the address input's role was ambiguous (would editing it destroy the map-picked location?). Resolved by decoupling the two: the address input is *always* just a trigger for a new search — typing in it never touches the confirmed `location`, only a successful Search (or a successful "Select on Map" confirm) does. The confirmation line now reads **"Location set: {address}"**, sourced from whichever path last succeeded — the typed/matched address text for the search path, or `MapLocationPicker`'s own reverse-geocoded text (already computed for its live label) for the map path, threaded back out through `onConfirm`'s new `MapLocationPickerResult` shape (`{ latitude, longitude, address }`, exported from `MapLocationPicker.tsx`). Changing your mind is still fully supported — type a new address and hit Search, it overwrites the confirmed location and the line updates — it just requires that one deliberate action instead of happening from a stray keystroke.

**Permissions:** None new — `(app)` already requires foreground location permission (FT-3/FT-4), which is all `MapLocationPicker` needs.

**Edge cases:**
1. Non-owner member sees every place (read is unrestricted to members) but no Edit/Delete affordance on rows they don't own; a forced write attempt is rejected server-side anyway. (Ownership-gated UI, exact rule TBD alongside piece 4/5 — carries over the discarded design's `createdBy === userId || role === 'owner'` check.)
2. Creator leaves the group but it persists — already loses select/edit rights server-side (FT-13); place just stops appearing in their list/map on next fetch.
3. Place edited/deleted by someone else while a screen is open — not live, resolves on next focus (same accepted gap as FT-12's edge case #5).
4. Duplicate place names within a group — allowed; name is a label, not an identity key.
5. Zero groups — "Places" entry point hidden entirely (see "Entry point" above).

**Out of scope:** foreground/background detection (FT-16/FT-18), push on entry/exit (FT-17); any change to FT-13's schema/RLS; admin/co-owner role or ownership transfer (same gap class as FT-11); named-place/autocomplete search (FT-14b).

**On-device verification:** per piece per the build order above, then end-to-end once all five land: from the main map with an active group, tap Places → add a place by address → confirm it appears as a pin on the map with default radius. Add a second place via "Select on Map," confirming the pin/circle track live while panning. Tap the first place's map pin → Callout → Edit → reposition via the inline picker, change radius, save → confirm both list and map reflect the change. Delete a place from the edit screen → confirm it's gone from both list and map. Switch active group (if testing with 2+ groups) → confirm Places list and map pins scope to the newly active group only. Confirm the "Places" button disappears entirely for an account with zero groups.

### FT-14b detail — Autocomplete/named-place upgrade for Places address search

**Type:** Feature (upgrades FT-14's exact-match address search to as-you-type, name-aware suggestions)

**Why:** FT-14 ships exact-address search via `expo-location`'s on-device `geocodeAsync` — resolves a typed postal address ("123 Main St") but not a business/place name ("Spaghetti Factory"), and gives one result with no narrowing suggestions as you type. FT-14b upgrades `AddressSearchModal` (shared by FT-14's Add Place and Edit flows) to a real places-autocomplete provider that handles both. Split out during FT-14 design so the provider/key decision doesn't block it, confirmed still deferred (PO, 2026-08-21) after the FT-14 redesign — v1 ships address-only.

**OPEN — needs a locked PO decision before implementation:** which provider? Google Places Autocomplete (widest coverage, billed API beyond a free tier — confirmed viable at family/small-group scale: autocomplete keystrokes are free at any volume when a session is properly closed by a Place Details call, and Essentials-tier Place Details gets 10,000 free calls/month, comfortably enough here) vs. Mapbox Search API (similar shape, separate account/key). Both are plain HTTP APIs — same client integration on iOS/Android. (Apple's `MKLocalSearchCompleter` was considered and rejected: iOS-only, no Android path, moot anyway since Android is out of scope for the whole roadmap — see "Other flags.") Not choosing here since it's a billing/account decision, not an architectural one.

**Client scope:** upgrades `AddressSearchModal` (FT-14) in place — wire it to a new `useAddressAutocomplete(query)` hook: debounced (don't fire per keystroke) and **AbortController-cancelled** on each new query so a slow stale response can't overwrite a newer result set. Renders a dropdown of narrowing suggestions below the input; selecting one resolves to a place (a second "place details" call for most providers, since autocomplete predictions return text + an opaque id, not raw coordinates) and returns it to whichever screen opened the modal (`AddPlaceScreen` or `EditPlaceScreen`), same return path FT-14 already uses for the exact-match version.

**New surface:** provider API key (new `.env` entry, follow this repo's existing `.env.example` pattern); new failure states (no network, zero results, rate-limited/quota-exceeded, provider timeout); if Google Places, session-token handling so the autocomplete + details calls bill as one session instead of two.

**Out of scope:** the provider account/billing setup itself (a one-time manual step, not a code task); any change to FT-13's schema (still just lat/lng/radius_m) or FT-14's `MapLocationPicker` path, which remains available alongside this.

---

### FT-15 detail — Push notification infrastructure (shared primitive)

**Type:** Chore (infra — no user-facing feature surface of its own; FT-16's
foreground alert stays in-app only, FT-17 is the first consumer that
actually triggers a push)

**Why:** FT-17 (entry/exit push) and FT-27 (v6 dangerous-activity push)
both need to "send a push notification to specific user(s)." Building that
inside FT-17 would hardcode it to geofencing and force FT-27 to duplicate
or refactor it later. FT-15 lands the generic pieces once: device token
storage, permission/registration on the client, and a shared server-side
send function that takes a recipient list + content, with zero
geofencing/activity awareness. FT-16 (foreground detection) doesn't depend
on this ticket — an in-app alert isn't a system push.

**Provider:** `expo-notifications` + Expo Push Service — the default for
an Expo-managed app already past the dev-build line (remote push isn't
supported in Expo Go from SDK 49+ anyway, so this doesn't cross a *new*
Expo Go/dev-build boundary, it's already on the dev-build side). Free, no
billing decision — not flagging as OPEN.

**Schema — `push_tokens`** (new migration `0010_push_tokens.sql`):
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.profiles(id) on delete cascade`
- `expo_push_token text not null unique` — unique on the token itself, not
  `(user_id, token)`: a token belongs to one device installation, and the
  same physical device can later be signed into a different account
  (shared household device). Upsert-on-conflict-by-token reassigns
  `user_id` automatically instead of accumulating stale rows for the old
  account.
- `updated_at timestamptz not null default now()` — bumped on every upsert
  (fresh grant, token refresh, or device reassignment).
- `created_at timestamptz not null default now()`

Index: `push_tokens_user_id_idx on (user_id)` (server-side send lookup).

**RLS / grants:** RLS enabled, one `push_tokens_own_row` policy,
`using/with check (auth.uid() = user_id)`, granted `select, insert,
update, delete` to `authenticated`. `select` is granted even though
nothing client-side reads a token back deliberately: Postgres requires
SELECT privilege to satisfy the RETURNING clause `upsert()` uses
internally to report what was written, regardless of whether the caller
asks for the row back — found during on-device QA (`upsert()` was failing
with a bare "permission denied" until `select` was added). RLS still
scopes it to the caller's own row, so this doesn't expose other users'
tokens. The server-side send function below runs under the service-role
key; `service_role` also needed its own explicit `select, insert, update,
delete` grant (found during on-device QA) — its RLS-bypass privilege
(BYPASSRLS) only skips row-level security policies, not the separate
table-grant system, so it doesn't get implicit access either.

**Server-side logic — shared send function, not a public endpoint:**
- `supabase/functions/_shared/sendPush.ts` — exports
  `sendPushNotification({ userIds, title, body, data })`. Looks up
  `push_tokens` for `userIds` (service-role client), batches to Expo's
  push API (`https://exp.host/--/api/v2/push/send`), and on an Expo
  `DeviceNotRegistered` receipt error, deletes that token row. Generic on
  purpose: no `geofence`/`activity` fields, just `title`/`body`/an opaque
  `data` payload the caller shapes.
- Deliberately a **shared importable module**, not its own deployed Edge
  Function reachable over HTTP: FT-17's and FT-27's trigger functions run
  in the same Supabase Edge Functions project and can import it directly,
  avoiding an extra network hop and its own auth surface for something
  never called from the client.
- No Edge Function is deployed by this ticket — nothing triggers it yet.
  Deployment happens with the first real caller (FT-17).

**Client scope** (`features/notifications/`, new feature folder — first
ticket to need it):
- `features/notifications/hooks/usePushRegistration.ts` — requests
  notification permission (mirrors FT-3's request/granted/denied shape),
  on grant calls `getExpoPushTokenAsync` and upserts `{ user_id,
  expo_push_token }` onto `push_tokens` (`onConflict: 'expo_push_token'`),
  and subscribes to Expo's push-token-change listener to re-upsert if the
  OS rotates the token. Returns `{ status: 'granted' | 'denied' |
  'undetermined' }` for the denied-state UI below.
- Invoked once from `app/(app)/_layout.tsx` (additive, alongside the
  existing `GroupsProvider` wrap) — requests permission automatically on
  first authenticated load, no dedicated onboarding screen (unlike FT-3's
  location flow): notifications aren't required for core app function, so
  a blocking permission screen isn't warranted.
- `app/_layout.tsx` (root layout, touched additively) — module-level
  `Notifications.setNotificationHandler(...)` call so a push shown while
  foregrounded actually displays (Expo's default suppresses it). Config
  only, not tied to auth state.
- `features/notifications/hooks/useNotificationResponse.ts` — subscribes
  to `addNotificationResponseReceivedListener`, returns the tapped
  notification's `data` payload. FT-15 calls nothing with it (no consumer
  exists yet); this just exposes the subscription so FT-17/FT-27 can route
  on `data.type` without each reimplementing the listener.
- `NotificationPermissionBanner` — small additive row on
  `GroupsScreen.tsx` (existing home screen), rendered only when
  `usePushRegistration()` reports `denied`; tapping opens
  `Linking.openSettings()`. This is the "ask again" surface per the
  permissions rule — there's no dedicated Settings screen in this app yet,
  so it lives on the existing home screen rather than spawning a new one.
- `app.json` — add the `expo-notifications` config plugin.

**Permissions:** Notifications permission, introduced by this ticket.
Denied state: `NotificationPermissionBanner` on `GroupsScreen`, tap → OS
Settings. No blocking flow — the app is fully usable with notifications
denied, unlike location.

**Edge cases:**
1. Same device, different account signs in later — token upsert
   reassigns `user_id` by conflict on `expo_push_token`, no stale
   recipient row left behind.
2. Permission denied then later granted via Settings — no in-app
   re-request needed; iOS relaunches the app on return from Settings,
   `usePushRegistration`'s effect re-runs and registers normally.
3. Uninstall/reinstall — old token naturally stops resolving (Expo returns
   `DeviceNotRegistered` on next send), `sendPushNotification` prunes it
   lazily rather than needing an uninstall hook.
4. User signs out — token row is left in place (not deleted): it gets
   reassigned if a different account signs in on that device, and costs
   nothing if the same account signs back in.
5. Two devices, one account (e.g. phone + a second household iPad) —
   supported naturally, one row per device, `sendPushNotification` fans
   out to every token for a `user_id`.

**Out of scope:** any actual trigger/recipient logic (FT-17, FT-27
entirely — this ticket sends nothing on its own); notification tap →
navigation routing (consumer's job, per notification type); Android (out
of scope for the whole roadmap); notification categories/actions;
badge-count management; any UI beyond the one denied-state banner.

**New surface:** requires an APNs key uploaded to the EAS project (Apple
Developer Portal → `eas credentials`) before a real push can be delivered
— one-time account setup, not a code task, same category as FT-14b's
provider key.

**On-device verification:** Grant notification permission on first
authenticated load; confirm a row appears in `push_tokens` for that user
(Supabase dashboard). Deny permission on a fresh install instead; confirm
`NotificationPermissionBanner` appears on the Groups screen, and tapping
it opens the iOS Settings app to this app's page. For the send path itself
(no consumer wired up yet), run `sendPushNotification` from a throwaway
local script (service-role key, not part of the app/repo) targeting your
own `user_id`; confirm the push is received both foregrounded (visible
banner, per the handler config) and backgrounded (system notification),
and that tapping it doesn't crash.

---

### FT-16 detail — Foreground geofence detection + in-app alert *(DESIGN CORRECTED 2026-08-25)*

**Correction:** The original version of this ticket (built + code-reviewed once) shipped a **self-only** alert — the crossing user saw their own "Entered {name}" banner. Confirmed wrong with the PO: the alert should notify **other** foregrounded group members when someone crosses a zone, not the crossing user themselves (e.g. Kirsten arrives home → Brian's foregrounded phone shows "Kirsten entered Home"; Brian's own phone shows nothing for his own arrival). Detection and logging are untouched — this only changes how the alert is *delivered*.

**Rework scope:**
- **Rebuild:** `useGeofenceAlert.ts`, `GeofenceAlertBanner.tsx` — realtime-subscription + other-member-filtering logic replaces the local-crossing-driven banner.
- **Unchanged, reuse as-is:** `distance.ts`, `useGeofenceDetection.ts`, `useLogGeofenceEvent.ts` — still "I crossed a zone, log it to `geofence_events`," per-device against the device's own location. `GeofenceCrossing` type (local crossing shape) is also unchanged.
- **Edited again:** `FamilyMap.tsx` (new props into `useGeofenceAlert`), `geofence.types.ts` (new `GeofenceAlertEvent` type, alongside untouched `GeofenceCrossing`).

**Type:** Feature (unchanged)

**Why:** unchanged premise — FT-13/14 give geofences and zone management but nothing surfaces a crossing live. FT-16 closes that loop for the foreground case: watch group members' `geofence_events` writes in realtime and alert on the ones that aren't your own. Still no push, still no background — FT-17/FT-18.

**Schema:** None new, confirmed. FT-13's `geofence_events_select_group_member` RLS (`exists ... is_group_member(g.group_id)`) already permits a group member to *read* every other member's `geofence_events` rows for shared geofences — that's exactly what the realtime subscription below needs, no policy change required.

**Delivery design (rebuilt) — mirrors `useGroupMemberLocations`'s realtime pattern (FT-6):**
- `GeofenceAlertEvent` type (new, `geofence.types.ts`): `{ geofenceId: string; geofenceName: string; eventType: 'enter' | 'exit'; userId: string; displayName: string; occurredAt: string }` — same shape as `GeofenceCrossing` plus the crossing member's identity.
- `useGeofenceAlert.ts` (rebuilt) — new signature: takes `activeGroupId`, `geofences` (id→name resolution, already held by `FamilyMap`), `members` (id→displayName resolution — reuses `useActiveGroupMembers`, which already excludes self server-side, no new lookup path), and `userId` (self, for an explicit filter). Subscribes to one unfiltered `postgres_changes` INSERT channel on `geofence_events` (e.g. `geofence_events:active_group`), keyed to `activeGroupId` — not to `geofences` content, to avoid resubscribing on every zone create/edit; the current geofence id→name map is held in a ref, updated by a separate effect off `geofences`. On each INSERT: skip if `payload.new.user_id === userId` (self-write, including from a second device on the same account, per FT-15 edge case 5); skip if `geofence_id` isn't in the current geofence ref (event belongs to a non-active group's zone, or the zone was just deleted); skip if `user_id` isn't found in `members` (stale membership/race — fail silent, no "Unknown" alert); otherwise build a `GeofenceAlertEvent` and show it. Same transient-banner mechanics as before: shows immediately, auto-dismisses after `GEOFENCE_ALERT_AUTO_DISMISS_MS`, manual dismiss cancels the timer. No initial fetch on mount (unlike `useGroupMemberLocations`) — alerts are realtime-only, no backfill of missed crossings.
- `GeofenceAlertBanner.tsx` (rebuilt) — same controlled/banner-row shape, copy changes to `"{displayName} entered {name}"` / `"{displayName} left {name}"`.

**Client scope — `FamilyMap.tsx` (edited again):** `useLogGeofenceEvent`/`useGeofenceDetection` wiring is untouched (still local crossing → log). `useGeofenceAlert` is now called with `(activeGroupId, geofences, members, userId)` instead of `(latestCrossing)`; `members` is already fetched here via `useActiveGroupMembers` for marker rendering — no new fetch added.

**Permissions:** None new, unchanged.

**Edge cases:**
1. Self crossing, any device on the account — no alert on the crossing user's own phone. This is the point of the correction, not a gap to work around.
2. Two members' phones both foregrounded on the same active group — each is alerted about the other's crossing, never their own.
3. Active group switched — the geofence-id ref used for filtering is rebuilt from the newly active group's `geofences`; an in-flight event for the previous group that lands after the switch is filtered out (its geofence id is no longer in the ref).
4. Crossing member has left the group, or their row in `members` hasn't loaded yet — event dropped silently rather than shown with a missing name.
5. Geofence deleted between the crossing and the alert's arrival — dropped silently, same posture as #4.
6. GPS jitter / rapid flapping — still no debounce (unchanged accepted posture from FT-13); each row still produces its own alert to other members.
7. App backgrounded/killed — no subscription runs, matches detection's own posture (unchanged); FT-18's line to move.

**Out of scope:** background detection (FT-18); actual push notifications (FT-17 — this is still in-app/foreground-only, just no longer self-targeted); showing your own crossing to yourself anywhere (explicitly not wanted, per PO); debounce/hysteresis; any change to `geofences`/`geofence_events` schema or RLS; a crossings-history UI; any change to `useForegroundLocation`, `useGeofences`, `useGeofenceDetection`, `useLogGeofenceEvent`, or `distance.ts`.

**On-device verification:** Requires two accounts in the same group, each on a foregrounded device (or two Expo Go sessions). Have account A cross a zone boundary — confirm account B's phone shows "{A's name} entered/left {zone}" and account A's own phone shows nothing. Reverse roles. Confirm a `geofence_events` row still lands with the correct `user_id` (unchanged detection/logging path). Switch account B's active group away from the shared one, then have account A cross again — confirm B gets no alert while off that group, and does again after switching back.

---

### FT-17 detail — Push notification to other group members on entry/exit (server-triggered webhook)

**Type:** Feature

**Why:** FT-16's in-app alert only reaches other group members whose app is foregrounded and subscribed to the realtime channel — the common case (closed/backgrounded app) gets nothing. FT-17 closes that gap server-side: a Database Webhook fires on every `geofence_events` INSERT, resolves the crossing event's other group members, and sends each of them a real push via FT-15's `sendPushNotification`. Detection/logging (FT-16) is unchanged; this is a second delivery path off the same write, not a replacement for FT-16.

**Schema:** None new. Reads `geofence_events` (FT-13), `geofences.group_id`/`name` (FT-13), `group_members`/`profiles` (FT-7) — all already RLS-protected but this reads under `service_role`, bypassing RLS by design (server-side dispatch, not client reads).

**Server-side logic** (new migration `0011_geofence_push_webhook.sql` + new edge function):
- `supabase/functions/geofence-alert-push/index.ts` — HTTP handler invoked by the webhook below. Payload is the standard Database Webhook shape (`{ type: 'INSERT', table: 'geofence_events', record: {...} }`). Steps: verify a shared secret header (Function secret, set via `supabase secrets set`) so the endpoint can't be hit by anyone who guesses the URL; look up the geofence (`name`, `group_id`) for `record.geofence_id` — if not found (deleted in the race between insert and webhook firing), no-op and return 200; look up the crossing user's `display_name`; query `group_members` for that `group_id` excluding `record.user_id` to get recipient ids — if empty (sole member), no-op; build `title`/`body` (`"{displayName} entered {zoneName}"` / `"...left..."`, same copy convention as FT-16's banner) and `data: { type: 'geofence_alert', geofenceId, eventType, userId, occurredAt }`; call FT-15's `sendPushNotification({ userIds: recipientIds, title, body, data })` (imported directly, same Edge Functions project).
- Trigger: a Database Webhook (Supabase's built-in `supabase_functions.http_request` trigger), `AFTER INSERT ON geofence_events FOR EACH ROW`, POSTing to the deployed function URL with the shared-secret header. Configured via migration (not dashboard-only) so it's versioned like every other schema change here.
- No new RLS/grants — the function runs under the service-role key, same posture as FT-15's `sendPushNotification`.

**Foreground-banner decision (resolved, not left ambiguous):** When the receiving member's app is foregrounded, the push does **not** also present as a native banner — FT-16's realtime in-app alert already covers that exact case (arrives on the same event, same content, typically faster since it skips the webhook/HTTP round trip). Showing both would mean the same crossing produces two visibly different-looking notices back to back on one screen. `app/_layout.tsx`'s notification handler (FT-15) is edited, additive/conditional only: when `notification.request.content.data.type === 'geofence_alert'`, return `shouldShowBanner: false` (and `shouldPlaySound: false`) — every other notification type (e.g. FT-27's future dangerous-activity push) keeps FT-15's existing show-while-foregrounded behavior. Backgrounded/killed apps are unaffected either way — the handler never runs there, so those pushes always surface as normal system notifications regardless of type. This is the entire client-side change this ticket makes.

**Client scope:** the one conditional edit to `app/_layout.tsx` above. No new screens, hooks, or components — recipients already have FT-15's push registration and FT-16's in-app path; this ticket only adds the missing delivery leg.

**Edge cases:**
1. Geofence deleted between the crossing insert and the webhook firing — function no-ops (geofence lookup returns nothing), no crash, no orphaned push.
2. Crossing user is the group's sole member — recipient query returns empty, no-op, no error.
3. Recipient has push permission denied / no `push_tokens` row — `sendPushNotification` already treats a userId with no tokens as a no-op (FT-15 behavior, unchanged).
4. Recipient has multiple devices — one push per token, same fan-out FT-15 already does; not new to this ticket.
5. Recipient foregrounded on a *different* active group than the crossing one — still gets the push (webhook has no concept of "active group," it targets everyone in the geofence's group except the crosser); FT-16's in-app alert would have filtered this out via `activeGroupId`, so this is a real, narrow divergence between the two delivery paths worth flagging, not fixing here — the push is arguably still correct (a crossing happened in a group they belong to), just not deduped against their currently-viewed group.
6. Rapid duplicate enter/exit rows (GPS flapping, same accepted posture as FT-13/FT-16) — each row fires its own webhook call and its own push; no dedupe/debounce added here either.
7. Webhook delivery failure/retry (Supabase webhooks retry on non-2xx) — the function is idempotent-safe to re-run (same `geofence_events` row just re-triggers the same lookup/send), so a retry duplicating one push is an acceptable, rare cost, not guarded against explicitly.

**Out of scope:** background detection (FT-18 — this ticket only reacts to whatever writes `geofence_events`, foreground or eventually background, without caring which); notification tap → navigation (flagged as a follow-up, same as FT-15's own "out of scope" note — `data.type`/`data.geofenceId` are already shaped to support it later); dedupe/debounce of rapid crossings; any change to FT-13's schema/RLS, FT-15's `sendPushNotification`/`push_tokens`, or FT-16's realtime alert logic; Android (out of scope for the whole roadmap); reconciling case #5 above (push not scoped to the recipient's active group) — flagged, not solved.

**On-device verification:** Two accounts sharing a group, each with push permission granted (FT-15) and at least one zone (FT-14). With account B's app **backgrounded**, have account A cross the zone boundary — confirm B receives a system push notification ("A entered/left {zone}") and tapping it opens the app without crashing. Repeat with B's app **foregrounded on the same group** — confirm B sees FT-16's in-app banner but **no** native banner/sound from the push (single notice, not two). Repeat with B foregrounded but on a **different** active group — confirm B still receives the native push (case #5) despite seeing no in-app banner. Confirm account A never receives a push for its own crossing (recipient query excludes the crosser, same invariant as FT-16).

---

### FT-18 detail — Background geofence detection

**Type:** Feature

**Why:** FT-16/17 only ever have something to detect when the crossing
user's own app is foregrounded — `useGeofenceDetection` polls `coords`
from `useForegroundLocation`'s JS watch loop, which stops the instant the
app backgrounds. FT-18 makes the crossing user's *own* detection survive
backgrounding/kill, so FT-16's alert and FT-17's push (both already
correct and unchanged) have a `geofence_events` row to react to even
then. This is a detection-source ticket only — no new alerting mechanism.

**Design decision — native region monitoring, not a JS loop:** iOS does
not reliably keep a JS `watchPositionAsync` loop running once
backgrounded/suspended. Per `expo-location`'s SDK 57 docs, the supported
pattern for detection that survives backgrounding (and, per Apple's
documented behavior, even a user force-quitting the app) is native
circular-region monitoring: `Location.startGeofencingAsync(taskName,
regions)` registers regions with iOS's CoreLocation directly; the OS —
not app JS — watches for entry/exit and wakes a
`TaskManager.defineTask`-registered headless task to handle it, from
`expo-task-manager` (new dependency, not yet in `package.json`). Confirm
exact function/type names against
https://docs.expo.dev/versions/v57.0.0/sdk/location/ and
.../sdk/task-manager/ before implementing — this is the intended shape,
not assumed from general RN knowledge.

**Permission & native config changes:**
- New "Always" location permission, layered on top of FT-3's existing
  "When In Use" grant (already required to reach any `(app)` screen via
  `LocationPermissionGate`) — `getBackgroundPermissionsAsync`/
  `requestBackgroundPermissionsAsync`. iOS shows its "Upgrade to Always
  Allow" prompt only once; a denial (or a later downgrade via Settings)
  routes to the same Settings-deep-link pattern every other permission
  in this app already uses, not a re-prompt.
- `app.json`: add the `expo-location` config plugin (not currently
  listed in `plugins` — today's foreground permission relies only on a
  manual `infoPlist` string) with `locationAlwaysAndWhenInUsePermission`
  (new purpose string that must concretely justify background use for
  App Store review — e.g. "So your family can be alerted when you
  arrive at or leave a Zone, even when Family Tracker isn't open") and
  `isIosBackgroundLocationEnabled: true` (adds `UIBackgroundModes:
  ["location"]`). Consolidate the existing manual
  `ios.infoPlist.NSLocationWhenInUseUsageDescription` into the plugin's
  `locationWhenInUsePermission` field instead, so both strings are
  managed in one place rather than risking drift.
- New dependency: `expo-task-manager` (`npx expo install`, matches this
  project's other `~57.0.x`-pinned Expo packages).
- **Native rebuild required.** Both the plugin config and the new native
  module change the dev client's compiled binary — a fresh `expo run:ios`
  / EAS dev-client build is needed before this ticket can run on-device;
  a Metro-only reload isn't enough. Flagged per this ticket's own
  constraint, not treated as blocking the design.

**Schema:** None. Reuses FT-13's `geofences`/`geofence_events` tables and
RLS as-is — the background task inserts through the same
`authenticated`-role grant/policy (`geofence_events_insert_own`) any
other client insert already uses.

**Detection & write path:**
- `features/geofencing/lib/logGeofenceEvent.ts` (new) — the plain,
  non-hook `geofence_events` insert extracted out of FT-16's
  `useLogGeofenceEvent.ts` (which now just calls it from its effect).
  First time this insert is needed from two call sites (a hook and a
  headless task), so it's pulled out once here rather than duplicated —
  no other behavior change to FT-16's hook.
- `features/geofencing/backgroundGeofenceTask.ts` (new) — module-scope
  `TaskManager.defineTask(BACKGROUND_GEOFENCE_TASK_NAME, ...)`. Must be a
  top-level side-effect import (the OS can relaunch headless JS and
  needs the task already defined, whether or not any screen has mounted
  this session) — imported once from `app/_layout.tsx`, same precedent
  as FT-15/17's other module-scope registrations there. On each native
  event: resolves `auth.getSession()` (relies on FT-2's existing
  AsyncStorage-persisted session — no new auth wiring) for `user_id`,
  maps the region `identifier` back to a `geofence_id` and
  `Location.GeofencingEventType.Enter/Exit` to `'enter'/'exit'`, and
  calls `logGeofenceEvent`. No `geofenceName` resolution needed (not
  stored on the row); none of FT-16's alert-side name-lookup logic is
  touched.
- `features/geofencing/hooks/useBackgroundGeofencePermission.ts` (new) —
  mirrors `useLocationPermission.ts`'s shape/states
  (`checking`/`undetermined`/`granted`/`denied`) over the background
  permission APIs.
- `features/geofencing/hooks/useBackgroundGeofenceRegistration.ts` (new)
  — given `activeGroupId`, `geofences`, and background permission
  status: listens for `AppState` transitions and keeps native region
  monitoring **exclusively a background-mode thing** —
  `startGeofencingAsync` on transition to `background` (only if
  permission is granted and at least one zone exists, capped to
  `MAX_MONITORED_GEOFENCES` regions, iOS's own system region-monitoring
  ceiling), `stopGeofencingAsync` on transition back to `active` so
  FT-16's foreground JS loop is the sole detector while the app is open.
  Deliberate design choice, not incidental — see edge case 1.
- `features/map/components/FamilyMap.tsx` (edited) — wires in both new
  hooks alongside the `geofences`/`activeGroupId` it already fetches;
  renders a new `BackgroundLocationPermissionBanner` (below the existing
  notification/geofence-alert banners) whenever permission isn't
  `granted` and the user has at least one group.
- `features/geofencing/components/BackgroundLocationPermissionBanner.tsx`
  (new) — non-blocking banner, mirrors `NotificationPermissionBanner`'s
  shape but with two copy states: `undetermined` (tap →
  `requestPermission()`, explains the background-alert benefit) and
  `denied` (tap → `Linking.openSettings()`).
- `lib/constants.ts` (edited) — adds `BACKGROUND_GEOFENCE_TASK_NAME` and
  `MAX_MONITORED_GEOFENCES` (20).

**Edge cases:**
1. Foreground + background double-detection of the same real crossing —
   avoided by design (native monitoring only runs while backgrounded; JS
   detection only runs while foregrounded), not by dedupe. A crossing
   landing in the exact instant of the `AppState` transition could
   theoretically be missed by both or double-logged — accepted as a rare
   timing gap, same tolerance this app already has for GPS-jitter
   duplicates (FT-13/16/17), not hardened further here.
2. App force-quit by the user (not just backgrounded) — per Apple's
   documented behavior, circular region monitoring is one of the few
   background APIs that survives this; the OS relaunches the app
   headlessly to run the registered task. This is the ticket's core new
   capability and the main thing on-device verification needs to prove,
   since it can't be simulated.
3. Group has more than `MAX_MONITORED_GEOFENCES` zones — registers only
   the first 20 (stable order, e.g. by `id`), no proximity-aware
   prioritization; unlikely at family/household scale, flagged rather
   than solved.
4. Permission downgraded from Always back to When-In-Use (or off) via
   Settings mid-session — the next `AppState` background transition
   finds `status !== 'granted'` and skips `startGeofencingAsync`; if
   monitoring was already active, it isn't proactively torn down the
   moment Settings changes (no way to observe that while foregrounded
   without polling). Acceptable gap, not solved here.
5. Session expired/signed out at the moment a background event fires —
   `auth.getSession()` resolves to no user, the insert is skipped via
   `logGeofenceEvent`'s existing swallow-and-log posture (unchanged from
   FT-16).
6. Zero zones in the active group, or zero groups — nothing registered;
   the banner still offers the permission ask (useful ahead of the first
   zone being created), the registration hook just no-ops.

**Out of scope:** any change to FT-16's `useGeofenceDetection`/
`distance.ts` (unchanged, still the foreground detector) or to FT-17's
webhook/alert logic (both already react to any `geofence_events` insert
regardless of source); Android (out of scope for the whole roadmap);
proximity-aware region prioritization past the 20-region cap; an in-app
toggle to turn background tracking off independent of iOS Settings; any
persistent in-app "background tracking active" indicator beyond iOS's
own system-level location-in-use indicator; historical backfill of
crossings missed while permission was denied; any general-purpose
background location broadcast (this is geofence detection only, not a
background version of `location_history` writes).

**On-device verification — physical device required; the iOS Simulator
can't reliably simulate region-monitoring callbacks for backgrounded/
killed apps.** After rebuilding the dev client: (1) grant "Always" via
the new banner's ask flow; separately verify the denied → Settings path.
(2) With the app foregrounded, cross a zone boundary — confirm FT-16's
existing foreground behavior is unaffected. (3) Background the app
(home/swipe up, not force-quit) outside any zone, then cross a
boundary — confirm a `geofence_events` row lands (Supabase dashboard)
and another foregrounded group member gets FT-16's alert and/or FT-17's
push. (4) Force-quit the app entirely from the app switcher, cross a
different zone boundary, and confirm a row still lands and the other
member is still alerted — this is the capability the whole ticket exists
for. (5) Revoke "Always" via Settings, background again, cross a
boundary — confirm no new row lands. (6) Re-foreground after a
background crossing and confirm native monitoring stops (no further
background rows while foregrounded) and JS detection resumes normally.

**Files touched:**
- `app.json`
- `package.json` (new `expo-task-manager` dependency)
- `lib/constants.ts`
- `app/_layout.tsx`
- `features/geofencing/lib/logGeofenceEvent.ts` (new)
- `features/geofencing/hooks/useLogGeofenceEvent.ts`
- `features/geofencing/backgroundGeofenceTask.ts` (new)
- `features/geofencing/hooks/useBackgroundGeofencePermission.ts` (new)
- `features/geofencing/hooks/useBackgroundGeofenceRegistration.ts` (new)
- `features/geofencing/components/BackgroundLocationPermissionBanner.tsx` (new)
- `features/map/components/FamilyMap.tsx`

**Note on parallel dispatch:** shares `features/map/components/FamilyMap.tsx`
and `lib/constants.ts` with FT-29's file list, but FT-29 is already ✅
Done — no live conflict today. No other currently-Ready ticket touches
these files.

---

### FT-34 detail — Fix spurious geofence exit/enter bursts on AppState re-registration

**Type:** Bug

**Why:** `useBackgroundGeofenceRegistration` (FT-18) calls `startGeofencingAsync` on every `background` transition and `stopGeofencingAsync` on every `active` transition. iOS evaluates every registered region's current membership synchronously on `startGeofencingAsync` and delivers it through the same callback as a real crossing — one `exit` per non-occupied zone, one `enter` for the occupied one. Confirmed on-device (2026-08-28, and again 2026-08-31) recurring every few minutes while continuously backgrounded, not just at relaunch, so something is re-triggering the `background` transition more often than a single foreground→background edge explains. Each spurious row fires FT-17's push webhook — active spam to other group members, high severity.

**Likely root cause (verify on-device, not certain at design time):** iOS terminates (not just suspends) backgrounded apps under routine memory pressure, then relaunches them headlessly to service a pending region-monitoring callback. Each relaunch remounts `FamilyMap.tsx` and creates a *new* `AppState` listener with no memory of the app's prior state, so the first `'change'` event it receives — even one just confirming the already-current `background` state — reads as a fresh transition and re-fires `startMonitoring`. Senior dev should correlate device logs (process-launch timestamps vs. burst timestamps) to confirm before assuming this is the sole cause. Fix 1 below is robust to this cause or plain foreground/background flapping (Control Center, lock/unlock) equally — it removes AppState as the registration trigger entirely.

**Fix 1 — decouple registration from AppState (primary, structural):** `useBackgroundGeofenceRegistration` stops listening to `AppState` for registration. Instead, a plain effect keyed on `[permissionStatus, activeGroupId, geofences]` computes a stable signature of the target region set (sorted `id:lat:lng:radiusM`) and calls `startGeofencingAsync` only when that signature differs from the last one actually registered (tracked via the new module below). Monitoring registers once permission/zones are ready and then runs continuously — never stopped on foreground. Re-registration now only happens on a genuine zone add/edit/delete or permission grant, not on every background/foreground flip.

**Fix 2 — preserve "no duplicate foreground detection" without stop/start:** FT-18's original mechanism for keeping native monitoring from firing alongside FT-16/33's foreground JS detector was turning it off while foregrounded. Since Fix 1 keeps it always on, that invariant moves into `backgroundGeofenceTask.ts`: before calling `logGeofenceEvent`, check `AppState.currentState`; if it reads `'active'`, no-op — the foreground detector already owns this crossing. A headless relaunch has no mounted UI, so `AppState.currentState` never reads `'active'` there, so the gate only suppresses writes when the app is genuinely foregrounded. `useGeofenceDetection.ts`/`distance.ts` (FT-16/33) are untouched.

**Fix 3 — suppress the initial-state burst on genuine (re-)registrations:** even a legitimate `startGeofencingAsync` call (first-ever registration, or a real zone-set change) still produces iOS's synchronous initial-membership report for every region. `backgroundGeofenceTask.ts` also checks a "registered at" timestamp (written by the hook immediately after each real `startGeofencingAsync` call) and skips writing for any callback landing within `GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS` of that timestamp — treated as an initial-state report, not a crossing, same accepted-imprecision posture as FT-13's other dedupe gaps. In-memory only: a genuine re-registration can only happen while the JS process is alive to call it, so the window and the process share a lifetime.

**New shared module:** `features/geofencing/lib/geofenceRegistrationTracker.ts` (new) — small in-memory module (no React) holding the last-registered signature and timestamp; written by `useBackgroundGeofenceRegistration` on every real `startGeofencingAsync` call, read by `backgroundGeofenceTask.ts` for Fix 3's window check. Needed because the hook and the headless task are separate modules with no other shared state.

**Edge cases:**
1. Zone added/edited/deleted while backgrounded — picked up by the effect diff on next foreground mount, same pre-existing latency as today, not worse.
2. App killed and relaunched headlessly for a real crossing — Fix 2's gate correctly falls through to writing (no UI, so `AppState.currentState` never reads `'active'`); Fix 3's window doesn't apply since a pure headless launch never calls `startGeofencingAsync`.
3. A real crossing lands inside the suppress window right after a genuine zone edit — swallowed (false negative), same class of accepted tradeoff as FT-33; rare relative to the spam this fixes.
4. Permission downgraded mid-session — unchanged from FT-18's existing edge case #4, not addressed here.

**Out of scope:** any change to `useGeofenceDetection.ts`/`distance.ts` (FT-16/33's foreground detector); FT-33's hysteresis fix itself (separate ticket); any change to `logGeofenceEvent.ts`'s insert shape or `geofence_events`/RLS; historical backfill/cleanup of already-inserted spurious rows (manual one-off, not code); Android.

**On-device verification:** physical device required. Grant "Always," create 2+ zones, background the app while inside one zone; confirm no `geofence_events` rows land for the un-occupied zones. Leave it backgrounded 15-20+ minutes without crossing anything; confirm zero new rows appear. Then cross a boundary while backgrounded; confirm exactly one row lands and one push fires. Foreground and cross a boundary; confirm FT-16's alert fires with no duplicate background-task row/push. Add a new zone while foregrounded; confirm the resulting one-time re-registration doesn't itself produce a spurious burst.

**Files touched:**
- `features/geofencing/hooks/useBackgroundGeofenceRegistration.ts`
- `features/geofencing/backgroundGeofenceTask.ts`
- `features/geofencing/lib/geofenceRegistrationTracker.ts` (new)
- `lib/constants.ts` (new `GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS`)

**No overlap with FT-33:** FT-33's fix lives entirely in `useGeofenceDetection.ts`/`distance.ts` (foreground detector) — zero shared files with this ticket, safe to run in parallel once both are Ready.

---

## V4 — Per-Group Visibility Controls *(blocked by v2)*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-19 | Schema: `group_visibility_overrides` — **event-sourced/append-only** (see locked consequence above), RLS layered on top of FT-12 | FT-12 | ✅ Done |
| FT-20 | Go invisible to a group (1h/2h/4h/all day = local midnight/indefinite) | FT-19 | ✅ Done |
| FT-21 | Global invisible toggle — separate event-sourced table, checked before per-group logic per #6 | FT-19 | ✅ Done |

### FT-19 detail — Schema: `group_visibility_overrides`

**Type:** Chore (schema/RLS only — mirrors FT-13's precedent: pure Postgres foundation, no UI; FT-20 is the first consumer)

**Why:** Decisions #6/#7 require "was this person hidden from this group at time T" to be answerable historically, not just right now — same reasoning that makes `location_history`/`geofence_events` append-only. This ticket lands the table plus RLS layered on FT-12's group-scoped `location_history` policy, so hiding takes effect at the DB layer as soon as a row exists, before FT-20 ships any UI to write one.

**Schema — `group_visibility_overrides`:**
- `id uuid primary key default gen_random_uuid()`
- `group_id uuid not null references public.groups(id) on delete cascade`
- `user_id uuid not null references public.profiles(id) on delete cascade`
- `event_type text not null check (event_type in ('hide', 'unhide'))` — same naming convention as `geofence_events.event_type`.
- `expires_at timestamptz null` — only meaningful for a `'hide'` event; null = indefinite. `check (event_type = 'hide' or expires_at is null)` backstops this.
- `created_at timestamptz not null default now()` — the event's own timestamp; also what FT-23's future "at time T" playback queries will compare against.

Index: `group_visibility_overrides_group_user_created_idx on (group_id, user_id, created_at desc)` — supports the "latest row" lookup both the helper function and FT-20's own-state fetch need.

**Event-sourced derivation ("currently hidden," concretely):** no current-state column anywhere. "Is user U currently hidden from group G" = take the single latest row for `(G, U)` ordered by `created_at desc`; true iff `event_type = 'hide'` and (`expires_at is null` or `expires_at > now()`). A duration-limited hide needs no matching `'unhide'` row to expire — passage of time alone flips the answer back once `expires_at` passes, which is also what makes "was U hidden from G at time T" answerable later by swapping `now()` for `T` in the same predicate. An explicit `'unhide'` row exists only for a user manually ending an indefinite (or early) hide.

**RLS / grants** (new migration `supabase/migrations/0014_group_visibility_overrides.sql`):
- RLS enabled. `select` granted to `authenticated`; **no `insert`/`update`/`delete` grant** — write access is RPC-only (FT-20's `set_group_visibility`), one consistent write path for every duration instead of a plain-grant/RPC split. Confirmed with Brian 2026-09-02.
  - `group_visibility_overrides_select_own`: `using (auth.uid() = user_id)` — a user reads their own hide history/current state only; no policy lets one member browse another's. Enforcement of who's hidden from whom happens via `location_history`'s policy below, not by exposing this table.
- New helper `public.is_hidden_from_group(p_user_id uuid, p_group_id uuid) returns boolean`, `stable`, `security definer`, pinned `search_path` (same hardening as FT-7/FT-12's helpers — needed because it reads rows the caller doesn't own, deliberately bypassing the self-only policy above): implements the derivation.
- New helper `public.shares_visible_group_with(p_user_id uuid) returns boolean`, `stable`, `security definer`, pinned `search_path` — replaces FT-12's `shares_group_with` at this one call site: true iff there exists a group both `auth.uid()` and `p_user_id` belong to where `not is_hidden_from_group(p_user_id, that group's id)`. `shares_group_with` itself is left in place, unused after this migration but not dropped — removing a function used by one now-replaced policy isn't worth the risk for a ticket that isn't about cleanup.
- Drops `location_history_select_shared_group_member` (FT-12), recreates as `location_history_select_shared_visible_group_member`: `using (auth.uid() = user_id or public.shares_visible_group_with(user_id))`. Self-clause unchanged and still load-bearing — hiding blocks *other* members' view, never your own.

**Forward note for FT-21 (global toggle, not this ticket):** decision #6 wants a global hidden flag checked before per-group logic. The natural extension is an outer `and not is_globally_hidden(user_id)` clause on this same `location_history` policy — additive to this migration's shape, not a rewrite of it. Flagged so FT-21 doesn't re-derive this policy from scratch.

**Edge cases:**
1. No override row ever exists for `(G, U)` — `is_hidden_from_group` returns false; matches today's FT-12 behavior for every user until FT-20 ships.
2. Hide expires mid-session — no write needed to become visible again; the next SELECT/realtime-INSERT evaluation of the policy just re-evaluates `now()`.
3. Group deleted, or either profile deleted — cascades via FK, consistent with `geofences`/`invites`.
4. User removed from the group (`group_members` row deleted) but override rows remain — deliberately **not** cascaded off `group_members` (no FK to it); needed so a future "was hidden at time T" stays answerable for a since-departed member, per decision #7.
5. Rapid duplicate hide/hide or unhide/unhide writes — no dedupe constraint, same accepted posture as `location_history`/`geofence_events`.

**Out of scope:** the write path and any UI (FT-20, entirely — this ticket ships zero way to create a row); FT-21's global-flag table/logic; FT-23's playback redaction logic (consumes this table's history later, not built here).

**Verification (schema-only, no client to run on-device):** apply the migration, then manually insert `'hide'`/`'unhide'` rows (Supabase SQL editor, since no RPC exists yet) and confirm against two accounts sharing a group: (a) with no override row, B sees A's location as before; (b) after inserting a `'hide'` row for A in that group with `expires_at` 5 minutes out, B's next fetch shows A gone; (c) once `expires_at` passes, a fresh fetch shows A visible again with no new row inserted; (d) an indefinite hide (`expires_at` null) stays hidden until an `'unhide'` row lands; (e) A always still sees their own location regardless of any hide row on their account.

**Files touched:**
- `supabase/migrations/0014_group_visibility_overrides.sql` (new)

---

### FT-20 detail — Go invisible to a group

**Type:** Feature

**Why:** FT-19 landed the table + RLS but nothing can write to it yet. FT-20 adds the toggle: a button scoped to the active group (same context FT-14's "Zones" button and `GroupSwitcher` live in), a duration picker (1h/2h/4h/all day/indefinite), and the one RPC needed to compute a server-side `expires_at` — every duration goes through this same RPC, one write path, not a plain-grant/RPC split. Confirmed with Brian 2026-09-02.

**Entry point:** new icon button on `FamilyMap.tsx`'s control row, alongside `GroupSwitcher`/the Zones button, gated on `activeGroupId != null` (same "no chrome with zero groups" precedent). Reflects current state via `useGroupVisibility(activeGroupId)` — eye vs. eye-slash icon.

**Duration picker:** tapping opens `VisibilityDurationSheet` — local modal state inside `FamilyMap.tsx`, not a route (same reasoning FT-14 used for `MapLocationPicker`/`AddressSearchModal`: no first-class way to return a value from a pushed screen). Options: 1 hour / 2 hours / 4 hours / All day / Until I turn it back on (indefinite). If already hidden for the active group, the sheet instead offers "Visible again now" (unhide).

**Server-side logic** (new migration `supabase/migrations/0015_set_group_visibility_rpc.sql`):
- `public.set_group_visibility(p_group_id uuid, p_hidden boolean, p_duration_minutes int default null, p_timezone text default null) returns void`, `security definer`: checks `is_group_member(p_group_id)` for `auth.uid()`. If `not p_hidden` → inserts `event_type = 'unhide'`, `expires_at = null`. If `p_hidden` and `p_duration_minutes` given → `expires_at = now() + make_interval(mins => p_duration_minutes)` (60/120/240 for 1h/2h/4h). If `p_hidden` and `p_timezone` given (duration null) → `expires_at` = next local midnight computed from `now() at time zone p_timezone`, converted back to `timestamptz` — the "all day" case. If `p_hidden` with both null → indefinite (`expires_at = null`). Default `PUBLIC` execute grant, same as FT-9/FT-10's RPCs.

**Client scope** (new `features/visibility/` folder):
- `features/visibility/types/visibility.types.ts` — `VisibilityDuration = '1h' | '2h' | '4h' | 'allDay' | 'indefinite'`; `GroupVisibilityState = { isHidden: boolean; expiresAt: string | null }`.
- `features/visibility/hooks/useGroupVisibility.ts` — given `activeGroupId`: one query for the caller's own latest override row (RLS-scoped by `group_visibility_overrides_select_own`), derives `GroupVisibilityState` client-side using the same predicate as `is_hidden_from_group` (small, acceptable duplication of one boolean check — not worth a round-trip RPC to read your own already-fetched row). Refetches on screen focus (mirrors `useActiveGroupMembers`). Returns `{ state, loading, refetch }`.
- `features/visibility/hooks/useSetGroupVisibility.ts` — `{ setVisibility(groupId, duration), setting, setErrorMessage }`. Maps duration → the RPC call (`'1h'/'2h'/'4h'` → `p_duration_minutes`; `'allDay'` → `p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone`; `'indefinite'` → both null; unhide → `p_hidden: false`). Calls the caller-supplied `refetch` on success (same cross-hook coordination precedent as FT-10/FT-11).
- `features/visibility/components/VisibilityToggleButton.tsx` — controlled (`isHidden`, `onPress`), icon-only, mirrors the Zones button's placement/style.
- `features/visibility/components/VisibilityDurationSheet.tsx` — controlled (`visible`, `isHidden`, `onSelectDuration`, `onUnhide`, `onClose`).
- `features/map/components/FamilyMap.tsx` (edited, additive) — wires both hooks, renders `VisibilityToggleButton` + conditionally `VisibilityDurationSheet`, same additive pattern as FT-14's Zones button.

**How gating actually happens (no client-side filtering code):** once FT-19's RLS exists, hiding takes effect purely at the DB layer — `useGroupMemberLocations` (FT-12) needs no changes. A hidden user's future `location_history` INSERTs simply stop matching `location_history_select_shared_visible_group_member` for blocked viewers, for both the initial query and the realtime INSERT stream (`postgres_changes` honors RLS per subscriber). This ticket adds zero visibility-gating logic to the map/location hooks.

**Confirmed with Brian (2026-09-02) — no "last seen" ghost marker, refetch-timed removal is fine for now:** a hidden user's dot must disappear entirely, not degrade into a stale "last seen X ago" marker like FT-28's staleness display — showing a last-known position after a deliberate hide would leak recent location, defeating the feature's purpose. Removal timing: a viewer who already has the app open keeps seeing the last-rendered marker until their map screen's next focus/refetch — RLS blocks new reads, not already-rendered client state. Brian explicitly accepted this (ship now, revisit "vanish instantly" later if wanted) rather than adding a live push-removal signal, which would be materially larger scope.

**Edge cases:**
1. Hide, then hide again with a different duration before the first expires — the new row is simply the new latest row; the earlier hide is superseded.
2. Unhide while no hide is active — allowed (harmless extra row), same tolerance as FT-10's accept-already-member case.
3. Device timezone changes mid-hide (travel) between setting "all day" and its expiry — `expires_at` was computed once, server-side, from the timezone sent at write time; doesn't recompute later. Accepted.
4. Hidden from Group A, still sharing Group B with a viewer — viewer keeps seeing them via B unless also hidden from B (`shares_visible_group_with` checks per-group); intended semantics, not a bug.
5. Sole member of a group hides — no other viewer exists to notice; harmless.

**Out of scope:** FT-21's global toggle (separate table/ticket, checked before this per decision #6); FT-23's playback redaction (reads this table's history later); any push/notification when someone goes invisible; any change to `useGroupMemberLocations`, `useActiveGroupMembers`, or `location_history`'s INSERT policy/grants — a hidden user's own device keeps writing `location_history` normally, only read visibility to others changes.

**On-device verification:** two accounts sharing a group, both foregrounded on the map. From A, open the visibility sheet, choose "1 hour" — confirm A's icon flips to hidden and, on B's next focus of the map, A's marker is gone. From A, tap "Visible again now" — confirm B sees A reappear on next focus. Repeat choosing "All day" — confirm the toggle persists across a force-quit/relaunch of A's app, and confirm (Supabase dashboard) the inserted row's `expires_at` lands at local midnight in the device's actual timezone, not UTC midnight. Confirm A always still sees their own marker while hidden from the group.

**Files touched:**
- `supabase/migrations/0015_set_group_visibility_rpc.sql` (new)
- `features/visibility/types/visibility.types.ts` (new)
- `features/visibility/hooks/useGroupVisibility.ts` (new)
- `features/visibility/hooks/useSetGroupVisibility.ts` (new)
- `features/visibility/components/VisibilityToggleButton.tsx` (new)
- `features/visibility/components/VisibilityDurationSheet.tsx` (new)
- `features/map/components/FamilyMap.tsx`

**File overlap:** zero shared files with FT-19 (FT-19 touches only its own migration file). `FamilyMap.tsx` is also touched by FT-18 and FT-29, both ✅ Done — no live conflict. No other currently-Ready ticket touches `FamilyMap.tsx`. FT-20 still can't start *before* FT-19 (its only dependency) is Done, but there's no file-overlap blocker once it is.

---

### FT-21 detail — Global invisible toggle

**Type:** Feature

**Why:** Decision #6 wants a single global "invisible to everyone" flag, checked *before* any per-group visibility logic — not a convenience action that fans out a hide write to every group (that would be indistinguishable from per-group hides at the data layer and wouldn't survive someone joining a new group while globally hidden). FT-19 anticipated this exact addition in its own "Forward note for FT-21": an outer `and not is_globally_hidden(user_id)` clause on `location_history`'s existing shared-visible-group policy. FT-21 lands that table, helper, RPC, and a UI entry point, mirroring FT-19+FT-20's combined shape as one ticket instead of two, since the surface is smaller (no group-scoping, no per-group entry point).

**Schema — `global_visibility_overrides`:**
- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references public.profiles(id) on delete cascade`
- `event_type text not null check (event_type in ('hide', 'unhide'))`
- `expires_at timestamptz null` — `check (event_type = 'hide' or expires_at is null)`, same shape as `group_visibility_overrides`.
- `created_at timestamptz not null default now()`

Index: `global_visibility_overrides_user_created_idx on (user_id, created_at desc)`. Same event-sourced derivation as FT-19: "currently globally hidden" = latest row for `user_id`, true iff `event_type = 'hide'` and (`expires_at is null` or `expires_at > now()`). No FK to any group — this table is intentionally group-agnostic.

**RLS / grants** (new migration `supabase/migrations/0018_global_visibility_overrides.sql`):
- RLS enabled. `select` to `authenticated`; no `insert`/`update`/`delete` grant — RPC-only write path, same posture as FT-19.
  - `global_visibility_overrides_select_own`: `using (auth.uid() = user_id)`.
- New helper `public.is_globally_hidden(p_user_id uuid) returns boolean`, `stable`, `security definer`, pinned `search_path` — same derivation/hardening pattern as `is_hidden_from_group`.
- Drops `location_history_select_shared_visible_group_member` (FT-19), recreates as `location_history_select_shared_visible_group_member_ungated`: `using (auth.uid() = user_id or (not public.is_globally_hidden(user_id) and public.shares_visible_group_with(user_id)))`. This is the "checked before per-group logic" requirement made concrete: the global check gates the whole per-group clause rather than being layered inside `shares_visible_group_with` itself, so it applies uniformly across every group with no per-group-policy duplication. Self-clause unchanged and still load-bearing — a globally hidden user still always sees their own location.
- **Where this slots into the RLS chain for future reference (FT-12 → FT-19 → FT-21):** FT-12 established the base shared-group-membership predicate; FT-19 layered per-group hide/unhide on top of it; FT-21 layers one more outer global gate on top of *that*. Any future ticket touching this policy (e.g. FT-23's playback redaction) inherits all three gates by construction if it reuses `is_globally_hidden`/`shares_visible_group_with`/`is_hidden_from_group` rather than re-querying `location_history` directly. Not redesigning FT-12/FT-19's policies here beyond this one additive clause.

**Server-side logic** (new migration `supabase/migrations/0019_set_global_visibility_rpc.sql`):
- `public.set_global_visibility(p_hidden boolean, p_duration_minutes int default null, p_timezone text default null) returns void`, `security definer`. No membership check needed (self-only action, unlike `set_group_visibility`). Same duration→`expires_at` computation as FT-20's `set_group_visibility` (minutes for 1h/2h/4h, local-midnight via `p_timezone` for "all day," null/null for indefinite, `p_hidden = false` for unhide). Default `PUBLIC` execute grant.

**Client scope** (extends `features/visibility/`, no new component files — `VisibilityToggleButton` and `VisibilityDurationSheet` are already prop-controlled with no `groupId` in their contract, so both are reused unchanged):
- `features/visibility/types/visibility.types.ts` — add `GlobalVisibilityState = { isHidden: boolean; expiresAt: string | null }` (structurally identical to `GroupVisibilityState`, kept as a separate named type since they're semantically distinct states, not interchangeable).
- `features/visibility/hooks/useGlobalVisibility.ts` — mirrors `useGroupVisibility.ts` but queries `global_visibility_overrides` with no group filter. Returns `{ state, loading, refetch }`.
- `features/visibility/hooks/useSetGlobalVisibility.ts` — mirrors `useSetGroupVisibility.ts`, calls `set_global_visibility` (no `p_group_id`). Returns `{ setVisibility(duration), setting, setErrorMessage }`.
- `features/groups/components/GroupsScreen.tsx` (edited, additive) — new entry point: renders `VisibilityToggleButton` + `VisibilityDurationSheet`, wired to the two new global hooks, placed above the groups list. `GroupsScreen` is the home screen and already hosts FT-15's `NotificationPermissionBanner` as the catch-all surface for app-wide (not group-scoped) controls absent a dedicated Settings screen — same precedent, reused rather than building a new screen for one switch.
- `FamilyMap.tsx` is **not** touched by this ticket — the global toggle is deliberately not on the map screen, since it's not scoped to `activeGroupId` and putting it next to FT-20's per-group button would visually imply it's another per-group action, which decision #6 explicitly rejects.

**Edge cases:**
1. No global override row ever exists — `is_globally_hidden` returns false; no behavior change for any existing user until this ships.
2. Globally hidden while also having an active per-group hide (FT-20) in some group — both are independently true; unhiding globally does **not** touch or clear any `group_visibility_overrides` row, and unhiding a specific group does not touch this table either. Per decision #6, global is a separate flag, not a fan-out write.
3. Globally hidden, not hidden per-group anywhere — every group's viewers lose visibility uniformly via the outer RLS clause, with zero `group_visibility_overrides` rows written.
4. Global hide expires mid-session — same as FT-19's per-group case: no write needed, next SELECT/realtime-INSERT re-evaluates `now()`.
5. User self-view — always sees their own location regardless of global state, same as FT-19/20's per-group self-clause.

**Out of scope:** any UI/logic that writes a `group_visibility_overrides` row when the global toggle changes (explicitly rejected by decision #6); FT-23's playback redaction reading this table's history; a combined "effectively hidden" indicator anywhere in the map UI (not needed — RLS alone gates reads, same "zero client-side filtering" precedent as FT-20); a dedicated Settings screen (reuses `GroupsScreen`, same as FT-15); any change to `group_visibility_overrides`, `set_group_visibility`, or FT-20's client hooks/components beyond reuse.

**On-device verification:** Two accounts sharing two different groups. From A's device, on the Groups screen (not the map), toggle global invisibility "All day." Confirm B's map, on next focus, shows A gone from *both* shared groups. Toggle A back visible; confirm B sees A reappear in both on next focus. Separately, have A hide from only one group via FT-20's per-group toggle (not global), confirm B still sees A in the other shared group. Then have A additionally go globally invisible; confirm B loses A everywhere. Have A turn off *only* the global toggle; confirm B sees A again in the group that was never per-group-hidden, but still not in the one still under an active FT-20 per-group hide. Confirm A always sees their own marker throughout.

**Files touched:**
- `supabase/migrations/0018_global_visibility_overrides.sql` (new)
- `supabase/migrations/0019_set_global_visibility_rpc.sql` (new)
- `features/visibility/types/visibility.types.ts`
- `features/visibility/hooks/useGlobalVisibility.ts` (new)
- `features/visibility/hooks/useSetGlobalVisibility.ts` (new)
- `features/groups/components/GroupsScreen.tsx`

**File overlap:** zero shared files with FT-19 or FT-20 (both touch only their own migrations, `features/visibility/{types,hooks for group-scope},components`, and `FamilyMap.tsx` — none of which FT-21 touches). `GroupsScreen.tsx` was last touched by FT-10/FT-11 (both ✅ Done, pipelined) — no live conflict with any other currently-Ready ticket.

---

### FT-38 detail — Scope per-group hide to the group being viewed

**Type:** Bug

**Why:** Per amended decision #11, per-group hide (FT-20) must mean "invisible on that group's map specifically," independent of any other shared group — but `shares_visible_group_with` can't express that; it's an OR across every mutually shared unhidden group, not the one group being viewed. Confirmed on-device 2026-09-03.

**Fix shape:** don't touch `location_history`'s RLS — it's still the correct coarse "can ever read this row at all" gate and stays unchanged (decision #11's removal semantics still depend on it). Instead, scope visibility at the group-membership list `useActiveGroupMembers` builds per active group: replace its raw `group_members`+`profiles` join (which has zero visibility awareness today) with a new SECURITY DEFINER RPC that does the join *and* excludes anyone hidden from that specific group or globally hidden. `useGroupMemberLocations` (FT-12) already derives `memberIds` from that output and already ignores realtime INSERTs for ids outside `memberIds` — so correctly scoping the member list alone fixes both the initial fetch and the realtime stream, with no changes to `useGroupMemberLocations.ts`.

**Schema:** no new tables/columns.

**Server-side logic** (new migration `supabase/migrations/0020_group_scoped_member_visibility_rpc.sql`):
- `public.get_visible_group_members(p_group_id uuid) returns table (user_id uuid, display_name text, avatar_color text)`, SECURITY DEFINER, stable, pinned `search_path`. Checks `is_group_member(p_group_id)` for `auth.uid()` (same guard/error-message pattern as `set_group_visibility`), then returns every other member of `p_group_id` joined to `profiles` where `not is_hidden_from_group(user_id, p_group_id)` and `not is_globally_hidden(user_id)`. Reuses FT-19/FT-21's helpers unchanged — no new predicate logic.
- Default `PUBLIC` execute grant, matching every other RPC in this project.

**Client scope:**
- `features/map/hooks/useActiveGroupMembers.ts` (edited) — replaces the raw `.from('group_members').select('profiles(...)')` query with `.rpc('get_visible_group_members', { p_group_id: activeGroupId })`, mapping `{ user_id, display_name, avatar_color }` → the existing `ActiveGroupMember` shape. Hook's public return type and focus-refetch behavior are unchanged.
- No other client files touched — `useGroupMemberLocations.ts`, `FamilyMap.tsx`, `GroupSwitcher.tsx` all consume `useActiveGroupMembers`'s existing output shape as-is.

**Edge cases:**
1. Hidden from Group A only, still visible via shared Group B — Group A's member list now excludes them (fixed); Group B's list still includes them (unaffected, correct).
2. Globally hidden — excluded from every group's member list (RPC checks `is_globally_hidden` too), consistent with FT-21's "checked before per-group logic."
3. Caller not a member of `p_group_id` — RPC raises, same guard as `set_group_visibility`; not reachable from the UI (`activeGroupId` is always one of the caller's own groups) but defended server-side regardless.
4. Member unhides mid-session — no live push; next focus refetch of `useActiveGroupMembers` (existing pattern) picks it up, same accepted latency as FT-20's "refetch-timed removal" precedent.
5. Self is never included (RPC excludes `auth.uid()`), unaffected by any hide state on the caller's own account.

**Out of scope:** any change to `location_history`'s RLS policy or to `shares_visible_group_with`/`is_hidden_from_group`/`is_globally_hidden` (all reused as-is); FT-37's stale-marker-while-still-visible refetch gap (separate ticket, same underlying "no live push" limitation, not solved here); a live/pushed removal signal when someone hides mid-session; any change to `useGroupMemberLocations.ts`, `useGroupVisibility.ts`, or `FamilyMap.tsx`.

**On-device verification:** Two accounts sharing two groups (A and B), both foregrounded. From A's device, open Group A's map (via the switcher), go invisible to Group A only ("1 hour"). On B's device, confirm on next focus: A's marker is gone from Group A's map but still visible on Group B's map after switching. Switch A back visible to Group A; confirm B sees A reappear on Group A's map on next focus. Repeat with A going *globally* invisible instead — confirm B loses A on both groups' maps this time.

**Files touched:**
- `supabase/migrations/0020_group_scoped_member_visibility_rpc.sql` (new)
- `features/map/hooks/useActiveGroupMembers.ts`

---

## V5 — Journey History / Playback *(blocked by v1's schema AND v2 AND v4 — per #7)*

| Ticket | Description | Depends on | Status |
|---|---|---|---|
| FT-22 | Journey history list (paginated/infinite-scroll, grouped by day — no date-range picker per PO decision 2026-09-03), member selector (any group member, not just self, per #7) | FT-5, FT-12 | ✅ Done |
| FT-23 | Route playback animation — redacts any time range where the viewed member was hidden (global or per-group) at that historical timestamp | FT-22, FT-19, FT-21 | ✅ Done |
| FT-40 | Bug: FT-22's day list (`useJourneyHistory`) reads `location_history` via a plain client `select`, whose RLS gates on the viewed member's *current* hidden state (FT-19/21), not each row's own timestamp. A currently-hidden member's day list shows "No history yet" for their entire history — including days from before they ever hid — instead of just omitting the hidden window, and blocks the tap-to-playback entry point FT-23 needs for exactly that case. Found by mobile-architect while designing FT-23 (2026-09-04); FT-23 works around it for the playback screen itself via a dedicated RPC, but the list is untouched. Likely fix: give the list the same RPC-based, per-row-timestamp authorization FT-23 uses, replacing reliance on live `location_history` RLS. | FT-22, FT-19, FT-21 | ⬜ |

---

### FT-22 detail — Journey history list, member selector, pagination

**Type:** Feature

**Why:** v1–v4 only ever show live locations. FT-22 is v5's foundation: a read-only, paginated history list for any member of a shared group (decision #7), built on the existing `location_history` schema (FT-5) and RLS (FT-12). No route playback (FT-23, a separate ticket blocked on this one) and no date-range-picker UI — explicitly rejected by the PO in favor of an infinite-scroll, day-grouped list.

**"Journey" definition — locked for this ticket:** a journey is one calendar day's raw `location_history` rows for the selected member (device-local day boundary, same "local midnight" convention as decision #5), not a computed movement/trip segment (contiguous-motion bounded by stationary gaps). FT-5's schema has no stop/start markers, so segment derivation would need a new, PO-unspecified heuristic (a stationary-gap threshold) — real scope creep for a list-only ticket. Day-grouping is also literally what the PO's "grouped by day" ask describes. FT-23 keys playback off `(memberId, dateLocal)` pairs, not a synthetic journey id, matching this.

**Schema:** No new tables/columns/indexes. `location_history` (FT-5) already has everything needed (`user_id, latitude, longitude, recorded_at, speed_mps, heading_deg, accuracy`), and its existing `(user_id, recorded_at desc)` index directly supports the keyset-paginated query below.

**RLS:** No changes. FT-12's `location_history_select_shared_group_member` (`auth.uid() = user_id or shares_group_with(user_id)`) already permits reading any shared-group member's full history — this ticket only adds a read path.

**Server-side logic:** None — plain client `select`, same posture as FT-14's geofence CRUD (grants + RLS only, no RPC for a read).

**Client scope** (new `features/history/` folder, matches the reserved `app/(app)/history/` route):
- `app/(app)/history/_layout.tsx` (new) — thin Stack, mirrors `app/(app)/places/_layout.tsx`.
- `app/(app)/history/index.tsx` (new) — thin route → `HistoryScreen`.
- `app/(app)/_layout.tsx` (edited, additive) — registers `<Stack.Screen name="history" />`.
- `features/map/components/FamilyMap.tsx` (edited, additive) — new "History" button alongside the existing "Zones" button, `router.push('/history')`.
- `features/history/components/HistoryScreen.tsx` (new) — composes `MemberSelector` + `JourneyList`, owns selected-member-id state (default: self).
- `features/history/hooks/useGroupRoster.ts` (new) — given `activeGroupId`, returns every *current* member (self + others), unfiltered by hide state: a plain `group_members` → `profiles` query. Deliberately **not** `useActiveGroupMembers` — that hook excludes anyone currently hidden (FT-38's `get_visible_group_members`), which would silently narrow "any group member" (decision #7); redaction by hide-state is FT-23's job, not this ticket's.
- `features/history/components/MemberSelector.tsx` (new) — controlled props (`members`, `selectedId`, `onSelect`), same shape as `GroupSwitcher.tsx`.
- `features/history/hooks/useJourneyHistory.ts` (new) — given `memberId`, keyset-paginated fetch: `{ days: JourneyDay[], loading, loadingMore, errorMessage, hasMore, loadMore }`. Initial page: most recent `JOURNEY_HISTORY_PAGE_ROW_LIMIT` rows ordered `recorded_at desc, id desc` (tie-break for FT-5's known same-instant-duplicate quirk). `loadMore` re-queries `recorded_at < oldestLoaded` (or `= oldest and id <` on a tie), appending. A page landing mid-day merges into that day's existing bucket rather than starting a duplicate one. Resets fully on `memberId` change.
- `features/history/lib/groupLocationHistoryByDay.ts` (new, pure function — same precedent as FT-29's `deconflictMarkerPositions`): `groupLocationHistoryByDay(rows: LocationHistoryPoint[]): JourneyDay[]`.
- `features/history/components/JourneyList.tsx` (new) — `FlatList` of day sections, most recent first, `onEndReached` → `loadMore`; end-of-list "beginning of history" state when `!hasMore`.
- `features/history/types/history.types.ts` (new) — `LocationHistoryPoint`, `JourneyDay`.
- `lib/constants.ts` (edited) — new `JOURNEY_HISTORY_PAGE_ROW_LIMIT` (recommend 500 — cheap indexed query, comfortably more than a normal day's worth of 5s/10m-interval fixes, so most "load more" taps span several real days).

**Pagination shape — designed for a future jump-to-date (not built here):** cursoring on `recorded_at`, not offset/page-number, means a later "jump to date" only needs to set the initial cursor to that date instead of "now" — no query redesign, just a different starting value into the same `loadMore` path.

**Edge cases:**
1. Selected member has zero rows ever — empty state, no "load more."
2. Switching `activeGroupId` while the selected member isn't in the new roster — reset selection to self (mirrors FT-12 edge case #4's full-reset-on-switch).
3. Query returns fewer than the page limit — `hasMore` false, "beginning of history" end state.
4. Page boundary lands mid-day — merged into the existing bucket, not a new one.
5. Two rows sharing an identical `recorded_at` (known FT-5 quirk) — `id` tie-break keeps keyset pagination from skipping/duplicating at a page boundary.
6. Self always selectable regardless of group membership (RLS's `auth.uid() = user_id` clause).

**Out of scope:**
- Route playback/animation — FT-23.
- Date-range-picker UI — rejected; only the cursor shape anticipates a future jump-to-date.
- Redacting rows by the viewed member's *historical* hidden state — FT-23's job per decision #7; FT-22 only respects *current* group-membership RLS for who can be queried at all.
- Trip/movement-segment derivation — day-grouping chosen instead.
- Any change to `location_history` schema, RLS, or grants.
- Any change to `useActiveGroupMembers.ts`, `useGroupMemberLocations.ts`, or `GroupSwitcher.tsx`.

**On-device verification:** With Accounts A and B sharing a group, B having posted fixes on at least two calendar days: from A's device open History, select B, confirm days render most-recent-first with correct per-day point counts. Scroll to trigger "load more," confirm older days append without duplicating/dropping the boundary day. Switch the selector to "Me" and confirm A's own days render. If testing with 2+ groups, switch active group and confirm the selector's roster updates. Scroll B's history to the true end and confirm "beginning of history" with no further requests.

**Files touched:**
- `app/(app)/history/_layout.tsx` (new)
- `app/(app)/history/index.tsx` (new)
- `app/(app)/_layout.tsx`
- `features/map/components/FamilyMap.tsx`
- `features/history/components/HistoryScreen.tsx` (new)
- `features/history/components/MemberSelector.tsx` (new)
- `features/history/components/JourneyList.tsx` (new)
- `features/history/hooks/useGroupRoster.ts` (new)
- `features/history/hooks/useJourneyHistory.ts` (new)
- `features/history/lib/groupLocationHistoryByDay.ts` (new)
- `features/history/types/history.types.ts` (new)
- `lib/constants.ts`

**Overlap note:** shares nothing with FT-30/FT-31/FT-32/FT-35/FT-36/FT-37's *described* scope, but those are still ⬜ with no architect Files-touched list of their own, so overlap can't be formally confirmed the way FT-29's callout confirmed against FT-17. One soft touch-point to flag: `FamilyMap.tsx` and `app/(app)/_layout.tsx` are both plausible FT-32 (initial-load staggering) touches — don't run FT-22 and FT-32 in parallel without checking FT-32's actual diff once it's architected.

---

### FT-23 detail — Route playback animation (redacts historical hide windows)

**Type:** Feature

**Why:** FT-22 lists a member's history but never renders it. Per decision #7, any group member can play back any other member's route, but must see it exactly as it looked at the time — a stretch where the viewed member was hidden (globally, FT-21, or from the group being viewed, FT-20/38) must stay redacted in playback even though the member isn't hidden today. FT-19's event-sourced tables already make "hidden at time T" answerable; nothing queries them that way yet.

**Known gap, not fixed here:** `location_history`'s read policy (FT-19/21) gates on the viewed member's *current* hidden state, not each row's own timestamp — so a client-side `select` (what FT-22's `useJourneyHistory` does) returns zero rows at all for a member who is currently hidden, not just their hidden window. FT-23 works around this for the playback screen itself via a dedicated RPC (below), but FT-22's day list is untouched and will still misreport "No history yet" for a currently-hidden member, blocking the tap-to-playback entry point for exactly that case. Logged as FT-40 (see backlog table below) rather than expanding this ticket to also rework FT-22's list query.

**Server-side logic** (new migration `supabase/migrations/0021_journey_playback_rpc.sql`):
- `public.is_hidden_from_group_at(p_user_id uuid, p_group_id uuid, p_at timestamptz) returns boolean` — `stable`, `security definer`, pinned `search_path`. Same derivation as FT-19's `is_hidden_from_group`, parameterized by `p_at` instead of `now()`: latest `group_visibility_overrides` row for `(p_group_id, p_user_id)` with `created_at <= p_at`, true iff `event_type = 'hide'` and (`expires_at is null` or `expires_at > p_at`).
- `public.is_globally_hidden_at(p_user_id uuid, p_at timestamptz) returns boolean` — same pattern against `global_visibility_overrides`, mirrors FT-21's `is_globally_hidden`.
- `public.get_journey_playback_points(p_user_id uuid, p_group_id uuid, p_date_local date, p_timezone text) returns table (id uuid, recorded_at timestamptz, latitude float8, longitude float8, speed_mps float8, heading_deg float8, is_redacted boolean)` — `stable`, `security definer`. If `p_user_id = auth.uid()`, skips authorization/redaction entirely (self always sees full own history, same self-clause precedent as every other visibility policy). Otherwise checks `is_group_member(p_group_id)` for both the caller and `p_user_id` (defense in depth — FT-22's roster only ever offers current members, but this is the actual authorization boundary now, replacing reliance on live `location_history` RLS). Computes the day's UTC range from `p_date_local`/`p_timezone` (same local-midnight convention as decision #5/FT-20), selects that member's `location_history` rows in range ordered by `recorded_at asc`, and for each row sets `is_redacted := is_globally_hidden_at(p_user_id, recorded_at) or is_hidden_from_group_at(p_user_id, p_group_id, recorded_at)`. **Redacted rows have `latitude`/`longitude`/`speed_mps`/`heading_deg` nulled server-side** — the flag alone isn't the privacy boundary, the coordinates themselves never leave the DB for a redacted instant, same posture as RLS never sending a hidden row at all today.
- No table/RLS/grant changes. Default `PUBLIC` execute grant, same as every other RPC in this project.

**Client scope** (extends `features/history/`):
- `features/history/types/history.types.ts` (edited, additive only) — new `PlaybackPoint = { id: string; recordedAt: string; latitude: number | null; longitude: number | null; speedMps: number | null; headingDeg: number | null; isRedacted: boolean }` and `RedactedWindow = { startsAt: string; endsAt: string }`. `LocationHistoryPoint`/`JourneyDay` (FT-22) untouched.
- `features/history/hooks/useJourneyPlayback.ts` (new) — given `(memberId, groupId, dateLocal)`: one call to `get_journey_playback_points` (`p_timezone` from `Intl.DateTimeFormat().resolvedOptions().timeZone`, same pattern as `useSetGroupVisibility`'s "all day"). Returns `{ points: PlaybackPoint[], redactedWindows: RedactedWindow[], loading, errorMessage }`; `redactedWindows` derived via the pure helper below. Resets fully on any param change.
- `features/history/lib/deriveRedactedWindows.ts` (new, pure function, same "cheaply unit-testable, no React" precedent as `deconflictMarkerPositions.ts`/`groupLocationHistoryByDay.ts`): `deriveRedactedWindows(points: PlaybackPoint[]): RedactedWindow[]` — collapses contiguous runs of `isRedacted` points into windows.
- `features/history/components/PlaybackMap.tsx` (new) — a dedicated `MapView` + `Polyline` (react-native-maps, already a dependency — no new native module) over just the non-redacted points, plus one animated `Marker` moving along them at a pace proportional to real elapsed time between consecutive visible points, compressed into a fixed `JOURNEY_PLAYBACK_ANIMATION_DURATION_MS` regardless of how long the actual day was. Play/Pause control only. Static "Hidden {start}–{end}" text per `redactedWindow`, shown above/below the map — not a scrubber timeline. **Not `FamilyMap.tsx`** — deliberate: `FamilyMap` bundles live tracking, geofencing, the visibility toggle, and group switching, none of which apply to a static historical day; reusing it would mean threading playback-only state through a component whose entire prop surface assumes "live," a bigger blast radius than building a small new map component from the same `react-native-maps` primitives already in use.
- `features/history/components/PlaybackScreen.tsx` (new) — reads `memberId`/`dateLocal` from route params, `activeGroupId` from `GroupsContext` (captured once at mount, not reactive to later group switches — this is a pushed modal-stack screen, not persistent like `FamilyMap`), composes `useJourneyPlayback` + `PlaybackMap`. States: loading, error (RPC-raised auth failure → friendly "no longer available" message, same posture as FT-9/10's deleted-group races), "Hidden all day" (every point redacted), normal.
- `features/history/components/JourneyList.tsx` (edited) — day rows become `Pressable`; new controlled prop `onPressDay: (day: JourneyDay) => void`. No other behavior change.
- `features/history/components/HistoryScreen.tsx` (edited) — passes `onPressDay` to `JourneyList`, navigating to `/history/playback?memberId={effectiveSelectedId}&date={day.dateLocal}`.
- `app/(app)/history/playback.tsx` (new) — thin route, reads `memberId`/`date` params → `PlaybackScreen`.
- `app/(app)/history/_layout.tsx` (edited) — registers `Stack.Screen name="playback"`, title "Playback," same close-button convention as "index."
- `lib/constants.ts` (edited) — `JOURNEY_PLAYBACK_ANIMATION_DURATION_MS` (recommend 20000 — long enough to visually track a route, short enough not to feel tedious on a busy day; fixed regardless of point count, so playback length stays predictable).

**Edge cases:**
1. Self playback — never redacted, regardless of any hide state on the caller's own account (RPC's `auth.uid()` bypass).
2. Entire day redacted (member hidden the whole day) — distinct "Hidden all day" state, not the same empty state as "zero rows ever" (FT-22's own empty state, untouched).
3. Multiple redacted windows in one day — each contiguous redacted run becomes its own window; no special-casing beyond the generic collapse.
4. Redacted by both global and per-group simultaneously — boolean OR, one window, no double-counting.
5. Hide/unhide boundary exactness — inherited unchanged from `is_hidden_from_group`/`is_globally_hidden`'s existing `expires_at` comparison, just evaluated at `recorded_at` instead of `now()`.
6. Per-group scope — a window hidden from Group A but not Group B (FT-38) redacts only when playback was reached via Group A; switching active group and re-entering the same day via Group B shows that window unredacted. Consistent with decision #11, not solved fresh here.
7. Target member removed from `p_group_id` between FT-22's list and the playback tap — RPC's membership check fails, friendly error, no crash.
8. FT-5's known same-`recorded_at` duplicate point — a single fixed-range day fetch, not paginated, so no cursor tie-break is needed here (unlike `useJourneyHistory`); a duplicate instant just contributes a near-zero-duration animation step.

**Out of scope:**
- Scrub/seek controls or a playback-speed selector — Play/Pause only.
- Multi-day continuous playback / stitching days together.
- Export/share of a route.
- Live "watch it happen now" playback — historical only.
- FT-22's day-list not surviving a currently-hidden member (see "Known gap" above) — FT-40.
- Any change to `location_history`'s schema/RLS, `is_hidden_from_group`, `is_globally_hidden`, `shares_visible_group_with`, `get_visible_group_members`, `useJourneyHistory`, or `groupLocationHistoryByDay` — all reused/paralleled unmodified.

**On-device verification:** Two accounts sharing a group. Have B post fixes across a day, going invisible to the shared group (FT-20) for part of that day, then visible again. From A: History → select B → tap that day → confirm the route renders with a visible gap and "Hidden HH:MM–HH:MM" label spanning the hidden window, Play animates the marker along the visible segments and skips the gap, and the day predating any hide/unhide shows a full unredacted route. Repeat with B globally hidden for an entire day (FT-21) → confirm the "Hidden all day" state, no route. Switch active group to a second shared group where B was never hidden during that same window, re-open the same day → confirm that window is now unredacted (per-group scoping, FT-38). Confirm A's own "Me" playback is never redacted regardless of A's own hide state.

**Files touched:**
- `supabase/migrations/0021_journey_playback_rpc.sql` (new)
- `features/history/types/history.types.ts`
- `features/history/hooks/useJourneyPlayback.ts` (new)
- `features/history/lib/deriveRedactedWindows.ts` (new)
- `features/history/components/PlaybackMap.tsx` (new)
- `features/history/components/PlaybackScreen.tsx` (new)
- `features/history/components/JourneyList.tsx`
- `features/history/components/HistoryScreen.tsx`
- `app/(app)/history/playback.tsx` (new)
- `app/(app)/history/_layout.tsx`
- `lib/constants.ts`

**File overlap:** no shared files with any other currently ⬜ ticket (FT-30/31/32/35/36/37 touch `FamilyMap.tsx`/`useGroupMemberLocations.ts`/`app/(app)/_layout.tsx`; FT-39 touches `GroupDetailScreen.tsx`; FT-24 touches auth-only files) — safe to run standalone.

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
- **Place markers need a distinct visual, not just a color swap.** FT-14's main-map integration (piece 5) currently distinguishes place pins from people pins only via `pinColor` (blue vs. default) — at a glance it still reads as "a person," not "a zone/geofence." Same category as the avatar-marker item above: worth a custom marker (icon or shape that signals "place," e.g. a small fence/flag/house glyph) once there's a design pass for map iconography generally. Flagged during FT-14 piece 5 on-device QA (2026-08-21), not blocking.
- **FT-28's 15-minute staleness threshold is tuned for the current foreground-only reality** (no background location writer exists until FT-18, which is scoped to geofencing only, not general broadcast). If background location tracking is ever broadened beyond FT-18's narrow use case, this threshold should be revisited — a background-tracked app would make "stale" a much rarer, more meaningful signal than it is today.
- **Future: persistent shape-shifting bottom sheet as the map's main interaction surface.** PO idea (2026-09-03, while discussing FT-22's history UX), not yet scoped to a ticket: a draggable bottom sheet (Apple/Google Maps-style — a peek at the bottom third, drag up toward full screen, dismissible) that's always present on the map screen. Default state holds Zones (FT-14) and possibly other persistent content; tapping a member's marker shape-shifts it into that member's detail/history view (FT-22/23); tapping elsewhere on the map (away from any member) returns it to the default state. This is a real architectural consolidation, not an additive change — Zones and History currently each live as their own separate modal route (`app/(app)/places/`, `app/(app)/history/`), and adopting this pattern later means migrating both into one persistent component driven by selection state, not just adding a new screen. Needs its own design/architecture pass before being scoped into tickets. Not blocking FT-22 or FT-14b — FT-22 shipped as a standalone modal route in the meantime, with an optional `?memberId=` deep-link param on `app/(app)/history/index.tsx` added specifically so a future entry point (marker tap, FT-39's member list) can route into it the same way regardless of which container UI eventually wraps it.
- **Flaky loading-state tests**: `useSendInvite.test.ts` (FT-9) and `useLeaveGroup.test.ts` (FT-11) both race a real `setTimeout(..., 100)` against `waitFor` to catch a hook's mid-flight loading state — occasionally times out under CPU load in full-suite runs. Not a correctness bug, just test timing. Worth a cleanup pass (deterministic manually-controlled promise instead of a real timer) if it starts causing CI noise. Found during FT-11 verification (2026-08-19).
- **`GroupSwitcher`'s pill-row styling should become a proper select/dropdown** once a user is likely to belong to more than a handful of groups — a horizontal scrolling pill row (FT-12) doesn't scale well past a few groups. Flagged during FT-12 on-device QA (2026-08-20), not blocking.
- **"Leave Group" placement on `GroupDetailScreen`** should move to the bottom of the screen, below other actions — standard "dangerous settings sink to the bottom" convention (mirrors iOS Settings apps). Currently sits wherever FT-11 originally placed it. Flagged during FT-14 on-device QA (2026-08-21), pure UI polish, not blocking.
- **`PlacesListScreen`'s edit-pencil indicator is a placeholder emoji (✏️)**, not a real icon. Swap for a proper icon from a component library (`@expo/vector-icons`, ships with Expo by default) or a native icon where available, during a later polish pass. Flagged during FT-14 piece 4 on-device QA (2026-08-21), not blocking.
