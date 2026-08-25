// features/geofencing/hooks/useReverseGeocode.ts
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

type UseReverseGeocodeResult = {
  reverseGeocode: (coords: {
    latitude: number;
    longitude: number;
  }) => Promise<string | null>;
  address: string | null;
  resolving: boolean;
};

const formatAddress = (result: Location.LocationGeocodedAddress): string => {
  const parts = [
    [result.streetNumber, result.street].filter(Boolean).join(' '),
    result.city,
    result.region,
  ].filter(Boolean);

  return parts.join(', ');
};

/**
 * On-device reverse geocode (coords -> address text), used by
 * MapLocationPicker to show a read-only label of the currently-centered
 * location. Guards against an older call's response landing after a newer
 * one (possible since panning can fire several calls in quick succession).
 */
export const useReverseGeocode = (): UseReverseGeocodeResult => {
  const [address, setAddress] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const reverseGeocode = useCallback(
    async (coords: { latitude: number; longitude: number }) => {
      const requestId = ++requestIdRef.current;

      setResolving(true);

      try {
        const results = await Location.reverseGeocodeAsync(coords);
        const [first] = results;
        const resolved = first ? formatAddress(first) : null;

        if (isMountedRef.current && requestIdRef.current === requestId) {
          setAddress(resolved);
          setResolving(false);
        }

        return resolved;
      } catch {
        if (isMountedRef.current && requestIdRef.current === requestId) {
          setAddress(null);
          setResolving(false);
        }

        return null;
      }
    },
    [],
  );

  return { reverseGeocode, address, resolving };
};
