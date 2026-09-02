# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Ticket tracking

ARCHITECTURE.md is the ticket tracker — roadmap, per-ticket Status (✅ Done / ⬜ Not started), dependencies, and locked decisions all live there. Do not create a separate tickets file; update ARCHITECTURE.md's Status column in place as tickets complete.

Status ✅ Done means the ticket's code exists — it does NOT by itself mean the ticket has been through the full review → fix → unit-test → verify pipeline. That pipeline's completion signal is a `git log` commit matching `FT-N: Unit tests for ...` (its final step); a ✅ Done ticket without that commit is implemented but not yet reviewed/tested.

At the start of a session (especially after /clear), before asking "what's next," determine the actual next ticket in this order:

1. Run `git log` and scan ✅ Done tickets in ticket-number order for the first one **missing** its `FT-N: Unit tests for ...` commit. If found, that ticket is next — resume its pipeline from the beginning (don't assume partial progress carried over; pipeline commits only land once the whole pipeline for a ticket finishes).
2. Only if every ✅ Done ticket has its pipeline commit, fall back to the first ⬜ Not started row whose dependencies are already ✅ Done.

# Notion board sync

A Jira-style mirror of this roadmap lives in Notion: "Family Tracker Roadmap" (database id `7bfdc5cf697b4db1bfaf0d0b6d497e31`, data source `f24b3cb1-cda1-4fe9-bdad-7c8ccda86f61`) — a master board plus one filtered board per version (V1–V6) as swimlanes, columns by Status (`Blocked` / `Ready` / `In Dev` / `Done`).

None of the mobile-* subagents have Notion tool access, so this sync is done by the main session, not delegated, at these points:
- When a new ticket is logged in ARCHITECTURE.md (a backlog bug/UX ticket surfaced during QA, not just a planned roadmap ticket): create its Notion page immediately in the same pass — `Name` ("FT-N — Title"), `Ticket #`, `Version`, `Depends On`, `Status` (`Ready` if its deps are already Done, `Blocked` otherwise), `Description`. Don't let ARCHITECTURE.md and Notion drift out of sync the way FT-31/32/33 did (added 2026-08-27/28, not synced to Notion until caught and backfilled 2026-08-27).
- When mobile-senior-dev is handed a ticket to implement (start of that ticket's pipeline, before any code is written): set that ticket's Notion page Status to `In Dev`.
- When the pipeline-completion commit (`FT-N: Unit tests for ...`) lands: set that ticket's Notion page Status to `Done`, and check whether any ticket that listed it in "Depends On" should flip from `Blocked` to `Ready`.

# Native config changes (app.json) require a prebuild, not just a rebuild

`ios/` and `android/` are gitignored, generated output — nothing tracks them, nothing diffs them, and `expo run:ios`/`expo run:ios --configuration Release` do **not** regenerate them if they already exist; those commands just recompile whatever native project is already on disk, however stale. A change to `app.json`'s `plugins`, `ios`, or `android` keys (new permission, `UIBackgroundModes`, entitlements, etc.) silently has zero effect until someone runs `npx expo prebuild --clean --platform ios` — no error, no warning, the old native config just keeps getting rebuilt forever.

This bit FT-18 for a full day of on-device testing (2026-08-27): `app.json` correctly gained `isIosBackgroundLocationEnabled: true`, but nobody ran `prebuild`, so the compiled `Info.plist` never gained `UIBackgroundModes: [location]`, and `startGeofencingAsync` failed on every single attempt with no error visible anywhere except Metro's own log file.

**Rule:** whenever a ticket's Files touched list includes `app.json`, immediately after implementation (before handing to code review, and again before any on-device QA) run:
```
npx expo prebuild --clean --platform ios
```
then spot-check the specific key that changed actually landed, e.g.:
```
/usr/libexec/PlistBuddy -c "Print :UIBackgroundModes" ios/familytracker/Info.plist
```
Only then rebuild with `expo run:ios`. Typecheck and the Jest suite cannot catch this class of bug — it's invisible to both.
