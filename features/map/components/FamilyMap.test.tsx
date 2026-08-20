// features/map/components/FamilyMap.test.tsx
// Mock all the hooks and components BEFORE imports
jest.mock('../../../lib/supabase');
jest.mock('../../../context/groups.context');
jest.mock('../hooks/useForegroundLocation');
jest.mock('../hooks/useActiveGroupMembers');
jest.mock('../hooks/useGroupMemberLocations');
jest.mock('../hooks/useLocationHistoryWriter');
jest.mock('./OtherUserMarker', () => ({
  OtherUserMarker: ({ displayName }: { displayName: string; location: unknown }) => {
    const { Text } = require('react-native');
    return <Text testID={`marker-${displayName}`}>{displayName}</Text>;
  },
}));
jest.mock('./GroupSwitcher', () => ({
  GroupSwitcher: ({
    groups,
    onSelect,
  }: {
    groups: { id: string; name: string }[];
    onSelect: (groupId: string) => void;
  }) => {
    const { Pressable, Text, View } = require('react-native');
    return groups && groups.length >= 2 ? (
      <View testID="group-switcher">
        {groups.map((group: { id: string; name: string }) => (
          <Pressable key={group.id} onPress={() => onSelect(group.id)}>
            <Text>{group.name}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;
  },
}));
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, initialRegion }: { children: unknown; initialRegion: unknown }) =>
      initialRegion ? <View testID="map-view">{children}</View> : null,
    Marker: ({ title }: { title: string }) => {
      const { Text } = require('react-native');
      return <Text testID={`marker-${title}`}>{title}</Text>;
    },
  };
});

import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';

import {
  createMembershipGroup,
  createActiveGroupMember,
  createOtherUserLocation,
} from '../../../test/utils';

import { FamilyMap } from './FamilyMap';
import { useGroupsContext } from '../../../context/groups.context';
import { useForegroundLocation } from '../hooks/useForegroundLocation';
import { useActiveGroupMembers } from '../hooks/useActiveGroupMembers';
import { useGroupMemberLocations } from '../hooks/useGroupMemberLocations';

const mockedUseGroupsContext = useGroupsContext as jest.MockedFunction<
  typeof useGroupsContext
>;
const mockedUseForegroundLocation = useForegroundLocation as jest.MockedFunction<
  typeof useForegroundLocation
>;
const mockedUseActiveGroupMembers = useActiveGroupMembers as jest.MockedFunction<
  typeof useActiveGroupMembers
>;
const mockedUseGroupMemberLocations = useGroupMemberLocations as jest.MockedFunction<
  typeof useGroupMemberLocations
>;

