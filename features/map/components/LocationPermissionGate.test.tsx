// features/map/components/LocationPermissionGate.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking, Text } from 'react-native';

import { useLocationPermission } from '../hooks/useLocationPermission';
import { LocationPermissionGate } from './LocationPermissionGate';

jest.mock('../hooks/useLocationPermission');

const mockUseLocationPermission =
  useLocationPermission as jest.MockedFunction<typeof useLocationPermission>;

describe('LocationPermissionGate', () => {
  beforeEach(() => {
    jest.spyOn(Linking, 'openSettings').mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders a loading indicator and no children while checking permission status', async () => {
    mockUseLocationPermission.mockReturnValue({
      status: 'checking',
      requestPermission: jest.fn(),
    });

    await render(
      <LocationPermissionGate>
        <Text>Protected content</Text>
      </LocationPermissionGate>,
    );

    expect(screen.getByLabelText('Loading')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();
  });

  it('renders only the children once permission is granted', async () => {
    mockUseLocationPermission.mockReturnValue({
      status: 'granted',
      requestPermission: jest.fn(),
    });

    await render(
      <LocationPermissionGate>
        <Text>Protected content</Text>
      </LocationPermissionGate>,
    );

    expect(screen.getByText('Protected content')).toBeTruthy();
    expect(screen.queryByLabelText('Loading')).toBeNull();
    expect(screen.queryByText('Location access is off')).toBeNull();
    expect(screen.queryByText('Share your location')).toBeNull();
  });

  it('renders the denied copy and opens Settings when the button is pressed', async () => {
    mockUseLocationPermission.mockReturnValue({
      status: 'denied',
      requestPermission: jest.fn(),
    });

    await render(
      <LocationPermissionGate>
        <Text>Protected content</Text>
      </LocationPermissionGate>,
    );

    expect(screen.getByText('Location access is off')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();

    const settingsButton = screen.getByRole('button', { name: 'Open Settings' });

    fireEvent.press(settingsButton);

    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
  });

  it('renders the undetermined copy and calls requestPermission when the button is pressed', async () => {
    const requestPermission = jest.fn();

    mockUseLocationPermission.mockReturnValue({
      status: 'undetermined',
      requestPermission,
    });

    await render(
      <LocationPermissionGate>
        <Text>Protected content</Text>
      </LocationPermissionGate>,
    );

    expect(screen.getByText('Share your location')).toBeTruthy();
    expect(screen.queryByText('Protected content')).toBeNull();

    const allowButton = screen.getByRole('button', { name: 'Allow Location Access' });

    fireEvent.press(allowButton);

    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});
