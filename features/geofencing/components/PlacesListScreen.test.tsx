// features/geofencing/components/PlacesListScreen.test.tsx
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');
jest.mock('../../../context/groups.context');
jest.mock('../../groups/hooks/useGroups');
jest.mock('../hooks/useGeofences');

// Mock expo-router AFTER other mocks to avoid conflicts
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useFocusEffect: (callback: () => void) => {
    callback();
  },
  useRouter: jest.fn(),
}));

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '../../../context/auth.context';
import { useGroupsContext } from '../../../context/groups.context';
import { useGroups } from '../../groups/hooks/useGroups';
import { useGeofences } from '../hooks/useGeofences';
import { PlacesListScreen } from './PlacesListScreen';
import type { Geofence } from '../types/geofence.types';

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockUseGroupsContext = useGroupsContext as jest.MockedFunction<
  typeof useGroupsContext
>;
const mockUseGroups = useGroups as jest.MockedFunction<typeof useGroups>;
const mockUseGeofences = useGeofences as jest.MockedFunction<typeof useGeofences>;

const createMockGeofence = (
  id: string = 'place-1',
  name: string = 'Downtown',
  createdBy: string = 'user-1'
): Geofence => ({
  id,
  groupId: 'group-1',
  name,
  latitude: 45.5,
  longitude: -122.7,
  radiusM: 304.8,
  createdBy,
  createdAt: '2024-01-01T00:00:00Z',
});

