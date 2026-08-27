// features/map/components/OtherUserMarker.test.tsx
// jest.mock() calls must come BEFORE any other imports
jest.mock('../hooks/useLocationStaleness');
jest.mock('react-native-maps', () => {
  const React = require('react');
  return {
    __esModule: true,
    Marker: (props: any) => React.createElement('Marker', props),
  };
});

import { render } from '@testing-library/react-native';

import type { OtherUserLocation } from '../hooks/useGroupMemberLocations';
import { useLocationStaleness } from '../hooks/useLocationStaleness';
import { OtherUserMarker } from './OtherUserMarker';

const mockUseLocationStaleness =
  useLocationStaleness as jest.MockedFunction<typeof useLocationStaleness>;

const location: OtherUserLocation = {
  latitude: 37.7749,
  longitude: -122.4194,
  recordedAt: '2024-01-01T00:00:00.000Z',
  speedMps: 2.0,
  headingDeg: 180,
};

describe('OtherUserMarker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders coordinate, title, description, accessibilityLabel, and no pinColor when fresh', async () => {
    mockUseLocationStaleness.mockReturnValue({ label: 'just now', isStale: false });

    const { toJSON } = await render(
      <OtherUserMarker
        displayName="Alice"
        location={location}
        coordinate={{ latitude: location.latitude, longitude: location.longitude }}
      />,
    );

    const marker = toJSON() as any;
    expect(marker.props.coordinate).toEqual({ latitude: 37.7749, longitude: -122.4194 });
    expect(marker.props.title).toBe('Alice');
    expect(marker.props.description).toBe('Last seen just now');
    expect(marker.props.accessibilityLabel).toBe("Alice's location");
    expect(marker.props.pinColor).toBeUndefined();
  });

  it.each([
    '1 minute ago',
    '2 minutes ago',
    '1 hour ago',
    '2 hours ago',
    '1 day ago',
    '2 days ago',
  ])('tints the pin gray and shows "Last seen %s" when stale', async (label) => {
    mockUseLocationStaleness.mockReturnValue({ label, isStale: true });

    const { toJSON } = await render(
      <OtherUserMarker
        displayName="Alice"
        location={location}
        coordinate={{ latitude: location.latitude, longitude: location.longitude }}
      />,
    );

    const marker = toJSON() as any;
    expect(marker.props.pinColor).toBe('#6b7280');
    expect(marker.props.description).toBe(`Last seen ${label}`);
  });

  it('passes location.recordedAt through to useLocationStaleness', async () => {
    mockUseLocationStaleness.mockReturnValue({ label: 'just now', isStale: false });

    await render(
      <OtherUserMarker
        displayName="Alice"
        location={location}
        coordinate={{ latitude: location.latitude, longitude: location.longitude }}
      />,
    );

    expect(mockUseLocationStaleness).toHaveBeenCalledWith(location.recordedAt);
  });

  it('renders a bare native Marker with no custom child view', async () => {
    mockUseLocationStaleness.mockReturnValue({ label: 'just now', isStale: false });

    const { toJSON } = await render(
      <OtherUserMarker
        displayName="Alice"
        location={location}
        coordinate={{ latitude: location.latitude, longitude: location.longitude }}
      />,
    );

    const marker = toJSON() as any;
    expect(
      marker.children === null ||
        marker.children === undefined ||
        marker.children.length === 0,
    ).toBe(true);
  });
});
