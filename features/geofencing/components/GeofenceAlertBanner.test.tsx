// features/geofencing/components/GeofenceAlertBanner.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import type { GeofenceAlertEvent } from '../types/geofence.types';
import { GeofenceAlertBanner } from './GeofenceAlertBanner';

function createAlert(
  overrides?: Partial<GeofenceAlertEvent>,
): GeofenceAlertEvent {
  return {
    geofenceId: 'zone-1',
    geofenceName: 'Home',
    eventType: 'enter',
    userId: 'user-2',
    displayName: 'Alice',
    occurredAt: '2024-01-01T12:00:00.000Z',
    ...overrides,
  };
}

describe('GeofenceAlertBanner', () => {
  it('renders null when alert is null', async () => {
    const { toJSON } = await render(
      <GeofenceAlertBanner alert={null} onDismiss={() => {}} />,
    );

    expect(toJSON()).toBeNull();
  });

  it('renders banner with displayName and geofence name on enter event', async () => {
    const alert = createAlert();

    await render(<GeofenceAlertBanner alert={alert} onDismiss={() => {}} />);

    expect(screen.getByText('Alice entered Home')).toBeTruthy();
  });

  it('renders banner with displayName and geofence name on exit event', async () => {
    const alert = createAlert({ eventType: 'exit' });

    await render(<GeofenceAlertBanner alert={alert} onDismiss={() => {}} />);

    expect(screen.getByText('Alice left Home')).toBeTruthy();
  });

  it('calls onDismiss when banner is pressed', async () => {
    const mockDismiss = jest.fn();
    const alert = createAlert();

    await render(<GeofenceAlertBanner alert={alert} onDismiss={mockDismiss} />);

    const banner = screen.getByLabelText('Alice entered Home. Dismiss');
    fireEvent.press(banner);

    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it('has accessibility role button', async () => {
    const alert = createAlert();

    await render(<GeofenceAlertBanner alert={alert} onDismiss={() => {}} />);

    const banner = screen.getByLabelText('Alice entered Home. Dismiss');
    expect(banner.props.accessibilityRole).toBe('button');
  });

  it('has correct accessibility label combining title and dismiss instruction', async () => {
    const alert = createAlert({ displayName: 'Bob', geofenceName: 'Work' });

    await render(<GeofenceAlertBanner alert={alert} onDismiss={() => {}} />);

    const banner = screen.getByLabelText('Bob entered Work. Dismiss');
    expect(banner).toBeTruthy();
  });


  it('handles special characters in names', async () => {
    const alert = createAlert({
      displayName: "O'Brien",
      geofenceName: "Joe's Place",
    });

    await render(<GeofenceAlertBanner alert={alert} onDismiss={() => {}} />);

    expect(screen.getByText("O'Brien entered Joe's Place")).toBeTruthy();
  });
});
