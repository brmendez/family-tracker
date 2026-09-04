// features/history/components/JourneyList.tsx
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import type { JourneyDay } from '../types/history.types';

type JourneyListProps = {
  days: JourneyDay[];
  loading: boolean;
  loadingMore: boolean;
  errorMessage: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
};

// dateLocal is "YYYY-MM-DD" — split and construct a local Date rather than
// `new Date(dateLocal)`, which JS parses as UTC midnight and can display
// as the previous day in negative-offset timezones.
const formatDateLocal = (dateLocal: string): string => {
  const [year, month, day] = dateLocal.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const formatPointCount = (count: number): string =>
  count === 1 ? '1 point' : `${count} points`;

// FlatList of day sections, most recent first (days already arrive in that
// order from useJourneyHistory). No route playback here — FT-23.
export const JourneyList = ({
  days,
  loading,
  loadingMore,
  errorMessage,
  hasMore,
  onLoadMore,
}: JourneyListProps) => {
  if (loading && days.length === 0 && !errorMessage) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" accessibilityLabel="Loading history" />
      </View>
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{errorMessage}</Text>
      </View>
    );
  }

  if (days.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No history yet for this member.</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={days}
      keyExtractor={(day) => day.dateLocal}
      onEndReachedThreshold={0.5}
      onEndReached={onLoadMore}
      renderItem={({ item }) => (
        <View style={styles.dayRow}>
          <Text style={styles.dayDate}>{formatDateLocal(item.dateLocal)}</Text>
          <Text style={styles.dayCount}>{formatPointCount(item.points.length)}</Text>
        </View>
      )}
      ListFooterComponent={
        loadingMore ? (
          <ActivityIndicator
            style={styles.footerSpinner}
            accessibilityLabel="Loading more history"
          />
        ) : !hasMore ? (
          <Text style={styles.footerText}>Beginning of history</Text>
        ) : null
      }
    />
  );
};

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  errorText: {
    fontSize: 14,
    color: '#c0392b',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
  dayCount: {
    fontSize: 13,
    color: '#666',
  },
  footerSpinner: {
    paddingVertical: 16,
  },
  footerText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 16,
  },
});
