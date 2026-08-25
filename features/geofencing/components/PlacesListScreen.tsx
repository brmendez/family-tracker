// features/geofencing/components/PlacesListScreen.tsx
import { useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../../context/auth.context';
import { useGroupsContext } from '../../../context/groups.context';
import { useGroups } from '../../groups/hooks/useGroups';
import { useGeofences } from '../hooks/useGeofences';

/** Zone list for the active group; rows the caller can edit show a pencil. */
export const PlacesListScreen = () => {
  const router = useRouter();
  const { activeGroupId } = useGroupsContext();
  const { userId } = useAuth();
  const { groups } = useGroups();
  const { geofences, loading, errorMessage, refetch } = useGeofences(
    activeGroupId ?? undefined,
  );

  const activeGroup = groups.find((candidate) => candidate.id === activeGroupId);

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const handleAddPlace = () => {
    router.push('/places/new');
  };

  const showInitialSpinner = loading && geofences.length === 0 && !errorMessage;

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.addButton}
        onPress={handleAddPlace}
        accessibilityLabel="Add Zone"
      >
        <Text style={styles.addButtonText}>+ Add Zone</Text>
      </Pressable>

      {showInitialSpinner ? (
        <Text style={styles.emptyText}>Loading zones...</Text>
      ) : errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : geofences.length === 0 ? (
        <Text style={styles.emptyText}>No zones yet for this group.</Text>
      ) : (
        <View style={styles.list}>
          {geofences.map((geofence) => {
            const canManage =
              geofence.createdBy === userId || activeGroup?.role === 'owner';

            return (
              <Pressable
                key={geofence.id}
                style={styles.listItem}
                onPress={() => router.push(`/places/${geofence.id}`)}
              >
                <Text style={styles.listItemName}>{geofence.name}</Text>
                {canManage ? (
                  <Text style={styles.editIcon} accessibilityLabel="Editable">
                    ✏️
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
  },
  addButton: {
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#c0392b',
  },
  list: {
    gap: 8,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
  },
  listItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  editIcon: {
    fontSize: 15,
  },
});
