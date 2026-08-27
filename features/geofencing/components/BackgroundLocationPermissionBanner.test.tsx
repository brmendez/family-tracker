// features/geofencing/components/BackgroundLocationPermissionBanner.test.tsx
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { BackgroundLocationPermissionBanner } from './BackgroundLocationPermissionBanner';

let openSettingsSpy: jest.SpiedFunction<typeof Linking.openSettings>;

describe('BackgroundLocationPermissionBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openSettingsSpy = jest.spyOn(Linking, 'openSettings');
  });

  afterEach(() => {
    openSettingsSpy.mockRestore();
  });

  describe('undetermined state', () => {
    it('renders correct title', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="undetermined"
          requestPermission={jest.fn()}
        />,
      );

      expect(screen.getByText('Get alerts even when the app is closed')).toBeTruthy();
    });

    it('renders correct body text', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="undetermined"
          requestPermission={jest.fn()}
        />,
      );

      expect(
        screen.getByText(
          /Allow "Always" location access so your family can be alerted/,
        ),
      ).toBeTruthy();
    });

    it('calls requestPermission when pressed', async () => {
      const mockRequestPermission = jest.fn();

      await render(
        <BackgroundLocationPermissionBanner
          status="undetermined"
          requestPermission={mockRequestPermission}
        />,
      );

      const banner = screen.getByLabelText('Allow background location access');
      fireEvent.press(banner);

      expect(mockRequestPermission).toHaveBeenCalled();
    });

    it('does not open Settings when pressed', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="undetermined"
          requestPermission={jest.fn()}
        />,
      );

      const banner = screen.getByLabelText('Allow background location access');
      fireEvent.press(banner);

      expect(openSettingsSpy).not.toHaveBeenCalled();
    });
  });

  describe('denied state', () => {
    it('renders correct title', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="denied"
          requestPermission={jest.fn()}
        />,
      );

      expect(screen.getByText('Background location is off')).toBeTruthy();
    });

    it('renders correct body text', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="denied"
          requestPermission={jest.fn()}
        />,
      );

      expect(
        screen.getByText(
          /Turn on "Always" location access in Settings/,
        ),
      ).toBeTruthy();
    });

    it('opens Settings when pressed', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="denied"
          requestPermission={jest.fn()}
        />,
      );

      const banner = screen.getByLabelText('Open Settings to enable background location');
      fireEvent.press(banner);

      expect(openSettingsSpy).toHaveBeenCalled();
    });

    it('does not call requestPermission when pressed', async () => {
      const mockRequestPermission = jest.fn();

      await render(
        <BackgroundLocationPermissionBanner
          status="denied"
          requestPermission={mockRequestPermission}
        />,
      );

      const banner = screen.getByLabelText('Open Settings to enable background location');
      fireEvent.press(banner);

      expect(mockRequestPermission).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has correct accessibility role', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="undetermined"
          requestPermission={jest.fn()}
        />,
      );

      const banner = screen.getByLabelText('Allow background location access');
      expect(banner.props.accessibilityRole).toBe('button');
    });

    it('has correct accessibility label for undetermined state', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="undetermined"
          requestPermission={jest.fn()}
        />,
      );

      const banner = screen.getByLabelText('Allow background location access');
      expect(banner.props.accessibilityLabel).toBe('Allow background location access');
    });

    it('has correct accessibility label for denied state', async () => {
      await render(
        <BackgroundLocationPermissionBanner
          status="denied"
          requestPermission={jest.fn()}
        />,
      );

      const banner = screen.getByLabelText('Open Settings to enable background location');
      expect(banner.props.accessibilityLabel).toBe('Open Settings to enable background location');
    });
  });

  describe('granted and checking states', () => {
    it('renders content even when status is granted (parent handles visibility)', async () => {
      // The component itself always renders; parent components handle visibility
      await render(
        <BackgroundLocationPermissionBanner
          status="granted"
          requestPermission={jest.fn()}
        />,
      );

      // Component still renders; parent controls display
      const banner = screen.queryByLabelText('Allow background location access');
      // This is not null because component always renders
      expect(banner || screen.queryByText('Get alerts even when the app is closed')).toBeTruthy();
    });

    it('renders content even when status is checking (parent handles visibility)', async () => {
      // The component itself always renders; parent components handle visibility
      await render(
        <BackgroundLocationPermissionBanner
          status="checking"
          requestPermission={jest.fn()}
        />,
      );

      // Component still renders; parent controls display
      const banner = screen.queryByLabelText('Allow background location access');
      expect(banner || screen.queryByText('Get alerts even when the app is closed')).toBeTruthy();
    });
  });
});
