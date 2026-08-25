// features/notifications/components/NotificationPermissionBanner.test.tsx
import { Linking } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { NotificationPermissionBanner } from './NotificationPermissionBanner';

let openSettingsSpy: jest.SpiedFunction<typeof Linking.openSettings>;

describe('NotificationPermissionBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    openSettingsSpy = jest.spyOn(Linking, 'openSettings');
  });

  afterEach(() => {
    jest.clearAllMocks();
    openSettingsSpy.mockRestore();
  });

  it('renders the banner with correct title', async () => {
    await render(<NotificationPermissionBanner />);

    expect(screen.getByText('Notifications are off')).toBeTruthy();
  });

  it('renders the banner with correct body text', async () => {
    await render(<NotificationPermissionBanner />);

    expect(screen.getByText(/Turn on notifications in Settings/)).toBeTruthy();
  });

  it('renders the banner as a pressable button', async () => {
    await render(<NotificationPermissionBanner />);

    const banner = screen.getByLabelText('Open Settings to enable notifications');
    expect(banner).toBeTruthy();
  });

  it('calls Linking.openSettings when pressed', async () => {
    await render(<NotificationPermissionBanner />);

    const banner = screen.getByLabelText('Open Settings to enable notifications');
    fireEvent.press(banner);

    expect(openSettingsSpy).toHaveBeenCalled();
  });

  it('has correct accessibility role', async () => {
    await render(<NotificationPermissionBanner />);

    const banner = screen.getByLabelText('Open Settings to enable notifications');
    expect(banner.props.accessibilityRole).toBe('button');
  });

  it('has correct accessibility label', async () => {
    await render(<NotificationPermissionBanner />);

    const banner = screen.getByLabelText('Open Settings to enable notifications');
    expect(banner.props.accessibilityLabel).toBe('Open Settings to enable notifications');
  });
});
