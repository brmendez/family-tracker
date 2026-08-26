// features/geofencing/hooks/useGeofenceAlert.ts
import type { RealtimePostgresInsertPayload } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { GEOFENCE_ALERT_AUTO_DISMISS_MS } from '../../../lib/constants';
import { supabase } from '../../../lib/supabase';
import type { ActiveGroupMember } from '../../map/hooks/useActiveGroupMembers';
import type { Geofence, GeofenceAlertEvent } from '../types/geofence.types';

type UseGeofenceAlertResult = {
  visibleAlert: GeofenceAlertEvent | null;
  dismiss: () => void;
};

type GeofenceEventRow = {
  geofence_id: string;
  user_id: string;
  event_type: 'enter' | 'exit';
  occurred_at: string;
};

/**
 * Alerts on OTHER group members' crossings via realtime INSERT on
 * geofence_events — mirrors useGroupMemberLocations' subscription pattern.
 * Self-writes never surface; see ARCHITECTURE.md FT-16 (corrected).
 */
export const useGeofenceAlert = (
  activeGroupId: string | null,
  geofences: Geofence[],
  members: ActiveGroupMember[],
  userId: string | null,
): UseGeofenceAlertResult => {
  const [visibleAlert, setVisibleAlert] = useState<GeofenceAlertEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscription below is keyed only on activeGroupId (avoids resubscribing
  // on every zone/member edit) — these refs keep its closure current.
  const geofenceNamesRef = useRef<Record<string, string>>({});
  const memberNamesRef = useRef<Record<string, string>>({});
  const userIdRef = useRef<string | null>(userId);

  useEffect(() => {
    geofenceNamesRef.current = Object.fromEntries(
      geofences.map((geofence) => [geofence.id, geofence.name]),
    );
  }, [geofences]);

  useEffect(() => {
    memberNamesRef.current = Object.fromEntries(
      members.map((member) => [member.id, member.displayName]),
    );
  }, [members]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!activeGroupId) {
      return;
    }

    let isCancelled = false;

    const channel = supabase
      .channel('geofence_events:active_group')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'geofence_events' },
        (payload: RealtimePostgresInsertPayload<GeofenceEventRow>) => {
          if (isCancelled || payload.new.user_id === userIdRef.current) {
            return;
          }

          const geofenceName = geofenceNamesRef.current[payload.new.geofence_id];
          const displayName = memberNamesRef.current[payload.new.user_id];

          // Non-active-group zone, deleted zone, or stale/unloaded
          // membership — drop silently rather than show a partial alert.
          if (!geofenceName || !displayName) {
            return;
          }

          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }

          setVisibleAlert({
            geofenceId: payload.new.geofence_id,
            geofenceName,
            eventType: payload.new.event_type,
            userId: payload.new.user_id,
            displayName,
            occurredAt: payload.new.occurred_at,
          });

          timeoutRef.current = setTimeout(() => {
            setVisibleAlert(null);
          }, GEOFENCE_ALERT_AUTO_DISMISS_MS);
        },
      )
      .subscribe();

    return () => {
      isCancelled = true;

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      supabase.removeChannel(channel);
    };
  }, [activeGroupId]);

  const dismiss = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setVisibleAlert(null);
  };

  return { visibleAlert, dismiss };
};
