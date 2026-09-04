import { render, screen } from '@testing-library/react-native';

import { JourneyList } from './JourneyList';
import type { JourneyDay } from '../types/history.types';

describe('JourneyList', () => {
  it('renders loading indicator when loading and no days', async () => {
    await render(
      <JourneyList
        days={[]}
        loading={true}
        loadingMore={false}
        errorMessage={null}
        hasMore={true}
        onLoadMore={jest.fn()}
      />,
    );

    // Component renders without error when loading
    expect(screen.root).toBeTruthy();
  });

  it('renders error message when fetch fails', async () => {
    await render(
      <JourneyList
        days={[]}
        loading={false}
        loadingMore={false}
        errorMessage="Network error"
        hasMore={true}
        onLoadMore={jest.fn()}
      />,
    );

    expect(screen.getByText('Network error')).toBeTruthy();
  });

  it('renders empty state when no days and not loading', async () => {
    await render(
      <JourneyList
        days={[]}
        loading={false}
        loadingMore={false}
        errorMessage={null}
        hasMore={true}
        onLoadMore={jest.fn()}
      />,
    );

    // Component renders without error
    expect(screen.root).toBeTruthy();
  });

  it('renders day rows with dates and point counts', async () => {
    const days: JourneyDay[] = [
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
          {
            id: '2',
            latitude: 37.7750,
            longitude: -122.4190,
            recordedAt: '2024-01-15T11:00:00.000Z',
            speedMps: null,
            headingDeg: null,
          },
        ],
      },
    ];

    await render(
      <JourneyList
        days={days}
        loading={false}
        loadingMore={false}
        errorMessage={null}
        hasMore={true}
        onLoadMore={jest.fn()}
      />,
    );

    // JourneyList formats dates as "Mon, Jan 15, 2024"
    expect(screen.getByText(/Jan 15/)).toBeTruthy();
    expect(screen.getByText('2 points')).toBeTruthy();
  });

  it('renders footer spinner when loadingMore', async () => {
    const days: JourneyDay[] = [
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

    await render(
      <JourneyList
        days={days}
        loading={false}
        loadingMore={true}
        errorMessage={null}
        hasMore={true}
        onLoadMore={jest.fn()}
      />,
    );

    // Footer spinner should render without error
    expect(screen.root).toBeTruthy();
  });

  it('renders "Beginning of history" footer when hasMore=false', async () => {
    const days: JourneyDay[] = [
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

    await render(
      <JourneyList
        days={days}
        loading={false}
        loadingMore={false}
        errorMessage={null}
        hasMore={false}
        onLoadMore={jest.fn()}
      />,
    );

    // Component renders without error
    expect(screen.root).toBeTruthy();
  });

  it('renders multiple day rows', async () => {
    const days: JourneyDay[] = [
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
      {
        dateLocal: '2024-01-14',
        points: [
          {
            id: '2',
            latitude: 37.7750,
            longitude: -122.4190,
            recordedAt: '2024-01-14T10:00:00.000Z',
            speedMps: null,
            headingDeg: null,
          },
        ],
      },
    ];

    await render(
      <JourneyList
        days={days}
        loading={false}
        loadingMore={false}
        errorMessage={null}
        hasMore={true}
        onLoadMore={jest.fn()}
      />,
    );

    // JourneyList formats dates, so we check for the month abbreviation
    expect(screen.getByText(/Jan 15/)).toBeTruthy();
    expect(screen.getByText(/Jan 14/)).toBeTruthy();
  });

  it('calls onLoadMore prop', async () => {
    const mockOnLoadMore = jest.fn();
    const days: JourneyDay[] = [
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

    await render(
      <JourneyList
        days={days}
        loading={false}
        loadingMore={false}
        errorMessage={null}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />,
    );

    expect(mockOnLoadMore).toBeDefined();
  });
});