const mockCoords = {
  latitude: 37.7749,
  longitude: -122.4194,
  altitude: 0,
  accuracy: 5,
  altitudeAccuracy: null,
  heading: 0,
  speed: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('FamilyMap', () => {
  it('renders own location marker and member markers when locations are available', async () => {
    const groups = [createMembershipGroup('group-1', 'Family')];
    const members = [
      createActiveGroupMember('member-1', 'Alice'),
      createActiveGroupMember('member-2', 'Bob'),
    ];
    const locations = {
      'member-1': createOtherUserLocation(37.7749, -122.4194),
      'member-2': createOtherUserLocation(40.7128, -74.006),
    };

    mockedUseGroupsContext.mockReturnValue({
      groups,
      activeGroupId: 'group-1',
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members,
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // Own marker should always be visible
    expect(screen.getByTestId('marker-You')).toBeTruthy();

    // Member markers should be visible
    await waitFor(() => {
      expect(screen.getByTestId('marker-Alice')).toBeTruthy();
      expect(screen.getByTestId('marker-Bob')).toBeTruthy();
    });

    // No empty state
    expect(screen.queryByText(/No other members|Join or create/)).toBeNull();
  });

  it('renders "No other members here yet" when group has no other members', async () => {
    const groups = [createMembershipGroup('group-1', 'Family')];

    mockedUseGroupsContext.mockReturnValue({
      groups,
      activeGroupId: 'group-1',
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(screen.getByText('No other members here yet')).toBeTruthy();
  });

  it('renders "Join or create a group" when user has no groups', async () => {
    mockedUseGroupsContext.mockReturnValue({
      groups: [],
      activeGroupId: null,
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(screen.getByText('Join or create a group to see family members')).toBeTruthy();
  });

  it('shows only members with known locations', async () => {
    const groups = [createMembershipGroup('group-1', 'Family')];
    const members = [
      createActiveGroupMember('member-1', 'Alice'),
      createActiveGroupMember('member-2', 'Bob'),
      createActiveGroupMember('member-3', 'Charlie'),
    ];
    // Only Alice and Bob have locations
    const locations = {
      'member-1': createOtherUserLocation(37.7749, -122.4194),
      'member-2': createOtherUserLocation(40.7128, -74.006),
    };

    mockedUseGroupsContext.mockReturnValue({
      groups,
      activeGroupId: 'group-1',
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members,
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations,
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(screen.getByTestId('marker-Alice')).toBeTruthy();
    expect(screen.getByTestId('marker-Bob')).toBeTruthy();
    expect(screen.queryByTestId('marker-Charlie')).toBeNull();
  });

  it('displays GroupSwitcher when 2+ groups exist', async () => {
    const groups = [
      createMembershipGroup('group-1', 'Family'),
      createMembershipGroup('group-2', 'Work'),
    ];

    mockedUseGroupsContext.mockReturnValue({
      groups,
      activeGroupId: 'group-1',
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(screen.getByTestId('group-switcher')).toBeTruthy();
  });

  it('hides GroupSwitcher when fewer than 2 groups exist', async () => {
    const groups = [createMembershipGroup('group-1', 'Family')];

    mockedUseGroupsContext.mockReturnValue({
      groups,
      activeGroupId: 'group-1',
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // Should not see group switcher
    expect(screen.queryByTestId('group-switcher')).toBeNull();
  });

  it('calls setActiveGroupId when a group is selected', async () => {
    const handleSetActiveGroupId = jest.fn();
    const groups = [
      createMembershipGroup('group-1', 'Family'),
      createMembershipGroup('group-2', 'Work'),
    ];

    mockedUseGroupsContext.mockReturnValue({
      groups,
      activeGroupId: 'group-1',
      setActiveGroupId: handleSetActiveGroupId,
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    const workPill = screen.getByText('Work').parent;

    fireEvent.press(workPill!);

    expect(handleSetActiveGroupId).toHaveBeenCalledWith('group-2');
  });

  it('displays error message from useForegroundLocation', async () => {
    mockedUseGroupsContext.mockReturnValue({
      groups: [],
      activeGroupId: null,
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage: 'Location permission denied',
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(screen.getByText('Location permission denied')).toBeTruthy();
  });

  it('shows loading spinner while coordinates are being loaded', async () => {
    mockedUseGroupsContext.mockReturnValue({
      groups: [],
      activeGroupId: null,
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: null,
      timestamp: null,
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    expect(screen.getByLabelText('Loading')).toBeTruthy();
  });

  it('does not show empty state when groups are still loading', async () => {
    mockedUseGroupsContext.mockReturnValue({
      groups: [],
      activeGroupId: null,
      setActiveGroupId: jest.fn(),
      loading: true, // Still loading
      errorMessage: null,
      refetchGroups: jest.fn(),
    });

    mockedUseForegroundLocation.mockReturnValue({
      coords: mockCoords,
      timestamp: Date.now(),
      errorMessage: null,
    });

    mockedUseActiveGroupMembers.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    mockedUseGroupMemberLocations.mockReturnValue({
      locations: {},
      loading: false,
      errorMessage: null,
    });

    await render(<FamilyMap />);

    // Should not show the "Join or create" empty state while loading
    expect(screen.queryByText('Join or create a group to see family members')).toBeNull();
  });
});
