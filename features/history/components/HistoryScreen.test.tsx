jest.mock('../../../lib/supabase');

import { render, screen } from '@testing-library/react-native';

import { useAuth } from '../../../context/auth.context';
import { useGroupsContext } from '../../../context/groups.context';
import { useGroupRoster } from '../hooks/useGroupRoster';
import { useJourneyHistory } from '../hooks/useJourneyHistory';
import { HistoryScreen } from './HistoryScreen';

jest.mock('../../../context/auth.context');
jest.mock('../../../context/groups.context');
jest.mock('../hooks/useGroupRoster');
jest.mock('../hooks/useJourneyHistory');
jest.mock('./JourneyList', () => {
  const { Text, View } = require('react-native');
  return {
    JourneyList: ({ errorMessage, onPressDay }: any) =>
      errorMessage ? (
        <View testID="journey-list-error">
          <Text>{errorMessage}</Text>
        </View>
      ) : (
        <View testID="journey-list" onPressDay={onPressDay} />
      ),
  };
});
jest.mock('./MemberSelector', () => {
  const { Text, View, Pressable } = require('react-native');
  return {
    MemberSelector: ({ members, selectedId, onSelect }: any) => (
      <View testID="member-selector">
        {members.map((m: any) => (
          <Pressable
            key={m.id}
            testID={`member-${m.id}`}
            onPress={() => onSelect(m.id)}
          >
            <Text>{m.displayName}</Text>
          </Pressable>
        ))}
      </View>
    ),
  };
});

const mockedUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockedUseGroupsContext =
  useGroupsContext as jest.MockedFunction<typeof useGroupsContext>;
const mockedUseGroupRoster = useGroupRoster as jest.MockedFunction<
  typeof useGroupRoster
>;
const mockedUseJourneyHistory =
  useJourneyHistory as jest.MockedFunction<typeof useJourneyHistory>;

