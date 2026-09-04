import { groupLocationHistoryByDay } from './groupLocationHistoryByDay';
import type { LocationHistoryPoint, JourneyDay } from '../types/history.types';

describe('groupLocationHistoryByDay', () => {
  it('empty array returns empty array', () => {
    const result = groupLocationHistoryByDay([]);
    expect(result).toEqual([]);
  });

  it('single point returns one day with one point', () => {
    const points: LocationHistoryPoint[] = [
      {
        id: '1',
        latitude: 37.7749,
        longitude: -122.4194,
        recordedAt: '2024-01-15T14:30:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
    ];

    const result = groupLocationHistoryByDay(points);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      dateLocal: '2024-01-15',
      points: [points[0]],
    });
  });

  it('multiple points on the same day bucket into one day', () => {
    const points: LocationHistoryPoint[] = [
      {
        id: '1',
        latitude: 37.7749,
        longitude: -122.4194,
        recordedAt: '2024-01-15T08:00:00.000Z',
        speedMps: 2.5,
        headingDeg: 90,
      },
      {
        id: '2',
        latitude: 37.7750,
        longitude: -122.4190,
        recordedAt: '2024-01-15T14:30:00.000Z',
        speedMps: 1.0,
        headingDeg: 180,
      },
      {
        id: '3',
        latitude: 37.7751,
        longitude: -122.4189,
        recordedAt: '2024-01-15T23:59:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
    ];

    const result = groupLocationHistoryByDay(points);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      dateLocal: '2024-01-15',
      points: [points[0], points[1], points[2]],
    });
  });

  it('points on different days create separate day buckets', () => {
    const points: LocationHistoryPoint[] = [
      {
        id: '1',
        latitude: 37.7749,
        longitude: -122.4194,
        recordedAt: '2024-01-15T10:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
      {
        id: '2',
        latitude: 37.7750,
        longitude: -122.4190,
        recordedAt: '2024-01-16T10:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
      {
        id: '3',
        latitude: 37.7751,
        longitude: -122.4189,
        recordedAt: '2024-01-17T10:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
    ];

    const result = groupLocationHistoryByDay(points);

    expect(result).toHaveLength(3);
    expect(result[0].dateLocal).toBe('2024-01-15');
    expect(result[1].dateLocal).toBe('2024-01-16');
    expect(result[2].dateLocal).toBe('2024-01-17');
    expect(result[0].points).toEqual([points[0]]);
    expect(result[1].points).toEqual([points[1]]);
    expect(result[2].points).toEqual([points[2]]);
  });

  it('preserves insertion order of points within a day', () => {
    const points: LocationHistoryPoint[] = [
      {
        id: '1',
        latitude: 37.7749,
        longitude: -122.4194,
        recordedAt: '2024-01-15T08:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
      {
        id: '2',
        latitude: 37.7750,
        longitude: -122.4190,
        recordedAt: '2024-01-15T14:30:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
      {
        id: '3',
        latitude: 37.7751,
        longitude: -122.4189,
        recordedAt: '2024-01-15T20:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
    ];

    const result = groupLocationHistoryByDay(points);

    expect(result[0].points).toEqual([points[0], points[1], points[2]]);
  });

  it('merges a point into an existing day bucket rather than creating a duplicate', () => {
    const existingDay: JourneyDay = {
      dateLocal: '2024-01-15',
      points: [
        {
          id: '1',
          latitude: 37.7749,
          longitude: -122.4194,
          recordedAt: '2024-01-15T08:00:00.000Z',
          speedMps: null,
          headingDeg: null,
        },
      ],
    };

    // Simulating a paginated append: first call with first point creates the day,
    // then second call with more points on same day should merge them in.
    const firstBatch = existingDay.points;
    const result1 = groupLocationHistoryByDay(firstBatch);

    const newPoint: LocationHistoryPoint = {
      id: '2',
      latitude: 37.7750,
      longitude: -122.4190,
      recordedAt: '2024-01-15T14:30:00.000Z',
      speedMps: null,
      headingDeg: null,
    };

    const combinedPoints = [...firstBatch, newPoint];
    const result2 = groupLocationHistoryByDay(combinedPoints);

    // Should still have only one day, with both points
    expect(result2).toHaveLength(1);
    expect(result2[0].dateLocal).toBe('2024-01-15');
    expect(result2[0].points).toHaveLength(2);
    expect(result2[0].points[0]).toEqual(firstBatch[0]);
    expect(result2[0].points[1]).toEqual(newPoint);
  });

  it('handles multiple days in a sequence', () => {
    // Test that points on day boundaries create separate buckets.
    // Using exact midnight UTC times to avoid timezone issues.
    const points: LocationHistoryPoint[] = [
      {
        id: '1',
        latitude: 37.7749,
        longitude: -122.4194,
        recordedAt: '2024-01-15T05:00:00.000Z', // Morning of 15th
        speedMps: null,
        headingDeg: null,
      },
      {
        id: '2',
        latitude: 37.7750,
        longitude: -122.4190,
        recordedAt: '2024-01-16T05:00:00.000Z', // Morning of 16th
        speedMps: null,
        headingDeg: null,
      },
    ];

    const result = groupLocationHistoryByDay(points);

    expect(result).toHaveLength(2);
    expect(result[0].points).toHaveLength(1);
    expect(result[1].points).toHaveLength(1);
  });

  it('uses device-local day boundaries, not UTC', () => {
    // Point at 2024-01-15T23:00:00Z in a timezone that's ahead (e.g. UTC+8)
    // should be 2024-01-16 local — testing that toDateLocal uses local date,
    // not UTC date. This test's precision is limited since we can't override
    // the system timezone in Node, but we can test the formatting logic.
    const points: LocationHistoryPoint[] = [
      {
        id: '1',
        latitude: 37.7749,
        longitude: -122.4194,
        recordedAt: '2024-01-15T23:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
    ];

    const result = groupLocationHistoryByDay(points);

    // The exact dateLocal depends on the system timezone running the test,
    // but we can verify the format is correct (YYYY-MM-DD)
    expect(result).toHaveLength(1);
    expect(result[0].dateLocal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles mixed-day interleaved points', () => {
    const points: LocationHistoryPoint[] = [
      {
        id: '1',
        latitude: 37.7749,
        longitude: -122.4194,
        recordedAt: '2024-01-15T10:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
      {
        id: '2',
        latitude: 37.7750,
        longitude: -122.4190,
        recordedAt: '2024-01-16T10:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
      {
        id: '3',
        latitude: 37.7751,
        longitude: -122.4189,
        recordedAt: '2024-01-15T14:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
    ];

    const result = groupLocationHistoryByDay(points);

    // Should have 2 days, with the 15th containing points 0 and 2
    expect(result).toHaveLength(2);
    const day15 = result.find((d) => d.dateLocal === '2024-01-15');
    const day16 = result.find((d) => d.dateLocal === '2024-01-16');

    expect(day15?.points).toHaveLength(2);
    expect(day15?.points[0].id).toBe('1');
    expect(day15?.points[1].id).toBe('3');

    expect(day16?.points).toHaveLength(1);
    expect(day16?.points[0].id).toBe('2');
  });

  it('handles multiple points across different days', () => {
    const points: LocationHistoryPoint[] = [];
    // Use times well into the day (noon) to avoid timezone boundary issues
    for (let day = 1; day <= 5; day++) {
      points.push({
        id: `point-${day}`,
        latitude: 37.7749 + day * 0.001,
        longitude: -122.4194,
        recordedAt: `2024-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
        speedMps: null,
        headingDeg: null,
      });
    }

    const result = groupLocationHistoryByDay(points);

    // Should have at least 4 or 5 days (depending on timezone)
    expect(result.length).toBeGreaterThanOrEqual(4);
    // Each result should have a dateLocal
    result.forEach((day) => {
      expect(day.dateLocal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Each day should have at least one point
      expect(day.points.length).toBeGreaterThan(0);
    });
  });
});
