// features/geofencing/hooks/useLogGeofenceEvent.test.ts
jest.mock('../../../lib/supabase');
jest.mock('../lib/logGeofenceEvent');

import { renderHook } from '@testing-library/react-native';

import { logGeofenceEvent } from '../lib/logGeofenceEvent';
import { useLogGeofenceEvent } from './useLogGeofenceEvent';

const mockedLogGeofenceEvent = logGeofenceEvent as jest.MockedFunction<typeof logGeofenceEvent>;

describe('useLogGeofenceEvent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls logGeofenceEvent when crossing and userId are both present', async () => {
    const crossing = {
      geofenceId: 'zone-123',
      geofenceName: 'Home',
      eventType: 'enter' as const,
      occurredAt: '2024-01-01T12:00:00Z',
    };

    await renderHook(() => useLogGeofenceEvent(crossing, 'user-456'));

    // The hook passes the entire crossing object to logGeofenceEvent
    expect(mockedLogGeofenceEvent).toHaveBeenCalledWith(crossing, 'user-456');
  });

  it('does not call logGeofenceEvent when crossing is null', async () => {
    await renderHook(() => useLogGeofenceEvent(null, 'user-456'));

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('does not call logGeofenceEvent when userId is null', async () => {
    await renderHook(() =>
      useLogGeofenceEvent(
        {
          geofenceId: 'zone-123',
          geofenceName: 'Home',
          eventType: 'enter',
          occurredAt: '2024-01-01T12:00:00Z',
        },
        null,
      ),
    );

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('does not call logGeofenceEvent when both crossing and userId are null', async () => {
    await renderHook(() => useLogGeofenceEvent(null, null));

    expect(mockedLogGeofenceEvent).not.toHaveBeenCalled();
  });

  it('calls logGeofenceEvent again when crossing changes', async () => {
    const { rerender } = await renderHook(
      ({ crossing, userId }: { crossing: any; userId: string | null }) =>
        useLogGeofenceEvent(crossing, userId),
      {
        initialProps: {
          crossing: {
            geofenceId: 'zone-123',
            geofenceName: 'Home',
            eventType: 'enter' as const,
            occurredAt: '2024-01-01T12:00:00Z',
          },
          userId: 'user-456',
        },
      },
    );

    expect(mockedLogGeofenceEvent).toHaveBeenCalledTimes(1);

    // Rerender with new crossing data
    await rerender({
      crossing: {
        geofenceId: 'zone-789',
        geofenceName: 'Work',
        eventType: 'exit' as const,
        occurredAt: '2024-01-01T12:30:00Z',
      },
      userId: 'user-456',
    });

    // After rerender completes, the second effect should have run
    expect(mockedLogGeofenceEvent).toHaveBeenCalledTimes(2);

    // Verify the second call had the new crossing data (including geofenceName)
    const secondCrossing = {
      geofenceId: 'zone-789',
      geofenceName: 'Work',
      eventType: 'exit' as const,
      occurredAt: '2024-01-01T12:30:00Z',
    };
    expect(mockedLogGeofenceEvent).toHaveBeenLastCalledWith(secondCrossing, 'user-456');
  });
});
