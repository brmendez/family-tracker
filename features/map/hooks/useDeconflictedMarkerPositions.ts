// features/map/hooks/useDeconflictedMarkerPositions.ts
import { useMemo } from 'react';

import {
  deconflictMarkerPositions,
  type Coordinate,
  type MarkerPosition,
} from '../lib/deconflictMarkerPositions';

// Thin memo wrapper over the pure function — same "derivation behind a
// small hook" shape as useLocationStaleness.
export const useDeconflictedMarkerPositions = (
  positions: MarkerPosition[],
): Record<string, Coordinate> =>
  useMemo(() => deconflictMarkerPositions(positions), [positions]);
