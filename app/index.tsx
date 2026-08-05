// app/index.tsx
import { FamilyMap } from '../features/map/components/FamilyMap';
import { LocationPermissionGate } from '../features/map/components/LocationPermissionGate';

const IndexScreen = () => {
  return (
    <LocationPermissionGate>
      <FamilyMap />
    </LocationPermissionGate>
  );
};

export default IndexScreen;
