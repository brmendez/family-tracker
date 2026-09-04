import { render, screen } from '@testing-library/react-native';

import { MemberSelector } from './MemberSelector';
import type { GroupRosterMember } from '../hooks/useGroupRoster';

describe('MemberSelector', () => {
  it('returns null when members array is empty', async () => {
    await render(
      <MemberSelector members={[]} selectedId={null} onSelect={jest.fn()} />,
    );

    // When component returns null, no elements render
    const selector = screen.queryByTestId?.('member-selector');
    expect(selector).toBeNull();
  });

  it('renders member pills for each member', async () => {
    const members: GroupRosterMember[] = [
      {
        id: 'user-1',
        displayName: 'Alice',
        avatarColor: '#ff0000',
      },
      {
        id: 'user-2',
        displayName: 'Bob',
        avatarColor: '#00ff00',
      },
    ];

    await render(
      <MemberSelector
        members={members}
        selectedId="user-1"
        onSelect={jest.fn()}
      />,
    );

    // Both member names should be rendered
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('handles members with null avatarColor', async () => {
    const members: GroupRosterMember[] = [
      {
        id: 'user-1',
        displayName: 'Alice',
        avatarColor: null,
      },
    ];

    await render(
      <MemberSelector
        members={members}
        selectedId="user-1"
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('handles selectedId=null', async () => {
    const members: GroupRosterMember[] = [
      {
        id: 'user-1',
        displayName: 'Alice',
        avatarColor: null,
      },
    ];

    await render(
      <MemberSelector members={members} selectedId={null} onSelect={jest.fn()} />,
    );

    expect(screen.getByText('Alice')).toBeTruthy();
  });

  it('handles many members', async () => {
    const members: GroupRosterMember[] = Array.from({ length: 10 }, (_, i) => ({
      id: `user-${i}`,
      displayName: `Member ${i}`,
      avatarColor: null,
    }));

    await render(
      <MemberSelector
        members={members}
        selectedId="user-5"
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByText('Member 5')).toBeTruthy();
    expect(screen.getByText('Member 0')).toBeTruthy();
    expect(screen.getByText('Member 9')).toBeTruthy();
  });
});
