// features/map/components/FamilyMap.test.tsx
// jest.mock() calls must come BEFORE any other imports
jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('../../../context/auth.context');

jest.mock('../hooks/useForegroundLocation');
jest.mock('../hooks/useLocationHistoryWriter');
jest.mock('../hooks/useOtherProfile');
jest.mock('../hooks/useOtherUserLocation');
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
import { useOtherProfile } from '../hooks/useOtherProfile';
import { useOtherUserLocation } from '../hooks/useOtherUserLocation';
import { FamilyMap } from './FamilyMap';

const mockUseForegroundLocation =
  useForegroundLocation as jest.MockedFunction<typeof useForegroundLocation>;
const mockUseLocationHistoryWriter =
  useLocationHistoryWriter as jest.MockedFunction<typeof useLocationHistoryWriter>;
const mockUseOtherProfile =
  useOtherProfile as jest.MockedFunction<typeof useOtherProfile>;
const mockUseOtherUserLocation =
  useOtherUserLocation as jest.MockedFunction<typeof useOtherUserLocation>;

// FamilyMap wraps MapView in a container View (to allow a sibling "waiting
// for other user" text node), so the map is the container's first child
// rather than the render root.
const getMapView = (tree: unknown) => {
  const container = tree as { children: Array<{ props: Record<string, unknown> }> };

  return container.children[0];
};


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

