// features/groups/components/PendingInvitesSection.tsx
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { PendingInvite } from '../hooks/usePendingInvites';

type PendingInvitesSectionProps = {
  invites: PendingInvite[];
  respond: (
    inviteId: string,
    decision: 'accept' | 'decline',
  ) => Promise<{ error: string | null }>;
  respondingId: string | null;
  respondErrorMessage: string | null;
  respondErrorInviteId: string | null;
};

/**
 * FT-10: controlled-props section (mirrors InviteForm's pattern). Renders
 * nothing when there are no pending invites — unlike GroupsScreen's own
 * empty state for the groups list, this is an incidental, usually-empty
 * section that shouldn't add permanent visual clutter.
 */
export const PendingInvitesSection = ({
  invites,
  respond,
  respondingId,
  respondErrorMessage,
  respondErrorInviteId,
}: PendingInvitesSectionProps) => {
  if (invites.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Pending invites</Text>

      {invites.map((invite) => {
        const isResponding = respondingId === invite.id;

        return (
          <View key={invite.id} style={styles.row}>
            <Text style={styles.groupName}>{invite.groupName}</Text>

            {respondErrorMessage && respondErrorInviteId === invite.id ? (
              <Text style={styles.error}>{respondErrorMessage}</Text>
            ) : null}

            {isResponding ? (
              <ActivityIndicator style={styles.spinner} />
            ) : (
              <View style={styles.buttonRow}>
                <Pressable
                  style={[styles.button, styles.acceptButton]}
                  onPress={() => respond(invite.id, 'accept')}
                  disabled={respondingId !== null}
                >
                  <Text style={styles.buttonText}>Accept</Text>
                </Pressable>

                <Pressable
                  style={[styles.button, styles.declineButton]}
                  onPress={() => respond(invite.id, 'decline')}
                  disabled={respondingId !== null}
                >
                  <Text style={styles.declineButtonText}>Decline</Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  heading: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
  },
  row: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  groupName: {
    fontSize: 16,
    color: '#222',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: '#2563eb',
  },
  declineButton: {
    borderWidth: 1,
    borderColor: '#d0d0d0',
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  declineButtonText: {
    color: '#444',
    fontSize: 15,
    fontWeight: '600',
  },
  spinner: {
    alignSelf: 'flex-start',
  },
  error: {
    color: '#c0392b',
    fontSize: 13,
  },
});
