// features/map/components/GroupSwitcher.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

import { createMembershipGroup } from '../../../test/utils';

import { GroupSwitcher } from './GroupSwitcher';

describe('GroupSwitcher', () => {
  it('renders nothing when groups.length < 2', async () => {
    await render(
      <GroupSwitcher
        groups={[createMembershipGroup('group-1', 'Family')]}
        activeGroupId="group-1"
        onSelect={jest.fn()}
      />,
    );

    expect(screen.queryByText('Family')).toBeNull();
  });

  it('renders nothing when groups is empty', async () => {
    await render(
      <GroupSwitcher groups={[]} activeGroupId={null} onSelect={jest.fn()} />,
    );

    expect(screen.queryByText(/Family|Work/)).toBeNull();
  });

  it('renders one pill per group when groups.length >= 2', async () => {
    const groups = [
      createMembershipGroup('group-1', 'Family'),
      createMembershipGroup('group-2', 'Work'),
    ];

    await render(
      <GroupSwitcher
        groups={groups}
        activeGroupId="group-1"
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('Family')).toBeTruthy();
    expect(screen.getByText('Work')).toBeTruthy();
  });

  it('applies active styling to the activeGroupId pill', async () => {
    const groups = [
      createMembershipGroup('group-1', 'Family'),
      createMembershipGroup('group-2', 'Work'),
    ];

    await render(
      <GroupSwitcher
        groups={groups}
        activeGroupId="group-2"
        onSelect={jest.fn()}
      />,
    );

    const workPill = screen.getByText('Work').parent;
    const familyPill = screen.getByText('Family').parent;

    expect(workPill?.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: '#2563eb' }),
    );
    expect(familyPill?.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: '#fff' }),
    );
  });

  it('calls onSelect with group id when a pill is pressed', async () => {
    const handleSelect = jest.fn();
    const groups = [
      createMembershipGroup('group-1', 'Family'),
      createMembershipGroup('group-2', 'Work'),
    ];

    await render(
      <GroupSwitcher
        groups={groups}
        activeGroupId="group-1"
        onSelect={handleSelect}
      />,
    );

    fireEvent.press(screen.getByText('Work').parent!);

    expect(handleSelect).toHaveBeenCalledWith('group-2');
  });

  it('handles null activeGroupId gracefully (no pill is active)', async () => {
    const groups = [
      createMembershipGroup('group-1', 'Family'),
      createMembershipGroup('group-2', 'Work'),
    ];

    await render(
      <GroupSwitcher groups={groups} activeGroupId={null} onSelect={jest.fn()} />,
    );

    expect(screen.getByText('Family').parent?.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: '#fff' }),
    );
    expect(screen.getByText('Work').parent?.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: '#fff' }),
    );
  });
});
