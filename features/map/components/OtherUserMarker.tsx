// features/map/components/OtherUserMarker.tsx
import { Marker } from 'react-native-maps';

import { useLocationStaleness } from '../hooks/useLocationStaleness';
import { deriveActivityState, getActivityLabel } from '../lib/deriveActivityState';
import type { OtherUserLocation } from '../hooks/useGroupMemberLocations';

type OtherUserMarkerProps = {
  displayName: string;
  location: OtherUserLocation;
  coordinate: { latitude: number; longitude: number };
};

const STALE_PIN_COLOR = '#6b7280';

export const OtherUserMarker = ({
  displayName,
  location,
  coordinate,
}: OtherUserMarkerProps) => {
  const { label, isStale } = useLocationStaleness(location.recordedAt);
  const activityLabel = getActivityLabel(deriveActivityState(location.speedMps));
  const description = activityLabel
    ? `Last seen ${label} · ${activityLabel}`
    : `Last seen ${label}`;

  return (
    <Marker
      coordinate={coordinate}
      title={displayName}
      description={description}
      accessibilityLabel={`${displayName}'s location`}
      pinColor={isStale ? STALE_PIN_COLOR : undefined}
    />
  );
};
