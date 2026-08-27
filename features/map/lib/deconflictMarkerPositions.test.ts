import { deconflictMarkerPositions } from './deconflictMarkerPositions';
import type { Coordinate, MarkerPosition } from './deconflictMarkerPositions';
import { distanceMeters } from '../../geofencing/distance';
import { MARKER_OFFSET_M, MARKER_OVERLAP_THRESHOLD_M } from '../../../lib/constants';

describe('deconflictMarkerPositions', () => {
  it('single point returns its true coordinate', () => {
    const positions: MarkerPosition[] = [
      { id: 'alice', latitude: 37.7749, longitude: -122.4194 },
    ];

    const result = deconflictMarkerPositions(positions);

    expect(result.alice).toEqual({ latitude: 37.7749, longitude: -122.4194 });
  });

  it('two points far apart both keep their true coordinates', () => {
    const positions: MarkerPosition[] = [
      { id: 'alice', latitude: 37.7749, longitude: -122.4194 },
      { id: 'bob', latitude: 40.7128, longitude: -74.006 }, // NYC, ~5000km away
    ];

    const result = deconflictMarkerPositions(positions);

    expect(result.alice).toEqual({ latitude: 37.7749, longitude: -122.4194 });
    expect(result.bob).toEqual({ latitude: 40.7128, longitude: -74.006 });
  });

  it('two points within threshold: anchor keeps position, other nudges away', () => {
    const anchor = { id: 'alice', latitude: 37.7749, longitude: -122.4194 };
    const nearby = {
      id: 'bob',
      latitude: 37.7749 + 0.0001, // ~11m away
      longitude: -122.4194,
    };

    const result = deconflictMarkerPositions([anchor, nearby]);

    // Lowest id (alice < bob) is anchor, stays at true coordinate
    expect(result.alice).toEqual({ latitude: anchor.latitude, longitude: anchor.longitude });

    // Bob gets nudged ~8m away
    const bobCoord = result.bob;
    const distFromAnchor = distanceMeters(anchor, bobCoord);
    expect(distFromAnchor).toBeCloseTo(MARKER_OFFSET_M, 1); // Within 1 meter of 8m offset

    // Bob's coordinate is different from true position
    expect(bobCoord).not.toEqual({
      latitude: nearby.latitude,
      longitude: nearby.longitude,
    });
  });

  it('three points in cluster: anchor keeps position, others offset at distinct angles', () => {
    const anchor = { id: 'alice', latitude: 37.7749, longitude: -122.4194 };
    const nearby1 = {
      id: 'bob',
      latitude: 37.7749 + 0.0001,
      longitude: -122.4194,
    };
    const nearby2 = {
      id: 'charlie',
      latitude: 37.7749,
      longitude: -122.4194 + 0.0001,
    };

    const result = deconflictMarkerPositions([anchor, nearby1, nearby2]);

    // Anchor stays true
    expect(result.alice).toEqual({ latitude: anchor.latitude, longitude: anchor.longitude });

    // Both non-anchors offset
    const bobCoord = result.bob;
    const charlieCoord = result.charlie;

    const bobDist = distanceMeters(anchor, bobCoord);
    const charlieDist = distanceMeters(anchor, charlieCoord);

    expect(bobDist).toBeCloseTo(MARKER_OFFSET_M, 1);
    expect(charlieDist).toBeCloseTo(MARKER_OFFSET_M, 1);

    // Bob and Charlie are at different angles, not the same coordinate
    expect(bobCoord).not.toEqual(charlieCoord);

    // Neither nudged member is at the true position
    expect(bobCoord).not.toEqual({
      latitude: nearby1.latitude,
      longitude: nearby1.longitude,
    });
    expect(charlieCoord).not.toEqual({
      latitude: nearby2.latitude,
      longitude: nearby2.longitude,
    });
  });

  it('sorting by id ensures deterministic anchor assignment regardless of input order', () => {
    const positions1: MarkerPosition[] = [
      { id: 'charlie', latitude: 37.7749, longitude: -122.4194 },
      { id: 'alice', latitude: 37.7749 + 0.0001, longitude: -122.4194 },
      { id: 'bob', latitude: 37.7749, longitude: -122.4194 + 0.0001 },
    ];

    const positions2: MarkerPosition[] = [
      { id: 'bob', latitude: 37.7749, longitude: -122.4194 + 0.0001 },
      { id: 'alice', latitude: 37.7749 + 0.0001, longitude: -122.4194 },
      { id: 'charlie', latitude: 37.7749, longitude: -122.4194 },
    ];

    const result1 = deconflictMarkerPositions(positions1);
    const result2 = deconflictMarkerPositions(positions2);

    // Regardless of input order, alice is the anchor and keeps true coordinate
    expect(result1.alice).toEqual(result2.alice);
    expect(result1.alice).toEqual({ latitude: 37.7749 + 0.0001, longitude: -122.4194 });
  });

  it('empty array returns empty record', () => {
    const result = deconflictMarkerPositions([]);

    expect(result).toEqual({});
  });

  it('two separate clusters are handled independently', () => {
    const cluster1Anchor = { id: 'alice', latitude: 37.7749, longitude: -122.4194 };
    const cluster1Nearby = { id: 'bob', latitude: 37.7749 + 0.0001, longitude: -122.4194 };
    // Cluster 2 is far away
    const cluster2Anchor = { id: 'charlie', latitude: 40.7128, longitude: -74.006 };
    const cluster2Nearby = { id: 'diana', latitude: 40.7128 + 0.0001, longitude: -74.006 };

    const result = deconflictMarkerPositions([
      cluster1Anchor,
      cluster1Nearby,
      cluster2Anchor,
      cluster2Nearby,
    ]);

    // Cluster 1: alice is anchor
    expect(result.alice).toEqual({
      latitude: cluster1Anchor.latitude,
      longitude: cluster1Anchor.longitude,
    });
    expect(result.bob).not.toEqual({
      latitude: cluster1Nearby.latitude,
      longitude: cluster1Nearby.longitude,
    });

    // Cluster 2: charlie is anchor (c < d)
    expect(result.charlie).toEqual({
      latitude: cluster2Anchor.latitude,
      longitude: cluster2Anchor.longitude,
    });
    expect(result.diana).not.toEqual({
      latitude: cluster2Nearby.latitude,
      longitude: cluster2Nearby.longitude,
    });

    // Clusters are independent (charlie's offset doesn't affect alice/bob)
    const bob1 = deconflictMarkerPositions([cluster1Anchor, cluster1Nearby]);
    expect(result.bob).toEqual(bob1.bob);
  });
});
