// features/groups/components/InviteForm.test.tsx
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');

import { render, screen } from '@testing-library/react-native';

import { InviteForm } from './InviteForm';

describe('InviteForm', () => {
  const mockOnInvite = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnInvite.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders email input with Email Address placeholder', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      const input = screen.getByPlaceholderText('Email address');
      expect(input).toBeTruthy();
    });

    it('renders Send invite button', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      expect(screen.getByText('Send invite')).toBeTruthy();
    });

    it('does not show validation error initially', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      expect(screen.queryByText('Enter a valid email address.')).toBeNull();
    });

    it('does not show error message when sendErrorMessage is null', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      expect(screen.queryByText('error')).toBeNull();
    });

    it('does not show success message initially', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      expect(screen.queryByText('Invite sent')).toBeNull();
    });
  });

  describe('email input', () => {
    it('has autoCapitalize set to none for email', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      const input = screen.getByPlaceholderText('Email address');
      expect(input.props.autoCapitalize).toBe('none');
    });

    it('has keyboardType set to email-address', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      const input = screen.getByPlaceholderText('Email address');
      expect(input.props.keyboardType).toBe('email-address');
    });
  });

  describe('input disabled state', () => {
    it('input is editable when sending=false', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={null} />,
      );

      const input = screen.getByPlaceholderText('Email address');
      expect(input.props.editable).toBe(true);
    });

    it('input is not editable when sending=true', async () => {
      await render(
        <InviteForm onInvite={mockOnInvite} sending={true} sendErrorMessage={null} />,
      );

      const input = screen.getByPlaceholderText('Email address');
      expect(input.props.editable).toBe(false);
    });
  });

  describe('error message display', () => {
    it('displays sendErrorMessage when provided', async () => {
      const errorMsg = 'Email is already a member of this group';
      await render(
        <InviteForm onInvite={mockOnInvite} sending={false} sendErrorMessage={errorMsg} />,
      );

      expect(screen.getByText(errorMsg)).toBeTruthy();
    });

  });
});
