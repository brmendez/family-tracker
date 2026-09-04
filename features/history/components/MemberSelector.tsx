// features/history/components/MemberSelector.tsx
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { GroupRosterMember } from '../hooks/useGroupRoster';

type MemberSelectorProps = {
  members: GroupRosterMember[];
  selectedId: string | null;
  onSelect: (memberId: string) => void;
};

// Controlled pill row, same shape as GroupSwitcher.tsx — any group member
// is selectable here (decision #7), not just currently-visible ones.
export const MemberSelector = ({
  members,
  selectedId,
  onSelect,
}: MemberSelectorProps) => {
  if (members.length === 0) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      {members.map((member) => {
        const isActive = member.id === selectedId;

        return (
          <Pressable
            key={member.id}
            style={[styles.chip, isActive ? styles.chipActive : null]}
            onPress={() => onSelect(member.id)}
            accessibilityLabel={`Show history for ${member.displayName}`}
          >
            <Text
              style={[styles.chipText, isActive ? styles.chipTextActive : null]}
            >
              {member.displayName}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flexGrow: 0,
    flexShrink: 0,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: '#2563eb',
    backgroundColor: '#2563eb',
  },
  chipText: {
    fontSize: 13,
    color: '#444',
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
});