describe('PlacesListScreen', () => {
  const mockRefetch = jest.fn();
  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseRouter.mockReturnValue({
      push: mockPush,
    } as any);

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

    mockUseGroups.mockReturnValue({
      groups: [
        {
          id: 'group-1',
          name: 'Family',
          role: 'owner',
          joinedAt: '2024-01-01T00:00:00Z',
        },
      ],
      loading: false,
      errorMessage: null,
      createGroup: jest.fn(),
      creating: false,
      createErrorMessage: null,
      refetch: jest.fn(),
    });

    mockUseGeofences.mockReturnValue({
      geofences: [],
      loading: false,
      errorMessage: null,
      refetch: mockRefetch,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('refetch on focus', () => {
    it('refetches geofences on focus', async () => {
      mockUseGeofences.mockReturnValue({
        geofences: [createMockGeofence('place-1')],
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      await render(<PlacesListScreen />);

      // useFocusEffect is mocked to call the callback immediately
      expect(mockRefetch).toHaveBeenCalled();
    });

  });

  describe('pencil indicator visibility', () => {
    it('shows pencil for places user created', async () => {
      const place = createMockGeofence('place-1', 'Downtown', 'user-1');

      mockUseGeofences.mockReturnValue({
        geofences: [place],
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      mockUseAuth.mockReturnValue({
        userId: 'user-1',
        session: null,
        profile: null,
        loading: false,
        signUp: jest.fn(),
        signIn: jest.fn(),
        signOut: jest.fn(),
      } as any);

      await render(<PlacesListScreen />);

      expect(screen.getByLabelText('Editable')).toBeTruthy();
    });

    it('shows pencil for places when user is group owner', async () => {
      const place = createMockGeofence('place-1', 'Downtown', 'user-2');

      mockUseGeofences.mockReturnValue({
        geofences: [place],
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      mockUseAuth.mockReturnValue({
        userId: 'user-1',
        session: null,
        profile: null,
        loading: false,
        signUp: jest.fn(),
        signIn: jest.fn(),
        signOut: jest.fn(),
      } as any);

      mockUseGroups.mockReturnValue({
        groups: [
          {
            id: 'group-1',
            name: 'Family',
            role: 'owner',
            joinedAt: '2024-01-01T00:00:00Z',
          },
        ],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<PlacesListScreen />);

      expect(screen.getByLabelText('Editable')).toBeTruthy();
    });

    it('does not show pencil for places user cannot manage', async () => {
      const place = createMockGeofence('place-1', 'Downtown', 'user-2');

      mockUseGeofences.mockReturnValue({
        geofences: [place],
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      mockUseAuth.mockReturnValue({
        userId: 'user-1',
        session: null,
        profile: null,
        loading: false,
        signUp: jest.fn(),
        signIn: jest.fn(),
        signOut: jest.fn(),
      } as any);

      mockUseGroups.mockReturnValue({
        groups: [
          {
            id: 'group-1',
            name: 'Family',
            role: 'member',
            joinedAt: '2024-01-01T00:00:00Z',
          },
        ],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<PlacesListScreen />);

      expect(screen.queryByLabelText('Editable')).toBeNull();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no places', async () => {
      mockUseGeofences.mockReturnValue({
        geofences: [],
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      await render(<PlacesListScreen />);

      expect(screen.getByText('No zones yet for this group.')).toBeTruthy();
    });

    it('shows loading state when loading and no places yet', async () => {
      mockUseGeofences.mockReturnValue({
        geofences: [],
        loading: true,
        errorMessage: null,
        refetch: mockRefetch,
      });

      await render(<PlacesListScreen />);

      expect(screen.getByText('Loading zones...')).toBeTruthy();
    });

    it('shows error state when error occurs', async () => {
      mockUseGeofences.mockReturnValue({
        geofences: [],
        loading: false,
        errorMessage: 'Network error',
        refetch: mockRefetch,
      });

      await render(<PlacesListScreen />);

      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  describe('places list', () => {
    it('renders all places in the list', async () => {
      const places = [
        createMockGeofence('place-1', 'Downtown'),
        createMockGeofence('place-2', 'Park'),
        createMockGeofence('place-3', 'Office'),
      ];

      mockUseGeofences.mockReturnValue({
        geofences: places,
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      await render(<PlacesListScreen />);

      expect(screen.getByText('Downtown')).toBeTruthy();
      expect(screen.getByText('Park')).toBeTruthy();
      expect(screen.getByText('Office')).toBeTruthy();
    });

    it('does not show loading indicator when loading=true but list has items', async () => {
      const places = [createMockGeofence('place-1', 'Downtown')];

      mockUseGeofences.mockReturnValue({
        geofences: places,
        loading: true,
        errorMessage: null,
        refetch: mockRefetch,
      });

      await render(<PlacesListScreen />);

      // List should be visible
      expect(screen.getByText('Downtown')).toBeTruthy();
      // Loading message should not be shown
      expect(screen.queryByText('Loading zones...')).toBeNull();
    });
  });

  describe('add zone button', () => {
    it('pressing + Add Zone navigates to /places/new', async () => {
      await render(<PlacesListScreen />);

      await fireEvent.press(screen.getByText('+ Add Zone'));

      expect(mockPush).toHaveBeenCalledWith('/places/new');
    });
  });

  describe('place list item navigation', () => {
    it('pressing a place row navigates to /places/:id', async () => {
      const places = [createMockGeofence('place-1', 'Downtown', 'user-1')];

      mockUseGeofences.mockReturnValue({
        geofences: places,
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      await render(<PlacesListScreen />);

      await fireEvent.press(screen.getByText('Downtown'));

      expect(mockPush).toHaveBeenCalledWith('/places/place-1');
    });
  });

  describe('multiple items with mixed ownership', () => {
    it('shows pencil only on owned places among multiple', async () => {
      const places = [
        createMockGeofence('place-1', 'Downtown', 'user-1'),
        createMockGeofence('place-2', 'Park', 'user-2'),
        createMockGeofence('place-3', 'Office', 'user-1'),
      ];

      mockUseGeofences.mockReturnValue({
        geofences: places,
        loading: false,
        errorMessage: null,
        refetch: mockRefetch,
      });

      mockUseAuth.mockReturnValue({
        userId: 'user-1',
        session: null,
        profile: null,
        loading: false,
        signUp: jest.fn(),
        signIn: jest.fn(),
        signOut: jest.fn(),
      } as any);

      mockUseGroups.mockReturnValue({
        groups: [
          {
            id: 'group-1',
            name: 'Family',
            role: 'member',
            joinedAt: '2024-01-01T00:00:00Z',
          },
        ],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<PlacesListScreen />);

      const editIcons = screen.getAllByLabelText('Editable');
      // Should have 2 editable items (place-1 and place-3, created by user-1)
      expect(editIcons).toHaveLength(2);
    });
  });
});
