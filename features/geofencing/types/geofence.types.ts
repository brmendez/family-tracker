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

// FT-16: a detected enter/exit, produced by useGeofenceDetection.
export type GeofenceCrossing = {
  geofenceId: string;
  geofenceName: string;
  eventType: 'enter' | 'exit';
  occurredAt: string;
};

// FT-16 (corrected): another group member's crossing, surfaced via realtime.
export type GeofenceAlertEvent = {
  geofenceId: string;
  geofenceName: string;
  eventType: 'enter' | 'exit';
  userId: string;
  displayName: string;
  occurredAt: string;
};
