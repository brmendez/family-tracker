// features/geofencing/components/EditPlaceScreen.test.tsx
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');
jest.mock('../../../context/groups.context');
jest.mock('expo-router');
jest.mock('../../groups/hooks/useGroups');
jest.mock('../hooks/useGeofences');
jest.mock('../hooks/useUpdateGeofence');
jest.mock('../hooks/useDeleteGeofence');
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

import { Alert } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useAuth } from '../../../context/auth.context';
import { useGroupsContext } from '../../../context/groups.context';
import { useGroups } from '../../groups/hooks/useGroups';
import { useGeofences } from '../hooks/useGeofences';
import { useUpdateGeofence } from '../hooks/useUpdateGeofence';
import { useDeleteGeofence } from '../hooks/useDeleteGeofence';
import { useGeocodeAddress } from '../hooks/useGeocodeAddress';
import { EditPlaceScreen } from './EditPlaceScreen';
import type { Geofence } from '../types/geofence.types';

const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<
  typeof useLocalSearchParams
>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseGroupsContext = useGroupsContext as jest.MockedFunction<
  typeof useGroupsContext
>;
const mockUseGroups = useGroups as jest.MockedFunction<typeof useGroups>;
const mockUseGeofences = useGeofences as jest.MockedFunction<typeof useGeofences>;
const mockUseUpdateGeofence = useUpdateGeofence as jest.MockedFunction<
  typeof useUpdateGeofence
>;
const mockUseDeleteGeofence = useDeleteGeofence as jest.MockedFunction<
  typeof useDeleteGeofence
>;
const mockUseGeocodeAddress = useGeocodeAddress as jest.MockedFunction<
  typeof useGeocodeAddress
>;

const createMockGeofence = (overrides: Partial<Geofence> = {}): Geofence => ({
  id: 'place-1',
  groupId: 'group-1',
  name: 'Downtown',
  latitude: 45.5,
  longitude: -122.7,
  radiusM: 304.8,
  createdBy: 'user-1',
  createdAt: '2024-01-01T00:00:00Z',
  ...overrides,
});

const mockUpdateGeofence = jest.fn().mockResolvedValue({ error: null });
const mockDeleteGeofence = jest.fn().mockResolvedValue({ error: null });
const mockBack = jest.fn();

const asOwner = () =>
  mockUseGroups.mockReturnValue({
    groups: [
      { id: 'group-1', name: 'Family', role: 'owner', joinedAt: '2024-01-01T00:00:00Z' },
    ],
    loading: false,
    errorMessage: null,
    createGroup: jest.fn(),
    creating: false,
    createErrorMessage: null,
    refetch: jest.fn(),
  });

const asMember = () =>
  mockUseGroups.mockReturnValue({
    groups: [
      { id: 'group-1', name: 'Family', role: 'member', joinedAt: '2024-01-01T00:00:00Z' },
    ],
    loading: false,
    errorMessage: null,
    createGroup: jest.fn(),
    creating: false,
    createErrorMessage: null,
    refetch: jest.fn(),
  });

beforeEach(() => {
  jest.clearAllMocks();
  capturedPickerProps = null;

  mockUseLocalSearchParams.mockReturnValue({ placeId: 'place-1' });
  mockUseRouter.mockReturnValue({ back: mockBack } as any);

  mockUseAuth.mockReturnValue({
    userId: 'user-1',
    session: null,
    profile: null,
    loading: false,
    signUp: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  } as any);

  mockUseGroupsContext.mockReturnValue({
    activeGroupId: 'group-1',
    setActiveGroupId: jest.fn(),
    groups: [],
    loading: false,
    errorMessage: null,
    refetchGroups: jest.fn(),
  });

  asOwner();

  mockUseGeofences.mockReturnValue({
    geofences: [createMockGeofence()],
    loading: false,
    errorMessage: null,
    refetch: jest.fn(),
  });

  mockUseUpdateGeofence.mockReturnValue({
    updateGeofence: mockUpdateGeofence,
    updating: false,
    updateErrorMessage: null,
  });

  mockUseDeleteGeofence.mockReturnValue({
    deleteGeofence: mockDeleteGeofence,
    deleting: false,
    deleteErrorMessage: null,
  });

  mockUseGeocodeAddress.mockReturnValue({
    geocodeAddress: jest.fn(),
    geocoding: false,
    geocodeErrorMessage: null,
  });
});

