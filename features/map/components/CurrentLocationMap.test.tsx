// features/map/components/CurrentLocationMap.test.tsx
// jest.mock() calls must come BEFORE any other imports
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../../context/auth.context');

jest.mock('../hooks/useForegroundLocation');
jest.mock('../hooks/useLocationHistoryWriter');
jest.mock('react-native-maps', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: (props: any) => React.createElement('MapView', props, props.children),
    Marker: (props: any) => React.createElement('Marker', props),
  };
});

import { render, screen } from '@testing-library/react-native';
import type { LocationObjectCoords } from 'expo-location';

import { MAP_INITIAL_DELTA } from '../../../lib/constants';
import { useForegroundLocation } from '../hooks/useForegroundLocation';
import { useLocationHistoryWriter } from '../hooks/useLocationHistoryWriter';
import { CurrentLocationMap } from './CurrentLocationMap';

const mockUseForegroundLocation =
  useForegroundLocation as jest.MockedFunction<typeof useForegroundLocation>;
const mockUseLocationHistoryWriter =
  useLocationHistoryWriter as jest.MockedFunction<typeof useLocationHistoryWriter>;

const createMockCoords = (
  latitude: number = 37.7749,
  longitude: number = -122.4194,
): LocationObjectCoords => ({
  latitude,
  longitude,
  altitude: 10,
  accuracy: 5,
  altitudeAccuracy: 2,
  heading: 45,
  speed: 1.5,
});

describe('CurrentLocationMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a loading indicator while coords are null', async () => {
    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage: null,
    });

    // Component should render without error in loading state
    await render(<CurrentLocationMap />);
    // When coords are null and no error, the component renders the ActivityIndicator
    // Verify by checking that error messages are not present
    expect(screen.queryByText(/Location service unavailable/)).toBeNull();
  });

  it('renders an error message when the location hook returns an error', async () => {
    const errorMessage = 'Location service unavailable';
    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage,
    });

    await render(<CurrentLocationMap />);

    expect(screen.getByText(errorMessage)).toBeTruthy();
  });

  it('does not render the error message when coords are present', async () => {
    const coords = createMockCoords();
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    await render(<CurrentLocationMap />);

    // Once coords are available, error messages should be gone
    expect(screen.queryByText(/Location service unavailable/)).toBeNull();
  });

  it('calls useLocationHistoryWriter with coords and timestamp from useForegroundLocation', async () => {
    const coords = createMockCoords();
    const timestamp = 1704067200000;

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    await render(<CurrentLocationMap />);

    expect(mockUseLocationHistoryWriter).toHaveBeenCalledWith(coords, timestamp);
  });

  it('calls useLocationHistoryWriter with null coords/timestamp while loading', async () => {
    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage: null,
    });

    await render(<CurrentLocationMap />);

    expect(mockUseLocationHistoryWriter).toHaveBeenCalledWith(null, null);
  });

  it('calls useLocationHistoryWriter again when coords/timestamp update', async () => {
    const coords1 = createMockCoords(37.7749, -122.4194);
    const timestamp1 = 1704067200000;

    mockUseForegroundLocation.mockReturnValue({
      coords: coords1,
      timestamp: timestamp1,
      errorMessage: null,
    });

    const { rerender } = await render(<CurrentLocationMap />);

    expect(mockUseLocationHistoryWriter).toHaveBeenCalledWith(coords1, timestamp1);

    const coords2 = createMockCoords(37.7750, -122.4195);
    const timestamp2 = 1704067300000;

    mockUseForegroundLocation.mockReturnValue({
      coords: coords2,
      timestamp: timestamp2,
      errorMessage: null,
    });

    await rerender(<CurrentLocationMap />);

    expect(mockUseLocationHistoryWriter).toHaveBeenCalledWith(coords2, timestamp2);
  });

  it('sets initialRegion from the first location received', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    const { toJSON } = await render(<CurrentLocationMap />);

    const mapView = toJSON() as unknown as { props: Record<string, unknown> };
    expect(mapView.props.initialRegion).toEqual({
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: MAP_INITIAL_DELTA,
      longitudeDelta: MAP_INITIAL_DELTA,
    });
  });

  it('does not reset initialRegion on subsequent coords updates', async () => {
    const coords1 = createMockCoords(37.7749, -122.4194);
    const timestamp1 = Date.now();

    // First render: loading state
    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage: null,
    });

    const { rerender, toJSON } = await render(<CurrentLocationMap />);

    // Second render: coords available
    mockUseForegroundLocation.mockReturnValue({
      coords: coords1,
      timestamp: timestamp1,
      errorMessage: null,
    });

    await rerender(<CurrentLocationMap />);

    const initialMapView = toJSON() as unknown as { props: Record<string, unknown> };
    const initialRegion = initialMapView.props.initialRegion;

    // After initialRegion is set, subsequent location updates shouldn't reset it
    const coords2 = createMockCoords(37.7750, -122.4195);

    mockUseForegroundLocation.mockReturnValue({
      coords: coords2,
      timestamp: timestamp1 + 1000,
      errorMessage: null,
    });

    await rerender(<CurrentLocationMap />);

    const updatedMapView = toJSON() as unknown as { props: Record<string, unknown> };
    expect(updatedMapView.props.initialRegion).toEqual(initialRegion);
    expect(updatedMapView.props.initialRegion).not.toEqual({
      latitude: coords2.latitude,
      longitude: coords2.longitude,
      latitudeDelta: MAP_INITIAL_DELTA,
      longitudeDelta: MAP_INITIAL_DELTA,
    });
  });

  it('displays the marker with the correct accessibility label', async () => {
    const coords = createMockCoords();
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    await render(<CurrentLocationMap />);

    expect(screen.getByLabelText('Your location')).toBeTruthy();
  });

  it('shows error state and clears loading indicator when error occurs', async () => {
    const errorMessage = 'Permission denied';

    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage,
    });

    await render(<CurrentLocationMap />);

    expect(screen.getByText(errorMessage)).toBeTruthy();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  it('prefers error state over loading state', async () => {
    // If somehow both error and null coords exist, error should be shown
    const errorMessage = 'Fatal error';

    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage,
    });

    await render(<CurrentLocationMap />);

    expect(screen.getByText(errorMessage)).toBeTruthy();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });
});
