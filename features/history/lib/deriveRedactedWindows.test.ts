import { deriveRedactedWindows } from './deriveRedactedWindows';
import type { PlaybackPoint } from '../types/history.types';

describe('deriveRedactedWindows', () => {
  it('returns empty array for empty points', () => {
    const result = deriveRedactedWindows([]);
    expect(result).toEqual([]);
  });

  it('returns empty array when no points are redacted', () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 2.5,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.0,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const result = deriveRedactedWindows(points);

    expect(result).toEqual([]);
  });

  it('collapses a single redacted point into one window', () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
    ];

    const result = deriveRedactedWindows(points);

    expect(result).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T08:00:00.000Z',
      },
    ]);
  });

  it('collapses contiguous redacted points into one window', () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T08:15:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T08:30:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
    ];

    const result = deriveRedactedWindows(points);

    expect(result).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T08:30:00.000Z',
      },
    ]);
  });

  it('creates separate windows for non-contiguous redacted runs', () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T08:15:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T08:30:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '4',
        recordedAt: '2024-01-15T08:45:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
    ];

    const result = deriveRedactedWindows(points);

    expect(result).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T08:00:00.000Z',
      },
      {
        startsAt: '2024-01-15T08:30:00.000Z',
        endsAt: '2024-01-15T08:45:00.000Z',
      },
    ]);
  });

  it('starts and ends redacted runs at correct timestamps', () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T10:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T11:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T12:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '4',
        recordedAt: '2024-01-15T13:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const result = deriveRedactedWindows(points);

    expect(result).toEqual([
      {
        startsAt: '2024-01-15T11:00:00.000Z',
        endsAt: '2024-01-15T12:00:00.000Z',
      },
    ]);
  });

  it('handles entire-day redaction', () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T14:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T20:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
    ];

    const result = deriveRedactedWindows(points);

    expect(result).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T20:00:00.000Z',
      },
    ]);
  });

  it('preserves point order assumption (must be recorded_at ascending)', () => {
    // Test that the function assumes points are in order; this is a contract
    // with the caller (RPC returns them ordered), so we verify it works as expected
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T10:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T09:00:00.000Z', // Out of order (test precondition violation)
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
    ];

    // Function assumes order and just uses the last redacted timestamp for endsAt,
    // so this will produce the wrong result — but that's the caller's responsibility
    // to pass sorted points. This test documents that assumption.
    const result = deriveRedactedWindows(points);

    expect(result).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T10:00:00.000Z',
      },
    ]);
  });

  it('handles multiple separate windows across a day', () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T08:30:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '4',
        recordedAt: '2024-01-15T12:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '5',
        recordedAt: '2024-01-15T13:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '6',
        recordedAt: '2024-01-15T14:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
      {
        id: '7',
        recordedAt: '2024-01-15T18:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
    ];

    const result = deriveRedactedWindows(points);

    expect(result).toEqual([
      {
        startsAt: '2024-01-15T08:00:00.000Z',
        endsAt: '2024-01-15T08:30:00.000Z',
      },
      {
        startsAt: '2024-01-15T12:00:00.000Z',
        endsAt: '2024-01-15T13:00:00.000Z',
      },
      {
        startsAt: '2024-01-15T18:00:00.000Z',
        endsAt: '2024-01-15T18:00:00.000Z',
      },
    ]);
  });
});
