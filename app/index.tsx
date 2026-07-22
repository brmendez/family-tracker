// app/index.tsx
import { CurrentLocationMap } from '../features/map/components/CurrentLocationMap';
import { LocationPermissionGate } from '../features/map/components/LocationPermissionGate';

export default function IndexScreen() {
  return (
    <LocationPermissionGate>
      <CurrentLocationMap />
    </LocationPermissionGate>
  );
}
