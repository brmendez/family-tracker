// features/visibility/components/VisibilityDurationSheet.test.tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

import { VisibilityDurationSheet } from './VisibilityDurationSheet';

describe('VisibilityDurationSheet', () => {
  const mockOnSelectDuration = jest.fn();
  const mockOnUnhide = jest.fn();
  const mockOnClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering when not hidden', () => {
    it('renders 5 duration options when isHidden=false', async () => {
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={false}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('1 hour')).toBeTruthy();
      expect(screen.getByText('2 hours')).toBeTruthy();
      expect(screen.getByText('4 hours')).toBeTruthy();
      expect(screen.getByText('All day')).toBeTruthy();
      expect(screen.getByText('Until I turn it back on')).toBeTruthy();
    });

    it('does not render "Visible again now" option when isHidden=false', async () => {
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={false}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      expect(screen.queryByText('Visible again now')).toBeNull();
    });

    it.each([
      ['1 hour', '1h'],
      ['2 hours', '2h'],
      ['4 hours', '4h'],
      ['All day', 'allDay'],
      ['Until I turn it back on', 'indefinite'],
    ])('calls onSelectDuration with %s -> %s when pressed', async (label, duration) => {
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={false}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      const button = screen.getByText(label).parent;
      fireEvent.press(button!);

      expect(mockOnSelectDuration).toHaveBeenCalledWith(duration);
    });
  });

  describe('rendering when hidden', () => {
    it('renders single "Visible again now" option when isHidden=true', async () => {
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={true}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Visible again now')).toBeTruthy();
    });

    it('does not render duration options when isHidden=true', async () => {
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={true}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      expect(screen.queryByText('1 hour')).toBeNull();
      expect(screen.queryByText('2 hours')).toBeNull();
      expect(screen.queryByText('4 hours')).toBeNull();
    });

    it('calls onUnhide when Visible again now option pressed', async () => {
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={true}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      const button = screen.getByText('Visible again now').parent;
      fireEvent.press(button!);

      expect(mockOnUnhide).toHaveBeenCalled();
    });
  });

  describe('setting in progress', () => {
    it('disables buttons when setting=true', async () => {
      const mockSelect = jest.fn();
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={false}
          setting={true}
          errorMessage={null}
          onSelectDuration={mockSelect}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      // Try to press a button - it should not call the handler when disabled
      const button = screen.getByText('1 hour').parent;
      fireEvent.press(button!);
      expect(mockSelect).not.toHaveBeenCalled();
    });

    it('disables unhide button when setting=true and isHidden=true', async () => {
      const mockUnhide = jest.fn();
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={true}
          setting={true}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockUnhide}
          onClose={mockOnClose}
        />,
      );

      const button = screen.getByText('Visible again now').parent;
      fireEvent.press(button!);

      expect(mockUnhide).not.toHaveBeenCalled();
    });
  });

  describe('error message display', () => {
    it('renders error message when present', async () => {
      const errorMsg = 'Failed to update visibility';
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={false}
          setting={false}
          errorMessage={errorMsg}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText(errorMsg)).toBeTruthy();
    });

    it('does not render error message when null', async () => {
      await render(
        <VisibilityDurationSheet
          visible={true}
          isHidden={false}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      // Just verify no error is shown
      expect(screen.queryByText(/error|failed/i)).toBeNull();
    });

  });

  describe('not visible', () => {
    it('does not render when visible=false', async () => {
      const { getByTestId } = render(
        <VisibilityDurationSheet
          visible={false}
          isHidden={false}
          setting={false}
          errorMessage={null}
          onSelectDuration={mockOnSelectDuration}
          onUnhide={mockOnUnhide}
          onClose={mockOnClose}
        />,
      );

      // When not visible, the modal's content should not be accessible
      expect(() => screen.getByText('1 hour')).toThrow();
    });
  });
});
