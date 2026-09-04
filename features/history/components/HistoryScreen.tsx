// features/history/components/HistoryScreen.tsx
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../../context/auth.context';
import { useGroupsContext } from '../../../context/groups.context';
import { useGroupRoster } from '../hooks/useGroupRoster';
import { useJourneyHistory } from '../hooks/useJourneyHistory';
import type { JourneyDay } from '../types/history.types';
import { JourneyList } from './JourneyList';
import { MemberSelector } from './MemberSelector';

type HistoryScreenProps = {
  // Deep-link entry point (e.g. tapping a member elsewhere in the app)
  // pre-selects their history instead of landing on self.
  initialMemberId?: string | null;
};

// Composes the member selector + journey list for the active group.
// Selection defaults to self (or initialMemberId, if provided) and fully
// resets on group switch (mirrors FT-12 edge case #4) rather than trying
// to carry a selection across groups.
export const HistoryScreen = ({ initialMemberId = null }: HistoryScreenProps) => {
  const router = useRouter();
  const { userId } = useAuth();
  const { activeGroupId } = useGroupsContext();
  const { members, errorMessage: rosterErrorMessage } = useGroupRoster(activeGroupId);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    initialMemberId,
  );

  const previousGroupIdRef = useRef(activeGroupId);

  useEffect(() => {
    if (previousGroupIdRef.current === activeGroupId) {
      return;
    }

    previousGroupIdRef.current = activeGroupId;
    setSelectedMemberId(null);
  }, [activeGroupId]);

  const effectiveSelectedId = selectedMemberId ?? userId;
  const { days, loading, loadingMore, errorMessage, hasMore, loadMore } =
    useJourneyHistory(effectiveSelectedId);

  const handlePressDay = (day: JourneyDay) => {
    router.push(
      `/history/playback?memberId=${effectiveSelectedId}&date=${day.dateLocal}`,
    );
  };

  return (
    <View style={styles.container}>
      <MemberSelector
        members={members}
        selectedId={effectiveSelectedId}
        onSelect={setSelectedMemberId}
      />
      {rosterErrorMessage ? (
        <Text style={styles.rosterError}>{rosterErrorMessage}</Text>
      ) : null}
      <JourneyList
        days={days}
        loading={loading}
        loadingMore={loadingMore}
        errorMessage={errorMessage}
        hasMore={hasMore}
        onLoadMore={loadMore}
        onPressDay={handlePressDay}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  rosterError: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    color: '#b91c1c',
    fontSize: 13,
  },
});
