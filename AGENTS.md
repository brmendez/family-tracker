# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Ticket tracking

ARCHITECTURE.md is the ticket tracker — roadmap, per-ticket Status (✅ Done / ⬜ Not started), dependencies, and locked decisions all live there. Do not create a separate tickets file; update ARCHITECTURE.md's Status column in place as tickets complete.

Status ✅ Done means the ticket's code exists — it does NOT by itself mean the ticket has been through the full review → fix → unit-test → verify pipeline. That pipeline's completion signal is a `git log` commit matching `FT-N: Unit tests for ...` (its final step); a ✅ Done ticket without that commit is implemented but not yet reviewed/tested.

At the start of a session (especially after /clear), before asking "what's next," determine the actual next ticket in this order:

1. Run `git log` and scan ✅ Done tickets in ticket-number order for the first one **missing** its `FT-N: Unit tests for ...` commit. If found, that ticket is next — resume its pipeline from the beginning (don't assume partial progress carried over; pipeline commits only land once the whole pipeline for a ticket finishes).
2. Only if every ✅ Done ticket has its pipeline commit, fall back to the first ⬜ Not started row whose dependencies are already ✅ Done.

# Notion board sync

A Jira-style mirror of this roadmap lives in Notion: "Family Tracker Roadmap" (database id `7bfdc5cf697b4db1bfaf0d0b6d497e31`, data source `f24b3cb1-cda1-4fe9-bdad-7c8ccda86f61`) — a master board plus one filtered board per version (V1–V6) as swimlanes, columns by Status (`Done` / `Ready` / `Blocked`).

None of the mobile-* subagents have Notion tool access, so this sync is done by the main session, not delegated. Once a ticket's pipeline-completion commit (`FT-N: Unit tests for ...`) lands, in that same turn: set that ticket's Notion page Status to `Done`, and check whether any ticket that listed it in "Depends On" should flip from `Blocked` to `Ready`.
