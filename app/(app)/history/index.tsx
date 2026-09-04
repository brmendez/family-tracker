// app/(app)/history/index.tsx
import { useLocalSearchParams } from 'expo-router';

import { HistoryScreen } from '../../../features/history/components/HistoryScreen';

// Optional ?memberId= lets other screens deep-link straight into a
// member's history (e.g. tapping them elsewhere in the app) instead of
// landing on self and requiring a manual selector tap.
const HistoryRoute = () => {
  const { memberId } = useLocalSearchParams<{ memberId?: string }>();

  return <HistoryScreen initialMemberId={memberId ?? null} />;
};

export default HistoryRoute;
