// features/map/components/GroupSwitcher.tsx
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { MembershipGroup } from '../../../context/groups.context';

type GroupSwitcherProps = {
  groups: MembershipGroup[];
  activeGroupId: string | null;
  onSelect: (groupId: string) => void;
};

// A single-group household has nothing to switch between, so this renders
// nothing rather than empty chrome (decision #4).
export const GroupSwitcher = ({
  groups,
  activeGroupId,
  onSelect,
}: GroupSwitcherProps) => {
  if (groups.length < 2) {
    return null;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scrollView}
      contentContainerStyle={styles.container}
    >
      {groups.map((group) => {
        const isActive = group.id === activeGroupId;

        return (
          <Pressable
            key={group.id}
            style={[styles.chip, isActive ? styles.chipActive : null]}
            onPress={() => onSelect(group.id)}
            accessibilityLabel={`Switch to ${group.name}`}
          >
            <Text
              style={[styles.chipText, isActive ? styles.chipTextActive : null]}
            >
              {group.name}
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
