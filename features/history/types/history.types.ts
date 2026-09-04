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
