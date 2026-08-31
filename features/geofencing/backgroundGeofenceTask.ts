// features/geofencing/backgroundGeofenceTask.ts
import { GeofencingEventType, type LocationRegion } from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { AppState } from 'react-native';

import { BACKGROUND_GEOFENCE_TASK_NAME } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { isWithinRegistrationSuppressWindow } from './lib/geofenceRegistrationTracker';
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
      console.warn('[geofencing] background task received error or no data:', error);
      return;
    }

    const { eventType, region } = data;

    // identifier is the geofence_id — set that way in useBackgroundGeofenceRegistration.
    const geofenceId = region.identifier;

    if (!geofenceId) {
      console.warn('[geofencing] background task region had no identifier:', region);
      return;
    }

    // FT-34 Fix 2: foreground JS detector (FT-16/33) already owns this crossing
    // while the app is open. A headless relaunch has no mounted UI, so
    // AppState.currentState never reads 'active' there.
    if (AppState.currentState === 'active') {
      return;
    }

    // FT-34 Fix 3: swallow iOS's synchronous initial-membership report, fired
    // for every region on every real (re-)registration, not just crossings.
    if (isWithinRegistrationSuppressWindow()) {
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Signed out at the moment the event fires — nothing to attribute the row to.
    if (!session?.user.id) {
      console.warn('[geofencing] background task found no session, skipping insert');
      return;
    }

    console.warn('[geofencing] background task firing:', geofenceId, eventType);

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
