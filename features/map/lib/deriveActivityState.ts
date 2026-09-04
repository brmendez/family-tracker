// features/map/lib/deriveActivityState.ts
import { ACTIVITY_STOPPED_MAX_MPS, ACTIVITY_WALKING_MAX_MPS } from '../../../lib/constants';

export type ActivityState = 'stopped' | 'walking' | 'driving' | null;

const ACTIVITY_LABELS: Record<Exclude<ActivityState, null>, string> = {
  stopped: 'Stopped',
  walking: 'Walking',
  driving: 'Driving',
};

// null speed means no signal to derive from — don't guess.
export const deriveActivityState = (speedMps: number | null): ActivityState => {
  if (speedMps === null) {
    return null;
  }

  if (speedMps < ACTIVITY_STOPPED_MAX_MPS) {
    return 'stopped';
  }

  if (speedMps < ACTIVITY_WALKING_MAX_MPS) {
    return 'walking';
  }

  return 'driving';
};

export const getActivityLabel = (state: ActivityState): string | null =>
  state === null ? null : ACTIVITY_LABELS[state];
