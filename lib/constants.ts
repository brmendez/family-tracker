// lib/constants.ts
/**
 * Location watch thresholds and other app-wide constants land here starting FT-4.
 */

/**
 * Foreground location watch thresholds (useForegroundLocation, FT-4). Tuned
 * for "walking around town," not car navigation — battery-conscious rather
 * than millisecond-precise. A fix at most every 5s, and only when the user
 * has actually moved 10m, avoids redundant GPS wakeups while someone is
 * standing still (e.g. at home or at a desk).
 */
export const LOCATION_WATCH_TIME_INTERVAL_MS = 5000;
export const LOCATION_WATCH_DISTANCE_INTERVAL_M = 10;

/**
 * Initial map region span (degrees) used before the map has been manually
 * zoomed/panned by the user — roughly a several-block neighborhood view.
 */
export const MAP_INITIAL_DELTA = 0.01;

// 15min stale threshold for open-but-stationary apps.
export const LOCATION_STALE_THRESHOLD_MS = 15 * 60 * 1000;

// Auto-dismiss delay for the in-app geofence crossing banner (FT-16).
export const GEOFENCE_ALERT_AUTO_DISMISS_MS = 6000;

// Marker deconfliction (FT-29): pins this close mis-trigger each other's
// native callout, so cluster and nudge apart by a small display-only offset.
export const MARKER_OVERLAP_THRESHOLD_M = 20;
export const MARKER_OFFSET_M = 8;

// FT-18: native region-monitoring task name and iOS's own region cap.
export const BACKGROUND_GEOFENCE_TASK_NAME = 'background-geofence-task';
export const MAX_MONITORED_GEOFENCES = 20;

// FT-33: reject GPS fixes less precise than this, and require this many
// consecutive agreeing fixes before treating a state flip as a real crossing.
export const GEOFENCE_MIN_ACCURACY_M = 50;
export const GEOFENCE_CONFIRMATION_COUNT = 3;

// FT-34: window after a real startGeofencingAsync call during which the
// background task treats a callback as iOS's initial-membership report, not
// a crossing. A few seconds comfortably covers the native bridge round trip
// with no meaningful risk of swallowing a genuine crossing that fast.
export const GEOFENCE_REGISTRATION_SUPPRESS_WINDOW_MS = 5000;

// FT-22: keyset page size for the journey history list — cheap indexed
// query, comfortably more than a normal day's worth of fixes, so most
// "load more" taps span several real days.
export const JOURNEY_HISTORY_PAGE_ROW_LIMIT = 500;

// FT-23: fixed playback animation length regardless of point count or the
// real day's span — long enough to visually track a route, short enough
// not to feel tedious on a busy day.
export const JOURNEY_PLAYBACK_ANIMATION_DURATION_MS = 20000;
