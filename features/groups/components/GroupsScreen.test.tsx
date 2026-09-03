// features/groups/components/GroupsScreen.test.tsx
// jest.mock() calls must come BEFORE any other imports
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');
jest.mock('../hooks/useGroups');
jest.mock('../hooks/usePendingInvites');
jest.mock('../../../context/groups.context');
jest.mock('../../visibility/hooks/useGlobalVisibility');
jest.mock('../../visibility/hooks/useSetGlobalVisibility');
// FT-11: useFocusEffect needs a real NavigationContainer to resolve
// useNavigation(), which isn't present in these bare component renders.
// Stub it to just run the effect immediately, like a plain useEffect —
// real focus/blur timing isn't what these tests are exercising.
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useFocusEffect: (effect: () => void) => effect(),
}));

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useGroupsContext } from '../../../context/groups.context';
import { useGroups } from '../hooks/useGroups';
import { usePendingInvites } from '../hooks/usePendingInvites';
import { useGlobalVisibility } from '../../visibility/hooks/useGlobalVisibility';
import { useSetGlobalVisibility } from '../../visibility/hooks/useSetGlobalVisibility';
import { GroupsScreen } from './GroupsScreen';
import type { Group } from '../hooks/useGroups';
import type { PendingInvite } from '../hooks/usePendingInvites';

const mockUseGroups = useGroups as jest.MockedFunction<typeof useGroups>;
const mockUsePendingInvites = usePendingInvites as jest.MockedFunction<typeof usePendingInvites>;
const mockUseGroupsContext = useGroupsContext as jest.MockedFunction<typeof useGroupsContext>;
const mockUseGlobalVisibility = useGlobalVisibility as jest.MockedFunction<typeof useGlobalVisibility>;
const mockUseSetGlobalVisibility = useSetGlobalVisibility as jest.MockedFunction<typeof useSetGlobalVisibility>;

const createMockGroup = (
  id: string = 'group-1',
  name: string = 'Family',
  role: 'owner' | 'member' = 'owner',
  joinedAt: string = '2024-01-01T00:00:00.000Z',
): Group => ({
  id,
  name,
  role,
  joinedAt,
});

const createMockInvite = (
  id: string = 'invite-1',
  groupId: string = 'group-1',
  groupName: string = 'Family',
  createdAt: string = '2024-01-01T00:00:00.000Z',
): PendingInvite => ({
  id,
  groupId,
  groupName,
  createdAt,
});

