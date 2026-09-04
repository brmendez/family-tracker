// features/history/lib/groupLocationHistoryByDay.ts
import type { JourneyDay, LocationHistoryPoint } from '../types/history.types';

// Device-local day boundary (same convention as decision #5's "all day"
// visibility expiry) — not UTC, so a fix at 11pm local doesn't bucket into
// the next UTC day.
const toDateLocal = (recordedAt: string): string => {
  const date = new Date(recordedAt);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

// Groups rows into calendar-day buckets, preserving the caller's row order
// within each day. A page landing mid-day merges into that day's existing
// bucket rather than starting a duplicate one, so this is safe to call
// repeatedly on a growing `points` array (see useJourneyHistory).
export const groupLocationHistoryByDay = (
  points: LocationHistoryPoint[],
): JourneyDay[] => {
  const daysByDate = new Map<string, JourneyDay>();

  for (const point of points) {
    const dateLocal = toDateLocal(point.recordedAt);
    const existing = daysByDate.get(dateLocal);

    if (existing) {
      existing.points.push(point);
      continue;
    }

    daysByDate.set(dateLocal, { dateLocal, points: [point] });
  }

  return Array.from(daysByDate.values());
};
