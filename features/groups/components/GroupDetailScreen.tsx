// features/groups/components/GroupDetailScreen.tsx
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useGroups } from '../hooks/useGroups';
import { useSendInvite } from '../hooks/useSendInvite';
import { InviteForm } from './InviteForm';

/**
 * FT-9: a single group's detail screen — shows the group and lets a
 * member send an invite. Reuses useGroups() (FT-8) unchanged and finds
 * the matching group client-side rather than adding a near-duplicate
 * single-row fetch hook. "Group not found" covers the group having
 * auto-deleted mid-navigation (FT-7's last-member-leaves trigger).
 */
export const GroupDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { groups, loading, errorMessage } = useGroups();
  const { sendInvite, sending, sendErrorMessage } = useSendInvite(id);

  const group = groups.find((candidate) => candidate.id === id);
  const showInitialSpinner = loading && groups.length === 0 && !errorMessage;

  if (showInitialSpinner) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (errorMessage && !group) {
    return (
      <View style={styles.center}>
        <Text style={styles.messageText}>{errorMessage}</Text>
      </View>
    );
  }

  if (!group) {
    return (
      <View style={styles.center}>
        <Text style={styles.messageText}>This group no longer exists.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {group.name}
        {group.role === 'owner' ? ' (owner)' : ''}
      </Text>

      <InviteForm
        onInvite={sendInvite}
        sending={sending}
        sendErrorMessage={sendErrorMessage}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#222',
  },
  messageText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
});
