// features/map/hooks/useLocationStaleness.ts
import { useEffect, useState } from 'react';

import { LOCATION_STALE_THRESHOLD_MS } from '../../../lib/constants';

export type LocationStaleness = {
  label: string;
  isStale: boolean;
};

const STALENESS_TICK_MS = 15000;

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const formatRelativeLabel = (elapsedMs: number): string => {
  if (elapsedMs < MINUTE_MS) {
    return 'just now';
  }

  if (elapsedMs < HOUR_MS) {
    const minutes = Math.floor(elapsedMs / MINUTE_MS);

    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }

  if (elapsedMs < DAY_MS) {
    const hours = Math.floor(elapsedMs / HOUR_MS);

    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(elapsedMs / DAY_MS);

  return `${days} day${days === 1 ? '' : 's'} ago`;
};

export const useLocationStaleness = (
  recordedAt: string,
): LocationStaleness => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const intervalId = setInterval(() => {
      setNow(Date.now());
    }, STALENESS_TICK_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  const recordedAtMs = new Date(recordedAt).getTime();
  const elapsedMs = Math.max(0, now - recordedAtMs);

  return {
    label: formatRelativeLabel(elapsedMs),
    isStale: elapsedMs >= LOCATION_STALE_THRESHOLD_MS,
  };
};
