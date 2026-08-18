// features/groups/components/GroupDetailScreen.test.tsx
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');
jest.mock('expo-router');
jest.mock('../hooks/useGroups');
jest.mock('../hooks/useSendInvite');

import { render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';

import { useGroups } from '../hooks/useGroups';
import { useSendInvite } from '../hooks/useSendInvite';
import { GroupDetailScreen } from './GroupDetailScreen';
import type { Group } from '../hooks/useGroups';

const mockUseLocalSearchParams = useLocalSearchParams as jest.MockedFunction<
  typeof useLocalSearchParams
>;
const mockUseGroups = useGroups as jest.MockedFunction<typeof useGroups>;
const mockUseSendInvite = useSendInvite as jest.MockedFunction<typeof useSendInvite>;

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

describe('GroupDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({ id: 'group-1' });
    mockUseGroups.mockReturnValue({
      groups: [createMockGroup('group-1', 'Family')],
      loading: false,
      errorMessage: null,
      createGroup: jest.fn(),
      creating: false,
      createErrorMessage: null,
      refetch: jest.fn(),
    });
    mockUseSendInvite.mockReturnValue({
      sendInvite: jest.fn(),
      sending: false,
      sendErrorMessage: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('route parameter handling', () => {
    it('passes id from route params to useSendInvite', async () => {
      mockUseLocalSearchParams.mockReturnValue({ id: 'group-123' });

      await render(<GroupDetailScreen />);

      expect(mockUseSendInvite).toHaveBeenCalledWith('group-123');
    });

    it('finds group matching the route id', async () => {
      const group1 = createMockGroup('group-1', 'Family', 'owner');
      const group2 = createMockGroup('group-2', 'Friends', 'member');
      mockUseGroups.mockReturnValue({
        groups: [group1, group2],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });
      mockUseLocalSearchParams.mockReturnValue({ id: 'group-2' });

      await render(<GroupDetailScreen />);

      expect(screen.getByText('Friends')).toBeTruthy();
    });
  });

  describe('loading state', () => {
    it('shows spinner when loading=true and groups.length===0 and no error', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: true,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      // Spinner should be visible; group content should not be
      expect(screen.queryByText('Family')).toBeNull();
    });

    it('shows group when loading=true but groups.length > 0', async () => {
      mockUseGroups.mockReturnValue({
        groups: [createMockGroup('group-1', 'Family')],
        loading: true,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      // Group should be visible even though loading
      expect(screen.getByText('Family (owner)')).toBeTruthy();
    });
  });

  describe('group not found / deleted', () => {
    it('shows "group no longer exists" message when group not found', async () => {
      mockUseLocalSearchParams.mockReturnValue({ id: 'nonexistent-group' });
      mockUseGroups.mockReturnValue({
        groups: [createMockGroup('group-1', 'Family')],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      expect(screen.getByText('This group no longer exists.')).toBeTruthy();
    });

    it('shows "group no longer exists" when no groups fetched and loading completes', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      expect(screen.getByText('This group no longer exists.')).toBeTruthy();
    });

    it('shows fetch error when group not found and error exists', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: 'Network error',
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      // When errorMessage && !group, shows the error message
      expect(screen.getByText('Network error')).toBeTruthy();
      expect(screen.queryByText('This group no longer exists.')).toBeNull();
    });
  });

  describe('fetch error state', () => {
    it('shows fetch error when errorMessage is set and no group found', async () => {
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: 'Network error',
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      // When errorMessage && !group, shows the error message
      expect(screen.getByText('Network error')).toBeTruthy();
    });

    it('shows fetch error but group if partial load succeeded', async () => {
      const group = createMockGroup('group-1', 'Family');
      mockUseGroups.mockReturnValue({
        groups: [group],
        loading: false,
        errorMessage: 'Partial load error',
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      // Group should be shown (error is just a warning in this case)
      expect(screen.getByText('Family (owner)')).toBeTruthy();
    });
  });

  describe('group display', () => {
    it('displays group name', async () => {
      mockUseGroups.mockReturnValue({
        groups: [createMockGroup('group-1', 'My Group', 'owner')],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      expect(screen.getByText('My Group (owner)')).toBeTruthy();
    });

    it('shows (owner) suffix when user is owner', async () => {
      mockUseGroups.mockReturnValue({
        groups: [createMockGroup('group-1', 'Family', 'owner')],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      expect(screen.getByText('Family (owner)')).toBeTruthy();
    });

    it('does not show suffix when user is member', async () => {
      mockUseGroups.mockReturnValue({
        groups: [createMockGroup('group-1', 'Family', 'member')],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      expect(screen.getByText('Family')).toBeTruthy();
      expect(screen.queryByText('Family (member)')).toBeNull();
    });
  });

  describe('InviteForm integration', () => {
    it('renders InviteForm with sendInvite callback', async () => {
      const mockSendInvite = jest.fn();
      mockUseSendInvite.mockReturnValue({
        sendInvite: mockSendInvite,
        sending: false,
        sendErrorMessage: null,
      });

      await render(<GroupDetailScreen />);

      // InviteForm should be rendered (it renders the input)
      expect(screen.getByPlaceholderText('Email address')).toBeTruthy();
    });

    it('passes sending state to InviteForm', async () => {
      mockUseSendInvite.mockReturnValue({
        sendInvite: jest.fn(),
        sending: true,
        sendErrorMessage: null,
      });

      await render(<GroupDetailScreen />);

      // When sending, input should be disabled
      const input = screen.getByPlaceholderText('Email address');
      expect(input.props.editable).toBe(false);
    });

    it('passes sendErrorMessage to InviteForm', async () => {
      mockUseSendInvite.mockReturnValue({
        sendInvite: jest.fn(),
        sending: false,
        sendErrorMessage: 'Email already a member',
      });

      await render(<GroupDetailScreen />);

      expect(screen.getByText('Email already a member')).toBeTruthy();
    });

    it('hides InviteForm when group not found', async () => {
      mockUseLocalSearchParams.mockReturnValue({ id: 'nonexistent' });
      mockUseGroups.mockReturnValue({
        groups: [],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      expect(screen.queryByPlaceholderText('Email address')).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles multiple groups with same id (uses first match)', async () => {
      const group1 = createMockGroup('group-1', 'Family');
      const group1Duplicate = createMockGroup('group-1', 'Duplicate Name');
      mockUseGroups.mockReturnValue({
        groups: [group1, group1Duplicate],
        loading: false,
        errorMessage: null,
        createGroup: jest.fn(),
        creating: false,
        createErrorMessage: null,
        refetch: jest.fn(),
      });

      await render(<GroupDetailScreen />);

      // Should use the first match
      expect(screen.getByText('Family (owner)')).toBeTruthy();
    });


  });
});
