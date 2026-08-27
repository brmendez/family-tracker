// features/map/lib/deconflictMarkerPositions.ts
import { distanceMeters } from '../../geofencing/distance';
import { MARKER_OFFSET_M, MARKER_OVERLAP_THRESHOLD_M } from '../../../lib/constants';

export type MarkerPosition = {
  id: string;
  latitude: number;
  longitude: number;
};

export type Coordinate = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_M = 6371000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

// Great-circle destination point given a start coordinate, bearing, and distance.
const offsetCoordinate = (
  origin: Coordinate,
  bearingDeg: number,
  distanceM: number,
): Coordinate => {
  const angularDistance = distanceM / EARTH_RADIUS_M;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(origin.latitude);
  const lng1 = toRadians(origin.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
      Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
    );

  return { latitude: toDegrees(lat2), longitude: toDegrees(lng2) };
};

// Sorted by id first so the lowest-id member is always the cluster anchor,
// regardless of fetch/array order — re-renders never flip which pin moves.
export const deconflictMarkerPositions = (
  positions: MarkerPosition[],
): Record<string, Coordinate> => {
  const sorted = [...positions].sort((a, b) => a.id.localeCompare(b.id));
  const clusters: MarkerPosition[][] = [];

  for (const position of sorted) {
    const cluster = clusters.find(
      (members) => distanceMeters(members[0], position) <= MARKER_OVERLAP_THRESHOLD_M,
    );

    if (cluster) {
      cluster.push(position);
    } else {
      clusters.push([position]);
    }
  }

  const result: Record<string, Coordinate> = {};

  for (const cluster of clusters) {
    const anchor = cluster[0];
    const clusterSize = cluster.length;

    cluster.forEach((member, index) => {
      if (index === 0) {
        result[member.id] = { latitude: anchor.latitude, longitude: anchor.longitude };
        return;
      }

      const bearingDeg = (360 / clusterSize) * index;
      result[member.id] = offsetCoordinate(anchor, bearingDeg, MARKER_OFFSET_M);
    });
  }

  return result;
};
