// app/index.tsx
import { CurrentLocationMap } from '../features/map/components/CurrentLocationMap';
import { LocationPermissionGate } from '../features/map/components/LocationPermissionGate';

const IndexScreen = () => {
  return (
    <LocationPermissionGate>
      <CurrentLocationMap />
    </LocationPermissionGate>
  );
};

export default IndexScreen;
