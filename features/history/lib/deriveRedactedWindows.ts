// features/history/lib/deriveRedactedWindows.ts
import type { PlaybackPoint, RedactedWindow } from '../types/history.types';

// Collapses contiguous runs of isRedacted points into windows — same
// "cheaply unit-testable, no React" precedent as groupLocationHistoryByDay.
// Points must already be recorded_at-ascending (RPC's own ordering).
export const deriveRedactedWindows = (points: PlaybackPoint[]): RedactedWindow[] => {
  const windows: RedactedWindow[] = [];
  let runStart: string | null = null;
  let runEnd: string | null = null;

  for (const point of points) {
    if (!point.isRedacted) {
      if (runStart !== null && runEnd !== null) {
        windows.push({ startsAt: runStart, endsAt: runEnd });
      }
      runStart = null;
      runEnd = null;
      continue;
    }

    if (runStart === null) {
      runStart = point.recordedAt;
    }
    runEnd = point.recordedAt;
  }

  if (runStart !== null && runEnd !== null) {
    windows.push({ startsAt: runStart, endsAt: runEnd });
  }

  return windows;
};
