// features/groups/components/PendingInvitesSection.test.tsx
import { fireEvent, render, screen } from '@testing-library/react-native';

import { PendingInvitesSection } from './PendingInvitesSection';
import type { PendingInvite } from '../hooks/usePendingInvites';

const createMockInvite = (
  id: string = 'invite-1',
  groupId: string = 'group-1',
  groupName: string = 'Family',
  createdAt: string = '2024-01-01T00:00:00.000Z',
): PendingInvite => ({
  id,
  groupId,
  groupName,
  createdAt,
});

describe('PendingInvitesSection', () => {
  const mockRespond = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockRespond.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders null when invites array is empty', async () => {
      const { toJSON } = await render(
        <PendingInvitesSection
          invites={[]}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      expect(toJSON()).toBeNull();
    });

    it('renders section heading when invites are present', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      expect(screen.getByText('Pending invites')).toBeTruthy();
    });

    it('renders a row for each invite', async () => {
      const invites = [
        createMockInvite('invite-1', 'group-1', 'Family'),
        createMockInvite('invite-2', 'group-2', 'Work'),
        createMockInvite('invite-3', 'group-3', 'Friends'),
      ];

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      expect(screen.getByText('Family')).toBeTruthy();
      expect(screen.getByText('Work')).toBeTruthy();
      expect(screen.getByText('Friends')).toBeTruthy();
    });
  });

  describe('accept and decline buttons', () => {
    it('renders Accept and Decline buttons for each invite when not responding', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      const acceptButtons = screen.getAllByText('Accept');
      const declineButtons = screen.getAllByText('Decline');

      expect(acceptButtons).toBeTruthy();
      expect(declineButtons).toBeTruthy();
    });

    it('Accept button calls respond with accept decision', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      const acceptButton = screen.getByText('Accept');
      fireEvent.press(acceptButton);

      expect(mockRespond).toHaveBeenCalledWith('invite-1', 'accept');
    });

    it('Decline button calls respond with decline decision', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      const declineButton = screen.getByText('Decline');
      fireEvent.press(declineButton);

      expect(mockRespond).toHaveBeenCalledWith('invite-1', 'decline');
    });

  });

  describe('responding state', () => {
    it('only hides buttons for the row with matching respondingId, not other rows', async () => {
      const invites = [
        createMockInvite('invite-1', 'group-1', 'Family'),
        createMockInvite('invite-2', 'group-2', 'Work'),
      ];

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId="invite-1"
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      // Only the Work row (invite-2) should still show its buttons.
      expect(screen.getAllByText('Accept')).toHaveLength(1);
      expect(screen.getAllByText('Decline')).toHaveLength(1);
    });

    it('does not show buttons when respondingId matches invite.id', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      const { container } = await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId="invite-1"
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      // Buttons should not be rendered when responding
      expect(screen.queryByText('Accept')).toBeNull();
      expect(screen.queryByText('Decline')).toBeNull();
    });

    it('shows buttons again when respondingId clears', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      const { rerender } = await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId="invite-1"
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      expect(screen.queryByText('Accept')).toBeNull();

      // Re-render with respondingId cleared
      await rerender(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      // Buttons should now be visible
      expect(screen.getByText('Accept')).toBeTruthy();
      expect(screen.getByText('Decline')).toBeTruthy();
    });
  });

  describe('error message display (FT-10 bug fix)', () => {
    it('displays error message only on the row matching respondErrorInviteId', async () => {
      const invites = [
        createMockInvite('invite-1', 'group-1', 'Family'),
        createMockInvite('invite-2', 'group-2', 'Work'),
      ];
      const errorMsg = 'This invite is expired';

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={errorMsg}
          respondErrorInviteId="invite-1"
        />,
      );

      // Error should only appear once (for invite-1)
      const errorTexts = screen.queryAllByText(errorMsg);
      expect(errorTexts).toHaveLength(1);
    });

    it('does not show error message when respondErrorMessage is null', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      // No error text should be present
      const errorTexts = screen.queryAllByText(/error|Error/i);
      expect(errorTexts).toHaveLength(0);
    });

    it('hides error when respondErrorInviteId no longer matches (e.g., on next respond call)', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];
      const errorMsg = 'First error';

      const { rerender } = await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={errorMsg}
          respondErrorInviteId="invite-1"
        />,
      );

      expect(screen.getByText(errorMsg)).toBeTruthy();

      // Simulate a second respond call that clears the error state
      await rerender(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      // Error should now be gone
      expect(screen.queryByText(errorMsg)).toBeNull();
    });

  });

  describe('button state during responding and error', () => {
    it('shows buttons again when error occurs and respondingId clears', async () => {
      const invites = [createMockInvite('invite-1', 'group-1', 'Family')];

      const { rerender } = await render(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId="invite-1"
          respondErrorMessage={null}
          respondErrorInviteId={null}
        />,
      );

      // During respond
      expect(screen.queryByText('Accept')).toBeNull();

      // After error
      await rerender(
        <PendingInvitesSection
          invites={invites}
          respond={mockRespond}
          respondingId={null}
          respondErrorMessage="Error message"
          respondErrorInviteId="invite-1"
        />,
      );

      // Buttons should be back and error should show
      expect(screen.getByText('Accept')).toBeTruthy();
      expect(screen.getByText('Decline')).toBeTruthy();
      expect(screen.getByText('Error message')).toBeTruthy();
    });
  });
});
