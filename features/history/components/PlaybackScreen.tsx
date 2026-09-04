// features/history/components/PlaybackScreen.tsx
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useGroupsContext } from '../../../context/groups.context';
import { useJourneyPlayback } from '../hooks/useJourneyPlayback';
import { PlaybackMap } from './PlaybackMap';

type PlaybackScreenProps = {
  memberId: string;
  dateLocal: string;
};

const formatTime = (isoString: string): string =>
  new Date(isoString).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

// activeGroupId is captured once at mount (useState's lazy-init-once
// behavior), not reactive to later group switches — this is a pushed
// modal-stack screen, not persistent like FamilyMap, so a switch mid-view
// shouldn't silently reinterpret which group's hide history applies.
export const PlaybackScreen = ({ memberId, dateLocal }: PlaybackScreenProps) => {
  const { activeGroupId } = useGroupsContext();
  const [groupId] = useState(activeGroupId);

  const { points, redactedWindows, loading, errorMessage } = useJourneyPlayback(
    memberId,
    groupId,
    dateLocal,
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" accessibilityLabel="Loading playback" />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>This journey is no longer available.</Text>
      </View>
    );
  }

  const allRedacted = points.length > 0 && points.every((point) => point.isRedacted);

  if (allRedacted) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>Hidden all day</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <PlaybackMap points={points} />
      {redactedWindows.length > 0 ? (
        <ScrollView style={styles.redactedList} contentContainerStyle={styles.redactedListContent}>
          {redactedWindows.map((window) => (
            <Text key={window.startsAt} style={styles.redactedText}>
              Hidden {formatTime(window.startsAt)}–{formatTime(window.endsAt)}
            </Text>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 15,
    color: '#444',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
    textAlign: 'center',
  },
  redactedList: {
    maxHeight: 96,
    flexGrow: 0,
  },
  redactedListContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 4,
  },
  redactedText: {
    fontSize: 13,
    color: '#b91c1c',
  },
});
