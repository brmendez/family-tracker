// features/geofencing/lib/logGeofenceEvent.test.ts
import { supabase } from '../../../lib/supabase';
import { logGeofenceEvent } from './logGeofenceEvent';

jest.mock('../../../lib/supabase');

const mockedSupabase = supabase as jest.Mocked<typeof supabase>;

describe('logGeofenceEvent', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('inserts a geofence_events row with mapped fields', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedSupabase.from.mockReturnValue({
      insert: mockInsert,
    } as any);

    await logGeofenceEvent(
      {
        geofenceId: 'zone-123',
        eventType: 'enter',
        occurredAt: '2024-01-01T12:00:00Z',
      },
      'user-456',
    );

    expect(mockedSupabase.from).toHaveBeenCalledWith('geofence_events');
    expect(mockInsert).toHaveBeenCalledWith({
      geofence_id: 'zone-123',
      user_id: 'user-456',
      event_type: 'enter',
      occurred_at: '2024-01-01T12:00:00Z',
    });
  });

  it('omits geofenceName from insert payload', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedSupabase.from.mockReturnValue({
      insert: mockInsert,
    } as any);

    await logGeofenceEvent(
      {
        geofenceId: 'zone-123',
        eventType: 'exit',
        occurredAt: '2024-01-01T12:05:00Z',
      },
      'user-456',
    );

    const insertedData = mockInsert.mock.calls[0][0];
    expect(insertedData).not.toHaveProperty('geofenceName');
  });

  it('catches and logs insert errors without throwing', async () => {
    const error = new Error('Insert failed');
    mockedSupabase.from.mockReturnValue({
      insert: jest.fn().mockResolvedValue({ data: null, error }),
    } as any);

    await logGeofenceEvent(
      {
        geofenceId: 'zone-123',
        eventType: 'enter',
        occurredAt: '2024-01-01T12:00:00Z',
      },
      'user-456',
    );

    expect(warnSpy).toHaveBeenCalledWith('[geofence-events] insert failed:', 'Insert failed');
  });

  it('handles exit events', async () => {
    const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
    mockedSupabase.from.mockReturnValue({
      insert: mockInsert,
    } as any);

    await logGeofenceEvent(
      {
        geofenceId: 'zone-789',
        eventType: 'exit',
        occurredAt: '2024-01-01T12:30:00Z',
      },
      'user-999',
    );

    expect(mockInsert).toHaveBeenCalledWith({
      geofence_id: 'zone-789',
      user_id: 'user-999',
      event_type: 'exit',
      occurred_at: '2024-01-01T12:30:00Z',
    });
  });
});
