// features/history/types/history.types.ts

// One location_history row for the FT-22 journey list — a display-shaped
// subset, not the full row. `id` is kept for the pagination cursor tie-break.
export type LocationHistoryPoint = {
  id: string;
  latitude: number;
  longitude: number;
  recordedAt: string; // ISO string, from recorded_at
  speedMps: number | null;
  headingDeg: number | null;
};

// A journey = one calendar day's points for the selected member (device-local
// day boundary), not a computed movement/trip segment — see ARCHITECTURE.md.
export type JourneyDay = {
  dateLocal: string; // YYYY-MM-DD, device-local
  points: LocationHistoryPoint[];
};

// FT-23: one get_journey_playback_points row. Redacted rows arrive with
// coordinates already nulled server-side — isRedacted is a display flag,
// not the privacy boundary.
export type PlaybackPoint = {
  id: string;
  recordedAt: string; // ISO string, from recorded_at
  latitude: number | null;
  longitude: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  isRedacted: boolean;
};

// A contiguous run of redacted points, collapsed by deriveRedactedWindows.
export type RedactedWindow = {
  startsAt: string;
  endsAt: string;
};