describe('EditPlaceScreen', () => {
  it('shows a loading indicator while geofences are still loading', async () => {
    mockUseGeofences.mockReturnValue({
      geofences: [],
      loading: true,
      errorMessage: null,
      refetch: jest.fn(),
    });

    await render(<EditPlaceScreen />);

    // Loading is a distinct third branch — neither the "not found" message
    // nor the editable form has rendered yet.
    expect(screen.queryByText('This zone no longer exists.')).toBeNull();
    expect(screen.queryByPlaceholderText('Zone name')).toBeNull();
  });

  it('shows "zone no longer exists" once loading finishes and the place is not found', async () => {
    mockUseGeofences.mockReturnValue({
      geofences: [],
      loading: false,
      errorMessage: null,
      refetch: jest.fn(),
    });

    await render(<EditPlaceScreen />);

    expect(screen.getByText('This zone no longer exists.')).toBeTruthy();
  });

  it('renders read-only, with no inputs or Save/Delete, when the caller cannot manage the zone', async () => {
    mockUseAuth.mockReturnValue({
      userId: 'user-2',
      session: null,
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as any);
    mockUseGeofences.mockReturnValue({
      geofences: [createMockGeofence({ createdBy: 'user-1' })],
      loading: false,
      errorMessage: null,
      refetch: jest.fn(),
    });
    asMember();

    await render(<EditPlaceScreen />);

    expect(screen.getByText('Downtown')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Zone name')).toBeNull();
    expect(screen.queryByText('Save')).toBeNull();
    expect(screen.queryByText('Delete Zone')).toBeNull();
  });

  it('allows editing when the caller is the zone creator, even as a plain member', async () => {
    mockUseGeofences.mockReturnValue({
      geofences: [createMockGeofence({ createdBy: 'user-1' })],
      loading: false,
      errorMessage: null,
      refetch: jest.fn(),
    });
    asMember();

    await render(<EditPlaceScreen />);

    expect(screen.getByPlaceholderText('Zone name')).toBeTruthy();
    expect(screen.getByText('Delete Zone')).toBeTruthy();
  });

  it('allows editing when the caller is the group owner, even if not the creator', async () => {
    mockUseAuth.mockReturnValue({
      userId: 'user-2',
      session: null,
      profile: null,
      loading: false,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as any);
    mockUseGeofences.mockReturnValue({
      geofences: [createMockGeofence({ createdBy: 'user-1' })],
      loading: false,
      errorMessage: null,
      refetch: jest.fn(),
    });
    asOwner();

    await render(<EditPlaceScreen />);

    expect(screen.getByPlaceholderText('Zone name')).toBeTruthy();
    expect(screen.getByText('Delete Zone')).toBeTruthy();
  });

  it('repositioning via the map picker does not overwrite the existing name', async () => {
    await render(<EditPlaceScreen />);

    expect(screen.getByPlaceholderText('Zone name').props.value).toBe(
      'Downtown',
    );

    await act(async () => {
      capturedPickerProps?.onConfirm({
        latitude: 46,
        longitude: -123,
        address: 'Some Other Address',
      });
    });

    expect(screen.getByPlaceholderText('Zone name').props.value).toBe(
      'Downtown',
    );
  });

  it('Delete Zone shows a destructive confirmation before actually deleting', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');

    await render(<EditPlaceScreen />);

    await fireEvent.press(screen.getByText('Delete Zone'));

    expect(alertSpy).toHaveBeenCalledWith(
      'Delete zone?',
      '"Downtown" will be removed for everyone in this group.',
      expect.any(Array),
    );
    expect(mockDeleteGeofence).not.toHaveBeenCalled();

    const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    const confirmButton = buttons.find((button) => button.text === 'Delete');

    await act(async () => {
      confirmButton?.onPress?.();
    });

    expect(mockDeleteGeofence).toHaveBeenCalledWith('place-1');
  });
});
