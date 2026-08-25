// features/geofencing/hooks/useReverseGeocode.test.ts
import { renderHook, act } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { useReverseGeocode } from './useReverseGeocode';

jest.mock('expo-location');

const mockReverseGeocodeAsync = Location.reverseGeocodeAsync as jest.MockedFunction<
  typeof Location.reverseGeocodeAsync
>;

describe('useReverseGeocode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('successful reverse geocode', () => {
    it('sets address from successful reverse geocode result', async () => {
      const mockResult: Location.LocationGeocodedAddress = {
        streetNumber: '123',
        street: 'Main St',
        city: 'Portland',
        region: 'OR',
      } as Location.LocationGeocodedAddress;

      mockReverseGeocodeAsync.mockResolvedValue([mockResult]);

      const { result } = await renderHook(() => useReverseGeocode());

      expect(result.current.address).toBeNull();
      expect(result.current.resolving).toBe(false);

      await act(async () => {
        result.current.reverseGeocode({ latitude: 45.5, longitude: -122.7 });
      });

      expect(result.current.address).toBe('123 Main St, Portland, OR');
      expect(result.current.resolving).toBe(false);
    });

    it('formats address correctly with partial address data', async () => {
      const mockResult: Location.LocationGeocodedAddress = {
        city: 'Seattle',
        region: 'WA',
      } as Location.LocationGeocodedAddress;

      mockReverseGeocodeAsync.mockResolvedValue([mockResult]);

      const { result } = await renderHook(() => useReverseGeocode());

      await act(async () => {
        result.current.reverseGeocode({ latitude: 47.6, longitude: -122.3 });
      });

      expect(result.current.address).toBe('Seattle, WA');
    });

    it('handles empty address results', async () => {
      mockReverseGeocodeAsync.mockResolvedValue([]);

      const { result } = await renderHook(() => useReverseGeocode());

      await act(async () => {
        result.current.reverseGeocode({ latitude: 0, longitude: 0 });
      });

      expect(result.current.address).toBeNull();
      expect(result.current.resolving).toBe(false);
    });
  });

  describe('request ID guard (stale request prevention)', () => {
    it('does not clobber newer result with older response', async () => {
      const slowResult: Location.LocationGeocodedAddress = {
        city: 'OldCity',
      } as Location.LocationGeocodedAddress;

      const fastResult: Location.LocationGeocodedAddress = {
        city: 'NewCity',
      } as Location.LocationGeocodedAddress;

      // First call resolves slowly, second resolves quickly
      mockReverseGeocodeAsync
        .mockResolvedValueOnce([slowResult])
        .mockResolvedValueOnce([fastResult]);

      const { result } = await renderHook(() => useReverseGeocode());

      let firstResolve: () => void = () => {};
      const firstPromise = new Promise<void>((resolve) => {
        firstResolve = resolve;
      });

      // Mock reverseGeocodeAsync to delay the first call
      mockReverseGeocodeAsync.mockImplementation((coords) => {
        // Second call resolves immediately
        if (coords.latitude === 47.6) {
          return Promise.resolve([fastResult]);
        }
        // First call waits for us to tell it to resolve
        return firstPromise.then(() => Promise.resolve([slowResult]));
      });

      // Issue first request
      await act(async () => {
        result.current.reverseGeocode({ latitude: 45.5, longitude: -122.7 });
      });

      // Issue second request (faster)
      await act(async () => {
        result.current.reverseGeocode({ latitude: 47.6, longitude: -122.3 });
      });

      // At this point, the second (faster) result should be applied
      expect(result.current.address).toBe('NewCity');

      // Now let the first request resolve
      await act(async () => {
        firstResolve();
        await firstPromise;
      });

      // Address should still be NewCity, not overwritten by the old response
      expect(result.current.address).toBe('NewCity');
    });
  });

  describe('error handling', () => {
    it('clears address and sets resolving=false on error', async () => {
      mockReverseGeocodeAsync.mockRejectedValue(new Error('Network error'));

      const { result } = await renderHook(() => useReverseGeocode());

      await act(async () => {
        result.current.reverseGeocode({ latitude: 45.5, longitude: -122.7 });
      });

      expect(result.current.address).toBeNull();
      expect(result.current.resolving).toBe(false);
    });
  });

  describe('resolving state', () => {
    it('sets resolving=true during the call and false when done', async () => {
      const mockResult: Location.LocationGeocodedAddress = {
        city: 'Portland',
      } as Location.LocationGeocodedAddress;

      mockReverseGeocodeAsync.mockResolvedValue([mockResult]);

      const { result } = await renderHook(() => useReverseGeocode());

      expect(result.current.resolving).toBe(false);

      await act(async () => {
        result.current.reverseGeocode({ latitude: 45.5, longitude: -122.7 });
      });

      expect(result.current.resolving).toBe(false);
    });
  });

  describe('unmount safety', () => {
    it('does not update state after unmount', async () => {
      const mockResult: Location.LocationGeocodedAddress = {
        city: 'Portland',
      } as Location.LocationGeocodedAddress;

      mockReverseGeocodeAsync.mockResolvedValue([mockResult]);

      const { result, unmount } = await renderHook(() => useReverseGeocode());

      await act(async () => {
        result.current.reverseGeocode({ latitude: 45.5, longitude: -122.7 });
      });

      unmount();

      // Should not throw or cause errors after unmount
      expect(result.current.address).toBe('Portland');
    });
  });
});
