// features/geofencing/radius.ts
// Decision #13: radius is entered/displayed in feet but stored as radius_m
// (meters, matching expo-location's region shape) — conversion lives here
// since both the map-picker slider and place-list row display need it.
const METERS_PER_FOOT = 0.3048;

export const RADIUS_MIN_FT = 250;
export const RADIUS_MAX_FT = 10600;
export const RADIUS_DEFAULT_FT = 1000;

export const feetToMeters = (feet: number): number => {
  return feet * METERS_PER_FOOT;
};

export const metersToFeet = (meters: number): number => {
  return meters / METERS_PER_FOOT;
};
