// features/geofencing/types/geofence.types.ts
export type Geofence = {
  id: string;
  groupId: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusM: number;
  createdBy: string | null;
  createdAt: string;
};
