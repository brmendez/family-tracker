// features/map/components/OtherUserMarker.tsx
import { Marker } from 'react-native-maps';

import { useLocationStaleness } from '../hooks/useLocationStaleness';
import type { OtherUserLocation } from '../hooks/useOtherUserLocation';

type OtherUserMarkerProps = {
  displayName: string;
  location: OtherUserLocation;
};

const STALE_PIN_COLOR = '#6b7280';

export const OtherUserMarker = ({
  displayName,
  location,
}: OtherUserMarkerProps) => {
  const { label, isStale } = useLocationStaleness(location.recordedAt);

  return (
    <Marker
      coordinate={{ latitude: location.latitude, longitude: location.longitude }}
      title={displayName}
      description={`Last seen ${label}`}
      accessibilityLabel={`${displayName}'s location`}
      pinColor={isStale ? STALE_PIN_COLOR : undefined}
    />
  );
};
