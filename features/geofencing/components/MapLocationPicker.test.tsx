// features/geofencing/components/MapLocationPicker.test.tsx
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// A stateful mock (real useState inside the factory) so that calling the
// mocked reverseGeocode() from within the real component triggers a real
// React re-render via act() — RNTL's rerender() didn't reliably re-invoke
// the mocked hook in this test-renderer setup, so this drives the update
// through the component's own actual state-change path instead.
let mockNextAddress: string | null = null;

jest.mock('../hooks/useReverseGeocode', () => {
  const { useState } = require('react');
  return {
    useReverseGeocode: () => {
      const [address, setAddress] = useState(null as string | null);
      const reverseGeocode = async () => {
        setAddress(mockNextAddress);
        return mockNextAddress;
      };
      return { reverseGeocode, address, resolving: false };
    },
  };
});

let capturedMapProps: {
  onRegionChange: (region: unknown) => void;
  onRegionChangeComplete: (region: unknown) => void;
} | null = null;

jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: {
      onRegionChange: (region: unknown) => void;
      onRegionChangeComplete: (region: unknown) => void;
    }) => {
      capturedMapProps = props;
      return <View testID="map-view" />;
    },
  };
});

import { act, fireEvent, render } from '@testing-library/react-native';

import { MapLocationPicker } from './MapLocationPicker';

const initialRegion = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

const pannedRegion = {
  latitude: 37.8,
  longitude: -122.45,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

beforeEach(() => {
  capturedMapProps = null;
  mockNextAddress = null;
});

describe('MapLocationPicker', () => {
  it('modal mode: panning alone does not call onConfirm', async () => {
    const onConfirm = jest.fn();

    await render(
      <MapLocationPicker
        mode="modal"
        initialRegion={initialRegion}
        radiusM={300}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    await act(async () => {
      await capturedMapProps?.onRegionChangeComplete(pannedRegion);
    });

    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('modal mode: "Next" confirms the last settled region', async () => {
    const onConfirm = jest.fn();

    const { getByText } = await render(
      <MapLocationPicker
        mode="modal"
        initialRegion={initialRegion}
        radiusM={300}
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />,
    );

    await act(async () => {
      await capturedMapProps?.onRegionChangeComplete(pannedRegion);
    });

    fireEvent.press(getByText('Next'));

    expect(onConfirm).toHaveBeenCalledWith({
      latitude: pannedRegion.latitude,
      longitude: pannedRegion.longitude,
      address: null,
    });
  });

  it('inline mode: mounting alone does not call onConfirm, even once the initial reverse-geocode resolves', async () => {
    const onConfirm = jest.fn();

    mockNextAddress = 'Initial Address';

    await render(
      <MapLocationPicker
        mode="inline"
        initialRegion={initialRegion}
        radiusM={300}
        onConfirm={onConfirm}
      />,
    );

    // The picker's own initial-mount effect calls reverseGeocode(initialRegion)
    // directly for the label only — onConfirm is only ever wired to actual
    // onRegionChangeComplete pan events, never fired at mount.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('inline mode: confirms once panning settles and the address resolves', async () => {
    const onConfirm = jest.fn();

    await render(
      <MapLocationPicker
        mode="inline"
        initialRegion={initialRegion}
        radiusM={300}
        onConfirm={onConfirm}
      />,
    );

    mockNextAddress = 'Panned Address';

    await act(async () => {
      await capturedMapProps?.onRegionChangeComplete(pannedRegion);
    });

    expect(onConfirm).toHaveBeenCalledWith({
      latitude: pannedRegion.latitude,
      longitude: pannedRegion.longitude,
      address: 'Panned Address',
    });
  });

  it('inline mode: confirms every distinct pan, even when consecutive pans resolve to the same address', async () => {
    // Regression test: onConfirm used to be driven by a useEffect keyed on
    // the resolved `address` string. React skips re-running a state-keyed
    // effect when the new value equals the old one, so two different pans
    // that happen to reverse-geocode to the identical formatted address
    // (e.g. repositioning within the same block) silently dropped the
    // second confirm. onConfirm is now called directly from the pan
    // handler once its own request resolves, independent of whether the
    // address text actually changed.
    const onConfirm = jest.fn();

    await render(
      <MapLocationPicker
        mode="inline"
        initialRegion={initialRegion}
        radiusM={300}
        onConfirm={onConfirm}
      />,
    );

    mockNextAddress = 'Same Address';

    const firstPan = {
      latitude: 37.8,
      longitude: -122.45,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    const secondPan = {
      latitude: 37.81,
      longitude: -122.46,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };

    await act(async () => {
      await capturedMapProps?.onRegionChangeComplete(firstPan);
    });
    await act(async () => {
      await capturedMapProps?.onRegionChangeComplete(secondPan);
    });

    expect(onConfirm).toHaveBeenNthCalledWith(1, {
      latitude: firstPan.latitude,
      longitude: firstPan.longitude,
      address: 'Same Address',
    });
    expect(onConfirm).toHaveBeenNthCalledWith(2, {
      latitude: secondPan.latitude,
      longitude: secondPan.longitude,
      address: 'Same Address',
    });
  });
});
