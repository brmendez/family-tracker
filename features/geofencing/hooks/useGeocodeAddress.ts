// features/geofencing/hooks/useGeocodeAddress.ts
import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';

export type GeocodedLocation = { latitude: number; longitude: number };

type UseGeocodeAddressResult = {
  geocodeAddress: (
    address: string,
  ) => Promise<{ location: GeocodedLocation | null; error: string | null }>;
  geocoding: boolean;
  geocodeErrorMessage: string | null;
};

const NO_RESULTS_MESSAGE = 'No results found for that address.';

/**
 * Decision #13: thin wrapper around expo-location's on-device
 * geocodeAsync — exact-match, explicit-submit only (no typeahead, that's
 * FT-14b). Returns the first result, same "first match wins" behavior the
 * ticket specifies.
 */
export const useGeocodeAddress = (): UseGeocodeAddressResult => {
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeErrorMessage, setGeocodeErrorMessage] = useState<
    string | null
  >(null);

  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const geocodeAddress = useCallback(async (address: string) => {
    setGeocoding(true);
    setGeocodeErrorMessage(null);

    try {
      const results = await Location.geocodeAsync(address);
      const [first] = results;

      if (!isMountedRef.current) {
        return { location: null, error: null };
      }

      setGeocoding(false);

      if (!first) {
        setGeocodeErrorMessage(NO_RESULTS_MESSAGE);
        return { location: null, error: NO_RESULTS_MESSAGE };
      }

      return {
        location: { latitude: first.latitude, longitude: first.longitude },
        error: null,
      };
    } catch (error) {
      const message = (error as Error).message;

      if (!isMountedRef.current) {
        return { location: null, error: null };
      }

      setGeocoding(false);
      setGeocodeErrorMessage(message);

      return { location: null, error: message };
    }
  }, []);

  return { geocodeAddress, geocoding, geocodeErrorMessage };
};
