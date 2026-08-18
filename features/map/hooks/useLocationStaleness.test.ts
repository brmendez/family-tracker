// features/map/hooks/useLocationStaleness.test.ts
import { act, renderHook } from '@testing-library/react-native';

import { LOCATION_STALE_THRESHOLD_MS } from '../../../lib/constants';
import { useLocationStaleness } from './useLocationStaleness';

const isoAgo = (ms: number, from = Date.now()) =>
  new Date(from - ms).toISOString();

describe('useLocationStaleness', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('label formatting', () => {
    it('stays "just now" under a minute, then flips at the 60s boundary', async () => {
      const { result: under } = await renderHook(() =>
        useLocationStaleness(isoAgo(59 * 1000)),
      );
      expect(under.current.label).toBe('just now');

      const { result: atBoundary } = await renderHook(() =>
        useLocationStaleness(isoAgo(60 * 1000)),
      );
      expect(atBoundary.current.label).toBe('1 minute ago');
    });

    it('pluralizes minutes and holds until the hour boundary', async () => {
      const { result: plural } = await renderHook(() =>
        useLocationStaleness(isoAgo(2 * 60 * 1000)),
      );
      expect(plural.current.label).toBe('2 minutes ago');

      const { result: justUnderHour } = await renderHook(() =>
        useLocationStaleness(isoAgo((59 * 60 + 59) * 1000)),
      );
      expect(justUnderHour.current.label).toBe('59 minutes ago');

      const { result: atHour } = await renderHook(() =>
        useLocationStaleness(isoAgo(60 * 60 * 1000)),
      );
      expect(atHour.current.label).toBe('1 hour ago');
    });

    it('pluralizes hours and holds until the day boundary', async () => {
      const { result: plural } = await renderHook(() =>
        useLocationStaleness(isoAgo(2 * 60 * 60 * 1000)),
      );
      expect(plural.current.label).toBe('2 hours ago');

      const { result: justUnderDay } = await renderHook(() =>
        useLocationStaleness(isoAgo(23 * 60 * 60 * 1000)),
      );
      expect(justUnderDay.current.label).toBe('23 hours ago');

      const { result: atDay } = await renderHook(() =>
        useLocationStaleness(isoAgo(24 * 60 * 60 * 1000)),
      );
      expect(atDay.current.label).toBe('1 day ago');
    });

    it('pluralizes days', async () => {
      const { result } = await renderHook(() =>
        useLocationStaleness(isoAgo(2 * 24 * 60 * 60 * 1000)),
      );
      expect(result.current.label).toBe('2 days ago');
    });

    it('clamps a future recordedAt to "just now" instead of a negative duration', async () => {
      const { result } = await renderHook(() =>
        useLocationStaleness(isoAgo(-1000)),
      );
      expect(result.current.label).toBe('just now');
      expect(result.current.isStale).toBe(false);
    });
  });

  describe('isStale flag', () => {
    it('flips exactly at LOCATION_STALE_THRESHOLD_MS, not before or after', async () => {
      const { result: justUnder } = await renderHook(() =>
        useLocationStaleness(isoAgo(LOCATION_STALE_THRESHOLD_MS - 1000)),
      );
      expect(justUnder.current.isStale).toBe(false);

      const { result: atThreshold } = await renderHook(() =>
        useLocationStaleness(isoAgo(LOCATION_STALE_THRESHOLD_MS)),
      );
      expect(atThreshold.current.isStale).toBe(true);
    });
  });

  describe('interval-based re-rendering', () => {
    it('advances the label over successive ticks without new props', async () => {
      const recordedAt = isoAgo(30 * 1000);
      const { result } = await renderHook(() => useLocationStaleness(recordedAt));

      expect(result.current.label).toBe('just now');

      await act(async () => {
        jest.advanceTimersByTime(31 * 1000); // 61s elapsed
      });
      expect(result.current.label).toBe('1 minute ago');

      await act(async () => {
        jest.advanceTimersByTime(60 * 1000); // 121s elapsed
      });
      expect(result.current.label).toBe('2 minutes ago');
    });

    it('flips isStale from false to true as time crosses the threshold', async () => {
      const recordedAt = isoAgo(LOCATION_STALE_THRESHOLD_MS - 60000);
      const { result } = await renderHook(() => useLocationStaleness(recordedAt));

      expect(result.current.isStale).toBe(false);

      await act(async () => {
        jest.advanceTimersByTime(60000);
      });
      expect(result.current.isStale).toBe(true);
    });
  });

  describe('cleanup on unmount', () => {
    it('clears its interval on unmount, so timer advances after unmount are inert', async () => {
      const { unmount } = await renderHook(() =>
        useLocationStaleness(isoAgo(30 * 1000)),
      );

      unmount();

      expect(() => {
        jest.advanceTimersByTime(30 * 1000);
      }).not.toThrow();
    });
  });
});