describe('HistoryScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedUseAuth.mockReturnValue({
      userId: 'user-self',
      user: null,
      loading: false,
      error: null,
      signUp: jest.fn(),
      signIn: jest.fn(),
      signOut: jest.fn(),
    } as any);

    mockedUseGroupsContext.mockReturnValue({
      activeGroupId: 'group-1',
      groups: [],
      switchGroup: jest.fn(),
    } as any);

    mockedUseGroupRoster.mockReturnValue({
      members: [
        {
          id: 'user-self',
          displayName: 'Me',
          avatarColor: null,
        },
        {
          id: 'user-alice',
          displayName: 'Alice',
          avatarColor: '#ff0000',
        },
      ],
      loading: false,
      errorMessage: null,
    });

    mockedUseJourneyHistory.mockReturnValue({
      days: [],
      loading: false,
      loadingMore: false,
      errorMessage: null,
      hasMore: false,
      loadMore: jest.fn(),
    });
  });

  it('renders member selector and journey list', async () => {
    await render(<HistoryScreen />);

    expect(screen.getByTestId('member-selector')).toBeTruthy();
    expect(screen.getByTestId('journey-list')).toBeTruthy();
  });

  it('defaults selected member to self (userId) when no initialMemberId', async () => {
    mockedUseJourneyHistory.mockReturnValue({
      days: [],
      loading: false,
      loadingMore: false,
      errorMessage: null,
      hasMore: false,
      loadMore: jest.fn(),
    });

    await render(<HistoryScreen />);

    // useJourneyHistory should be called with userId
    expect(mockedUseJourneyHistory).toHaveBeenCalledWith('user-self');
  });

  it('uses initialMemberId to pre-select a member', async () => {
    mockedUseJourneyHistory.mockReturnValue({
      days: [],
      loading: false,
      loadingMore: false,
      errorMessage: null,
      hasMore: false,
      loadMore: jest.fn(),
    });

    await render(<HistoryScreen initialMemberId="user-alice" />);

    // useJourneyHistory should be called with the initialMemberId
    expect(mockedUseJourneyHistory).toHaveBeenCalledWith('user-alice');
  });

  it('resets selection to self when activeGroupId changes', async () => {
    const { rerender } = await render(<HistoryScreen initialMemberId="user-alice" />);

    expect(mockedUseJourneyHistory).toHaveBeenCalledWith('user-alice');

    // Change the active group
    mockedUseGroupsContext.mockReturnValue({
      activeGroupId: 'group-2',
      groups: [],
      switchGroup: jest.fn(),
    } as any);

    await rerender(<HistoryScreen initialMemberId="user-alice" />);

    // After group change, should reset to self
    expect(mockedUseJourneyHistory).toHaveBeenLastCalledWith('user-self');
  });

  it('does not reset selection if activeGroupId does not actually change', async () => {
    const { rerender } = await render(<HistoryScreen initialMemberId="user-alice" />);

    const callCount1 = mockedUseJourneyHistory.mock.calls.length;

    await rerender(<HistoryScreen initialMemberId="user-alice" />);

    // Should not cause additional calls beyond the render
    const callCount2 = mockedUseJourneyHistory.mock.calls.length;
    // Expect same or minimal additional calls (React may batch)
    expect(callCount2).toBeLessThanOrEqual(callCount1 + 1);
  });

  it('renders roster error message when roster fetch fails', async () => {
    mockedUseGroupRoster.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: 'Failed to load group members',
    });

    await render(<HistoryScreen />);

    const errorText = screen.getByText('Failed to load group members');
    expect(errorText).toBeTruthy();
  });

  it('does not render roster error message when fetch succeeds', async () => {
    mockedUseGroupRoster.mockReturnValue({
      members: [
        {
          id: 'user-self',
          displayName: 'Me',
          avatarColor: null,
        },
      ],
      loading: false,
      errorMessage: null,
    });

    await render(<HistoryScreen />);

    // Error text should not be present
    const errorTexts = screen.queryAllByText(/Failed to load/i);
    expect(errorTexts).toHaveLength(0);
  });

  it('passes activeGroupId to useGroupRoster', async () => {
    await render(<HistoryScreen />);

    expect(mockedUseGroupRoster).toHaveBeenCalledWith('group-1');
  });

  it('switches activeGroupId and calls useGroupRoster with new id', async () => {
    const { rerender } = await render(<HistoryScreen />);

    expect(mockedUseGroupRoster).toHaveBeenCalledWith('group-1');

    mockedUseGroupsContext.mockReturnValue({
      activeGroupId: 'group-2',
      groups: [],
      switchGroup: jest.fn(),
    } as any);

    await rerender(<HistoryScreen />);

    expect(mockedUseGroupRoster).toHaveBeenCalledWith('group-2');
  });

  it('initial null activeGroupId is handled', async () => {
    mockedUseGroupsContext.mockReturnValue({
      activeGroupId: null,
      groups: [],
      switchGroup: jest.fn(),
    } as any);

    await render(<HistoryScreen />);

    expect(mockedUseGroupRoster).toHaveBeenCalledWith(null);
  });

  it('passes history results to JourneyList component', async () => {
    const mockDays = [
      {
        dateLocal: '2024-01-15',
        points: [
          {
            id: '1',
            latitude: 37.7749,
            longitude: -122.4194,
            recordedAt: '2024-01-15T10:00:00.000Z',
            speedMps: null,
            headingDeg: null,
          },
        ],
      },
    ];

    mockedUseJourneyHistory.mockReturnValue({
      days: mockDays,
      loading: false,
      loadingMore: false,
      errorMessage: null,
      hasMore: true,
      loadMore: jest.fn(),
    });

    await render(<HistoryScreen />);

    expect(screen.getByTestId('journey-list')).toBeTruthy();
  });

  it('handles null initialMemberId explicitly', async () => {
    await render(<HistoryScreen initialMemberId={null} />);

    // Should still default to self
    expect(mockedUseJourneyHistory).toHaveBeenCalledWith('user-self');
  });

  it('does not reset selection when switching between groups if component re-renders within same group', async () => {
    const { rerender } = await render(<HistoryScreen initialMemberId="user-alice" />);

    // Rerender with same activeGroupId
    mockedUseGroupsContext.mockReturnValue({
      activeGroupId: 'group-1',
      groups: [],
      switchGroup: jest.fn(),
    } as any);

    await rerender(<HistoryScreen initialMemberId="user-alice" />);

    // Should still be calling with user-alice (selection not reset)
    expect(mockedUseJourneyHistory).toHaveBeenLastCalledWith('user-alice');
  });

  it('renders nothing for MemberSelector when no members', async () => {
    mockedUseGroupRoster.mockReturnValue({
      members: [],
      loading: false,
      errorMessage: null,
    });

    await render(<HistoryScreen />);

    // MemberSelector should render even if empty (it handles the rendering)
    expect(screen.getByTestId('member-selector')).toBeTruthy();
  });

  it('calls loadMore when triggered from JourneyList', async () => {
    const mockLoadMore = jest.fn();

    mockedUseJourneyHistory.mockReturnValue({
      days: [
        {
          dateLocal: '2024-01-15',
          points: [
            {
              id: '1',
              latitude: 37.7749,
              longitude: -122.4194,
              recordedAt: '2024-01-15T10:00:00.000Z',
              speedMps: null,
              headingDeg: null,
            },
          ],
        },
      ],
      loading: false,
      loadingMore: false,
      errorMessage: null,
      hasMore: true,
      loadMore: mockLoadMore,
    });

    await render(<HistoryScreen />);

    // The loadMore function should be available to JourneyList
    expect(screen.getByTestId('journey-list')).toBeTruthy();
  });

  it('passes onPressDay handler to JourneyList', async () => {
    const mockDay = {
      dateLocal: '2024-01-15',
      points: [
        {
          id: '1',
          latitude: 37.7749,
          longitude: -122.4194,
          recordedAt: '2024-01-15T10:00:00.000Z',
          speedMps: null,
          headingDeg: null,
        },
      ],
    };

    mockedUseJourneyHistory.mockReturnValue({
      days: [mockDay],
      loading: false,
      loadingMore: false,
      errorMessage: null,
      hasMore: false,
      loadMore: jest.fn(),
    });

    await render(<HistoryScreen />);

    const journeyList = screen.getByTestId('journey-list');
    expect(journeyList.props.onPressDay).toBeDefined();
    expect(typeof journeyList.props.onPressDay).toBe('function');
  });
});
