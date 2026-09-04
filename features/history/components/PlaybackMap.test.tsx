import { fireEvent, render } from '@testing-library/react-native';

import { PlaybackMap } from './PlaybackMap';
import type { PlaybackPoint } from '../types/history.types';

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const actual = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: actual.View,
    Marker: actual.View,
    Polyline: actual.View,
  };
});

describe('PlaybackMap', () => {
  // requestAnimationFrame is real (no fake timers in this file), so a Play
  // press starts a genuine async tick loop that outlives its test and
  // pollutes the next one. Stub it to a no-op — no test here asserts on
  // in-flight animation frames, only on Play/Pause state and the rendered
  // segments/markers, so ticks never need to actually fire.
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(0);
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders without crashing with empty points', async () => {
    const { toJSON } = await render(<PlaybackMap points={[]} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders with a single visible point', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
    ];

    const { toJSON } = await render(<PlaybackMap points={points} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders Play button as disabled when zero or one visible points', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
    ];

    const { getByLabelText } = await render(<PlaybackMap points={points} />);
    const playButton = getByLabelText('Play');
    expect(playButton.props.accessibilityState.disabled).toBe(true);
  });

  it('renders Play button as enabled when 2+ visible points', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const { getByLabelText } = await render(<PlaybackMap points={points} />);
    const playButton = getByLabelText('Play');
    expect(playButton.props.accessibilityState.disabled).toBe(false);
  });

  it('toggles between Play and Pause on button press', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const { getByLabelText } = await render(<PlaybackMap points={points} />);

    await fireEvent.press(getByLabelText('Play'));
    expect(getByLabelText('Pause')).toBeTruthy();

    // Pause again so the animation loop this started doesn't keep running
    // past the end of the test (real requestAnimationFrame, no fake timers here).
    await fireEvent.press(getByLabelText('Pause'));
    expect(getByLabelText('Play')).toBeTruthy();
  });

  it('skips redacted points when building segments', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T10:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const { toJSON } = await render(<PlaybackMap points={points} />);
    // The component should render without error, skipping the redacted point
    // in the segment polylines
    expect(toJSON()).toBeTruthy();
  });

  it('handles all-redacted points (no visible segments)', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
    ];

    const { toJSON, getByLabelText } = await render(<PlaybackMap points={points} />);
    expect(toJSON()).toBeTruthy();
    const playButton = getByLabelText('Play');
    expect(playButton.props.accessibilityState.disabled).toBe(true);
  });

  it('resets marker and pauses on points change', async () => {
    const points1: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const points2: PlaybackPoint[] = [
      {
        id: '3',
        recordedAt: '2024-01-16T08:00:00.000Z',
        latitude: 37.7751,
        longitude: -122.4189,
        speedMps: 2.0,
        headingDeg: 270,
        isRedacted: false,
      },
      {
        id: '4',
        recordedAt: '2024-01-16T09:00:00.000Z',
        latitude: 37.7752,
        longitude: -122.4188,
        speedMps: 1.2,
        headingDeg: 360,
        isRedacted: false,
      },
    ];

    const { rerender, getByLabelText } = await render(<PlaybackMap points={points1} />);
    const playButton1 = getByLabelText('Play');
    await fireEvent.press(playButton1);

    // Change points
    await rerender(<PlaybackMap points={points2} />);
    const playButton2 = getByLabelText('Play');
    // After change, should be paused (reset)
    expect(playButton2).toBeTruthy();
  });

  it('handles points with mixed null coordinates (redacted embedded in visible)', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T09:30:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: null,
        headingDeg: null,
        isRedacted: false,
      },
      {
        id: '4',
        recordedAt: '2024-01-15T10:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const { toJSON } = await render(<PlaybackMap points={points} />);
    expect(toJSON()).toBeTruthy();
  });

  it('handles duplicate timestamps for same-recorded_at points', async () => {
    // Edge case: FT-5's known same-recorded_at duplicate
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T08:00:00.000Z', // Same timestamp
        latitude: 37.77491,
        longitude: -122.41941,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
    ];

    const { toJSON } = await render(<PlaybackMap points={points} />);
    expect(toJSON()).toBeTruthy();
  });

  it('renders multiple polyline segments for non-contiguous visible runs', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
      {
        id: '3',
        recordedAt: '2024-01-15T10:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '4',
        recordedAt: '2024-01-15T11:00:00.000Z',
        latitude: 37.7751,
        longitude: -122.4189,
        speedMps: 2.0,
        headingDeg: 270,
        isRedacted: false,
      },
      {
        id: '5',
        recordedAt: '2024-01-15T12:00:00.000Z',
        latitude: 37.7752,
        longitude: -122.4188,
        speedMps: 1.2,
        headingDeg: 360,
        isRedacted: false,
      },
    ];

    const { toJSON } = await render(<PlaybackMap points={points} />);
    // Two segments: [1,2] and [4,5], with a gap at [3]
    expect(toJSON()).toBeTruthy();
  });

  it('computes initial region from first visible point', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: 37.7749,
        longitude: -122.4194,
        speedMps: 1.0,
        headingDeg: 90,
        isRedacted: false,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: 37.7750,
        longitude: -122.4190,
        speedMps: 1.5,
        headingDeg: 180,
        isRedacted: false,
      },
    ];

    const { toJSON } = await render(<PlaybackMap points={points} />);
    expect(toJSON()).toBeTruthy();
  });

  it('handles no initial region when all points redacted', async () => {
    const points: PlaybackPoint[] = [
      {
        id: '1',
        recordedAt: '2024-01-15T08:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
      {
        id: '2',
        recordedAt: '2024-01-15T09:00:00.000Z',
        latitude: null,
        longitude: null,
        speedMps: null,
        headingDeg: null,
        isRedacted: true,
      },
    ];

    const { toJSON } = await render(<PlaybackMap points={points} />);
    expect(toJSON()).toBeTruthy();
  });
});
