// features/geofencing/components/AddPlaceScreen.test.tsx
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');
jest.mock('../../../context/groups.context');
jest.mock('expo-router');
jest.mock('../../map/hooks/useForegroundLocation');
jest.mock('../hooks/useCreateGeofence');
jest.mock('../hooks/useGeocodeAddress');

let capturedPickerProps: {
  onConfirm: (result: { latitude: number; longitude: number; address: string | null }) => void;
} | null = null;

jest.mock('./MapLocationPicker', () => ({
  MapLocationPicker: (props: {
    onConfirm: (result: { latitude: number; longitude: number; address: string | null }) => void;
  }) => {
    capturedPickerProps = props;
    return null;
  },
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { useGroupsContext } from '../../../context/groups.context';
import { useForegroundLocation } from '../../map/hooks/useForegroundLocation';
import { useCreateGeofence } from '../hooks/useCreateGeofence';
import { useGeocodeAddress } from '../hooks/useGeocodeAddress';
import { AddPlaceScreen } from './AddPlaceScreen';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseGroupsContext = useGroupsContext as jest.MockedFunction<
  typeof useGroupsContext
>;
const mockUseForegroundLocation = useForegroundLocation as jest.MockedFunction<
  typeof useForegroundLocation
>;
const mockUseCreateGeofence = useCreateGeofence as jest.MockedFunction<
  typeof useCreateGeofence
>;
const mockUseGeocodeAddress = useGeocodeAddress as jest.MockedFunction<
  typeof useGeocodeAddress
>;

const mockBack = jest.fn();
const mockCreateGeofence = jest.fn().mockResolvedValue({ error: null });
const mockGeocodeAddress = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  capturedPickerProps = null;

  mockUseRouter.mockReturnValue({ back: mockBack } as any);

  mockUseGroupsContext.mockReturnValue({
    activeGroupId: 'group-1',
    setActiveGroupId: jest.fn(),
    groups: [],
    loading: false,
    errorMessage: null,
    refetchGroups: jest.fn(),
  });

  mockUseForegroundLocation.mockReturnValue({
    coords: { latitude: 45.5, longitude: -122.7 },
    locationError: null,
    requesting: false,
  } as any);

  mockUseCreateGeofence.mockReturnValue({
    createGeofence: mockCreateGeofence,
    creating: false,
    createErrorMessage: null,
  });

  mockUseGeocodeAddress.mockReturnValue({
    geocodeAddress: mockGeocodeAddress,
    geocoding: false,
    geocodeErrorMessage: null,
  });
});

describe('AddPlaceScreen', () => {
  it('renders name, address, and location-picking controls', async () => {
    await render(<AddPlaceScreen />);

    expect(screen.getByPlaceholderText('Zone name')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search an address')).toBeTruthy();
    expect(screen.getByText('Search')).toBeTruthy();
    expect(screen.getByText('Select on Map')).toBeTruthy();
    expect(screen.getByText('Add Zone')).toBeTruthy();
  });

  it('Add Zone is inert until a location is set, then creates the zone once one is', async () => {
    mockGeocodeAddress.mockResolvedValue({
      location: { latitude: 1, longitude: 2 },
      error: null,
    });

    await render(<AddPlaceScreen />);

    // No location yet — Pressable's disabled prop should block the press
    // entirely, so createGeofence must never fire.
    await fireEvent.press(screen.getByText('Add Zone'));
    expect(mockCreateGeofence).not.toHaveBeenCalled();

    await fireEvent.changeText(
      screen.getByPlaceholderText('Search an address'),
      '123 Main St',
    );
    await fireEvent.press(screen.getByText('Search'));
    await fireEvent.press(screen.getByText('Add Zone'));

    expect(mockCreateGeofence).toHaveBeenCalledWith({
      groupId: 'group-1',
      name: '123 Main St',
      latitude: 1,
      longitude: 2,
      radiusM: expect.any(Number),
    });
  });

  it('auto-fills the name from a successful search when the name is still empty', async () => {
    mockGeocodeAddress.mockResolvedValue({
      location: { latitude: 1, longitude: 2 },
      error: null,
    });

    await render(<AddPlaceScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText('Search an address'),
      '123 Main St',
    );
    await fireEvent.press(screen.getByText('Search'));

    expect(screen.getByPlaceholderText('Zone name').props.value).toBe(
      '123 Main St',
    );
  });

  it('does not overwrite a manually-edited name when a search later succeeds', async () => {
    mockGeocodeAddress.mockResolvedValue({
      location: { latitude: 1, longitude: 2 },
      error: null,
    });

    await render(<AddPlaceScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText('Zone name'),
      'My Zone',
    );
    await fireEvent.changeText(
      screen.getByPlaceholderText('Search an address'),
      '123 Main St',
    );
    await fireEvent.press(screen.getByText('Search'));

    expect(screen.getByPlaceholderText('Zone name').props.value).toBe(
      'My Zone',
    );
  });

  it('shows the empty-name validation error only once Save is pressed with no name', async () => {
    mockGeocodeAddress.mockResolvedValue({
      location: { latitude: 1, longitude: 2 },
      error: null,
    });

    await render(<AddPlaceScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText('Search an address'),
      '123 Main St',
    );
    await fireEvent.press(screen.getByText('Search'));
    await fireEvent.changeText(screen.getByPlaceholderText('Zone name'), '');

    expect(screen.queryByText("Zone name can't be empty.")).toBeNull();

    await fireEvent.press(screen.getByText('Add Zone'));

    expect(screen.getByText("Zone name can't be empty.")).toBeTruthy();
  });

  it('confirming a location via the map picker clears the address search field', async () => {
    await render(<AddPlaceScreen />);

    await fireEvent.changeText(
      screen.getByPlaceholderText('Search an address'),
      'stale text',
    );
    await fireEvent.press(screen.getByText('Select on Map'));

    await act(async () => {
      capturedPickerProps?.onConfirm({
        latitude: 1,
        longitude: 2,
        address: 'Picked Address',
      });
    });

    expect(screen.getByPlaceholderText('Search an address').props.value).toBe(
      '',
    );
    expect(screen.getByText('Location set: Picked Address')).toBeTruthy();
  });
});
