// features/geofencing/backgroundGeofenceTask.ts
import { GeofencingEventType, type LocationRegion } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { BACKGROUND_GEOFENCE_TASK_NAME } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { logGeofenceEvent } from './lib/logGeofenceEvent';

type GeofencingTaskBody = {
  eventType: GeofencingEventType;
  region: LocationRegion;
};

// FT-18: must be defined at module scope (imported once from app/_layout.tsx)
// so iOS can headlessly relaunch JS and find this task after a force-quit.
TaskManager.defineTask<GeofencingTaskBody>(
  BACKGROUND_GEOFENCE_TASK_NAME,
  async ({ data, error }) => {
    if (error || !data) {
      return;
    }

    const { eventType, region } = data;

    // identifier is the geofence_id — set that way in useBackgroundGeofenceRegistration.
    const geofenceId = region.identifier;

    if (!geofenceId) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Signed out at the moment the event fires — nothing to attribute the row to.
    if (!session?.user.id) {
      return;
    }

    await logGeofenceEvent(
      {
        geofenceId,
        eventType: eventType === GeofencingEventType.Enter ? 'enter' : 'exit',
        occurredAt: new Date().toISOString(),
      },
      session.user.id,
    );
  },
);
