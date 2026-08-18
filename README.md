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
