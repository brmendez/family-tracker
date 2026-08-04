# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Ticket tracking

ARCHITECTURE.md is the ticket tracker — roadmap, per-ticket Status (✅ Done / ⬜ Not started), dependencies, and locked decisions all live there. Do not create a separate tickets file; update ARCHITECTURE.md's Status column in place as tickets complete.

Status ✅ Done means the ticket's code exists — it does NOT by itself mean the ticket has been through the full review → fix → unit-test → verify pipeline. That pipeline's completion signal is a `git log` commit matching `FT-N: Unit tests for ...` (its final step); a ✅ Done ticket without that commit is implemented but not yet reviewed/tested.

At the start of a session (especially after /clear), before asking "what's next," determine the actual next ticket in this order:
1. Run `git log` and scan ✅ Done tickets in ticket-number order for the first one **missing** its `FT-N: Unit tests for ...` commit. If found, that ticket is next — resume its pipeline from the beginning (don't assume partial progress carried over; pipeline commits only land once the whole pipeline for a ticket finishes).
2. Only if every ✅ Done ticket has its pipeline commit, fall back to the first ⬜ Not started row whose dependencies are already ✅ Done.
