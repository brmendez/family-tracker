// features/geofencing/distance.ts
const EARTH_RADIUS_M = 6371000;

type LatLng = {
  latitude: number;
  longitude: number;
};

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/** Great-circle distance in meters between two lat/lng points. */
export const distanceMeters = (a: LatLng, b: LatLng): number => {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);

  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
};