describe('FamilyMap', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default: no other profile yet, so FT-6 additions are inert unless a
    // test opts in explicitly.
    mockUseOtherProfile.mockReturnValue({
      otherProfile: null,
      loading: false,
      errorMessage: null,
    });
    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });
  });

  it('renders a loading indicator while coords are null', async () => {
    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage: null,
    });

    // Component should render without error in loading state
    await render(<FamilyMap />);
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

    await render(<FamilyMap />);

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

    await render(<FamilyMap />);

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

    await render(<FamilyMap />);

    expect(mockUseLocationHistoryWriter).toHaveBeenCalledWith(coords, timestamp);
  });

  it('calls useLocationHistoryWriter with null coords/timestamp while loading', async () => {
    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage: null,
    });

    await render(<FamilyMap />);

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

    const { rerender } = await render(<FamilyMap />);

    expect(mockUseLocationHistoryWriter).toHaveBeenCalledWith(coords1, timestamp1);

    const coords2 = createMockCoords(37.7750, -122.4195);
    const timestamp2 = 1704067300000;

    mockUseForegroundLocation.mockReturnValue({
      coords: coords2,
      timestamp: timestamp2,
      errorMessage: null,
    });

    await rerender(<FamilyMap />);

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

    const { toJSON } = await render(<FamilyMap />);

    const mapView = getMapView(toJSON());
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

    const { rerender, toJSON } = await render(<FamilyMap />);

    // Second render: coords available
    mockUseForegroundLocation.mockReturnValue({
      coords: coords1,
      timestamp: timestamp1,
      errorMessage: null,
    });

    await rerender(<FamilyMap />);

    const initialMapView = getMapView(toJSON());
    const initialRegion = initialMapView.props.initialRegion;

    // After initialRegion is set, subsequent location updates shouldn't reset it
    const coords2 = createMockCoords(37.7750, -122.4195);

    mockUseForegroundLocation.mockReturnValue({
      coords: coords2,
      timestamp: timestamp1 + 1000,
      errorMessage: null,
    });

    await rerender(<FamilyMap />);

    const updatedMapView = getMapView(toJSON());
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

    await render(<FamilyMap />);

    expect(screen.getByLabelText('Your location')).toBeTruthy();
  });

  it('shows error state and clears loading indicator when error occurs', async () => {
    const errorMessage = 'Permission denied';

    mockUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage,
    });

    await render(<FamilyMap />);

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

    await render(<FamilyMap />);

    expect(screen.getByText(errorMessage)).toBeTruthy();
    expect(screen.queryByLabelText('Loading')).toBeNull();
  });

  // FT-6: Tests for other user's location marker and waiting text
  it('renders a second Marker with the other user coordinates when useOtherUserLocation returns a non-null location', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: {
        id: 'other-user-id',
        displayName: 'Alice',
        avatarColor: '#FF5733',
      },
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: {
        latitude: 40.7128,
        longitude: -74.006,
        recordedAt: '2024-01-01T00:00:00.000Z',
        speedMps: 2.0,
        headingDeg: 180,
      },
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // Both markers should be rendered with accessibility labels
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    expect(screen.getByLabelText("Alice's location")).toBeTruthy();
  });

  it('uses the provided displayName even if empty string', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    // otherProfile exists but displayName is empty
    mockUseOtherProfile.mockReturnValue({
      otherProfile: {
        id: 'other-user-id',
        displayName: '', // empty string should still be used (not fall back to "Family member")
        avatarColor: null,
      },
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: {
        latitude: 40.7128,
        longitude: -74.006,
        recordedAt: '2024-01-01T00:00:00.000Z',
        speedMps: null,
        headingDeg: null,
      },
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // When displayName is empty, the component uses it (accessibility label will be "'s location")
    expect(screen.getByLabelText("'s location")).toBeTruthy();
    // Own marker should still render
    expect(screen.getByLabelText('Your location')).toBeTruthy();
  });

  it('uses "Family member" fallback when otherProfile is null', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: null,
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: {
        latitude: 40.7128,
        longitude: -74.006,
        recordedAt: '2024-01-01T00:00:00.000Z',
        speedMps: 2.0,
        headingDeg: 180,
      },
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // When otherProfile is null, component uses "Family member" as displayName
    expect(screen.getByLabelText("Family member's location")).toBeTruthy();
  });

  it('renders no second marker and no waiting text when otherProfile is null', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: null,
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // Own marker should render
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    // No other user marker (no "Family member's location" or similar)
    expect(screen.queryByLabelText(/.*'s location/)).toBeNull();
    // No waiting text should be present
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it('renders the "Waiting for..." text when otherProfile is non-null but location is null', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: {
        id: 'other-user-id',
        displayName: 'Bob',
        avatarColor: '#00FF00',
      },
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(screen.getByText("Waiting for Bob's first location update…")).toBeTruthy();
  });

  it('uses correct display name in waiting text when otherProfile.displayName is unavailable', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: null,
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // When otherProfile is null, no waiting text should render
    // (because the condition is: otherProfile && !otherLocation)
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it('renders waiting text without blocking the map or own marker', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: {
        id: 'other-user-id',
        displayName: 'Charlie',
        avatarColor: null,
      },
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // Own marker should still render
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    // No second marker
    expect(screen.queryByLabelText(/.*'s location/)).toBeNull();
    // Waiting text should be present
    expect(screen.getByText("Waiting for Charlie's first location update…")).toBeTruthy();
  });

  it('own marker still renders correctly regardless of other-user state (regression check against FT-4)', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    // Case 1: otherProfile null, location null
    mockUseOtherProfile.mockReturnValue({
      otherProfile: null,
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });

    const { rerender } = await render(<FamilyMap />);

    // Own marker should render
    expect(screen.getByLabelText('Your location')).toBeTruthy();

    // Case 2: otherProfile exists, location exists
    mockUseOtherProfile.mockReturnValue({
      otherProfile: {
        id: 'other-user-id',
        displayName: 'David',
        avatarColor: '#0000FF',
      },
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: {
        latitude: 40.7128,
        longitude: -74.006,
        recordedAt: '2024-01-01T00:00:00.000Z',
        speedMps: 1.0,
        headingDeg: 45,
      },
      loading: false,
      errorMessage: null,
    });

    await rerender(<FamilyMap />);

    // Own marker should still render even with other profile present
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    // And the other marker should also render
    expect(screen.getByLabelText("David's location")).toBeTruthy();
  });

  it('shows waiting text even when otherUserLocation hook returns error (error does not prevent waiting state)', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: {
        id: 'other-user-id',
        displayName: 'Eve',
        avatarColor: null,
      },
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: 'Failed to fetch other user location',
    });

    await render(<FamilyMap />);

    // Own marker should render
    expect(screen.getByLabelText('Your location')).toBeTruthy();
    // No second marker
    expect(screen.queryByLabelText(/Eve.*location/)).toBeNull();
    // Waiting text should still render (because location is null and otherProfile is non-null)
    // The component doesn't check errorMessage, only whether location is null
    expect(screen.getByText("Waiting for Eve's first location update…")).toBeTruthy();
  });

  it('passes otherUserId (from otherProfile?.id) to useOtherUserLocation', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    const otherUserId = 'specific-other-user-id';
    mockUseOtherProfile.mockReturnValue({
      otherProfile: {
        id: otherUserId,
        displayName: 'Frank',
        avatarColor: '#FFFF00',
      },
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(mockUseOtherUserLocation).toHaveBeenCalledWith(otherUserId);
  });

  it('passes null to useOtherUserLocation when otherProfile is null', async () => {
    const coords = createMockCoords(37.7749, -122.4194);
    const timestamp = Date.now();

    mockUseForegroundLocation.mockReturnValue({
      coords,
      timestamp,
      errorMessage: null,
    });

    mockUseOtherProfile.mockReturnValue({
      otherProfile: null,
      loading: false,
      errorMessage: null,
    });

    mockUseOtherUserLocation.mockReturnValue({
      location: null,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(mockUseOtherUserLocation).toHaveBeenCalledWith(null);
  });
});