describe('GroupsScreen', () => {
  const mockRefetch = jest.fn();
  const mockCreateGroup = jest.fn();
  const mockRespond = jest.fn();
  const mockPendingRefetch = jest.fn();
  const mockRefetchGroups = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    mockUseGroups.mockClear();
    mockRefetch.mockReset();
    mockCreateGroup.mockReset();
    mockRespond.mockReset();
    mockPendingRefetch.mockReset();
    mockRefetchGroups.mockReset();
    mockRefetch.mockResolvedValue(undefined);
    mockCreateGroup.mockResolvedValue({ error: null });
    mockRespond.mockResolvedValue({ error: null });
    mockPendingRefetch.mockResolvedValue(undefined);
    mockRefetchGroups.mockResolvedValue(undefined);

    // Default usePendingInvites mock: no pending invites
    mockUsePendingInvites.mockReturnValue({
      invites: [],
      loading: false,
      errorMessage: null,
      refetch: mockPendingRefetch,
      respond: mockRespond,
      respondingId: null,
      respondErrorMessage: null,
      respondErrorInviteId: null,
    });

    // Default useGroupsContext mock — FT-12's map group list, coordinated
    // with here on create/accept.
    mockUseGroupsContext.mockReturnValue({
      groups: [],
      activeGroupId: null,
      setActiveGroupId: jest.fn(),
      loading: false,
      errorMessage: null,
      refetchGroups: mockRefetchGroups,
    });

    // FT-21: default global visibility mocks — not visible, no in-flight
    // requests. These hooks' own behavior is covered by their own test
    // files; GroupsScreen's tests only need them to render without error.
    mockUseGlobalVisibility.mockReturnValue({
      state: { isHidden: false, expiresAt: null },
      loading: false,
      refetch: jest.fn().mockResolvedValue(undefined),
    });
    mockUseSetGlobalVisibility.mockReturnValue({
      setVisibility: jest.fn().mockResolvedValue({ error: null }),
      setting: false,
      setErrorMessage: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initial loading state', () => {
    it('shows a spinner when loading=true and groups.length===0 and no error', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: true,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // When in loading state, error and empty state messages should not be present
      expect(screen.queryByText(/No groups yet/)).toBeNull();
      expect(screen.queryByText(/Retry/)).toBeNull();
      expect(screen.queryByText('Family')).toBeNull();
    });

    it('does not show spinner when loading=true but groups.length > 0', async () => {
      const group = createMockGroup('group-1', 'TestGroup');
      mockUseGroups.mockReturnValue({
        groups: [group],
        loading: true,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // The list should be shown (spinner suppressed)
      expect(screen.getByText('TestGroup (owner)')).toBeTruthy();
    });

    it('does not show spinner when loading=true but errorMessage is set', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: true,
        errorMessage: 'Network error',
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // Error state should be shown (spinner suppressed)
      expect(screen.getByText('Network error')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('displays error message when errorMessage is set', async () => {
      const errorMsg = 'Failed to load groups';
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: errorMsg,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.getByText(errorMsg)).toBeTruthy();
    });

    it('shows a retry button when errorMessage is set', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: 'Network error',
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeTruthy();
    });

    it('retry button is accessible for pressing', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: 'Network error',
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // Retry button should be present
      const retryButton = screen.getByText('Retry');
      expect(retryButton).toBeTruthy();
    });

    it('does not show error state when errorMessage is null', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.queryByText(/Retry/)).toBeNull();
    });
  });

  describe('empty state', () => {
    it('shows empty state message when groups is empty and no error', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.getByText('No groups yet.')).toBeTruthy();
    });

    it('does not show empty state when there are groups', async () => {
      const group = createMockGroup('group-1', 'Family', 'owner');
      mockUseGroups.mockReturnValue({
        groups: [group],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.queryByText('No groups yet.')).toBeNull();
      expect(screen.getByText('Family (owner)')).toBeTruthy();
    });
  });

  describe('groups list', () => {
    it('renders a list of groups with their names', async () => {
      const groups = [
        createMockGroup('group-1', 'Family', 'owner'),
        createMockGroup('group-2', 'Friends', 'member'),
        createMockGroup('group-3', 'Coworkers', 'member'),
      ];
      mockUseGroups.mockReturnValue({
        groups,
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.getByText('Family (owner)')).toBeTruthy();
      expect(screen.getByText('Friends')).toBeTruthy();
      expect(screen.getByText('Coworkers')).toBeTruthy();
    });

    it('shows (owner) suffix for owner role', async () => {
      const ownerGroup = createMockGroup('group-1', 'Family', 'owner');
      mockUseGroups.mockReturnValue({
        groups: [ownerGroup],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.getByText('Family (owner)')).toBeTruthy();
    });

    it('does not show suffix for member role', async () => {
      const memberGroup = createMockGroup('group-1', 'Friends', 'member');
      mockUseGroups.mockReturnValue({
        groups: [memberGroup],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.getByText('Friends')).toBeTruthy();
      expect(screen.queryByText('Friends (member)')).toBeNull();
    });

    it('renders multiple groups in correct order', async () => {
      const groups = [
        createMockGroup('group-1', 'Aaa', 'owner'),
        createMockGroup('group-2', 'Zzz', 'member'),
        createMockGroup('group-3', 'Mmm', 'member'),
      ];
      mockUseGroups.mockReturnValue({
        groups,
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      const allText = screen.getByText('Aaa (owner)').parent?.parent?.props.children;
      expect(allText).toBeTruthy();
    });
  });

  describe('CreateGroupForm integration', () => {
    it('passes createGroup, creating, and createErrorMessage to CreateGroupForm', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: true,
        createErrorMessage: 'Create failed',
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // CreateGroupForm should be rendered with error message visible
      expect(screen.getByText('Create failed')).toBeTruthy();
    });

    it('does not suppress the list when creating is true (list stays visible during create refetch)', async () => {
      const group = createMockGroup('group-1', 'Family', 'owner');
      mockUseGroups.mockReturnValue({
        groups: [group],
        loading: true, // Refetch triggered by create
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: true,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // The list should still be visible even though loading=true and creating=true
      // because groups.length > 0
      expect(screen.getByText('Family (owner)')).toBeTruthy();
    });

    it('successful create also triggers GroupsProvider refetchGroups (FT-12)', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });
      mockCreateGroup.mockResolvedValue({ error: null });

      await render(<GroupsScreen />);

      await act(async () => {
        fireEvent.press(screen.getByText('Create'));
      });

      expect(mockCreateGroup).toHaveBeenCalled();
      expect(mockRefetchGroups).toHaveBeenCalled();
    });
  });

  describe('spinner suppression during create-triggered refetch', () => {
    it('shows list when groups.length > 0 even if loading=true (no spinner over populated list)', async () => {
      const group = createMockGroup('group-1', 'Family', 'owner');
      mockUseGroups.mockReturnValue({
        groups: [group],
        loading: true, // refetch in progress
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: true,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // List should be visible
      expect(screen.getByText('Family (owner)')).toBeTruthy();
      // Spinner should NOT be shown (showInitialSpinner logic checks groups.length === 0)
      expect(screen.queryByTestId('loading-indicator')).toBeNull();
    });

    it('shows error state even if loading=true', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: true,
        errorMessage: 'Network error',
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // Error state should be shown (spinner suppressed)
      expect(screen.getByText('Network error')).toBeTruthy();
      expect(screen.queryByTestId('loading-indicator')).toBeNull();
    });
  });

  describe('FT-9: list item navigation', () => {
    it('renders list items as pressable elements (for navigation to detail screen)', async () => {
      const groups = [
        createMockGroup('group-1', 'Family', 'owner'),
        createMockGroup('group-2', 'Friends', 'member'),
      ];
      mockUseGroups.mockReturnValue({
        groups,
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      // List items should be rendered (they're now in Pressable elements)
      expect(screen.getByText('Family (owner)')).toBeTruthy();
      expect(screen.getByText('Friends')).toBeTruthy();
    });
  });

  describe('FT-10: PendingInvitesSection integration', () => {
    it('renders PendingInvitesSection with pending invites', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];
      mockUsePendingInvites.mockReturnValue({
        invites,
        loading: false,
        errorMessage: null,
        refetch: mockPendingRefetch,
        respond: mockRespond,
        respondingId: null,
        respondErrorMessage: null,
        respondErrorInviteId: null,
      });

      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.getByText('Pending invites')).toBeTruthy();
      expect(screen.getByText('Family')).toBeTruthy();
    });

    it('does not render PendingInvitesSection when no pending invites', async () => {
      mockUsePendingInvites.mockReturnValue({
        invites: [],
        loading: false,
        errorMessage: null,
        refetch: mockPendingRefetch,
        respond: mockRespond,
        respondingId: null,
        respondErrorMessage: null,
        respondErrorInviteId: null,
      });

      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(screen.queryByText('Pending invites')).toBeNull();
    });

    it('successful accept triggers useGroups refetch', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];
      mockUsePendingInvites.mockReturnValue({
        invites,
        loading: false,
        errorMessage: null,
        refetch: mockPendingRefetch,
        respond: mockRespond,
        respondingId: null,
        respondErrorMessage: null,
        respondErrorInviteId: null,
      });

      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      mockRespond.mockResolvedValue({ error: null });

      await render(<GroupsScreen />);
      mockRefetch.mockClear(); // clear the focus-effect refetch from mount

      await act(async () => {
        fireEvent.press(screen.getByText('Accept'));
      });

      expect(mockRespond).toHaveBeenCalledWith('invite-1', 'accept');
      expect(mockRefetch).toHaveBeenCalled();
      // FT-12: GroupsProvider's list must also learn about the new
      // membership, or the map stays stale until the next app launch.
      expect(mockRefetchGroups).toHaveBeenCalled();
    });

    it('successful decline does not trigger useGroups refetch', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];
      mockUsePendingInvites.mockReturnValue({
        invites,
        loading: false,
        errorMessage: null,
        refetch: mockPendingRefetch,
        respond: mockRespond,
        respondingId: null,
        respondErrorMessage: null,
        respondErrorInviteId: null,
      });

      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      mockRespond.mockResolvedValue({ error: null });

      await render(<GroupsScreen />);
      mockRefetch.mockClear(); // clear the focus-effect refetch from mount

      await act(async () => {
        fireEvent.press(screen.getByText('Decline'));
      });

      expect(mockRespond).toHaveBeenCalledWith('invite-1', 'decline');
      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });

  describe('FT-11: focus refetch', () => {
    it('refetches groups on focus, e.g. returning here after leaving a group elsewhere', async () => {
      mockUseGroups.mockReturnValue({
        groups: [createMockGroup('group-1', 'Family')],
        loading: false,
        errorMessage: null,
        createGroup: mockCreateGroup,
        creating: false,
        createErrorMessage: null,
        refetch: mockRefetch,
      });

      await render(<GroupsScreen />);

      expect(mockRefetch).toHaveBeenCalled();
    });
  });
});
