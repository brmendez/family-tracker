// features/groups/components/CreateGroupForm.test.tsx
jest.mock('../../../lib/supabase');
jest.mock('../../../context/auth.context');

import { render, screen } from '@testing-library/react-native';

import { CreateGroupForm } from './CreateGroupForm';

describe('CreateGroupForm', () => {
  const mockOnCreate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnCreate.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders with input prefilled with "Family"', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage={null}
        />,
      );

      expect(screen.getByDisplayValue('Family')).toBeTruthy();
    });

    it('renders the Create button', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage={null}
        />,
      );

      expect(screen.getByText('Create')).toBeTruthy();
    });

    it('renders a placeholder "Group name"', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage={null}
        />,
      );

      const input = screen.getByDisplayValue('Family');
      expect(input.props.placeholder).toBe('Group name');
    });

    it('does not show validation error initially', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage={null}
        />,
      );

      expect(screen.queryByText(/can't be empty/)).toBeNull();
    });
  });

  describe('loading state', () => {
    it('disables input when creating=true', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={true}
          createErrorMessage={null}
        />,
      );

      const input = screen.getByDisplayValue('Family');
      expect(input.props.editable).toBe(false);
    });

    it('enables input when creating=false', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage={null}
        />,
      );

      const input = screen.getByDisplayValue('Family');
      expect(input.props.editable).toBe(true);
    });
  });

  describe('error handling', () => {
    it('displays createErrorMessage when provided', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage="Network error"
        />,
      );

      expect(screen.getByText('Network error')).toBeTruthy();
    });

    it('does not display error message when null', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage={null}
        />,
      );

      expect(screen.queryByText(/Network/)).toBeNull();
    });

    it('keeps form usable when error is present', async () => {
      await render(
        <CreateGroupForm
          onCreate={mockOnCreate}
          creating={false}
          createErrorMessage="Create failed"
        />,
      );

      const input = screen.getByDisplayValue('Family');
      expect(input.props.editable).toBe(true);
    });
  });
});
