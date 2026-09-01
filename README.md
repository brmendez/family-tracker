# Family Tracker

An iOS family location-sharing app — see each other's live location on a map,
with group sharing, geofencing, and visibility controls planned. Built with
Expo (React Native) and Supabase.

Currently in **v1** (live map between two hardcoded users, no groups yet).
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full roadmap, ticket
tracker, and locked product/architecture decisions.

## Stack
- Expo + TypeScript, iOS only
- Supabase (auth, Postgres, realtime)
- Jest + React Native Testing Library

## Development process

This app is built using an AI-orchestrated development workflow that I
designed and directed end-to-end. My role is project owner: I write the
detailed specs, make every architectural and product decision, and drive
the work through a structured pipeline rather than one-shot prompting.

Each feature moves through a fixed set of specialized sub-agents that I
orchestrate:

- **Architect** — turns a spec into a concrete implementation plan and
  ticket breakdown, with explicit files-touched lists and dependencies.
- **Senior developer** — implements a single ticket against that plan.
- **Code reviewer** — reviews the generated code against the design doc
  and project standards before anything is accepted.
- **Unit test writer** — adds test coverage once implementation is
  approved.
- **QA** — an additional review pass used selectively on features with
  meaningful UX or edge-case surface.

I review every piece of generated code myself, decide what gets fixed or
reworked, and own the tradeoffs — nothing ships on a model's say-so. The
full ticket history, locked decisions, and roadmap are tracked in
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Running it

Requires a dev build — `react-native-maps` is a native module Expo Go
doesn't support.

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
npm run ios
```

```bash
npm test        # watch mode
npm run test:ci # single run
```

A longer setup/contributing guide will land here later — this is just
enough to get oriented and running.
