// lib/constants.ts
// Location watch thresholds and other app-wide constants land here starting FT-4.

// Foreground location watch thresholds (useForegroundLocation, FT-4). Tuned
// for "walking around town," not car navigation — battery-conscious rather
// than millisecond-precise. A fix at most every 5s, and only when the user
// has actually moved 10m, avoids redundant GPS wakeups while someone is
// standing still (e.g. at home or at a desk).
export const LOCATION_WATCH_TIME_INTERVAL_MS = 5000;
export const LOCATION_WATCH_DISTANCE_INTERVAL_M = 10;

// Initial map region span (degrees) used before the map has been manually
// zoomed/panned by the user — roughly a several-block neighborhood view.
export const MAP_INITIAL_DELTA = 0.01;
