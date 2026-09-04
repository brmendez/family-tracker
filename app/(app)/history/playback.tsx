// app/(app)/history/playback.tsx
import { useLocalSearchParams } from 'expo-router';

import { PlaybackScreen } from '../../../features/history/components/PlaybackScreen';

// FT-23: memberId/date come from JourneyList's day-row tap (HistoryScreen).
const PlaybackRoute = () => {
  const { memberId, date } = useLocalSearchParams<{ memberId: string; date: string }>();

  return <PlaybackScreen memberId={memberId} dateLocal={date} />;
};

export default PlaybackRoute;
